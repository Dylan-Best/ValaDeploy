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
                    build_result, payload.slug, settings.APP_NETWORK,
                    payload.replica, payload.envs_var
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
        db = Session_local()
        project_network = ensure_project_network(slug)

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

                        container_id = run_container(
                            image_name=comp_payload["db_image"],
                            slug=container_name,
                            network=project_network,
                            envs_var=comp_payload.get("envs_var"),
                            extra_networks=None,        # jamais sur le réseau Traefik
                            volumes=volume_binding,
                            expose_traefik=False,       # jamais de label Traefik
                        )
                        ProjectService.finalize_component_success(db, component.id, container_ids=[container_id])
                    except Exception as e:
                        ProjectService.mark_component_failed(
                            db, component.id, f"Erreur démarrage database: {e}", fail_reason=FailReason.DEPLOY_ERROR
                        )
                    continue

                # ---------- CAS FRONT / BACK : même pipeline que l'existant, par composant ----------
                destination_path = f"/tmp/ids-repo/{container_name}"

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

                trivy_result = scan_image(build_result)
                ProjectService.save_component_scan_results(db, component.id, trivy_result=trivy_result)
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

                try:
                    container_ids = scale_project(
                        build_result,
                        slug=container_name,
                        network=project_network,
                        desired_replicas=comp_payload.get("replica", 1),
                        envs_var=comp_payload.get("envs_var"),
                        extra_networks=extra_nets,
                    )
                    ProjectService.finalize_component_success(
                        db, component.id, container_ids=container_ids, commit_hash=clone_result["commit_hash"]
                    )
                except Exception as e:
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
            
            