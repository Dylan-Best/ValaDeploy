""" 
Configuration general et transversale de l'application.
"""

from pydantic_settings import BaseSettings
from pydantic_settings import SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str
    POSTGRES_DB: str
    POSTGRES_HOST: str
    POSTGRES_PORT: int
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    ENVIRONMENT: str

    # fonction considerée comme une propriété de la classe,
    @property 
    def url(self) -> str:  
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # attribut par convention, pour définir le fichier .env à utiliser
    model_config = SettingsConfigDict(env_file = ".env")

settings = Settings()
