from enum import Enum
import os
from pathlib import Path
import docker
from app.core.docker_client import client

class ProjectType(str, Enum):
    DOCKERFILE = "dockerfile"
    PYTHON = "python"
    NODEJS = "nodejs"
    JAVA = "java"
    RUBY = "ruby"
    PHP = "php"
    UNKNOWN = "unknown"

def detect_project_type(project_path):
    """
    Detect the type of project based on the presence of specific configuration files.

    Args:
        project_path (str): The path to the project directory.

    Returns:
        ProjectType: The detected project type or 'UNKNOWN' if not detected.
    """


    # Define a mapping of configuration files to project types
    config_files = {
        'Dockerfile': ProjectType.DOCKERFILE,
        'requirements.txt': ProjectType.PYTHON,
        'package.json': ProjectType.NODEJS,
        'pom.xml': ProjectType.JAVA,
        'build.gradle': ProjectType.JAVA,
        'setup.py': ProjectType.PYTHON,
        'Gemfile': ProjectType.RUBY,
        'composer.json': ProjectType.PHP,
    }

    # Check for the presence of each configuration file in the project directory
    for config_file, project_type in config_files.items():
        if os.path.isfile(os.path.join(project_path, config_file)):
            return project_type

    return ProjectType.UNKNOWN


def generate_dockerfile(project_type: ProjectType, project_path: str):
    """
    Copy the appropriate template file to the project directory based on the project type.

    Args:
        project_type (ProjectType): The detected project type.
        project_path (str): The path to the project directory.

    Raises:
        ValueError: If the project type is unknown or if the template file does not exist.

    """
    # Define a mapping of project types to template file names
    template_files = {
        ProjectType.PYTHON: 'python.dockerfile',
        ProjectType.NODEJS: 'node.dockerfile',
    }
    
    if project_type == ProjectType.DOCKERFILE:
        dockerfile_path = Path(project_path) / "Dockerfile"
        if dockerfile_path.is_file():
            return {"dockerfile_path": str(dockerfile_path)}

    # Get the template file name for the given project type
    template_file_name = template_files.get(project_type)
    
    if project_type == ProjectType.UNKNOWN:
        raise ValueError(f"Cannot generate Dockerfile for unknown project type")
    if not template_file_name:
        raise ValueError(f"No template available for project type: {project_type}")

    # Construct the path to the template file
    templates_dir = Path(__file__).parent.parent / "templates"
    template_file_path = templates_dir / template_file_name

    if not template_file_path.is_file():
        raise ValueError(f"Template file does not exist: {template_file_path}")

    # Read the content of the template file
    with open(template_file_path, 'r') as template_file:
        template_content = template_file.read()

    # Write the content to a Dockerfile in the project directory
    dockerfile_path = Path(project_path) / "Dockerfile"
    with open(dockerfile_path, 'w') as dockerfile:
        dockerfile.write(template_content)
    return {"dockerfile_path": str(dockerfile_path)}


def build_docker_image(project_path: str, slug: str, commit_hash: str):
    """
    Build a Docker image for the given project.

    Args:
        project_path (str): The path to the project directory.
        slug (str): The slug for the project.
        commit_hash (str): The commit hash for the project.
    
    
    Returns:
        str: The name of the built Docker image.
    """
    # Generate a short commit hash (first 7 characters)
    short_commit_hash = commit_hash[:7]
    # Construct the image tag
    image_tag = f"{slug}:{short_commit_hash}"

    try:
        # Build the Docker image using the Docker client
        build_result = client.images.build(path=project_path, tag=image_tag)
        build_logs = build_result[1]
        for log in build_logs:
            if 'stream' in log:
                print(log['stream'].strip())
                
    except docker.errors.BuildError as e:
        raise ValueError(f"Failed to build Docker image: {e}")

    return image_tag