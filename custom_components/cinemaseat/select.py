"""Native track selectors belonging to the same CinemaSeat player device."""
from homeassistant.components.select import SelectEntity
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.dispatcher import async_dispatcher_connect


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([CinemaSeatTrackSelect(entry, "audio"), CinemaSeatTrackSelect(entry, "subtitle")])


class CinemaSeatTrackSelect(SelectEntity):
    _attr_should_poll = False
    _attr_has_entity_name = True

    def __init__(self, entry, kind):
        self.entry = entry
        self.kind = kind
        self._attr_name = "Audio" if kind == "audio" else "Subtitles"
        self._attr_unique_id = entry.data["player_id"] + "_" + kind
        self._attr_device_info = {"identifiers": {("cinemaseat", entry.data["player_id"])}}
        self._attr_icon = "mdi:volume-high" if kind == "audio" else "mdi:subtitles"

    @property
    def player(self):
        return self.hass.data["cinemaseat"]["hub"].players.get(self.entry.data["player_id"])

    async def async_added_to_hass(self):
        self.async_on_remove(async_dispatcher_connect(self.hass,
            "cinemaseat_state_" + self.entry.data["player_id"], self.async_write_ha_state))

    @property
    def available(self):
        player = self.player
        if not player or not player.available:
            return False
        state = player.snapshot
        presentation = state.get("presentation") or {}
        capability = "select_audio_current" if self.kind == "audio" else "select_subtitle_current"
        return (state.get("can_control_playback", state.get("ha_mode", True))
                and state.get("status") in {"playing", "paused"}
                and (not presentation or presentation.get("phase") == "movie")
                and state.get("owner") == "local" and capability in state.get("capabilities", [])
                and (self.kind == "subtitle" or bool(state.get("audio_tracks"))))

    def _choices(self):
        player = self.player
        if not player:
            return {}
        tracks = player.snapshot.get("audio_tracks" if self.kind == "audio" else "subtitle_tracks") or []
        return {f"{track['name']} · {track['id']}": track["id"] for track in tracks}

    @property
    def options(self):
        return (["Off"] if self.kind == "subtitle" else []) + list(self._choices())

    @property
    def current_option(self):
        player = self.player
        if not player:
            return None
        if self.kind == "subtitle" and player.snapshot.get("subtitles_off"):
            return "Off"
        current = player.snapshot.get("selected_audio_id" if self.kind == "audio" else "selected_subtitle_id")
        return next((name for name, track_id in self._choices().items() if track_id == current), None)

    async def async_select_option(self, option):
        player = self.player
        if not player or not self.available or option not in self.options:
            raise HomeAssistantError("Refresh the current CinemaSeat track selection")
        session_id = player.snapshot.get("session_id")
        if self.kind == "audio":
            await player.async_select_audio(self._choices()[option], session_id)
        else:
            await player.async_select_subtitle(session_id, track_id=self._choices().get(option), off=option == "Off")
        # The option changes only on confirmed player feedback, never on dispatch.
