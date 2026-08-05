from fastapi import APIRouter, HTTPException
from app.schemas.deploy import CloneSchema
from app.services.git_service import clone_repository
from app.services.build_service import detect_project_type, generate_dockerfile, build_docker_image

router = APIRouter()

@router.post("/clone")
async def clone(payload: CloneSchema):
    destination_path = f"/tmp/ids-repo/{payload.slug}"
    try:
        clone_result = clone_repository(payload.repo_url, destination_path, payload.branch)
        detect_result = detect_project_type(destination_path)
        dockerfile_result = generate_dockerfile(detect_result, destination_path)
        build_result = build_docker_image(destination_path, payload.slug, clone_result["commit_hash"])
        return {"clone_result": clone_result, "detect_result": detect_result, "dockerfile_path": dockerfile_result["dockerfile_path"], "build_result": build_result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")