import logging
import traceback

from app.db.database import Session_local
from app.schemas.deploy import CloneSchema
from app.services.project_service import ProjectService
from app.services.git_service import clone_repository
from app.services.build_service import detect_project_type, generate_dockerfile, build_docker_image
from app.services.container_service import run_container, scale_project
from app.services.scan_service import scan_image, detect_secret
from app.core.config import settings
from app.core.exceptions import BuildError, DeployError, DetectionError, SecretLeakError, VulnerabilityError
from app.models.project import FailReason, ComponentKind, ProjectStatus, ProjectComponent
from app.services.container_service import ensure_project_network, run_container


class DeployService:
    @staticmethod
    def run_deployment_pipeline(project_id: int, payload: CloneSchema):
        db = Session_local()
        destination_path = f"/tmp/ids-repo/{payload.slug}"

        try:
            try:
                clone_result = clone_repository(payload.repo_url, destination_path, payload.branch)
            except Exception as e:
                raise ValueError(f"Erreur lors du clone: {e}") from e

            gitleak_result = detect_secret(destination_path)
            # enregistrer le resultat des counts
            ProjectService.save_scan_results(db, project_id, gitleak_result=gitleak_result)
            if gitleak_result["blocking"]:
                raise SecretLeakError("Secret trouvé dans le dépôt")

            try:
                detect_result = detect_project_type(destination_path)
                generate_dockerfile(detect_result, destination_path)
            except Exception as e:
                raise DetectionError(f"Erreur lors de la détection du projet: {e}") from e

            try:
                build_result = build_docker_image(destination_path, payload.slug, clone_result["commit_hash"])
            except Exception as e:
                raise BuildError(f"Erreur lors du build: {e}") from e

            trivy_result = scan_image(build_result)
            ProjectService.save_scan_results(db, project_id, trivy_result=trivy_result)
            if trivy_result["blocking"]:
                crit_vulns = trivy_result["critical_vulnerabilities"]
                raise VulnerabilityError(
                    f"Déploiement bloqué : {len(crit_vulns)} faille(s) critique(s) détectée(s)",
                    crit_vulns,
                )

            try:
                container_ids = scale_project(
                    build_result, 
                    payload.slug, settings.APP_NETWORK,
                    payload.replica, payload.envs_var,
                    port=payload.port,
                )
            except Exception as e:
                raise DeployError(f"Erreur lors du déploiement des conteneurs: {e}") from e

            ProjectService.finalize_success(
                db, project_id,
                container_ids=container_ids,
                commit_hash=clone_result["commit_hash"],
            )

        except VulnerabilityError as e:
            ProjectService.mark_failed(
                db, project_id, str(e),
                fail_reason=FailReason.VULNERABILITY,
                vulnerabilities=e.vulnerabilities,
            )
        except SecretLeakError as e:
            ProjectService.mark_failed(db, project_id, str(e), fail_reason=FailReason.SECRET_LEAK)
        except DetectionError as e:
            ProjectService.mark_failed(db, project_id, str(e), fail_reason=FailReason.DETECTION_ERROR)
        except BuildError as e:
            ProjectService.mark_failed(db, project_id, str(e), fail_reason=FailReason.BUILD_ERROR)
        except DeployError as e:
            ProjectService.mark_failed(db, project_id, str(e), fail_reason=FailReason.DEPLOY_ERROR)
        except ValueError as e:
            ProjectService.mark_failed(db, project_id, str(e), fail_reason=FailReason.CLONE_ERROR)
        except Exception as e:
            ProjectService.mark_failed(db, project_id, f"Erreur inattendue: {e}", fail_reason=FailReason.OTHER)
        finally:
            db.close()
            


    @staticmethod
    def run_stack_deployment_pipeline(project_id: int, slug: str, components: list):
        """
        Déploie une stack multi-composants (front/back/database) pour un Project.

        Prérequis : ProjectService.create_pending_stack(...) a déjà été appelé AVANT
        (côté route), donc project_id et chaque composant existent déjà en base,
        statut BUILDING.

        Args:
            project_id (int): id du Project parent (créé par create_pending_stack)
            slug (str): slug du projet, utilisé pour nommer le réseau et les conteneurs
            components (list): liste de dicts {"component_id": int, "kind": ComponentKind,
                                "repo_url"?, "branch"?, "replica"?, "envs_var"?,
                                "db_image"?, "volume_name"?, "expose_publicly"?}
                                — même contenu que celui envoyé à create_pending_stack,
                                avec en plus "component_id" (l'id retourné par la création).
        """
        
        # ⚠️ TEMPORAIRE — usage TEST uniquement, à repasser à False avant toute
        # utilisation réelle. Permet de voir la stack tourner malgré des vulnérabilités
        # critiques détectées, pour valider la communication réseau inter-conteneurs.
        SKIP_SECURITY_GATE_FOR_TEST = True
        
        db = Session_local()
        project_network = ensure_project_network(slug)

        # Le composant DATABASE doit être traité avant BACK, pour que ses credentials
        # (générés plus bas) soient déjà en base au moment où on construit DATABASE_URL
        # pour le composant BACK. On trie sans modifier l'ordre relatif du reste.
        components = sorted(
            components,
            key=lambda c: 0 if c["kind"] == ComponentKind.DATABASE else 1
        )

        # Référence vers le composant DATABASE de la stack une fois traité, pour
        # permettre l'injection auto de DATABASE_URL dans le composant BACK plus bas.
        # Reste à None si la stack n'a pas de composant DATABASE.
        db_component = None

        try:
            for comp_payload in components:
                component = ProjectService.get_component_by_id(db, comp_payload["component_id"])
                if not component:
                    continue  # composant introuvable, on ne bloque pas le reste de la stack

                container_name = f"{slug}-{comp_payload['name']}"

                # ---------- CAS DATABASE : pas de clone, pas de scan, juste run ----------
                if comp_payload["kind"] == ComponentKind.DATABASE:
                    try:
                        volume_binding = None
                        if comp_payload.get("volume_name"):
                            volume_binding = {
                                comp_payload["volume_name"]: {"bind": "/var/lib/postgresql/data", "mode": "rw"}
                            }

                        # Génération auto des credentials (user/password/db), jamais saisis
                        # par l'utilisateur. Persistés une seule fois sur le ProjectComponent.
                        ProjectService.generate_db_credentials(db, component.id, slug)
                        db.refresh(component)

                        # Les credentials générés priment : on les impose à l'image officielle
                        # Postgres via les env vars standard, en gardant d'éventuelles
                        # envs_var supplémentaires fournies par l'utilisateur (non-secrètes).
                        db_envs_var = {
                            **(comp_payload.get("envs_var") or {}),
                            "POSTGRES_USER": component.db_user,
                            "POSTGRES_PASSWORD": component.db_password,
                            "POSTGRES_DB": component.db_name,
                        }

                        container_id = run_container(
                            image_name=comp_payload["db_image"],
                            slug=container_name,
                            network=project_network,
                            envs_var=comp_payload.get("envs_var"),
                            plain_envs_var={
                                "POSTGRES_USER": component.db_user,
                                "POSTGRES_PASSWORD": component.db_password,
                                "POSTGRES_DB": component.db_name,
                            },
                            extra_networks=None,
                            volumes=volume_binding,
                            expose_traefik=False,
                        )
                        ProjectService.finalize_component_success(db, component.id, container_ids=[container_id])

                        # Gardé pour l'injection auto de DATABASE_URL dans le composant BACK
                        db_component = component
                    except Exception as e:
                        ProjectService.mark_component_failed(
                            db, component.id, f"Erreur démarrage database: {e}", fail_reason=FailReason.DEPLOY_ERROR
                        )
                    continue

                # ---------- CAS FRONT / BACK : même pipeline que l'existant, par composant ----------
                destination_path = f"/tmp/ids-repo/{container_name}"
                
                # Garde-fou : le schéma Pydantic rend déjà `port` obligatoire pour FRONT/BACK,
                # mais on revalide ici au cas où le payload aurait transité par un autre chemin
                # (ex: rejeu manuel, script interne) sans repasser par la validation Pydantic.
                if comp_payload.get("port") is None:
                    ProjectService.mark_component_failed(
                        db, component.id,
                        "Port d'écoute non renseigné pour ce composant",
                        fail_reason=FailReason.DEPLOY_ERROR,
                    )
                    continue


                try:
                    clone_result = clone_repository(
                        comp_payload["repo_url"], destination_path, comp_payload.get("branch", "main")
                    )
                except Exception as e:
                    ProjectService.mark_component_failed(
                        db, component.id, f"Erreur clone: {e}", fail_reason=FailReason.CLONE_ERROR
                    )
                    continue  # un composant en échec n'arrête pas le reste de la stack

                gitleak_result = detect_secret(destination_path)
                ProjectService.save_component_scan_results(db, component.id, gitleak_result=gitleak_result)
                if gitleak_result["blocking"]:
                    ProjectService.mark_component_failed(
                        db, component.id, "Secret trouvé dans le dépôt", fail_reason=FailReason.SECRET_LEAK
                    )
                    continue

                try:
                    detect_result = detect_project_type(destination_path)
                    generate_dockerfile(detect_result, destination_path)
                except Exception as e:
                    ProjectService.mark_component_failed(
                        db, component.id, f"Erreur détection: {e}", fail_reason=FailReason.DETECTION_ERROR
                    )
                    continue

                try:
                    build_result = build_docker_image(destination_path, container_name, clone_result["commit_hash"])
                except Exception as e:
                    ProjectService.mark_component_failed(
                        db, component.id, f"Erreur build: {e}", fail_reason=FailReason.BUILD_ERROR
                    )
                    continue

                try:
                    trivy_result = scan_image(build_result, skip_security_gate=SKIP_SECURITY_GATE_FOR_TEST)
                    ProjectService.save_component_scan_results(db, component.id, trivy_result=trivy_result)
                except Exception as e:
                    ProjectService.mark_component_failed(
                        db, component.id, f"Erreur scan vulnérabilités: {e}", fail_reason=FailReason.SCAN_ERROR
                    )
                    continue
                if trivy_result["blocking"]:
                    crit_vulns = trivy_result["critical_vulnerabilities"]
                    ProjectService.mark_component_failed(
                        db, component.id,
                        f"Déploiement bloqué : {len(crit_vulns)} faille(s) critique(s) détectée(s)",
                        fail_reason=FailReason.VULNERABILITY,
                        vulnerabilities=crit_vulns,
                    )
                    continue

                # Front (ou back si expose_publicly=True) : en plus du réseau du projet,
                # on connecte au réseau Traefik pour être routable publiquement.
                extra_nets = [settings.APP_NETWORK] if comp_payload.get("expose_publicly") else None

                # Injection auto de DATABASE_URL si la stack a un composant DATABASE déjà
                # démarré. L'utilisateur n'a plus à la renseigner manuellement dans envs_var.
                plain_envs = {}
                if comp_payload["kind"] == ComponentKind.BACK and db_component is not None:
                    db_container_name = f"{slug}-{db_component.name}"
                    plain_envs["DATABASE_URL"] = (
                        f"postgres://{db_component.db_user}:{db_component.db_password}"
                        f"@{db_container_name}:5432/{db_component.db_name}"
                    )

                try:
                    container_ids = scale_project(
                        build_result,
                        slug=container_name,
                        network=project_network,
                        desired_replicas=comp_payload.get("replica", 1),
                        envs_var=comp_payload.get("envs_var"),   # reste tel quel, jamais touché par nous
                        extra_networks=extra_nets,
                        port=comp_payload["port"], 
                        plain_envs_var=plain_envs, # DATABASE_URL passe exclusivement ici
                        expose_traefik=comp_payload.get("expose_publicly", False),
                    )
                    
                    ProjectService.finalize_component_success(
                        db, component.id, container_ids=container_ids, commit_hash=clone_result["commit_hash"]
                    )
                except Exception as e:
                    logging.exception(f"Erreur déploiement du composant {container_name}")
                    ProjectService.mark_component_failed(
                        db, component.id, f"Erreur déploiement: {e}", fail_reason=FailReason.DEPLOY_ERROR
                    )

            # Statut global du Project parent = reflet de l'état des composants
            all_components = ProjectService.get_components_by_project(db, project_id)
            if all_components and all(c.status == ProjectStatus.RUNNING for c in all_components):
                ProjectService.update_project_status(db, project_id, ProjectStatus.RUNNING)
            elif any(c.status == ProjectStatus.FAILED for c in all_components):
                ProjectService.update_project_status(db, project_id, ProjectStatus.FAILED)

        finally:
            db.close()