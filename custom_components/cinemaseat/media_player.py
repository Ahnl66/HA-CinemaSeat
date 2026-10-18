"""Search and confirmed playback through CinemaSeat's paired direct WebSocket player."""
import asyncio
from contextlib import suppress
import json
import math
import time
from datetime import timedelta
from uuid import uuid4
from types import SimpleNamespace

from homeassistant.components.media_player import (
    MediaClass, MediaPlayerEntity, MediaPlayerEntityFeature, MediaPlayerState,
    MediaType, SearchMedia,
)
from homeassistant.components.media_player.browse_media import BrowseMedia
from homeassistant.components.media_player.errors import SearchError
from homeassistant.core import callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.util import dt as dt_util


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([CinemaSeatPlayer(entry)])


class CinemaSeatPlayer(MediaPlayerEntity):
    _attr_should_poll = False
    _attr_supported_features = (
        MediaPlayerEntityFeature.PLAY | MediaPlayerEntityFeature.PAUSE
        | MediaPlayerEntityFeature.STOP | MediaPlayerEntityFeature.NEXT_TRACK
        | MediaPlayerEntityFeature.PREVIOUS_TRACK | MediaPlayerEntityFeature.PLAY_MEDIA
        | MediaPlayerEntityFeature.SEARCH_MEDIA | MediaPlayerEntityFeature.SEEK
    )
    _attr_media_content_type = MediaType.MOVIE

    def __init__(self, entry):
        self.entry = entry
        self._attr_name = entry.title
        self._attr_unique_id = entry.data["player_id"] + "_media_player"
        self.controller = str(uuid4())
        self.snapshot = {}
        self.online = False
        self._unloading = False
        self.updated = 0.0
        self.pending = {}
        self._last_event = None
        self.command_lock = asyncio.Lock()
        self._attr_device_info = {
            "identifiers": {("cinemaseat", entry.data["player_id"])},
            "name": entry.title, "manufacturer": "CinemaSeat", "model": "Apple TV player",
        }

    async def async_added_to_hass(self):
        self.hass.data["cinemaseat"]["hub"].bind_player(self)
        self.async_on_remove(async_track_time_interval(
            self.hass, self._check_stale, timedelta(seconds=5)))

    async def async_will_remove_from_hass(self):
        self._unloading = True
        self._fail_pending("CinemaSeat was unloaded")
        self.hass.data["cinemaseat"]["hub"].unbind_player(self)

    @callback
    def connection_changed(self, online):
        self.online = online
        if online:
            self.updated = 0
            self.snapshot = {}
            self._last_event = None
        else:
            self._fail_pending("CinemaSeat disconnected; open CinemaSeat and select HA mode")
        self.async_write_ha_state()

    @callback
    def receive_frame(self, frame):
        if frame.get("type") == "state" and isinstance(frame.get("state"), dict):
            self._state_received(SimpleNamespace(payload=json.dumps(frame["state"])))
        elif frame.get("type") == "reply" and isinstance(frame.get("reply"), dict):
            self._reply_received(SimpleNamespace(payload=json.dumps(frame["reply"])))

        elif frame.get("type") == "event" and isinstance(frame.get("event"), dict):
            self._event_received(frame["event"])

    @callback
    def _event_received(self, event):
        presentation = event.get("presentation")
        allowed = {"prepare_start_sequence", "sequence_released", "sequence_stopped", "sequence_ended",
                   "curtain_opening_started", "curtain_opening_ended", "theater_intro_started", "theater_intro_ended",
                   "trailer_intro_started", "trailer_intro_ended", "trailer_started", "trailer_ended",
                   "rating_started", "rating_ended", "audio_started", "audio_ended", "start_movie", "pause_movie",
                   "resume_movie", "change_chapter", "change_audio", "change_subtitle", "stop_movie", "movie_ended",
                   "timecode", "step_skipped", "playback_error"}
        if (event.get("version") != 1 or event.get("player_id") != self.entry.data["player_id"]
                or event.get("boot_id") != self.snapshot.get("boot_id")
                or event.get("event") not in allowed or not isinstance(presentation, dict)):
            return
        sequence = event.get("sequence")
        if not isinstance(sequence, int) or sequence < 0:
            return
        key = (event["boot_id"], sequence)
        if self._last_event and key[0] == self._last_event[0] and key[1] <= self._last_event[1]:
            return
        current = self.snapshot.get("presentation") or {}
        if not presentation.get("id") or current.get("id") != presentation["id"]:
            return
        self._last_event = key
        state = event.get("state") or {}
        data = {"entity_id": self.entity_id, "player_id": event["player_id"],
                "boot_id": event["boot_id"], "presentation_id": presentation["id"],
                "session_id": event.get("session_id"), "event": event["event"], "sequence": sequence,
                "movie_id": presentation.get("movie_id"), "lead": presentation.get("lead"),
                "source": "nas" if (presentation.get("movie_id") or "").startswith("nas:") else "plex",
                "phase": presentation.get("phase"), "position": state.get("position", 0),
                "duration": state.get("duration", 0), "status": state.get("status"),
                "previous_position": event.get("previous_position"), "discontinuity": event.get("discontinuity", True),
                "buffering": state.get("buffering", False), "chapter_id": state.get("chapter_id"),
                "audio_id": state.get("selected_audio_id"), "subtitle_id": state.get("selected_subtitle_id"),
                "subtitles_off": state.get("subtitles_off")}
        self.hass.bus.async_fire("cinemaseat_event", data)

    async def _send_command(self, command):
        await self.hass.data["cinemaseat"]["hub"].send(self.entry.data["player_id"], command)

    @callback
    def _check_stale(self, _now):
        self.async_write_ha_state()

    @callback
    def _state_received(self, message):
        try:
            value = json.loads(message.payload)
            if value.get("version") != 1 or value.get("player_id") != self.entry.data["player_id"]:
                return
            if (value.get("boot_id") == self.snapshot.get("boot_id")
                    and value.get("sequence", 0) < self.snapshot.get("sequence", 0)):
                return
            old_boot = self.snapshot.get("boot_id")
            if old_boot and old_boot != value.get("boot_id"):
                self._fail_pending("CinemaSeat restarted during the operation")
            self.snapshot = value
            self.updated = time.monotonic()
            self._attr_media_position_updated_at = dt_util.utcnow()
            self.async_write_ha_state()
        except (ValueError, TypeError, AttributeError):
            return

    def _fail_pending(self, message):
        for item in self.pending.values():
            if not item["future"].done():
                item["future"].set_exception(HomeAssistantError(message))

    @callback
    def _availability_received(self, message):
        self.online = message.payload == "online"
        if not self.online:
            self._fail_pending("CinemaSeat disconnected; open CinemaSeat and select HA mode")
        self.async_write_ha_state()

    @callback
    def _reply_received(self, message):
        try:
            reply = json.loads(message.payload)
            item = self.pending.get(str(reply.get("command_id", "")).lower())
            if not item or item["future"].done() or reply.get("version") != 1:
                return
            if item["boot"] and reply.get("boot_id") != item["boot"]:
                return
            if reply.get("status") in {"executed", "accepted", "rejected"}:
                if reply.get("session_id") and item["operation"] is not None:
                    item["operation"]["session_id"] = reply["session_id"]
                if reply["status"] != "accepted" or item["accepted_ok"]:
                    item["future"].set_result(reply)
        except (ValueError, TypeError, AttributeError):
            return

    @property
    def available(self):
        return self.online and time.monotonic() - self.updated < 20

    @property
    def state(self):
        return {
            "playing": MediaPlayerState.PLAYING, "paused": MediaPlayerState.PAUSED,
            "preparing": MediaPlayerState.BUFFERING, "ready": MediaPlayerState.PAUSED,
        }.get(self.snapshot.get("status"), MediaPlayerState.IDLE)

    @property
    def media_title(self):
        return self.snapshot.get("title")

    @property
    def media_content_id(self):
        return self.snapshot.get("movie_id")

    @property
    def media_position(self):
        return self.snapshot.get("position", 0)

    @property
    def media_duration(self):
        return self.snapshot.get("duration", 0)

    @property
    def extra_state_attributes(self):
        return {"pairing_required": not bool(self.entry.data.get("auth_token")), **{k: self.snapshot.get(k) for k in [
            "player_id", "boot_id", "session_id", "status", "owner", "buffering", "error_code",
            "capabilities", "curtain_state", "presentation", "ha_mode", "can_control_playback", "chapter_id",
            "audio_tracks", "subtitle_tracks", "selected_audio_id", "selected_subtitle_id", "subtitles_off",
        ]}}

    async def _request(self, action, state=None, *, timeout=20, operation=None, **fields):
        if self._unloading:
            raise HomeAssistantError("CinemaSeat was unloaded")
        command_id = str(uuid4())
        future = self.hass.loop.create_future()
        self.pending[command_id] = {
            "future": future, "boot": (state or {}).get("boot_id"),
            "accepted_ok": action.endswith("chapter_current") or action in {
                "select_audio_current", "select_subtitle_current", "seek_current", "advance_sequence"}, "operation": operation,
        }
        command = {
            "version": 1, "command_id": command_id, "player_id": self.entry.data["player_id"],
            "controller_id": self.controller, "auth_token": self.entry.data.get("auth_token", ""),
            "expires_at": time.time() + 20, "action": action,
        }
        if state:
            command.update(boot_id=state["boot_id"], session_id=state.get("session_id"))
        command.update(fields)
        try:
            await self._send_command(command)
            reply = await asyncio.wait_for(future, timeout=timeout)
            if reply["status"] == "rejected":
                raise HomeAssistantError("CinemaSeat: " + reply.get("code", "rejected"))
            return reply
        except TimeoutError as err:
            raise HomeAssistantError("CinemaSeat did not respond; open CinemaSeat and select HA mode") from err
        finally:
            self.pending.pop(command_id, None)

    async def async_search_media(self, query):
        text = query.search_query.strip()
        if not text or len(text) > 128:
            raise SearchError("Enter a film title of 1–128 characters")
        if query.media_content_type not in (None, MediaType.MOVIE, "cinemaseat", "cinemaseat_nas", "cinemaseat_plex"):
            return SearchMedia(result=[])
        if query.media_filter_classes and MediaClass.MOVIE not in query.media_filter_classes:
            return SearchMedia(result=[])
        async with self.command_lock:
            try:
                state = (await self._request("get_state"))["state"]
                if "search_movies" not in state.get("capabilities", []):
                    raise HomeAssistantError("Update CinemaSeat on the connected player to enable search")
                reply = await self._request("search_movies", state, query=text,
                                            source={"cinemaseat_nas": "nas", "cinemaseat_plex": "plex"}.get(query.media_content_type, "all"))
            except HomeAssistantError as err:
                raise SearchError(str(err)) from err
        return SearchMedia(result=[BrowseMedia(
            media_class=MediaClass.MOVIE, media_content_type=MediaType.MOVIE,
            media_content_id=movie["id"],
            title=movie["title"] + (f" ({movie['year']})" if movie.get("year") else "") + (" [NAS]" if movie["id"].startswith("nas:") else " [Plex]"),
            can_play=True, can_expand=False,
        ) for movie in reply.get("movies", [])])

    async def _heartbeat(self, state, control):
        while True:
            await asyncio.sleep(5)
            await self._request("heartbeat", state, control_id=control, timeout=8)

    async def async_movie_details(self, movie_id):
        async with self.command_lock:
            state = (await self._request("get_state"))["state"]
            if "get_movie_details" not in state.get("capabilities", []):
                raise HomeAssistantError("Update CinemaSeat on the connected player to choose tracks")
            reply = await self._request("get_movie_details", state, movie_id=movie_id)
            movies = reply.get("movies", [])
            if len(movies) != 1 or movies[0].get("id") != movie_id:
                raise HomeAssistantError("CinemaSeat did not return the selected film")
            return {"movie": movies[0], "boot_id": state["boot_id"]}

    async def _select_track(self, action, session_id, **fields):
        async with self.command_lock:
            state = (await self._request("get_state"))["state"]
            if state.get("session_id") != session_id:
                raise HomeAssistantError("The film changed; refresh the track selection")
            if state.get("status") not in {"playing", "paused"}:
                raise HomeAssistantError("Start the film before switching tracks")
            if state.get("owner") != "local":
                raise HomeAssistantError("Another controller owns this film")
            if action not in state.get("capabilities", []):
                raise HomeAssistantError("Update CinemaSeat on the connected player to switch tracks")
            await self._request(action, state, **fields)

    async def async_select_audio(self, track_id, session_id):
        await self._select_track("select_audio_current", session_id, audio_id=track_id)

    async def async_select_subtitle(self, session_id, track_id=None, off=False):
        if (off and track_id is not None) or (not off and not track_id):
            raise HomeAssistantError("Choose a subtitle track or turn subtitles off")
        await self._select_track("select_subtitle_current", session_id,
                                 subtitle_id=track_id, subtitles_off=off)

    async def _start_movie(self, state, control, movie_id, operation, tracks):
        prepared = await self._request(
            "prepare", state, control_id=control, movie_id=movie_id,
            position=0, timeout=120, operation=operation, **tracks)
        session = prepared.get("session_id")
        if not session:
            raise HomeAssistantError("CinemaSeat did not confirm a prepared film")
        operation["session_id"] = session
        await self._request("start", {**state, "session_id": session},
                            control_id=control, timeout=120)

    async def async_play_media(self, media_type, media_id, **kwargs):
        if media_type not in (MediaType.MOVIE, "cinemaseat") or not isinstance(media_id, str) or not media_id or len(media_id) > 128:
            raise HomeAssistantError("Choose a CinemaSeat film result")
        if kwargs.get("announce") or kwargs.get("enqueue") not in (None, "replace", "play"):
            raise HomeAssistantError("CinemaSeat does not support announcements or a playback queue")
        extra = kwargs.get("extra") or {}
        if not isinstance(extra, dict):
            raise HomeAssistantError("Invalid track selection")
        audio_id = extra.get("audio_id")
        subtitle_id = extra.get("subtitle_id")
        off = extra.get("subtitles_off", subtitle_id is None)
        if (any(track is not None and (not isinstance(track, str) or not track or len(track) > 128)
                for track in (audio_id, subtitle_id)) or not isinstance(off, bool)
                or (off and subtitle_id is not None)):
            raise HomeAssistantError("Invalid track selection")
        tracks = {"audio_id": audio_id, "subtitle_id": subtitle_id, "subtitles_off": off}
        async with self.command_lock:
            state = (await self._request("get_state"))["state"]
            if extra.get("boot_id") and extra["boot_id"] != state["boot_id"]:
                raise HomeAssistantError("CinemaSeat restarted; choose the film again")
            if state.get("status") not in {"idle", "stopped", "ended", "error"}:
                raise HomeAssistantError("Stop the current film before starting another film")
            control = (await self._request("claim_control", state)).get("control_id")
            if not control:
                raise HomeAssistantError("CinemaSeat did not grant control")
            operation = {}
            heartbeat = self.hass.async_create_task(self._heartbeat(state, control))
            start = self.hass.async_create_task(self._start_movie(state, control, media_id, operation, tracks))
            success = False
            try:
                done, _ = await asyncio.wait({start, heartbeat}, return_when=asyncio.FIRST_COMPLETED)
                if heartbeat in done:
                    await heartbeat
                    raise HomeAssistantError("CinemaSeat heartbeat stopped")
                await start
                # Stop heartbeats before relinquishing the lease, so a late
                # heartbeat cannot fail a successfully started presentation.
                heartbeat.cancel()
                with suppress(asyncio.CancelledError):
                    await heartbeat
                await self._request("release_control", state, control_id=control)
                success = True
            finally:
                for task in (start, heartbeat):
                    task.cancel()
                for task in (start, heartbeat):
                    with suppress(asyncio.CancelledError, HomeAssistantError):
                        await task
                if not success:
                    # Cancel only the session owned by this start transaction.
                    if operation.get("session_id"):
                        with suppress(HomeAssistantError):
                            await self._request("cancel", {**state, "session_id": operation["session_id"]},
                                                control_id=control, timeout=8)
                    with suppress(HomeAssistantError):
                        await self._request("release_control", state, control_id=control, timeout=8)

    async def async_prepare_sequence(self, movie_id, audio_id=None, subtitle_id=None, subtitles_off=True):
        async with self.command_lock:
            state = (await self._request("get_state"))["state"]
            if "prepare_sequence" not in state.get("capabilities", []):
                raise HomeAssistantError("Update CinemaSeat to use Play Sequence")
            if not movie_id.startswith("nas:"):
                raise HomeAssistantError("Play Sequence requires an indexed NAS film")
            reply = await self._request("prepare_sequence", state, movie_id=movie_id, audio_id=audio_id,
                                        subtitle_id=subtitle_id, subtitles_off=subtitles_off)
            return {"presentation_id": (reply.get("state", {}).get("presentation") or {}).get("id")}

    async def async_start_sequence(self, presentation_id):
        async with self.command_lock:
            state = (await self._request("get_state"))["state"]
            if (state.get("presentation") or {}).get("id") != presentation_id:
                raise HomeAssistantError("The presentation changed; this release has expired")
            await self._request("start_sequence", state, presentation_id=presentation_id)

    async def async_advance_sequence(self):
        async with self.command_lock:
            state = (await self._request("get_state"))["state"]
            presentation = state.get("presentation") or {}
            if not presentation.get("id"):
                raise HomeAssistantError("No current sequence")
            await self._request("advance_sequence", state, presentation_id=presentation["id"])

    async def async_media_seek(self, position):
        if not isinstance(position, (int, float)) or not math.isfinite(position) or position < 0:
            raise HomeAssistantError("Enter a valid timecode in seconds")
        async with self.command_lock:
            state = (await self._request("get_state"))["state"]
            if "seek_current" not in state.get("capabilities", []):
                raise HomeAssistantError("Update CinemaSeat to use Move to Timecode")
            await self._request("seek_current", state, position=position)

    async def async_show_curtain(self, show=True):
        async with self.command_lock:
            state = (await self._request("get_state"))["state"]
            if "show_curtain" not in state.get("capabilities", []):
                raise HomeAssistantError("Update the CinemaSeat tvOS app to use Show curtain.")
            if state.get("status") not in {"idle", "stopped", "ended", "error"}:
                raise HomeAssistantError("Stop the current film before changing the curtain.")
            await self._request("show_curtain", state, show=show)

    async def _transport(self, action):
        async with self.command_lock:
            state = (await self._request("get_state"))["state"]
            status = state.get("status")
            presentation = state.get("presentation") or {}
            if presentation.get("id"):
                if action == "stop_current":
                    await self._request(action, state, presentation_id=presentation["id"])
                    return
                if action == "play" and presentation.get("waiting_for_ha"):
                    raise HomeAssistantError("Use Start Sequence with the presentation ID to release this wait point")
                if presentation.get("phase") != "movie":
                    if action == "next_chapter_current":
                        await self._request("advance_sequence", state, presentation_id=presentation["id"])
                        return
                    raise HomeAssistantError("This control is available during the feature; use Skip sequence step for preroll")
            if not state.get("session_id") or status in {"idle", "stopped", "ended", "error"}:
                if action == "stop_current":
                    return
                raise HomeAssistantError("No current film. Search and choose a film first.")
            if action == "play":
                if status == "playing":
                    return
                action = "start_current" if status == "ready" else "resume_current"
            await self._request(action, state)

    async def async_media_play(self):
        await self._transport("play")

    async def async_media_pause(self):
        await self._transport("pause_current")

    async def async_media_stop(self):
        await self._transport("stop_current")

    async def async_media_next_track(self):
        await self._transport("next_chapter_current")

    async def async_media_previous_track(self):
        await self._transport("previous_chapter_current")
