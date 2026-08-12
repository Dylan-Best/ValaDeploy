from fastapi import APIRouter, HTTPException
from app.schemas.deploy import CloneSchema
from app.services.git_service import clone_repository
from app.services.build_service import detect_project_type, generate_dockerfile, build_docker_image
from app.services.container_service import scale_project
from app.core.config import settings
from app.services.scan_service import scan_image, detect_secret

router = APIRouter()

@router.post("/clone")
async def clone(payload: CloneSchema):
    destination_path = f"/tmp/ids-repo/{payload.slug}"
    try:
        clone_result = clone_repository(payload.repo_url, destination_path, payload.branch)
        gitleak_result = detect_secret(destination_path)
        if gitleak_result["blocking"] :
            raise ValueError("ATTENTION: un secret trouve dans le dossier creer")
        
        detect_result = detect_project_type(destination_path)
        dockerfile_result = generate_dockerfile(detect_result, destination_path)
        
        build_result = build_docker_image(destination_path, payload.slug, clone_result["commit_hash"])
        trivy_result = scan_image(build_result)
        if trivy_result["blocking"]:
            raise ValueError(f"Déploiement bloqué : {trivy_result['severity_count'].get('CRITICAL', 0)} faille(s) critique(s) détectée(s)")
        
        container_ids = scale_project(build_result, payload.slug, settings.APP_NETWORK, payload.replica, payload.envs_var)
        return {"clone_result": clone_result, 
                "detect_result": detect_result, 
                "dockerfile_path": dockerfile_result["dockerfile_path"],
                "build_result": build_result,
                "container_ids": container_ids
                }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")