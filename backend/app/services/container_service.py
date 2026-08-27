from app.core.docker_client import client
from app.services.traefik_service import build_traefik_labels
import docker
from app.core.security import decrypt_data

def run_container(image_name : str, slug : str , network: str, envs_var:dict = None, extra_networks: list = None, volumes: dict = None, expose_traefik: bool = True) -> str:
    """
    Run a Docker container with the specified image name, slug, and network.

    Args:
        volumes (dict, optional): ex: {"vol-mydb": {"bind": "/var/lib/postgresql/data", "mode": "rw"}}
                               None = comportement inchangé (aucun volume monté, comme avant).
        expose_traefik (bool, optional): si False, aucun label Traefik n'est posé
                                      (utile pour une DB qui ne doit jamais être routée).
                                      True par défaut = comportement inchangé.
        image_name (str): The name of the Docker image to run.
        slug (str): A unique identifier for the container.
        network (str): The name of the Docker network to connect the container to.
        envs_var (dict, optional): A dictionary of environment variables to set in the container. 
                                   The values should be encrypted and will be decrypted before being passed to the container.
        extra_networks (list, optional): liste de réseaux Docker additionnels à connecter
                                          après la création du conteneur (ex: réseau Traefik pour
                                          exposer publiquement un service qui tourne aussi sur le
                                          réseau interne du projet).   
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
    
    
    traefik_labels = build_traefik_labels(slug) if expose_traefik else {}

    
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
        volumes=volumes,
        detach=True
    )
    
    # Si extra_networks est fourni, on connecte le conteneur à chacun EN PLUS
    # du réseau principal déjà attaché ci-dessus. Le SDK Docker ne permet
    # d'attacher qu'un seul réseau à la création, donc les suivants se font
    # via .connect() après coup.
    if extra_networks:
        for net_name in extra_networks:
            try:
                docker_network = client.networks.get(net_name)
                docker_network.connect(container)
            except docker.errors.NotFound:
                raise ValueError(f"Réseau introuvable pour la connexion additionnelle: {net_name}")
        
    return container.id


def scale_project(image_name: str, slug: str, network: str, desired_replicas: int, envs_var: dict = None, extra_networks:list = None) -> list:
    """
    Scale the number of running containers for a project.

    Args:
        image_name (str): The name of the Docker image to run.
        slug (str): A unique identifier for the container.
        network (str): The name of the Docker network to connect the container to.
        desired_replicas (int): The desired number of replicas to run.
        envs_var (dict, optional): A dictionary of environment variables to set in the container. 
                                   The values should be encrypted and will be decrypted before being passed to the container.

    Returns:
        list: A list of IDs of the running containers after scaling.
    """
    # Get all containers with names starting with the slug
    existing_containers = client.containers.list(all=True, filters={"name": f"{slug}-"})
    
    # Extract the replica numbers from existing container names
    existing_numbers = []
    for container in existing_containers:
        try:
            number = int(container.name.rsplit('-', 1)[-1])
            existing_numbers.append((number, container))
        except ValueError:
            continue  # Skip if the name does not end with a number

    # Sort existing containers by their replica number in descending order
    existing_numbers.sort(key=lambda x: x[0], reverse=True)

    # Stop and remove excess containers if desired_replicas is less than current count
    if desired_replicas < len(existing_numbers):
        to_remove_count = len(existing_numbers) - desired_replicas
        # Prend les 'to_remove_count' premiers éléments (index 0 à to_remove_count - 1)
        for _, container_to_remove in existing_numbers[:to_remove_count]:
            if container_to_remove.status == 'running':
                container_to_remove.stop()
            container_to_remove.remove(force=True)

    # Start or restart containers up to desired_replicas
    running_container_ids = []
    for i in range(1, desired_replicas + 1):
        container_name = f"{slug}-{i}"
        new_container_id = run_container(image_name, container_name, network, envs_var, extra_networks)
        running_container_ids.append(new_container_id)
    
    return running_container_ids 

def ensure_project_network(slug: str) -> str:
    """
    NOUVEAU — Crée un réseau Docker dédié à un projet s'il n'existe pas déjà,
    et retourne son nom. Idempotent : si le réseau existe déjà, ne fait rien
    et retourne juste le nom.

    Ce réseau sert de réseau INTERNE au projet : tous les services d'une même
    stack (front/back/db) y sont connectés pour se joindre par nom de conteneur,
    sans être exposés à l'extérieur (contrairement au réseau Traefik).

    Args:
        slug (str): le slug du projet (ex: "myapp")

    Returns:
        str: le nom du réseau créé (ex: "net-myapp")
    """
    network_name = f"net-{slug}"
    try:
        client.networks.get(network_name)  # déjà existant, rien à faire
    except docker.errors.NotFound:
        client.networks.create(network_name, driver="bridge")
    return network_name