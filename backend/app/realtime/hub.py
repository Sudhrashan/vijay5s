"""Live event hub.

Every browser holds one WebSocket. When anything changes (issue raised, issue closed,
allocation saved, escalation run) the API calls `hub.publish(topic, data)`.

- Single instance: events go straight to the sockets connected to this process.
- Several instances behind a load balancer: set REDIS_URL. Each instance publishes to a
  Redis channel and every instance relays what it hears to its own sockets, so a user
  connected to replica B still sees an issue raised through replica A.
"""
import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import WebSocket

from app.core.config import settings

log = logging.getLogger("realtime")
CHANNEL = "vijay5s:events"


class Hub:
    def __init__(self) -> None:
        self._sockets: set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self._redis = None
        self._listener: asyncio.Task | None = None

    async def start(self) -> None:
        if not settings.REDIS_URL:
            log.info("Realtime hub running in single-instance mode")
            return
        import redis.asyncio as redis

        self._redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
        self._listener = asyncio.create_task(self._listen())
        log.info("Realtime hub subscribed to Redis channel %s", CHANNEL)

    async def stop(self) -> None:
        if self._listener:
            self._listener.cancel()
        if self._redis:
            await self._redis.aclose()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._sockets.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._sockets.discard(ws)

    @property
    def online(self) -> int:
        return len(self._sockets)

    async def publish(self, topic: str, data: dict | None = None) -> None:
        msg = json.dumps({"topic": topic, "data": data or {}, "at": datetime.now(timezone.utc).isoformat()},
                         default=str)
        if self._redis:
            await self._redis.publish(CHANNEL, msg)
        else:
            await self._fanout(msg)

    async def _fanout(self, msg: str) -> None:
        dead = []
        for ws in list(self._sockets):
            try:
                await ws.send_text(msg)
            except Exception:  # client vanished mid-send
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws)

    async def _listen(self) -> None:
        while True:
            try:
                pubsub = self._redis.pubsub()
                await pubsub.subscribe(CHANNEL)
                async for item in pubsub.listen():
                    if item.get("type") == "message":
                        await self._fanout(item["data"])
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # Redis restart: retry instead of dying
                log.warning("Redis listener dropped (%s); retrying in 3 s", exc)
                await asyncio.sleep(3)


hub = Hub()
