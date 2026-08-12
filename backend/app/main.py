from fastapi import FastAPI
from app.core.config import settings 
from app.api.routes_deploy import router as deploy_router
from app.api.routes_logs import router as logs_router

app = FastAPI(title=settings.APP_NAME, description="Projet de memoire")
app.include_router(deploy_router)
app.include_router(logs_router)

@app.get("/")
def show_message():
    return {"message" : "it's work" }
