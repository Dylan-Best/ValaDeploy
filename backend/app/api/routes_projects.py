from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.project_service import ProjectService

router = APIRouter()

@router.get("/projects")
def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Récupère tous les projets de l'utilisateur connecté.
    """
    projects = ProjectService.get_user_projects(db, current_user.id)
    
    return [
        {
            "id": p.id,
            "slug": p.slug,
            "repo_url": p.repo_url,
            "branch": p.branch,
            "replica": p.replica,
            "status": p.status,
            "commit_hash": p.commit_hash,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None
        }
        for p in projects
    ]

@router.get("/projects/dashboard/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Statistiques agrégées pour le dashboard (total, running, failed,
    pourcentage d'échecs dus à des vulnérabilités critiques).
    """
    return ProjectService.get_dashboard_stats(db, current_user.id)