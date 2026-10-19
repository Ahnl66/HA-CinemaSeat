"""Run with Home Assistant 2026.10 dependencies: python tests/test_cinemaseat.py."""
import asyncio
import base64
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
        elif action == "browse_movies":
            offset = command.get("offset", 0)
            self.reply(command, movies=self.movies[offset:offset + 30], total=len(self.movies))
        elif action == "get_artwork":
            self.reply(command, artwork=base64.b64encode(b"\xff\xd8\xff\xd9").decode())
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
        with self.assertRaisesRegex(HomeAssistantError, "retired"):
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
        self.assertEqual([r.title for r in result.result], ["Same title (1954) [Plex]","Same title (2026) [Plex]"])
        self.assertEqual([r.media_content_id for r in result.result], ["1","2"])
        self.assertEqual([c["action"] for c in self.broker.commands], ["get_state","search_movies"])
        self.assertEqual(self.broker.state["session_id"], "existing")

    async def test_nas_source_filter_is_forwarded(self):
        self.broker.movies = [{"id": "nas:one", "title": "NAS movie"}]
        result = await self.player.async_search_media(SearchMediaQuery(search_query="movie", media_content_type="cinemaseat_nas"))
        self.assertEqual(self.broker.commands[-1]["source"], "nas")
        self.assertTrue(result.result[0].title.endswith("[NAS]"))

    async def test_events_are_correlated_and_deduplicated(self):
        events = []
        self.player.entity_id = "media_player.test"
        self.player.hass.bus = SimpleNamespace(async_fire=lambda event_type, data: events.append((event_type, data)))
        presentation = {"id": "show-1", "movie_id": "nas:film", "lead": "cs", "phase": "preparing"}
        self.player.snapshot = {"boot_id": "boot-1", "presentation": presentation}
        event = {"version": 1, "player_id": "test-player", "boot_id": "boot-1", "sequence": 2,
                 "event": "prepare_start_sequence", "presentation": presentation, "state": {"position": 0}}
        self.player.receive_frame({"type": "event", "event": event})
        self.player.receive_frame({"type": "event", "event": event})
        self.player.receive_frame({"type": "event", "event": {**event, "sequence": 3, "boot_id": "old"}})
        self.player.receive_frame({"type": "event", "event": {**event, "sequence": 4, "presentation": {**presentation, "id": "old"}}})
        self.player.receive_frame({"type": "event", "event": {**event, "sequence": 5, "event": "stateChanged"}})
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0][0], "cinemaseat_event")
        self.assertEqual(events[0][1]["presentation_id"], "show-1")
        self.player.receive_frame({"type": "event", "event": {**event, "sequence": 6, "event": "timecode", "state": {"position": 50, "duration": 100}}})
        self.assertEqual(events[-1][1]["position"], 50)
        self.player.receive_frame({"type": "event", "event": {**event, "sequence": 7,
            "event": "curtain_state_changed", "state": {"curtain_state": "opening"}}})
        self.assertEqual(events[-1][1]["curtain_state"], "opening")

    async def test_start_sequence_requires_exact_presentation(self):
        self.broker.state["presentation"] = {"id": "show-1", "waiting_for_ha": True}
        with self.assertRaises(HomeAssistantError):
            await self.player.async_start_sequence("old-show")
        self.assertNotIn("start_sequence", [c["action"] for c in self.broker.commands])
        await self.player.async_start_sequence("show-1")
        self.assertEqual(self.broker.commands[-1]["presentation_id"], "show-1")

    async def test_prepare_sequence_is_separate_from_release(self):
        self.broker.state["capabilities"].append("prepare_sequence")
        await self.player.async_prepare_sequence("nas:film")
        self.assertEqual([c["action"] for c in self.broker.commands], ["get_state", "prepare_sequence"])
        self.assertNotIn("claim_control", [c["action"] for c in self.broker.commands])

    async def test_seek_and_preroll_stop_use_current_identity(self):
        self.broker.state.update(session_id="feature-1", status="playing")
        self.broker.state["capabilities"].append("seek_current")
        await self.player.async_media_seek(125)
        self.assertEqual((self.broker.commands[-1]["action"], self.broker.commands[-1]["position"]), ("seek_current", 125))
        for position in [float("nan"), float("inf"), -1]:
            with self.assertRaises(HomeAssistantError):
                await self.player.async_media_seek(position)
        self.broker.state.update(session_id=None, status="preparing", presentation={"id": "show-1", "phase": "preparing"})
        await self.player.async_media_stop()
        self.assertEqual(self.broker.commands[-1]["presentation_id"], "show-1")

    async def test_local_sequence_can_be_controlled_without_ha_mode(self):
        self.broker.state.update(ha_mode=False, can_control_playback=True, session_id="local-film", status="playing",
                                 presentation={"id": "local-show", "phase": "movie", "lead": "cs"})
        self.broker.state["capabilities"].append("seek_current")
        await self.player.async_media_pause()
        self.broker.state["status"] = "paused"
        await self.player.async_media_play()
        self.broker.state["status"] = "playing"
        await self.player.async_media_next_track()
        await self.player.async_media_previous_track()
        await self.player.async_media_seek(75)
        await self.player.async_select_audio("audio-nl", "local-film")
        await self.player.async_select_subtitle("local-film", off=True)
        await self.player.async_media_stop()
        commands = [c for c in self.broker.commands if c["action"] != "get_state"]
        self.assertEqual([c["action"] for c in commands], ["pause_current", "resume_current", "next_chapter_current",
            "previous_chapter_current", "seek_current", "select_audio_current", "select_subtitle_current", "stop_current"])
        self.assertTrue(all(c["session_id"] == "local-film" for c in commands))
        self.assertEqual(commands[-1]["presentation_id"], "local-show")

    async def test_standard_play_media_requests_sequence_without_releasing_it(self):
        self.broker.state["capabilities"].append("prepare_sequence")
        await self.player.async_play_media("movie", "nas:film", extra={"playback_mode": "sequence"})
        self.assertEqual([c["action"] for c in self.broker.commands], ["get_state", "prepare_sequence"])
        self.broker.commands.clear()
        await self.player.async_play_media("cinemaseat_sequence", "nas:film")
        self.assertEqual(self.broker.commands[-1]["action"], "prepare_sequence")
        with self.assertRaises(HomeAssistantError):
            await self.player.async_play_media("movie", "nas:film", extra={"playback_mode": "invalid"})

    async def test_standard_play_releases_only_current_wait_point(self):
        self.broker.state.update(status="preparing", presentation={"id": "wait-1", "phase": "preparing", "waiting_for_ha": True})
        await self.player.async_media_play()
        self.assertEqual(self.broker.commands[-1]["action"], "start_sequence")
        self.assertEqual(self.broker.commands[-1]["presentation_id"], "wait-1")

    async def test_flat_presentation_attributes_and_buffering(self):
        self.player.snapshot = {"status": "playing", "buffering": True,
            "presentation": {"id": "show", "lead": "cs", "phase": "trailer", "waiting_for_ha": False,
                "released": True, "movie_id": "nas:main", "title": "Feature", "duration": 1000}}
        attrs = self.player.extra_state_attributes
        self.assertEqual((attrs["presentation_id"], attrs["sequence_phase"], attrs["feature_title"]), ("show", "trailer", "Feature"))
        self.assertEqual(attrs["feature_duration"], 1000)
        self.assertEqual(attrs["library_source"], "nas")
        self.assertEqual(self.player.state, module.MediaPlayerState.BUFFERING)

    async def test_dynamic_features_distinguish_current_control_and_new_starts(self):
        F = module.MediaPlayerEntityFeature
        self.player.snapshot = {"ha_mode": False, "can_control_playback": True,
            "capabilities": ["start_sequence", "stop_current", "seek_current", "pause_current", "resume_current", "browse_movies"],
            "presentation": {"id": "show", "phase": "preparing", "waiting_for_ha": True}}
        self.assertTrue(self.player.supported_features & F.PLAY)
        self.assertFalse(self.player.supported_features & F.SEEK)
        self.assertFalse(self.player.supported_features & F.PLAY_MEDIA)
        self.player.snapshot["presentation"] = {"id": "show", "phase": "movie"}
        self.player.snapshot.update(session_id="feature", status="playing")
        self.assertTrue(self.player.supported_features & F.SEEK)
        self.player.snapshot.update(ha_mode=True, capabilities=["prepare", "browse_movies", "search_movies"])
        self.assertTrue(self.player.supported_features & F.BROWSE_MEDIA)
        self.assertTrue(self.player.supported_features & F.PLAY_MEDIA)
        self.player.snapshot.update(presentation=None, session_id=None, status="idle")
        self.assertEqual(self.player.supported_features, F.PLAY_MEDIA | F.BROWSE_MEDIA | F.SEARCH_MEDIA)

    async def test_browse_pages_and_direct_sequence_choices(self):
        self.player.entity_id = "media_player.test"
        self.broker.state["capabilities"].extend(["browse_movies", "get_artwork", "prepare_sequence"])
        self.player.snapshot = dict(self.broker.state)
        self.broker.movies = [{"id": f"nas:{i}", "title": f"Film {i}"} for i in range(35)]
        root = await self.player.async_browse_media()
        self.assertEqual([c.title for c in root.children], ["Plex", "NAS"])
        page = await self.player.async_browse_media("cinemaseat_library", "nas:0")
        self.assertEqual(len(page.children), 31)
        self.assertEqual(page.children[-1].media_content_id, "nas:30")
        self.assertNotIn("private-test-token", page.children[0].thumbnail)
        page2 = await self.player.async_browse_media("cinemaseat_library", "nas:30")
        self.assertEqual(len(page2.children), 5)
        choices = await self.player.async_browse_media("movie", "nas:0")
        self.assertEqual([c.media_content_type for c in choices.children], ["movie", "cinemaseat_sequence"])
        from homeassistant.components.media_player.errors import BrowseError
        with self.assertRaises(BrowseError):
            await self.player.async_browse_media("cinemaseat_library", "nas:-1")

    async def test_artwork_is_bounded_cached_and_uses_player_proxy(self):
        self.player.entity_id = "media_player.test"
        self.player.online = True; self.player.updated = time.monotonic()
        self.player.snapshot = {**self.broker.state, "capabilities": ["get_artwork"], "movie_id": "nas:film"}
        self.assertIn("/api/media_player_proxy/", self.player.entity_picture)
        first = await self.player.async_get_media_image()
        second = await self.player.async_get_media_image()
        self.assertEqual(first, second)
        self.assertEqual(first[1], "image/jpeg")
        self.assertEqual([c["action"] for c in self.broker.commands], ["get_artwork"])
        self.player.online = False
        self.assertEqual(await self.player.async_get_media_image(), (None, None))

    async def test_position_updates_are_throttled_without_losing_seek_or_pause(self):
        writes = []; self.player.async_write_ha_state = lambda: writes.append(1)
        self.player.online = True
        base = {"version": 1, "player_id": "test-player", "boot_id": "boot-1", "status": "playing", "duration": 100}
        def receive(position, sequence, **changes):
            self.player._state_received(SimpleNamespace(payload=json.dumps({**base, "position": position, "sequence": sequence, **changes})))
        with patch.object(module.time, "monotonic", return_value=100):
            receive(10, 1)
        with patch.object(module.time, "monotonic", return_value=101):
            receive(11, 2)
        self.assertEqual(len(writes), 1)
        self.assertEqual(self.player.media_position, 10)
        self.assertEqual(self.player.snapshot["position"], 11)
        with patch.object(module.time, "monotonic", return_value=102):
            receive(12, 3, status="paused")
        self.assertEqual(len(writes), 2)
        with patch.object(module.time, "monotonic", return_value=103):
            receive(50, 4, status="paused")
        self.assertEqual(len(writes), 3)
        self.assertEqual(self.player.media_position, 50)

    async def test_native_track_selects_use_current_session_and_confirmed_feedback(self):
        spec = importlib.util.spec_from_file_location("cinemaseat_under_test.select", player_path.with_name("select.py"))
        select_module = importlib.util.module_from_spec(spec); spec.loader.exec_module(select_module)
        self.player.hass.data["cinemaseat"]["hub"].players = {"test-player": self.player}
        self.player.online = True; self.player.updated = time.monotonic()
        self.broker.state.update(status="playing", session_id="local-1", owner="local", can_control_playback=True,
            audio_tracks=[{"id":"audio-nl", "name":"Dutch"}], selected_audio_id="audio-nl",
            subtitle_tracks=[{"id":"sub-nl", "name":"Dutch"}], subtitles_off=True)
        self.player.snapshot = dict(self.broker.state)
        audio = select_module.CinemaSeatTrackSelect(self.player.entry, "audio"); audio.hass = self.player.hass
        subtitle = select_module.CinemaSeatTrackSelect(self.player.entry, "subtitle"); subtitle.hass = self.player.hass
        self.assertTrue(audio.available)
        self.assertEqual(audio.options, ["Dutch · audio-nl"])
        self.assertEqual(subtitle.current_option, "Off")
        await subtitle.async_select_option("Dutch · sub-nl")
        self.assertEqual(self.broker.commands[-1]["session_id"], "local-1")
        self.assertEqual(self.broker.commands[-1]["subtitle_id"], "sub-nl")
        self.assertEqual(subtitle.current_option, "Off")
        self.player.snapshot["presentation"] = {"phase":"trailer"}
        self.assertFalse(audio.available)

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
        with patch.object(module, "async_dispatcher_send"):
            self.player._availability_received(SimpleNamespace(payload="offline"))
        with self.assertRaisesRegex(HomeAssistantError,"disconnected"): await task
        self.assertEqual(self.player.pending,{})


if __name__ == "__main__": unittest.main()
