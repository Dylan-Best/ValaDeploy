# app/api/routes_logs.py
import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.db.database import Session_local
from app.core.security import decode_token
from app.core.exceptions import ContainerNotFoundError
from app.services.logs_service import stream_container_logs
from app.services.project_service import ProjectService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/logs/{slug}")
async def websocket_logs(websocket: WebSocket, slug: str, token: str = Query(...)):
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
        if project is None:
            logger.warning("WS logs %s: aucun projet trouvé pour ce slug", slug)
            await websocket.close(code=4404)
            return
        if project.user_id != user_id:
            logger.warning(
                "WS logs %s: user_id mismatch (token=%s, projet=%s)",
                slug, user_id, project.user_id
            )
            await websocket.close(code=4404)
            return
        container_ref = project.container_ids[0]  # premier conteneur du projet
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