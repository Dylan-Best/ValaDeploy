from app.db.database import Session_local
from app.schemas.deploy import CloneSchema
from app.services.project_service import ProjectService
from app.services.git_service import clone_repository
from app.services.build_service import detect_project_type, generate_dockerfile, build_docker_image
from app.services.container_service import scale_project
from app.services.scan_service import scan_image, detect_secret
from app.core.config import settings
from app.core.exceptions import BuildError, DeployError, DetectionError, SecretLeakError, VulnerabilityError
from app.models.project import FailReason


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