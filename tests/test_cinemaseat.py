"""Run with Home Assistant 2026.10 dependencies: python tests/test_cinemaseat.py."""
import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import time
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

player_path = (Path(sys.argv.pop(1)) if len(sys.argv) > 1 and sys.argv[1].endswith(".py") else
               Path(__file__).resolve().parents[1] / "custom_components/cinemaseat/media_player.py")
setup_spec = importlib.util.spec_from_file_location("cinemaseat_under_test", player_path.with_name("__init__.py"),
                                                  submodule_search_locations=[str(player_path.parent)])
setup_module = importlib.util.module_from_spec(setup_spec)
sys.modules[setup_spec.name] = setup_module
setup_spec.loader.exec_module(setup_module)
spec = importlib.util.spec_from_file_location("cinemaseat_under_test.media_player", player_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
from homeassistant.components.media_player import SearchMediaQuery
from homeassistant.components.media_player.errors import SearchError
from homeassistant.exceptions import HomeAssistantError


class Broker:
    def __init__(self, player):
        self.player = player
        self.commands = []
        self.state = {"boot_id": "boot-1", "session_id": None, "status": "idle",
                      "capabilities": ["search_movies", "get_movie_details", "select_audio_current", "select_subtitle_current"], "owner": "local"}
        self.movies = [{"id": "1", "title": "Same title", "year": 1954},
                       {"id": "2", "title": "Same title", "year": 2026}]
        self.delay = .03
        self.prepare_timeout = False
        self.heartbeat_fails = False
        self.foreign_reply = False

    def reply(self, command, status="executed", **fields):
        reply = {"version": 1, "command_id": command["command_id"],
                 "boot_id": command.get("boot_id", self.state["boot_id"]), "status": status, **fields}
        self.player._reply_received(SimpleNamespace(payload=json.dumps(reply)))

    async def publish(self, command):
        self.commands.append(command)
        assert command["expires_at"] > time.time()
        action = command["action"]
        if action == "get_state": self.reply(command, state=dict(self.state))
        elif action == "search_movies":
            if self.foreign_reply:
                self.player._reply_received(SimpleNamespace(payload=json.dumps({
                    "version":1,"command_id":command["command_id"],"boot_id":"old-boot",
                    "status":"executed","movies":[{"id":"wrong","title":"Stale"}]})))
            self.reply(command, movies=self.movies)
        elif action == "get_movie_details":
            self.reply(command, movies=[{"id":command["movie_id"],"title":"Film",
                "audio":[{"id":"audio-en","name":"English"},{"id":"audio-nl","name":"Dutch"}],
                "subtitles":[{"id":"sub-nl","name":"Dutch"}]}])
        elif action in {"select_audio_current","select_subtitle_current"}:
            self.reply(command, "accepted", session_id=self.state["session_id"])
        elif action == "claim_control": self.reply(command, control_id="lease-1")
        elif action == "prepare":
            if command["movie_id"] == "missing":
                self.reply(command, "rejected", code="movie_not_found"); return
            self.state.update(session_id="session-1", status="preparing", owner="external")
            self.reply(command, "accepted", session_id="session-1")
            if not self.prepare_timeout:
                def ready():
                    self.state["status"] = "ready"
                    self.reply(command, session_id="session-1")
                asyncio.get_running_loop().call_later(self.delay, ready)
        elif action == "start":
            assert self.state["status"] == "ready"
            self.state["status"] = "playing"
            self.reply(command, session_id="session-1")
        elif action == "heartbeat":
            if self.heartbeat_fails: self.reply(command, "rejected", code="not_owner")
            else: self.reply(command)
        elif action == "release_control":
            self.state["owner"] = "local"; self.reply(command)
        elif action == "cancel":
            assert command["session_id"] == "session-1"
            self.state["status"] = "stopped"; self.reply(command)
        else: self.reply(command)


class LifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.views = []
        self.actions = set()
        self.hass = SimpleNamespace(
            data={}, http=SimpleNamespace(register_view=self.views.append),
            bus=SimpleNamespace(async_listen_once=lambda *args: None),
            services=SimpleNamespace(async_remove=lambda d, s: self.actions.discard(s)),
            config_entries=SimpleNamespace(
                async_forward_entry_setups=AsyncMock(),
                async_unload_platforms=AsyncMock(return_value=True)),
        )
        def register(hass, domain, name, **kwargs):
            self.actions.add(name)
        self.patch = patch.object(setup_module.service, "async_register_platform_entity_service", register)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        await setup_module.async_setup(self.hass, {})
        self.first = SimpleNamespace(entry_id="first", data={"player_id":"first","auth_token":"t"*64})
        self.second = SimpleNamespace(entry_id="second", data={"player_id":"second","auth_token":"s"*64})

    async def test_multiple_players_unload_and_reload(self):
        await asyncio.gather(setup_module.async_setup_entry(self.hass, self.first),
                             setup_module.async_setup_entry(self.hass, self.second))
        self.assertEqual(len(self.views), 2)
        self.assertEqual(self.actions, set(setup_module.SERVICES))
        self.assertTrue(await setup_module.async_unload_entry(self.hass, self.first))
        self.assertEqual(self.actions, set(setup_module.SERVICES))
        response = await self.views[1].get(None)
        self.assertEqual(response.status, 200)
        self.assertEqual(response.headers["Cache-Control"], "no-cache")
        self.assertTrue(await setup_module.async_unload_entry(self.hass, self.second))
        self.assertEqual(self.actions, set())
        from aiohttp import web
        with self.assertRaises(web.HTTPNotFound):
            await self.views[1].get(None)
        await setup_module.async_setup_entry(self.hass, self.first)
        self.assertEqual(self.actions, set(setup_module.SERVICES))
        self.assertEqual((await self.views[1].get(None)).status, 200)
        self.assertEqual(len(self.views), 2)

    async def test_failed_unload_retains_services_and_entry(self):
        await setup_module.async_setup_entry(self.hass, self.first)
        self.hass.config_entries.async_unload_platforms.return_value = False
        self.assertFalse(await setup_module.async_unload_entry(self.hass, self.first))
        self.assertEqual(self.actions, set(setup_module.SERVICES))
        self.assertEqual(self.hass.data["cinemaseat"]["entries"], {"first"})

    async def test_failed_setup_rolls_back_services(self):
        self.hass.config_entries.async_forward_entry_setups.side_effect = RuntimeError("setup failed")
        with self.assertRaises(RuntimeError):
            await setup_module.async_setup_entry(self.hass, self.first)
        self.assertEqual(self.actions, set())
        self.assertEqual(self.hass.data["cinemaseat"]["entries"], set())

    async def test_failed_second_setup_retains_first_player(self):
        await setup_module.async_setup_entry(self.hass, self.first)
        self.hass.config_entries.async_forward_entry_setups.side_effect = RuntimeError("setup failed")
        with self.assertRaises(RuntimeError):
            await setup_module.async_setup_entry(self.hass, self.second)
        self.assertEqual(self.actions, set(setup_module.SERVICES))
        self.assertEqual(self.hass.data["cinemaseat"]["entries"], {"first"})


class CinemaSeatTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.player = module.CinemaSeatPlayer(SimpleNamespace(
            title="Test", data={"player_id":"test-player","auth_token":"private-test-token"}))
        self.player.hass = SimpleNamespace(loop=asyncio.get_running_loop(), async_create_task=asyncio.create_task,
            data={"cinemaseat":{"hub":SimpleNamespace(unbind_player=lambda player: None)}})
        self.broker = Broker(self.player)
        self.patch = patch.object(self.player, "_send_command", self.broker.publish)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        async def heartbeat(state, control):
            while True:
                await asyncio.sleep(.005)
                await self.player._request("heartbeat", state, control_id=control)
        self.player._heartbeat = heartbeat

    async def test_removal_during_prepare_stops_tasks_without_late_commands(self):
        self.broker.prepare_timeout = True
        task = asyncio.create_task(self.player.async_play_media("movie", "1"))
        for _ in range(100):
            if any(c["action"] == "prepare" for c in self.broker.commands):
                break
            await asyncio.sleep(.001)
        self.assertIn("prepare", [c["action"] for c in self.broker.commands])
        await self.player.async_will_remove_from_hass()
        with self.assertRaisesRegex(HomeAssistantError, "unloaded"):
            await asyncio.wait_for(task, .5)
        commands = list(self.broker.commands)
        await asyncio.sleep(.02)
        self.assertEqual(self.broker.commands, commands)
        self.assertNotIn("start", [c["action"] for c in commands])
        self.assertEqual(self.player.pending, {})
        with self.assertRaisesRegex(HomeAssistantError, "unloaded"):
            await self.player._request("get_state")
        self.assertEqual(self.broker.commands, commands)

    async def test_entity_registers_transport_and_timer_cleanup(self):
        removals = []
        bound = []
        self.player.async_on_remove = removals.append
        self.player.hass.data["cinemaseat"]["hub"].bind_player = bound.append
        with patch.object(module, "async_track_time_interval", return_value=lambda: None) as timer:
            await self.player.async_added_to_hass()
        self.assertEqual(bound, [self.player])
        self.assertEqual(len(removals), 1)
        self.assertTrue(callable(removals[0]))
        timer.assert_called_once()

    async def test_curtain_requires_supported_idle_player_and_keeps_target(self):
        with self.assertRaisesRegex(HomeAssistantError, "Update"):
            await self.player.async_show_curtain()
        self.broker.state["capabilities"].append("show_curtain")
        self.broker.state.update(status="playing", session_id="existing")
        with self.assertRaisesRegex(HomeAssistantError, "Stop"):
            await self.player.async_show_curtain()
        self.broker.state.update(status="idle", session_id=None)
        await self.player.async_show_curtain()
        await self.player.async_show_curtain(False)
        commands=[c for c in self.broker.commands if c["action"]=="show_curtain"]
        self.assertEqual([c["show"] for c in commands], [True,False])
        self.assertTrue(all(c["player_id"]==self.player.entry.data["player_id"] and c["boot_id"]=="boot-1" for c in commands))

    async def test_search_preserves_playback_and_distinguishes_versions(self):
        self.broker.state.update(status="playing", session_id="existing", owner="local")
        result = await self.player.async_search_media(SearchMediaQuery(search_query="title"))
        self.assertEqual([r.title for r in result.result], ["Same title (1954)","Same title (2026)"])
        self.assertEqual([r.media_content_id for r in result.result], ["1","2"])
        self.assertEqual([c["action"] for c in self.broker.commands], ["get_state","search_movies"])
        self.assertEqual(self.broker.state["session_id"], "existing")

    async def test_no_results_and_invalid_query(self):
        self.broker.movies=[]
        self.assertEqual((await self.player.async_search_media(SearchMediaQuery(search_query="unknown"))).result, [])
        with self.assertRaises(SearchError): await self.player.async_search_media(SearchMediaQuery(search_query=" "))

    async def test_old_player_explains_update(self):
        self.broker.state["capabilities"]=[]
        with self.assertRaisesRegex(SearchError,"Update CinemaSeat"):
            await self.player.async_search_media(SearchMediaQuery(search_query="title"))

    async def test_stale_boot_reply_does_not_supply_results(self):
        self.broker.foreign_reply=True
        result=await self.player.async_search_media(SearchMediaQuery(search_query="title"))
        self.assertEqual(result.result[0].media_content_id,"1")

    async def test_start_waits_for_readiness_and_releases_control(self):
        task=asyncio.create_task(self.player.async_play_media("movie","1"))
        await asyncio.sleep(.01)
        self.assertFalse(task.done())
        self.assertNotIn("start",[c["action"] for c in self.broker.commands])
        await task
        actions=[c["action"] for c in self.broker.commands]
        self.assertIn("heartbeat",actions)
        self.assertLess(actions.index("prepare"),actions.index("start"))
        self.assertEqual(actions[-1],"release_control")
        self.assertEqual(self.broker.state["status"],"playing")
        self.assertEqual(self.broker.state["owner"],"local")
        self.assertEqual(self.player.pending,{})

    async def test_active_film_is_not_replaced(self):
        self.broker.state.update(status="paused",session_id="existing")
        with self.assertRaisesRegex(HomeAssistantError,"Stop the current film"):
            await self.player.async_play_media("movie","2")
        self.assertEqual([c["action"] for c in self.broker.commands],["get_state"])

    async def test_missing_movie_releases_control(self):
        with self.assertRaisesRegex(HomeAssistantError,"movie_not_found"):
            await self.player.async_play_media("movie","missing")
        self.assertEqual(self.broker.commands[-1]["action"],"release_control")
        self.assertNotIn("start",[c["action"] for c in self.broker.commands])

    async def test_heartbeat_failure_cancels_only_owned_session(self):
        self.broker.prepare_timeout=True; self.broker.heartbeat_fails=True
        with self.assertRaisesRegex(HomeAssistantError,"not_owner"):
            await self.player.async_play_media("movie","1")
        self.assertEqual([c["action"] for c in self.broker.commands][-2:],["cancel","release_control"])
        self.assertEqual(self.player.pending,{})

    async def test_prepare_timeout_cancels_and_never_starts(self):
        self.broker.prepare_timeout=True
        request=self.player._request
        async def short_request(action,*args,**kwargs):
            kwargs["timeout"]=.025
            return await request(action,*args,**kwargs)
        self.player._request=short_request
        with self.assertRaisesRegex(HomeAssistantError,"did not respond"):
            await self.player.async_play_media("movie","1")
        actions=[c["action"] for c in self.broker.commands]
        self.assertNotIn("start",actions)
        self.assertEqual(actions[-2:],["cancel","release_control"])
        self.assertEqual(self.player.pending,{})

    async def test_details_are_read_only_even_during_playback(self):
        self.broker.state.update(status="playing",session_id="existing")
        data=await self.player.async_movie_details("2")
        self.assertEqual(data["movie"]["audio"][1]["id"],"audio-nl")
        self.assertEqual([c["action"] for c in self.broker.commands],["get_state","get_movie_details"])

    async def test_start_passes_explicit_track_ids_to_prepare(self):
        await self.player.async_play_media("movie","1",extra={"audio_id":"audio-nl","subtitle_id":"sub-nl","subtitles_off":False})
        prepare=next(c for c in self.broker.commands if c["action"]=="prepare")
        self.assertEqual((prepare["audio_id"],prepare["subtitle_id"],prepare["subtitles_off"]),("audio-nl","sub-nl",False))

    async def test_inconsistent_subtitle_selection_rejected_before_claim(self):
        with self.assertRaisesRegex(HomeAssistantError,"Invalid track selection"):
            await self.player.async_play_media("movie","1",extra={"subtitle_id":"sub-nl","subtitles_off":True})
        self.assertEqual(self.broker.commands,[])

    async def test_start_rejects_details_from_an_old_boot(self):
        with self.assertRaisesRegex(HomeAssistantError,"restarted"):
            await self.player.async_play_media("movie","1",extra={"boot_id":"old-boot"})
        self.assertEqual([c["action"] for c in self.broker.commands],["get_state"])

    async def test_current_track_switches_use_session_and_accept_dispatch(self):
        self.broker.state.update(status="paused",session_id="existing")
        await self.player.async_select_audio("audio-nl","existing")
        await self.player.async_select_subtitle("existing",track_id="sub-nl")
        await self.player.async_select_subtitle("existing",off=True)
        requests=[c for c in self.broker.commands if c["action"]!="get_state"]
        self.assertEqual([c["action"] for c in requests],["select_audio_current","select_subtitle_current","select_subtitle_current"])
        self.assertTrue(all(c["session_id"]=="existing" for c in requests))
        self.assertEqual(requests[-1]["subtitle_id"],None)
        self.assertTrue(requests[-1]["subtitles_off"])
        self.assertEqual(self.broker.state["status"],"paused")

    async def test_track_choice_cannot_affect_a_new_session_or_foreign_owner(self):
        self.broker.state.update(status="playing",session_id="new-session")
        with self.assertRaisesRegex(HomeAssistantError,"film changed"):
            await self.player.async_select_audio("audio-nl","old-session")
        self.broker.state["owner"]="external"
        with self.assertRaisesRegex(HomeAssistantError,"Another controller"):
            await self.player.async_select_audio("audio-nl","new-session")
        self.assertTrue(all(c["action"]=="get_state" for c in self.broker.commands))

    async def test_disconnect_fails_waiter_immediately(self):
        self.broker.prepare_timeout=True
        self.player.async_write_ha_state=lambda: None
        task=asyncio.create_task(self.player.async_play_media("movie","1"))
        await asyncio.sleep(.01)
        self.player._availability_received(SimpleNamespace(payload="offline"))
        with self.assertRaisesRegex(HomeAssistantError,"disconnected"): await task
        self.assertEqual(self.player.pending,{})


if __name__ == "__main__": unittest.main()
