from app.core.docker_client import client
import docker

def run_container(image_name, slug , network:str):
    """
    Run a Docker container with the specified image name, slug, and network.

    Args:
        image_name (str): The name of the Docker image to run.
        slug (str): A unique identifier for the container.
        network (str): The name of the Docker network to connect the container to.

    Returns:
        str: The ID of the running container.
    """
    # Check if the container with the same slug already exists
   
    try:
        existing_container = client.containers.get(slug)
        if existing_container:
            if existing_container.status == 'running' :
                #print(f"Container with slug '{slug}' is already running. Stopping it before creating a new one.")
                existing_container.stop()
            #print(f"Container with slug '{slug}' has been stopped. Removing it now.")
            existing_container.remove()
    except docker.errors.NotFound:
        #print("No container found with the same slug. Proceeding to create a new container.")
        pass

    except docker.errors.APIError as e:
        raise ValueError(f"Error occurred while running container: {e}")
        # Container not found, proceed with creating it
    container = client.containers.run(
        image=image_name,
        name=slug,
        network=network,
        detach=True
    )
        
    return container.id