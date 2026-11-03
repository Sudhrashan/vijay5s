import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.deps import user_from_token
from app.db.session import SessionLocal
from app.realtime.hub import hub

router = APIRouter()


def _auth(token: str) -> str | None:
    with SessionLocal() as db:
        user = user_from_token(token, db)
        return user.name if user else None


@router.websocket("/ws")
async def live(ws: WebSocket, token: str = ""):
    """One socket per browser tab. Auth uses ?token=<jwt> because browsers cannot set
    headers on a WebSocket. The server only pushes; clients refetch what changed."""
    name = await asyncio.to_thread(_auth, token)
    if not name:
        # Accept first so the browser actually receives 4401 and logs out (useLive.ts);
        # closing before accept surfaces only as HTTP 403 / code 1006.
        await ws.accept()
        await ws.close(code=4401)
        return
    await hub.connect(ws)
    try:
        await ws.send_json({"topic": "hello", "data": {"name": name, "online": hub.online}})
        while True:
            msg = await ws.receive_text()  # keep-alive pings from the client
            if msg == "ping":
                await ws.send_text('{"topic":"pong","data":{}}')
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(ws)
