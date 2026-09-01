import logging
from pathlib import Path
from .detector import ProjectType

logger = logging.getLogger(__name__)
def generate_dockerfile(project_type: ProjectType, project_path: str) -> dict:
    """
    Génère un Dockerfile adapté au type de projet détecté.
    Args:
    project_type: Type de projet détecté
    project_path: Chemin vers le répertoire du projet
    
    Returns:
        dict: {"dockerfile_path": str}
        
    Raises:
        ValueError: Si le type est inconnu ou sans template
    """
    path = Path(project_path)

    # Si Dockerfile existant, on le réutilise
    if project_type == ProjectType.DOCKERFILE:
        dockerfile_path = path / "Dockerfile"
        logger.info(f"Utilisation du Dockerfile existant: {dockerfile_path}")
        return {"dockerfile_path": str(dockerfile_path)}

    if project_type == ProjectType.UNKNOWN:
        raise ValueError("Impossible de générer un Dockerfile : type de projet inconnu.")

    # Mapping des types vers les fichiers templates
    template_files = {
        ProjectType.REACT_VITE: 'react_vite.dockerfile',
        ProjectType.LARAVEL: 'laravel.dockerfile',
        ProjectType.LARAVEL_MONOLITH: 'laravel_monolith.dockerfile',
        ProjectType.NODEJS: 'node.dockerfile',
        ProjectType.PYTHON: 'python.dockerfile',
    }

    template_file_name = template_files.get(project_type)
    if not template_file_name:
        raise ValueError(f"Aucun template disponible pour le type : {project_type}")

    # Chemin vers le template
    templates_dir = Path(__file__).parent.parent.parent / "templates"
    template_file_path = templates_dir / template_file_name

    if not template_file_path.is_file():
        raise ValueError(f"Template introuvable: {template_file_path}")

    # Lecture du template
    with open(template_file_path, 'r', encoding='utf-8') as f:
        template_content = f.read()

    # Écriture du Dockerfile dans le projet
    dockerfile_path = path / "Dockerfile"
    with open(dockerfile_path, 'w', encoding='utf-8') as f:
        f.write(template_content)

    logger.info(f"Dockerfile généré avec succès pour le type : {project_type.value}")
    return {"dockerfile_path": str(dockerfile_path)}