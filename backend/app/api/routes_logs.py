# app/api/routes_logs.py
import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.db.database import Session_local
from app.core.security import decode_token
from app.core.exceptions import ContainerNotFoundError
from app.services.logs_service import stream_container_logs
from app.services.project_service import ProjectService
from app.models.project import ProjectComponent

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/logs/{slug}")
async def websocket_logs(websocket: WebSocket, 
                         slug: str, 
                         token: str = Query(...),
                         component_id: str = Query(None)):
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except Exception as e:
        logger.warning("WS logs %s: échec decode_token (%s)", slug, e)
        await websocket.close(code=4401)
        return

    db = Session_local()
    try:
        project = ProjectService.get_project_by_slug(db, slug)
        if project is None or project.user_id != user_id:
            logger.warning("WS logs %s: projet introuvable ou non autorisé", slug)
            await websocket.close(code=4404)
            return
        
        # --- LOGIQUE MULTI-COMPOSANT ---
        if component_id:
            component = db.query(ProjectComponent).filter(
                ProjectComponent.id == component_id,
                ProjectComponent.project_id == project.id # Sécurité : vérifier qu'il appartient à ce projet
            ).first()
            
            if not component:
                await websocket.accept()
                await websocket.send_json({"type": "error", "message": "Composant introuvable."})
                await websocket.close()
                return

            if not component.container_ids:
                await websocket.accept()
                await websocket.send_json({
                    "type": "info",
                    "message": "Build en cours pour ce composant. Les logs arriveront bientôt."
                })
                await websocket.close()
                return
            
            container_ref = component.container_ids[0] # On prend le premier conteneur du composant
            
        # --- LOGIQUE MONO-PROJET (Fallback) ---
        else:
            if not project.container_ids:
                await websocket.accept()
                await websocket.send_json({
                    "type": "info",
                    "message": "Le déploiement est en cours. Les logs du conteneur seront disponibles une fois le build terminé."
                })
                await websocket.close()
                return
            
            container_ref = project.container_ids[0]
    
    finally:
        db.close()

    await websocket.accept()

    async def watch_disconnect():
        """Ne fait rien tant que la connexion est ouverte ; se termine dès
        que le client part (fermeture d'onglet, reload, navigation)."""
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass

    async def send_logs():
        try:
            async for line in stream_container_logs(container_ref):
                await websocket.send_text(line)
        except ContainerNotFoundError:
            await websocket.send_text("--- Conteneur introuvable ---")

    disconnect_task = asyncio.create_task(watch_disconnect())
    logs_task = asyncio.create_task(send_logs())

    try:
        done, pending = await asyncio.wait(
            {disconnect_task, logs_task}, return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
    except Exception:
        logger.exception("Erreur pendant le streaming des logs pour %s", slug)
    finally:
        try:
            await websocket.close()
        except Exception:
            pass