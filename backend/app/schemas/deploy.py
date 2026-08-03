from pydantic import BaseModel

class CloneSchema(BaseModel):
    """ 
Format de la requête attendue pour le clonage d'un dépôt Git.
Attributes:
    repo_url (str): L'URL du dépôt Git à cloner.
    branch (str): La branche à cloner. Par défaut, c'est 'main'.
    slug (str): Le nom du répertoire local où le dépôt sera cloné.
"""
    repo_url: str
    branch: str = 'main'
    slug: str