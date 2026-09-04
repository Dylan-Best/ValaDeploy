#app/api.routes_projects.py

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.project_service import ProjectService
from app.core.docker_client import client
from fastapi import Query
from app.models.project import ProjectComponent, ProjectStatus 
import logging

from app.services.container_service import ensure_project_network, manage_container_state, run_container 

router = APIRouter()
logger = logging.getLogger(__name__)

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
        raise HTTPException(status_code=404, detail="Projet introuvable ou non autorisé.")

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


    
    new_container_ids = []
    
    # On s'assure que le réseau interne existe
    network_name = ensure_project_network(slug) 
    
    # Fonction helper pour trouver le réseau Traefik automatiquement
    def find_traefik_network():
        for net in client.networks.list():
            if "traefik" in net.name.lower() or net.name == "web":
                return net.name
        return None
    
    #3. Exécuter l'action sur chaque conteneur
    for c_id in container_ids_to_manage:
        try:
            # Tentative normale (Start/Stop/Restart)
            manage_container_state(c_id, action, slug)
            new_container_ids.append(c_id)
            
        except Exception as e:
            error_msg = str(e)
            # DÉTECTION DU BUG RÉSEAU FANTÔME
            if "network" in error_msg.lower() and "not found" in error_msg.lower():
                logger.warning(f"Réseau fantôme détecté pour {c_id}. Recréation automatique du conteneur...")
                try:
                    broken_container = client.containers.get(c_id)
                    
                    # 1. Récupérer les infos vitales du conteneur cassé
                    image_name = broken_container.image.tags[0] if broken_container.image.tags else broken_container.image.short_id
                    container_name = broken_container.name
                    
                    # 2. Supprimer le conteneur cassé
                    broken_container.remove(force=True)
                    
                    # 3. Préparer les paramètres pour la recréation
                    envs = component.env_vars if component_id else project.env_vars
                    port = component.port if component_id else None
                    
                    # Trouver le réseau Traefik pour que le conteneur soit bien exposé
                    traefik_net = find_traefik_network()
                    extra_nets = [traefik_net] if (traefik_net and port) else []

                    # 4. Recréer le conteneur proprement via run_container
                    new_id = run_container(
                        image_name=image_name,
                        slug=container_name, # On garde le même nom (ex: mytest8-back-1)
                        network=network_name,
                        plain_envs_var=envs, # Les vars sont déjà en clair dans la BDD
                        expose_traefik=True if port else False,
                        port=port,
                        extra_networks=extra_nets
                    )
                    
                    new_container_ids.append(new_id)
                    logger.info(f"Conteneur recréé avec succès: {new_id}")
                    
                except Exception as recreate_error:
                    logger.exception("Erreur lors de la recréation du conteneur")
                    raise HTTPException(status_code=500, detail=f"Échec de la recréation du conteneur cassé: {str(recreate_error)}")
            else:
                # Autre erreur inconnue, on la remonte
                raise HTTPException(status_code=500, detail=f"Erreur sur le conteneur {c_id}: {error_msg}")

    # 4. Mettre à jour les IDs en BDD (car l'ID a changé après recréation !)
    if component_id:
        component.container_ids = new_container_ids
    else:
        project.container_ids = new_container_ids
        
    db.commit()

# =============== pipeline endpoints ===============

@router.get("/deploy/{project_id}/pipeline")
async def get_pipeline_status(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = ProjectService.get_project_by_id(db, project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")

    # Mapping des statuts BDD vers le format attendu par le frontend
    status_map = {
        ProjectStatus.BUILDING: "running",
        ProjectStatus.RUNNING: "success",
        ProjectStatus.FAILED: "failed",
        ProjectStatus.STOPPED: "cancelled"
    }
    global_status = status_map.get(project.status, "running")
    steps = []
    
    # 1. Étape Clone
    clone_status = "completed" if project.commit_hash else ("active" if project.status == ProjectStatus.BUILDING else "pending")
    steps.append({
        "label": "Clone Repository",
        "description": f"Récupération de la branche {project.branch}",
        "status": clone_status,
        "duration_seconds": 3 if clone_status == "completed" else None
    })

    # 2. Étape Build
    build_status = "pending"
    if project.status in [ProjectStatus.RUNNING, ProjectStatus.FAILED, ProjectStatus.STOPPED]:
        build_status = "completed"
    elif project.status == ProjectStatus.BUILDING and project.commit_hash:
        build_status = "active"
    steps.append({
        "label": "Build Docker Image",
        "description": "Génération du Dockerfile et construction",
        "status": build_status,
        "duration_seconds": 12 if build_status == "completed" else None
    })

    # 3. Étape Security Scan
    scan_status = "pending"
    if project.status in [ProjectStatus.RUNNING, ProjectStatus.FAILED, ProjectStatus.STOPPED]:
        scan_status = "completed"
    elif project.status == ProjectStatus.BUILDING and build_status == "completed":
        scan_status = "active"
    steps.append({
        "label": "Security Scan",
        "description": "Analyse Trivy (vulnérabilités) et Gitleaks (secrets)",
        "status": scan_status,
        "duration_seconds": 8 if scan_status == "completed" else None
    })

    # 4. Étape Deploy
    deploy_status = "pending"
    if project.status == ProjectStatus.RUNNING:
        deploy_status = "completed"
    elif project.status == ProjectStatus.FAILED:
        deploy_status = "failed"
    elif project.status == ProjectStatus.BUILDING and scan_status == "completed":
        deploy_status = "active"
    steps.append({
        "label": "Deploy to Traefik",
        "description": "Démarrage des conteneurs et configuration du routage",
        "status": deploy_status,
        "duration_seconds": 5 if deploy_status == "completed" else None
    })

    # Si c'est une stack, on détaille les composants dans le pipeline
    components = ProjectService.get_components_by_project(db, project_id)
    if len(components) > 0:
        comp_status_map = {
            ProjectStatus.BUILDING: "active",
            ProjectStatus.RUNNING: "completed",
            ProjectStatus.FAILED: "failed",
            ProjectStatus.STOPPED: "pending"
        }
        for comp in components:
            steps.append({
                "label": f"Composant: {comp.name} ({comp.kind.value})",
                "description": comp.error_message or f"Statut: {comp.status.value}",
                "status": comp_status_map.get(comp.status, "pending"),
                "duration_seconds": None
            })

    # Logs (version simplifiée déduite de l'état, sera connectée aux vrais logs plus tard)
    logs = [f"[INFO] Pipeline initialized for project '{project.slug}'"]
    if project.commit_hash:
        logs.append(f"[INFO] Successfully cloned commit {project.commit_hash[:7]}")
    if project.status == ProjectStatus.RUNNING:
        logs.append("[INFO] Docker build completed successfully")
        logs.append("[INFO] Security scan passed")
        logs.append("[INFO] Containers started and attached to Traefik network")
    elif project.status == ProjectStatus.FAILED:
        logs.append(f"[ERROR] Pipeline failed: {project.error_message or 'Unknown error'}")
    else:
        logs.append("[INFO] Pipeline in progress...")

    # Construction de l'URL live (fallback intelligent)
    live_url = None
    if project.status == ProjectStatus.RUNNING:
        port = 8080 # Fallback par défaut
        if len(components) > 0:
            for c in components:
                if c.port:
                    port = c.port
                    break
        live_url = f"http://{project.slug}.localhost:{port}"

    return {
        "status": global_status,
        "project": {
            "slug": project.slug,
            "environment": "local", 
            "commit_sha": project.commit_hash,
            "live_url": live_url
        },
        "steps": steps,
        "logs": logs
    }

@router.post("/deploy/{project_id}/cancel")
async def cancel_build(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = ProjectService.get_project_by_id(db, project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    
    if project.status == ProjectStatus.BUILDING:
        project.status = ProjectStatus.FAILED
        project.error_message = "Build cancelled by user"
        db.commit()
    return {"message": "Build cancelled"}

@router.post("/deploy/{project_id}/retry")
async def retry_build(
    project_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = ProjectService.get_project_by_id(db, project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    
    project.status = ProjectStatus.BUILDING
    project.error_message = None
    db.commit()
    
    # TODO: Relancer le vrai pipeline DeployService ici
    return {"message": "Build retry initiated"}