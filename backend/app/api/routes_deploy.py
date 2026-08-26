from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import ProjectStatus
from app.services.project_service import ProjectService
from app.services.deploy_service import DeployService
from app.schemas.deploy import CloneSchema

router = APIRouter()


@router.post("/deploy", status_code=202)
async def deploy(
    payload: CloneSchema,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        new_project = ProjectService.create_pending_project(
            db=db,
            user=current_user,
            slug=payload.slug,
            repo_url=payload.repo_url,
            branch=payload.branch,
            replica=payload.replica,
            env_vars=payload.envs_var,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    background_tasks.add_task(run_in_threadpool, DeployService.run_deployment_pipeline, new_project.id, payload)

    return {
        "project_id": new_project.id,
        "status": new_project.status,
        "message": "Déploiement lancé."
    }


@router.get("/deploy/{project_id}/status")
async def get_deploy_status(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = ProjectService.get_project_by_id(db, project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")

    return {
        "project_id": project.id,
        "status": project.status,
        "error_message": project.error_message,
        "container_ids": project.container_ids if project.status == ProjectStatus.RUNNING else None,
    }