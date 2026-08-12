from fastapi import FastAPI, WebSocket, WebSocketDisconnect, APIRouter
#from fastapi.concurrency import run_in_threadpool
from app.core.docker_client import client
import docker

router = APIRouter()
    
@router.websocket("/logs/{slug}")
async def get_logs(websocket: WebSocket, slug: str ):
    try:
        await websocket.accept()
        container = client.containers.get(slug)
        
        for log in container.logs(follow=True, stream=True):
            await websocket.send_text(log.decode())
    
    except docker.errors.NotFound:
        await websocket.send_text("Conteneur introuvable")
    except WebSocketDisconnect :
        pass
        