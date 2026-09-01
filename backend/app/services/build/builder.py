"""
Module de build d'images Docker.
Gère la compilation des images à partir des Dockerfiles.
"""
import logging
import docker
from app.core.docker_client import client
from typing import Optional, Dict

logger = logging.getLogger(__name__)

def build_docker_image(project_path: str,
                       slug: str, 
                       commit_hash: str,
                       build_args: Optional[Dict[str, str]] = None ) -> str:
    """
    Build une image Docker pour le projet.
    Args:
    project_path: Chemin vers le répertoire du projet
    slug: Slug du projet
    commit_hash: Hash du commit
    
    Returns:
        str: Tag de l'image Docker construite
        
    Raises:
        ValueError: Si le build échoue
    """
    short_commit_hash = commit_hash[:7]
    image_tag = f"{slug}:{short_commit_hash}"

    try:
        logger.info(f"Démarrage du build Docker pour {image_tag}...")
        if build_args:
            logger.info(f"Arguments de build injectés : {build_args}")
        
        # Préparation des arguments pour le client Docker
        build_kwargs = {
            'path': project_path,
            'tag': image_tag,
            'rm': True,  # Nettoie les conteneurs intermédiaires
            'decode': True
        }
        
        # Si on a des build_args, on les ajoute au dictionnaire
        if build_args:
            build_kwargs['buildargs'] = build_args
        
        # Build avec streaming des logs
        build_result = client.images.build(**build_kwargs)  
        
        
        # Traitement des logs en temps réel
        for chunk in build_result[1]:
            if 'stream' in chunk:
                logger.debug(chunk['stream'].strip())
            elif 'error' in chunk:
                logger.error(chunk['error'])
                raise ValueError(f"Erreur pendant le build: {chunk['error']}")
                
    except docker.errors.BuildError as e:
        logger.exception(f"Échec du build Docker pour {image_tag}")
        raise ValueError(f"Failed to build Docker image: {e}")
    except Exception as e:
        logger.exception(f"Erreur inattendue lors du build Docker")
        raise ValueError(f"Erreur inattendue lors du build: {e}")

    logger.info(f"Build réussi : {image_tag}")
    return image_tag