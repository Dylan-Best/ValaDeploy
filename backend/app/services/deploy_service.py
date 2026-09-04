import contextlib
import logging
import os
import sys
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
        log_dir = "app/logs"
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, f"build_{project_id}.log")

        # Redirection TOTALE (stdout et stderr) vers le fichier de log
        with open(log_file, 'w', encoding='utf-8') as f:
            with contextlib.redirect_stdout(f), contextlib.redirect_stderr(f):
                print(f"[INFO] ==================================================")
                print(f"[INFO] Démarrage du pipeline pour le projet: {payload.slug} (ID: {project_id})")
                print(f"[INFO] ==================================================")
                
                db = Session_local()
                destination_path = f"/tmp/ids-repo/{payload.slug}"

                try:
                    print(f"[1/6] Clonage du dépôt: {payload.repo_url} (branche: {payload.branch})")
                    clone_result = clone_repository(payload.repo_url, destination_path, payload.branch)
                    print(f"    Clone réussi. Commit: {clone_result['commit_hash']}")

                    print("[2/6] Analyse des secrets (Gitleaks)...")
                    gitleak_result = detect_secret(destination_path)
                    ProjectService.save_scan_results(db, project_id, gitleak_result=gitleak_result)
                    if gitleak_result["blocking"]:
                        raise SecretLeakError("Secret trouvé dans le dépôt")
                    print("      Aucun secret détecté.")

                    print("[3/6] Détection du type de projet et génération du Dockerfile...")
                    detect_result = detect_project_type(destination_path)
                    generate_dockerfile(detect_result, destination_path)
                    print(f"      Projet détecté et Dockerfile généré.")

                    print(f"[4/6] Build de l'image Docker '{payload.slug}'...")
                    build_result = build_docker_image(destination_path, payload.slug, clone_result["commit_hash"])
                    print("      Build de l'image terminé avec succès.")

                    print("[5/6] Analyse des vulnérabilités (Trivy)...")
                    trivy_result = scan_image(build_result)
                    ProjectService.save_scan_results(db, project_id, trivy_result=trivy_result)
                    if trivy_result["blocking"]:
                        crit_vulns = trivy_result["critical_vulnerabilities"]
                        raise VulnerabilityError(
                            f"Déploiement bloqué : {len(crit_vulns)} faille(s) critique(s) détectée(s)",
                            crit_vulns,
                        )
                    print("      Scan de sécurité validé.")

                    print(f"[6/6] Déploiement des conteneurs (réplicas: {payload.replica})...")
                    container_ids = scale_project(
                        build_result, 
                        payload.slug, settings.APP_NETWORK,
                        payload.replica, payload.envs_var,
                        port=payload.port,
                    )
                    print("      Conteneurs démarrés et connectés au réseau.")

                    print("[INFO] ==================================================")
                    print("[INFO] DÉPLOIEMENT TERMINÉ AVEC SUCCÈS")
                    print("[INFO] ==================================================")
                    
                    ProjectService.finalize_success(
                        db, project_id,
                        container_ids=container_ids,
                        commit_hash=clone_result["commit_hash"],
                    )

                except VulnerabilityError as e:
                    print(f"[ERREUR] {e}")
                    ProjectService.mark_failed(db, project_id, str(e), fail_reason=FailReason.VULNERABILITY, vulnerabilities=e.vulnerabilities)
                except SecretLeakError as e:
                    print(f"[ERREUR] {e}")
                    ProjectService.mark_failed(db, project_id, str(e), fail_reason=FailReason.SECRET_LEAK)
                except DetectionError as e:
                    print(f"[ERREUR] {e}")
                    ProjectService.mark_failed(db, project_id, str(e), fail_reason=FailReason.DETECTION_ERROR)
                except BuildError as e:
                    print(f"[ERREUR] {e}")
                    ProjectService.mark_failed(db, project_id, str(e), fail_reason=FailReason.BUILD_ERROR)
                except DeployError as e:
                    print(f"[ERREUR] {e}")
                    ProjectService.mark_failed(db, project_id, str(e), fail_reason=FailReason.DEPLOY_ERROR)
                except ValueError as e:
                    print(f"[ERREUR] {e}")
                    ProjectService.mark_failed(db, project_id, str(e), fail_reason=FailReason.CLONE_ERROR)
                except Exception as e:
                    print(f"[ERREUR CRITIQUE] Erreur inattendue: {e}")
                    print(traceback.format_exc()) # Capture la stack trace complète dans le fichier de log !
                    ProjectService.mark_failed(db, project_id, f"Erreur inattendue: {e}", fail_reason=FailReason.OTHER)
                finally:
                    db.close()

    @staticmethod
    def run_stack_deployment_pipeline(project_id: int, slug: str, components: list):
        """
        Déploie une stack multi-composants (front/back/database) pour un Project.
        Les logs sont redirigés vers un fichier pour être streamés via WebSocket.
        """
        log_dir = "app/logs"
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, f"build_{project_id}.log")

        with open(log_file, 'w', encoding='utf-8', buffering=1) as f:
            with contextlib.redirect_stdout(f), contextlib.redirect_stderr(f):
                print(f"[INFO] ==================================================")
                print(f"[INFO] Démarrage du pipeline STACK pour: {slug} (ID: {project_id})")
                print(f"[INFO] Composants à déployer: {len(components)}")
                print(f"[INFO] ==================================================\n")
                
                # ⚠️ TEMPORAIRE — usage TEST uniquement, à repasser à False avant toute
                # utilisation réelle. Permet de voir la stack tourner malgré des vulnérabilités
                # critiques détectées, pour valider la communication réseau inter-conteneurs.
                SKIP_SECURITY_GATE_FOR_TEST = True
                logger = logging.getLogger(__name__)
                
                db = Session_local()
                project_network = ensure_project_network(slug)

                # Le composant DATABASE doit être traité avant BACK, pour que ses credentials
                # (générés plus bas) soient déjà en base au moment où on construit DATABASE_URL
                # pour le composant BACK. On trie sans modifier l'ordre relatif du reste.
                components = sorted(
                    components,
                    key=lambda c: 0 if c["kind"] == ComponentKind.DATABASE else 1
                )

                # Référence vers le composant DATABASE de la stack une fois traité
                db_component = None

                try:
                    total_components = len(components)
                    for idx, comp_payload in enumerate(components, 1):
                        component = ProjectService.get_component_by_id(db, comp_payload["component_id"])
                        if not component:
                            print(f"[WARN] Composant ID {comp_payload['component_id']} introuvable, skip.")
                            continue

                        container_name = f"{slug}-{comp_payload['name']}"
                        print(f"[{idx}/{total_components}] Traitement du composant: {container_name} ({comp_payload['kind'].value})")

                        # ---------- CAS DATABASE : pas de clone, pas de scan, juste run ----------
                        if comp_payload["kind"] == ComponentKind.DATABASE:
                            try:
                                volume_binding = None
                                if comp_payload.get("volume_name"):
                                    volume_binding = {
                                        comp_payload["volume_name"]: {"bind": "/var/lib/postgresql/data", "mode": "rw"}
                                    }

                                print(f"  [DB] Génération des credentials PostgreSQL...")
                                ProjectService.generate_db_credentials(db, component.id, slug)
                                db.refresh(component)
                                print(f"  [DB] Credentials générés: user={component.db_user}, db={component.db_name}")

                                db_envs_var = {
                                    **(comp_payload.get("envs_var") or {}),
                                    "POSTGRES_USER": component.db_user,
                                    "POSTGRES_PASSWORD": component.db_password,
                                    "POSTGRES_DB": component.db_name,
                                }

                                print(f"  [DB] Démarrage du conteneur avec l'image {comp_payload['db_image']}...")
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
                                db_component = component
                                print(f"  [DB]  Base de données démarrée avec succès (container_id: {container_id[:12]})\n")
                            except Exception as e:
                                print(f"  [DB]  Erreur démarrage database: {e}")
                                print(traceback.format_exc())
                                ProjectService.mark_component_failed(
                                    db, component.id, f"Erreur démarrage database: {e}", fail_reason=FailReason.DEPLOY_ERROR
                                )
                            continue

                        # ---------- CAS FRONT / BACK : pipeline complet ----------
                        destination_path = f"/tmp/ids-repo/{container_name}"
                        
                        if comp_payload.get("port") is None:
                            print(f"  [ERROR] Port d'écoute non renseigné pour {container_name}")
                            ProjectService.mark_component_failed(
                                db, component.id,
                                "Port d'écoute non renseigné pour ce composant",
                                fail_reason=FailReason.DEPLOY_ERROR,
                            )
                            continue

                        # Étape 1: Clone
                        print(f"  [1/5] Clonage du dépôt: {comp_payload['repo_url']} (branche: {comp_payload.get('branch', 'main')})")
                        try:
                            clone_result = clone_repository(
                                comp_payload["repo_url"], destination_path, comp_payload.get("branch", "main")
                            )
                            print(f"         Clone réussi. Commit: {clone_result['commit_hash']}")
                        except Exception as e:
                            print(f"         Erreur clone: {e}")
                            ProjectService.mark_component_failed(
                                db, component.id, f"Erreur clone: {e}", fail_reason=FailReason.CLONE_ERROR
                            )
                            continue

                        # Étape 2: Gitleaks
                        print(f"  [2/5] Analyse des secrets (Gitleaks)...")
                        gitleak_result = detect_secret(destination_path)
                        ProjectService.save_component_scan_results(db, component.id, gitleak_result=gitleak_result)
                        if gitleak_result["blocking"]:
                            print(f"         Secret trouvé dans le dépôt - déploiement bloqué")
                            ProjectService.mark_component_failed(
                                db, component.id, "Secret trouvé dans le dépôt", fail_reason=FailReason.SECRET_LEAK
                            )
                            continue
                        print(f"         Aucun secret détecté.")

                        # Étape 3: Détection + Dockerfile
                        print(f"  [3/5] Détection du type de projet et génération du Dockerfile...")
                        try:
                            detect_result = detect_project_type(destination_path)
                            generate_dockerfile(detect_result, destination_path)
                            print(f"         Projet détecté et Dockerfile généré.")
                        except Exception as e:
                            print(f"         Erreur détection: {e}")
                            ProjectService.mark_component_failed(
                                db, component.id, f"Erreur détection: {e}", fail_reason=FailReason.DETECTION_ERROR
                            )
                            continue

                        # Étape 4: Build
                        build_args = {}
                        if comp_payload["kind"] == ComponentKind.FRONT:
                            back_comp = next((c for c in components if c["kind"] == ComponentKind.BACK), None)
                            if back_comp:
                                back_container_name = f"{slug}-{back_comp['name']}"
                                back_url = f"http://{back_container_name}.localhost" 
                                build_args["VITE_API_URL"] = back_url
                                print(f"  [INFO] Injection de VITE_API_URL={back_url} pour le build frontend")
                        
                        print(f"  [4/5] Build de l'image Docker '{container_name}'...")
                        try:
                            build_result = build_docker_image(
                                destination_path, 
                                container_name, 
                                clone_result["commit_hash"],
                                build_args=build_args if build_args else None 
                            )
                            print(f"         Build de l'image terminé avec succès.")
                        except Exception as e:
                            print(f"         Erreur build: {e}")
                            ProjectService.mark_component_failed(
                                db, component.id, f"Erreur build: {e}", fail_reason=FailReason.BUILD_ERROR
                            )
                            continue

                        # Étape 5: Trivy (scan vulnérabilités)
                        print(f"  [5/5] Analyse des vulnérabilités (Trivy)...")
                        try:
                            trivy_result = scan_image(build_result, skip_security_gate=SKIP_SECURITY_GATE_FOR_TEST)
                            ProjectService.save_component_scan_results(db, component.id, trivy_result=trivy_result)
                        except Exception as e:
                            print(f"         Erreur scan vulnérabilités: {e}")
                            ProjectService.mark_component_failed(
                                db, component.id, f"Erreur scan vulnérabilités: {e}", fail_reason=FailReason.SCAN_ERROR
                            )
                            continue
                        if trivy_result["blocking"]:
                            crit_vulns = trivy_result["critical_vulnerabilities"]
                            print(f"         {len(crit_vulns)} faille(s) critique(s) détectée(s) - déploiement bloqué")
                            ProjectService.mark_component_failed(
                                db, component.id,
                                f"Déploiement bloqué : {len(crit_vulns)} faille(s) critique(s) détectée(s)",
                                fail_reason=FailReason.VULNERABILITY,
                                vulnerabilities=crit_vulns,
                            )
                            continue
                        print(f"        Scan de sécurité validé.")

                        # Étape 6: Déploiement du conteneur
                        extra_nets = [settings.APP_NETWORK] if comp_payload.get("expose_publicly") else None

                        plain_envs = {}
                        if comp_payload["kind"] == ComponentKind.BACK and db_component is not None:
                            db_container_name = f"{slug}-{db_component.name}"
                            plain_envs["DATABASE_URL"] = (
                                f"postgres://{db_component.db_user}:{db_component.db_password}"
                                f"@{db_container_name}:5432/{db_component.db_name}"
                            )
                            print(f"  [INFO] Injection auto de DATABASE_URL vers {db_container_name}")

                        print(f"  [DEPLOY] Démarrage du conteneur (port: {comp_payload['port']}, expose: {comp_payload.get('expose_publicly', False)})...")
                        try:
                            container_ids = scale_project(
                                build_result,
                                slug=container_name,
                                network=project_network,
                                desired_replicas=comp_payload.get("replica", 1),
                                envs_var=comp_payload.get("envs_var"),
                                extra_networks=extra_nets,
                                port=comp_payload["port"], 
                                plain_envs_var=plain_envs,
                                expose_traefik=comp_payload.get("expose_publicly", False),
                            )
                            
                            ProjectService.finalize_component_success(
                                db, component.id, container_ids=container_ids, commit_hash=clone_result["commit_hash"]
                            )
                            print(f"  [DEPLOY]  Composant {container_name} démarré avec succès\n")
                        except Exception as e:
                            print(f"  [DEPLOY]  Erreur déploiement: {e}")
                            logging.exception(f"Erreur déploiement du composant {container_name}")
                            ProjectService.mark_component_failed(
                                db, component.id, f"Erreur déploiement: {e}", fail_reason=FailReason.DEPLOY_ERROR
                            )

                    # Statut global du Project parent
                    print(f"[INFO] ==================================================")
                    print(f"[INFO] Calcul du statut global de la stack...")
                    all_components = ProjectService.get_components_by_project(db, project_id)
                    if all_components and all(c.status == ProjectStatus.RUNNING for c in all_components):
                        ProjectService.update_project_status(db, project_id, ProjectStatus.RUNNING)
                        print(f"[INFO]  STACK ENTIÈREMENT DÉPLOYÉE ET RUNNING")
                    elif any(c.status == ProjectStatus.FAILED for c in all_components):
                        ProjectService.update_project_status(db, project_id, ProjectStatus.FAILED)
                        failed_count = sum(1 for c in all_components if c.status == ProjectStatus.FAILED)
                        print(f"[INFO]   STACK PARTIELLEMENT EN ÉCHEC ({failed_count}/{len(all_components)} composants failed)")
                    else:
                        print(f"[INFO] Statut stack mis à jour.")
                    print(f"[INFO] ==================================================\n")

                except Exception as e:
                    print(f"\n[ERREUR CRITIQUE STACK] {e}")
                    print(traceback.format_exc())
                    ProjectService.update_project_status(db, project_id, ProjectStatus.FAILED)
                finally:
                    db.close()