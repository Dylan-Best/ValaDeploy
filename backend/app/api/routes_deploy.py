from fastapi import APIRouter, HTTPException
from app.schemas.deploy import CloneSchema
from app.services.git_service import clone_repository
from app.services.build_service import detect_project_type
from app.services.build_service import generate_dockerfile

router = APIRouter()

@router.post("/clone")
async def clone(payload: CloneSchema):
    destination_path = f"/tmp/ids-repo/{payload.slug}"
    try:
        clone_result = clone_repository(payload.repo_url, destination_path, payload.branch)
        detect_result = detect_project_type(destination_path)
        dockerfile_result = generate_dockerfile(detect_result, destination_path)
        return {"clone_result": clone_result, "detect_result": detect_result, "dockerfile_path": dockerfile_result["dockerfile_path"]}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")