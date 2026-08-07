from app.core.docker_client import client
from app.services.traefik_service import build_traefik_labels
import docker
from app.core.security import decrypt_data

def run_container(image_name : str, slug : str , network: str, envs_var:dict = None) -> str:
    """
    Run a Docker container with the specified image name, slug, and network.

    Args:
        image_name (str): The name of the Docker image to run.
        slug (str): A unique identifier for the container.
        network (str): The name of the Docker network to connect the container to.
        envs_var (dict, optional): A dictionary of environment variables to set in the container. 
                                   The values should be encrypted and will be decrypted before being passed to the container.
    Returns:
        str: The ID of the running container.
    """
    # Check if the container with the same slug already exists
   
    try:
        existing_container = client.containers.get(slug)
        if existing_container:
            if existing_container.status == 'running' :
                existing_container.stop()
            existing_container.remove()
    except docker.errors.NotFound:
        #print("No container found with the same slug. Proceeding to create a new container.")
        pass

    except docker.errors.APIError as e:
        raise ValueError(f"Error occurred while running container: {e}")
    
    
    traefik_labels = build_traefik_labels(slug) 
    
    # Decrypt environment variables if provided
    var_envs = {}
    if envs_var:
        for key, value in envs_var.items():
            decrypted_value = decrypt_data(value)
            var_envs[key] = decrypted_value
    
    container = client.containers.run(
        image=image_name,
        name=slug,
        network=network,
        environment=var_envs,
        labels=traefik_labels,
        detach=True
    )
        
    return container.id