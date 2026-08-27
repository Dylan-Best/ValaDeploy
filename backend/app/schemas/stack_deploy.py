from pydantic import BaseModel
from app.models.project import ComponentKind


class StackComponentSchema(BaseModel):
    """
    Un composant de la stack (front, back, ou database).
    """
    name: str                      # ex: "front", "back", "database"
    kind: ComponentKind            # FRONT / BACK / DATABASE

    # --- Champs pour FRONT / BACK ---
    repo_url: str | None = None
    branch: str = 'main'
    replica: int = 1
    envs_var: dict[str, str] | None = None
    expose_publicly: bool = False  # True = routable via Traefik (ex: front, ou back si son API est publique)

    # --- Champs pour DATABASE ---
    db_image: str | None = None
    volume_name: str | None = None


class StackDeploySchema(BaseModel):
    """
    Format de la requête pour déployer une stack multi-composants (front/back/db) en une fois.
    """
    slug: str
    components: list[StackComponentSchema]