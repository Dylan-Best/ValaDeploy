#app/api.routes_projects.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.project_service import ProjectService

from fastapi import Query
from app.models.project import ProjectComponent, ProjectStatus 


from app.services.container_service import manage_container_state 

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


@router.post("/projects/{slug}/action")
def project_action(
    slug: str,
    action: str = Query(..., description="start, stop, ou restart"),
    component_id: int = Query(None, description="ID du composant pour les stacks multi-services"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if action not in ['start', 'stop', 'restart']:
        raise HTTPException(status_code=400, 
                            detail="Action invalide. Utilisez 'start', 'stop' ou 'restart'.")

    # 1. Vérifier le projet et l'autorisation
    project = ProjectService.get_project_by_slug(db, slug)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=404, 
                            detail="Projet introuvable ou non autorisé.")

    container_ids_to_manage = []
    new_status = ProjectStatus.RUNNING if action in ['start', 'restart'] else ProjectStatus.STOPPED

    # 2. Déterminer quels conteneurs toucher (Multi-composant vs Mono)
    if component_id:
        component = db.query(ProjectComponent).filter(
            ProjectComponent.id == component_id,
            ProjectComponent.project_id == project.id
        ).first()
        
        if not component or not component.container_ids:
            raise HTTPException(status_code=404, detail="Composant ou conteneurs introuvables pour cet ID.")
        
        container_ids_to_manage = component.container_ids
        component.status = new_status # Mise à jour du statut en BDD
    else:
        if not project.container_ids:
            raise HTTPException(status_code=404, detail="Aucun conteneur associé à ce projet.")
        
        container_ids_to_manage = project.container_ids
        project.status = new_status # Mise à jour du statut en BDD


    
    for c_id in container_ids_to_manage:
        try:
            manage_container_state(c_id, action, slug) # 'slug' est utilisé pour reconstruire le nom du réseau: net-{slug}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Erreur sur le conteneur {c_id}: {str(e)}")

    # 4. Sauvegarder l'état en base de données
    db.commit()

    return {"message": f"Action '{action}' réussie avec succès.", "slug": slug}

