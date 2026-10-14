"""Direct player WebSocket and short-lived, HA-admin-approved pairing."""
from __future__ import annotations

import asyncio
from collections import defaultdict, deque
from dataclasses import dataclass
import hmac
import re
import secrets
import time

from aiohttp import web, WSMsgType
from homeassistant.components.http import HomeAssistantView
from homeassistant.exceptions import HomeAssistantError

DOMAIN = "cinemaseat"
PAIRING_SECONDS = 120
PLAYER_ID = re.compile(r"[A-Za-z0-9_-]{1,128}\Z")


@dataclass
class Pairing:
    code: str
    player_id: str
    expires: float
    future: asyncio.Future
    socket: web.WebSocketResponse


class PlayerHub:
    """Only configured secrets authenticate players; codes require HA config flow."""

    def __init__(self, hass, clock=time.monotonic):
        self.hass = hass
        self.clock = clock
        self.entries = {}
        self.players = {}
        self.sockets = {}
        self.pending = {}
        self.claimed = {}
        self.attempts = defaultdict(deque)
        self.open_sockets = set()
        self.stopping = False

    def begin_pairing(self, player_id, socket, remote):
        self.prune()
        if not PLAYER_ID.fullmatch(player_id) or self.stopping:
            raise ValueError("invalid_player")
        attempts = self.attempts[remote]
        now = self.clock()
        while attempts and attempts[0] <= now - 300:
            attempts.popleft()
        if len(attempts) >= 10 or len(self.pending) + len(self.claimed) >= 32:
            raise ValueError("pairing_rate_limited")
        attempts.append(now)
        # A second request cannot silently replace a code already on another TV.
        if any(p.player_id == player_id for p in (*self.pending.values(), *self.claimed.values())):
            raise ValueError("pairing_in_progress")
        while (code := f"{secrets.randbelow(1_000_000):06d}") in self.pending:
            pass
        pairing = Pairing(code, player_id, now + PAIRING_SECONDS,
                          asyncio.get_running_loop().create_future(), socket)
        self.pending[code] = pairing
        return pairing

    def prune(self):
        now = self.clock()
        for code, pairing in list(self.pending.items()):
            if pairing.expires <= now or pairing.socket.closed:
                self.cancel_pairing(pairing)
        for player, pairing in list(self.claimed.items()):
            if pairing.expires <= now or pairing.socket.closed:
                self.cancel_pairing(pairing)
        # Bound rate-limit storage, including arbitrary remote addresses.
        for remote, attempts in list(self.attempts.items()):
            while attempts and attempts[0] <= now - 300:
                attempts.popleft()
            if not attempts:
                self.attempts.pop(remote, None)

    def peek_pairing(self, code):
        self.prune()
        pairing = self.pending.get(code)
        if pairing is None or pairing.future.done():
            raise ValueError("invalid_code")
        return pairing

    def claim_pairing(self, code):
        pairing = self.peek_pairing(code)
        self.pending.pop(code)
        self.claimed[pairing.player_id] = pairing
        return {"player_id": pairing.player_id, "auth_token": secrets.token_urlsafe(48),
                "transport": "direct"}

    def cancel_pairing(self, pairing):
        if self.pending.get(pairing.code) is pairing:
            self.pending.pop(pairing.code)
        if self.claimed.get(pairing.player_id) is pairing:
            self.claimed.pop(pairing.player_id)
        if not pairing.future.done():
            pairing.future.cancel()

    def finish_pairing(self, entry):
        pairing = self.claimed.pop(entry.data["player_id"], None)
        if pairing and not pairing.future.done() and not pairing.socket.closed:
            pairing.future.set_result(entry.data["auth_token"])

    def register_entry(self, entry):
        self.entries[entry.data["player_id"]] = entry

    def bind_player(self, player):
        player_id = player.entry.data["player_id"]
        self.players[player_id] = player
        player.connection_changed(player_id in self.sockets)

    def unbind_player(self, player):
        player_id = player.entry.data["player_id"]
        if self.players.get(player_id) is player:
            self.players.pop(player_id)

    async def unregister_entry(self, entry):
        player_id = entry.data["player_id"]
        self.entries.pop(player_id, None)
        socket = self.sockets.pop(player_id, None)
        if player := self.players.get(player_id):
            player.connection_changed(False)
        if socket:
            await socket.close(code=1001, message=b"Player unloaded")

    def authenticates(self, player_id, token):
        entry = self.entries.get(player_id)
        expected = entry.data.get("auth_token", "") if entry else ""
        return (isinstance(token, str) and len(expected) >= 32
                and hmac.compare_digest(expected.encode(), token.encode()))

    async def attach(self, player_id, socket):
        old = self.sockets.pop(player_id, None)
        if old:
            if player := self.players.get(player_id):
                player.connection_changed(False)
            await old.close(code=1001, message=b"Connection replaced")
        self.sockets[player_id] = socket
        if player := self.players.get(player_id):
            player.connection_changed(True)

    def detach(self, player_id, socket):
        if self.sockets.get(player_id) is socket:
            self.sockets.pop(player_id)
            if player := self.players.get(player_id):
                player.connection_changed(False)

    async def send(self, player_id, command):
        socket = self.sockets.get(player_id)
        if not socket or socket.closed:
            raise HomeAssistantError("CinemaSeat disconnected; open CinemaSeat and select HA mode")
        try:
            await socket.send_json({"type": "command", "command": command})
        except (ConnectionError, RuntimeError) as err:
            raise HomeAssistantError("CinemaSeat disconnected") from err

    async def shutdown(self, _event=None):
        self.stopping = True
        for pairing in (*list(self.pending.values()), *list(self.claimed.values())):
            self.cancel_pairing(pairing)
        await asyncio.gather(*(s.close(code=1001) for s in list(self.open_sockets)),
                             return_exceptions=True)
        self.sockets.clear()


class CinemaSeatPlayerView(HomeAssistantView):
    """Public handshake endpoint with independent per-player authentication."""

    url = "/api/cinemaseat/player"
    name = "cinemaseat:player"
    requires_auth = False

    def __init__(self, hub):
        self.hub = hub

    async def get(self, request):
        hub = self.hub
        if hub.stopping or len(hub.open_sockets) >= 64:
            raise web.HTTPServiceUnavailable()
        ws = web.WebSocketResponse(heartbeat=15, max_msg_size=131_072)
        await ws.prepare(request)
        hub.open_sockets.add(ws)
        player_id = None
        pairing = None
        try:
            hello = await ws.receive_json(timeout=10)
            if not isinstance(hello, dict) or hello.get("version") != 1:
                raise ValueError("unsupported_version")
            player_id = hello.get("player_id", "")
            if not isinstance(player_id, str) or not PLAYER_ID.fullmatch(player_id):
                raise ValueError("invalid_player")
            if hello.get("type") == "pair":
                pairing = hub.begin_pairing(player_id, ws, request.remote or "unknown")
                await ws.send_json({"type": "pairing", "code": pairing.code,
                                    "expires_in": PAIRING_SECONDS, "player_id": player_id})
                closed = asyncio.create_task(ws.receive())
                try:
                    done, _ = await asyncio.wait({pairing.future, closed},
                                                timeout=PAIRING_SECONDS,
                                                return_when=asyncio.FIRST_COMPLETED)
                    if pairing.future in done and not pairing.future.cancelled():
                        await ws.send_json({"type": "paired", "secret": pairing.future.result(),
                                            "player_id": player_id})
                    elif closed not in done:
                        await ws.send_json({"type": "error", "code": "pairing_expired"})
                finally:
                    closed.cancel()
                    await asyncio.gather(closed, return_exceptions=True)
                return ws
            if hello.get("type") != "hello" or not hub.authenticates(player_id, hello.get("secret")):
                raise ValueError("pairing_required")
            await hub.attach(player_id, ws)
            await ws.send_json({"type": "connected"})
            async for message in ws:
                if message.type != WSMsgType.TEXT:
                    continue
                frame = message.json()
                if not isinstance(frame, dict):
                    raise ValueError("invalid_message")
                if hub.sockets.get(player_id) is not ws:
                    break
                player = hub.players.get(player_id)
                if player:
                    player.receive_frame(frame)
        except (ValueError, TypeError, asyncio.TimeoutError) as err:
            if not ws.closed:
                # Fixed errors only, never reflect tokens or malformed payloads.
                code = str(err) if str(err) in {"pairing_expired", "pairing_required", "pairing_rate_limited",
                    "pairing_in_progress", "invalid_player", "unsupported_version"} else "invalid_handshake"
                await ws.send_json({"type": "error", "code": code})
        finally:
            if pairing:
                hub.cancel_pairing(pairing)
            if player_id:
                hub.detach(player_id, ws)
            hub.open_sockets.discard(ws)
            await ws.close()
        return ws
