from fastapi import FastAPI
from app.core.config import settings 

app = FastAPI(title=settings.APP_NAME, description="Projet de memoire")

@app.get("/")
def show_message():
    return {"message" : "it's work" }
