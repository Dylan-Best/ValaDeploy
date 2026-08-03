from fastapi import APIRouter, HTTPException
from app.schemas.deploy import CloneSchema
from app.services.git_service import clone_repository

router = APIRouter()

@router.post("/clone")
async def clone(payload: CloneSchema):
    destination_path = f"/tmp/ids-repo/{payload.slug}"
    try:
        clone_result = clone_repository(payload.repo_url, destination_path, payload.branch)
        return clone_result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")