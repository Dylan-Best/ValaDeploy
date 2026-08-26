from sqlalchemy.orm import Session
from app.models.project import FailReason, Project, ProjectStatus
from app.models.user import User
from datetime import datetime
from typing import List, Dict, Any

class ProjectService:
    """Service pour la gestion des projets en base de données"""
    
    @staticmethod
    def get_user_projects(db: Session, user_id: int) -> List[Project]:
        """
        Récupère tous les projets d'un utilisateur
        """
        return db.query(Project).filter(Project.user_id == user_id).all()
    
    @staticmethod
    def get_project_by_slug(db: Session, slug: str) -> Project | None:
        """
        Récupère un projet par son slug
        """
        return db.query(Project).filter(Project.slug == slug).first()
    
    @staticmethod
    def create_project(
        db: Session,
        user: User,
        slug: str,
        repo_url: str,
        branch: str,
        replica: int,
        env_vars: Dict[str, str],
        container_ids: List[str],
        commit_hash: str,
        status: ProjectStatus = ProjectStatus.RUNNING
    ) -> Project:
        """
        Crée un nouveau projet en base de données
        """
        # Vérifier si un projet avec ce slug existe déjà
        existing = ProjectService.get_project_by_slug(db, slug)
        if existing:
            raise ValueError(f"Un projet avec le nom '{slug}' existe déjà")
        
        # Créer le projet
        new_project = Project(
            user_id=user.id,
            slug=slug,
            repo_url=repo_url,
            branch=branch,
            replica=replica,
            env_vars=env_vars,
            status=status,
            container_ids=container_ids,
            commit_hash=commit_hash,
            created_at=datetime.utcnow()
        )
        
        db.add(new_project)
        db.commit()
        db.refresh(new_project)
        
        return new_project
    
    @staticmethod
    def update_project_status(db: Session, project_id: int, status: ProjectStatus) -> Project | None:
        """
        Met à jour le statut d'un projet
        """
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            project.status = status
            project.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(project)
        return project
    
    @staticmethod
    def update_project_container_ids(db: Session, project_id: int, container_ids: List[str]) -> Project | None:
        """
        Met à jour les container IDs d'un projet
        """
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            project.container_ids = container_ids
            project.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(project)
        return project
    
    # ======== METHODE SUPPLEMENTAIRE ===============
    
    @staticmethod
    def create_pending_project(
        db: Session,
        user: User,
        slug: str,
        repo_url: str,
        branch: str,
        replica: int,
        env_vars: Dict[str, str],
    ) -> Project:
        """
        Crée le projet en base immédiatement, statut BUILDING,
        sans container_ids/commit_hash (pas encore connus).
        """
        existing = ProjectService.get_project_by_slug(db, slug)
        if existing:
            raise ValueError(f"Un projet avec le nom '{slug}' existe déjà")

        new_project = Project(
            user_id=user.id,
            slug=slug,
            repo_url=repo_url,
            branch=branch,
            replica=replica,
            env_vars=env_vars,
            status=ProjectStatus.BUILDING,
            container_ids=None,
            commit_hash=None,
            created_at=datetime.utcnow()
        )
        db.add(new_project)
        db.commit()
        db.refresh(new_project)
        return new_project

    @staticmethod
    def finalize_success(db, project_id, container_ids, commit_hash):
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            project.status = ProjectStatus.RUNNING
            project.container_ids = container_ids
            project.commit_hash = commit_hash
            project.error_message = None
            project.fail_reason = None
            project.vulnerabilities = []
            project.critical_vuln_count = 0
            project.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(project)
        return project

    @staticmethod
    def mark_failed(
        db: Session,
        project_id: int,
        error_message: str,
        fail_reason: FailReason = FailReason.OTHER,
        vulnerabilities: List[Dict[str, Any]] | None = None,
    ) -> Project | None:
        """
        Marque le projet en échec avec le détail de l'erreur.
        """
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            project.status = ProjectStatus.FAILED
            project.error_message = error_message
            project.fail_reason = fail_reason
            if vulnerabilities is not None:
                project.vulnerabilities = vulnerabilities
                project.critical_vuln_count = len(vulnerabilities)
            project.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(project)
        return project

    @staticmethod
    def get_project_by_id(db: Session, project_id: int, user_id: int) -> Project | None:
        """
        Récupère un projet par ID, restreint à son propriétaire.
        """
        return db.query(Project).filter(
            Project.id == project_id,
            Project.user_id == user_id
        ).first()
        
    @staticmethod
    def get_dashboard_stats(db: Session, user_id: int) -> dict:
        total = db.query(Project).filter(Project.user_id == user_id).count()
        running = db.query(Project).filter(
            Project.user_id == user_id, Project.status == ProjectStatus.RUNNING
        ).count()
        failed = db.query(Project).filter(
            Project.user_id == user_id, Project.status == ProjectStatus.FAILED
        ).count()
        failed_vuln = db.query(Project).filter(
            Project.user_id == user_id,
            Project.status == ProjectStatus.FAILED,
            Project.fail_reason == FailReason.VULNERABILITY,
        ).count()

        critical_vuln_percentage = round((failed_vuln / failed) * 100, 1) if failed > 0 else 0.0

        return {
            "total_projects": total,
            "running_projects": running,
            "failed_projects": failed,
            "critical_vuln_percentage": critical_vuln_percentage,
        }