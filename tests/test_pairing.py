"""Pairing and live WebSocket tests; run in the HA Python runtime."""
import asyncio
import importlib
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

# Reuse the production package loader; unittest does not run it on import.
sys.path.insert(0, str(Path(__file__).parent))
import test_cinemaseat as base
transport = importlib.import_module("cinemaseat_under_test.transport")
flow_module = importlib.import_module("cinemaseat_under_test.config_flow")
from aiohttp import web, WSMsgType
from aiohttp.test_utils import TestClient, TestServer


class PairingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.now = 100.0
        self.hub = transport.PlayerHub(None, clock=lambda: self.now)
        self.socket = SimpleNamespace(closed=False)

    async def test_leading_zero_code_single_use_and_long_random_secret(self):
        with patch.object(transport.secrets, "randbelow", return_value=42):
            pairing = self.hub.begin_pairing("tv", self.socket, "local")
        self.assertEqual(pairing.code, "000042")
        data = self.hub.claim_pairing(pairing.code)
        self.assertEqual(data["player_id"], "tv")
        self.assertGreaterEqual(len(data["auth_token"]), 32)
        with self.assertRaises(ValueError):
            self.hub.claim_pairing(pairing.code)
        self.hub.finish_pairing(SimpleNamespace(data=data))
        self.assertEqual(await pairing.future, data["auth_token"])

    async def test_expiry_cancels_pending_and_rejects_code(self):
        pairing = self.hub.begin_pairing("tv", self.socket, "local")
        self.now += 121
        with self.assertRaisesRegex(ValueError, "invalid_code"):
            self.hub.peek_pairing(pairing.code)
        self.assertTrue(pairing.future.cancelled())
        self.assertEqual(self.hub.pending, {})

    async def test_collision_retry_and_duplicate_player_protection(self):
        with patch.object(transport.secrets, "randbelow", side_effect=[1, 1, 2]):
            first = self.hub.begin_pairing("first", self.socket, "local")
            second = self.hub.begin_pairing("second", self.socket, "local")
        self.assertNotEqual(first.code, second.code)
        with self.assertRaisesRegex(ValueError, "pairing_in_progress"):
            self.hub.begin_pairing("first", self.socket, "local")
        await self.hub.shutdown()

    async def test_rate_limit_and_bounded_pending_sessions(self):
        for i in range(10):
            p = self.hub.begin_pairing(f"tv-{i}", self.socket, "local")
            self.hub.cancel_pairing(p)
        with self.assertRaisesRegex(ValueError, "pairing_rate_limited"):
            self.hub.begin_pairing("last", self.socket, "local")
        self.now += 301
        self.hub.begin_pairing("last", self.socket, "local")
        await self.hub.shutdown()

    async def test_secret_is_bound_to_player_and_removed_entry(self):
        entry = SimpleNamespace(data={"player_id":"tv", "auth_token":"x"*64})
        self.hub.register_entry(entry)
        self.assertTrue(self.hub.authenticates("tv", "x"*64))
        self.assertFalse(self.hub.authenticates("other", "x"*64))
        self.assertFalse(self.hub.authenticates("tv", "wrong"))
        await self.hub.unregister_entry(entry)
        self.assertFalse(self.hub.authenticates("tv", "x"*64))

    async def test_old_entry_migration_removes_legacy_secret(self):
        entry = SimpleNamespace(version=1, title="TV", data={"player_id":"tv", "auth_token":"legacy"*10})
        def update(item, **values):
            item.version = values["version"]
            item.data = values["data"]
        hass = SimpleNamespace(config=SimpleNamespace(components=set()),
                               config_entries=SimpleNamespace(async_update_entry=update))
        self.assertTrue(await base.setup_module.async_migrate_entry(hass, entry))
        self.assertEqual(entry.version, 2)
        self.assertNotIn("auth_token", entry.data)
        self.assertTrue(entry.data["requires_pairing"])

    async def test_flow_requires_six_digits_and_derives_player_id(self):
        flow = flow_module.CinemaSeatConfigFlow()
        flow.hass = SimpleNamespace(data={"cinemaseat":{"hub":self.hub}})
        flow.async_set_unique_id = AsyncMock()
        flow._abort_if_unique_id_configured = lambda: None
        pairing = self.hub.begin_pairing("automatic-id", self.socket, "local")
        with patch.object(flow_module, "async_setup_component", AsyncMock(return_value=True)):
            invalid = await flow.async_step_user({"pairing_code":"123", "name":"Living room"})
            self.assertEqual(invalid["errors"], {"pairing_code":"invalid_code"})
            result = await flow.async_step_user({"pairing_code":pairing.code, "name":"Living room"})
        self.assertEqual(result["type"], "create_entry")
        self.assertEqual(result["data"]["player_id"], "automatic-id")
        self.assertNotIn("pairing_code", result["data"])
        self.assertEqual(result["title"], "Living room")
        await self.hub.shutdown()

    async def test_reconfigure_rejects_a_different_tv(self):
        flow = flow_module.CinemaSeatConfigFlow()
        flow.hass = SimpleNamespace(data={"cinemaseat":{"hub":self.hub}})
        pairing = self.hub.begin_pairing("another-tv", self.socket, "local")
        entry = SimpleNamespace(title="TV", data={"player_id":"original-tv"})
        with patch.object(flow_module, "async_setup_component", AsyncMock(return_value=True)):
            result = await flow._pair({"pairing_code":pairing.code}, entry=entry)
        self.assertEqual(result["errors"], {"pairing_code":"wrong_player"})
        self.assertIs(self.hub.peek_pairing(pairing.code), pairing)
        await self.hub.shutdown()


class WebSocketTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.hub = transport.PlayerHub(None)
        self.entry = SimpleNamespace(data={"player_id":"tv", "auth_token":"test-secret-"*6})
        self.changes = []
        self.frames = []
        self.player = SimpleNamespace(entry=self.entry, connection_changed=self.changes.append,
                                     receive_frame=self.frames.append)
        self.hub.register_entry(self.entry)
        self.hub.bind_player(self.player)
        app = web.Application()
        app.router.add_get("/player", transport.CinemaSeatPlayerView(self.hub).get)
        self.client = TestClient(TestServer(app))
        await self.client.start_server()
        self.addAsyncCleanup(self.client.close)
        self.addAsyncCleanup(self.hub.shutdown)

    async def authenticate(self):
        ws = await self.client.ws_connect("/player")
        await ws.send_json({"type":"hello","version":1,"player_id":"tv", "secret":self.entry.data["auth_token"]})
        self.assertEqual((await ws.receive_json())["type"], "connected")
        return ws

    async def test_authenticated_command_and_feedback_exchange(self):
        ws = await self.authenticate()
        command = {"command_id":"one", "action":"get_state"}
        await self.hub.send("tv", command)
        self.assertEqual(await ws.receive_json(), {"type":"command", "command":command})
        await ws.send_json({"type":"state", "state":{"status":"idle"}})
        for _ in range(100):
            if self.frames: break
            await asyncio.sleep(.001)
        self.assertEqual(self.frames[0]["state"]["status"], "idle")
        self.assertTrue(self.changes[-1])
        await self.hub.unregister_entry(self.entry)
        self.assertFalse(self.changes[-1])
        self.assertNotIn("tv", self.hub.sockets)

    async def test_unauthenticated_socket_cannot_send_state_or_get_commands(self):
        ws = await self.client.ws_connect("/player")
        await ws.send_json({"type":"hello","version":1,"player_id":"tv", "secret":"wrong"})
        self.assertEqual(await ws.receive_json(), {"type":"error", "code":"pairing_required"})
        self.assertEqual(self.frames, [])
        self.assertEqual(self.hub.sockets, {})

    async def test_full_short_code_pairing_exchange_and_reconnect(self):
        ws = await self.client.ws_connect("/player")
        await ws.send_json({"type":"pair","version":1,"player_id":"new-tv"})
        response = await ws.receive_json()
        self.assertEqual(len(response["code"]), 6)
        self.assertEqual(response["expires_in"], 120)
        self.assertNotIn("secret", response)
        data = self.hub.claim_pairing(response["code"])
        entry = SimpleNamespace(data=data)
        self.hub.register_entry(entry)
        self.hub.finish_pairing(entry)
        paired = await ws.receive_json()
        self.assertEqual(paired["type"], "paired")
        self.assertEqual(paired["secret"], data["auth_token"])
        self.assertNotIn("new-tv", self.hub.sockets)  # Pairing is not a control session.
        await ws.close()
        authenticated = await self.client.ws_connect("/player")
        await authenticated.send_json({"type":"hello","version":1,"player_id":"new-tv", "secret":paired["secret"]})
        self.assertEqual((await authenticated.receive_json())["type"], "connected")

    async def test_pairing_disconnect_invalidates_code(self):
        ws = await self.client.ws_connect("/player")
        await ws.send_json({"type":"pair","version":1,"player_id":"new-tv"})
        response = await ws.receive_json()
        await ws.close()
        for _ in range(100):
            if response["code"] not in self.hub.pending: break
            await asyncio.sleep(.001)
        with self.assertRaises(ValueError):
            self.hub.peek_pairing(response["code"])

    async def test_expired_pairing_notifies_tv_and_removes_pending(self):
        with patch.object(transport, "PAIRING_SECONDS", .03):
            ws = await self.client.ws_connect("/player")
            await ws.send_json({"type":"pair","version":1,"player_id":"new-tv"})
            await ws.receive_json()
            self.assertEqual(await ws.receive_json(), {"type":"error","code":"pairing_expired"})
            await ws.receive()  # Wait for server cleanup and the close frame.
        self.assertEqual(self.hub.pending, {})

    async def test_replaced_socket_cannot_disconnect_new_connection(self):
        first = await self.authenticate()
        second = await self.authenticate()
        await first.close()
        await self.hub.send("tv", {"action":"get_state"})
        self.assertEqual((await second.receive_json())["type"], "command")
        self.assertTrue(self.changes[-1])


if __name__ == "__main__":
    unittest.main()
