"""CinemaSeat lifecycle and bundled dashboard resource."""
from pathlib import Path
from contextlib import suppress
from homeassistant.exceptions import HomeAssistantError

from aiohttp import web
import voluptuous as vol

from homeassistant.components.http import HomeAssistantView
from homeassistant.const import Platform, EVENT_HOMEASSISTANT_STOP
from homeassistant.core import SupportsResponse
from homeassistant.helpers import config_validation as cv, service

from .transport import PlayerHub, CinemaSeatPlayerView

DOMAIN = "cinemaseat"
SERVICES = ("movie_details", "select_audio", "select_subtitle", "show_curtain", "prepare_sequence", "start_sequence", "advance_sequence")


class CinemaSeatCardView(HomeAssistantView):
    """Serve public JavaScript only while a player entry is loaded."""

    url = "/cinemaseat/cinema-search-card.js"
    name = "cinemaseat:search_card"
    requires_auth = False

    def __init__(self, hass):
        self.hass = hass

    async def get(self, request):
        if not self.hass.data.get(DOMAIN, {}).get("entries"):
            raise web.HTTPNotFound()
        return web.FileResponse(
            Path(__file__).with_name("cinema-search-card.js"),
            headers={"Cache-Control": "no-cache"},
        )


def _register_services(hass):
    """Register actions when the first player is loaded."""
    service.async_register_platform_entity_service(
        hass, DOMAIN, "prepare_sequence", entity_domain="media_player",
        schema={vol.Required("movie_id"): cv.string, vol.Optional("audio_id"): cv.string,
                vol.Optional("subtitle_id"): cv.string, vol.Optional("subtitles_off", default=True): cv.boolean},
        func="async_prepare_sequence", supports_response=SupportsResponse.OPTIONAL,
    )
    service.async_register_platform_entity_service(
        hass, DOMAIN, "start_sequence", entity_domain="media_player",
        schema={vol.Required("presentation_id"): cv.string}, func="async_start_sequence",
    )
    service.async_register_platform_entity_service(
        hass, DOMAIN, "advance_sequence", entity_domain="media_player",
        schema={}, func="async_advance_sequence",
    )
    service.async_register_platform_entity_service(
        hass, "cinemaseat", "show_curtain", entity_domain="media_player",
        schema={vol.Optional("show", default=True): cv.boolean}, func="async_show_curtain",
    )
    service.async_register_platform_entity_service(
        hass, "cinemaseat", "movie_details", entity_domain="media_player",
        schema={vol.Required("movie_id"): vol.All(cv.string, vol.Length(min=1, max=128))},
        func="async_movie_details", supports_response=SupportsResponse.ONLY,
    )
    service.async_register_platform_entity_service(
        hass, "cinemaseat", "select_audio", entity_domain="media_player",
        schema={vol.Required("track_id"): cv.string, vol.Required("session_id"): cv.string},
        func="async_select_audio",
    )
    service.async_register_platform_entity_service(
        hass, "cinemaseat", "select_subtitle", entity_domain="media_player",
        schema={vol.Optional("track_id"): cv.string, vol.Required("session_id"): cv.string,
                vol.Optional("off", default=False): cv.boolean},
        func="async_select_subtitle",
    )


def _remove_services(hass):
    for name in SERVICES:
        hass.services.async_remove(DOMAIN, name)


async def async_setup(hass, config):
    hub = PlayerHub(hass)
    hass.data[DOMAIN] = {"entries": set(), "hub": hub}
    hass.http.register_view(CinemaSeatPlayerView(hub))
    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, hub.shutdown)
    # HA keeps HTTP routes until restart. This single view returns 404 after
    # the last entry unloads and can serve the card again after reinstall.
    hass.http.register_view(CinemaSeatCardView(hass))
    return True


async def async_setup_entry(hass, entry):
    entries = hass.data[DOMAIN]["entries"]
    if not entries:
        _register_services(hass)
    entries.add(entry.entry_id)
    hub = hass.data[DOMAIN]["hub"]
    hub.register_entry(entry)
    try:
        await hass.config_entries.async_forward_entry_setups(entry, [Platform.MEDIA_PLAYER])
    except Exception:
        entries.discard(entry.entry_id)
        await hub.unregister_entry(entry)
        if not entries:
            _remove_services(hass)
        raise
    hub.finish_pairing(entry)
    return True


async def async_unload_entry(hass, entry):
    if not await hass.config_entries.async_unload_platforms(entry, [Platform.MEDIA_PLAYER]):
        return False
    entries = hass.data[DOMAIN]["entries"]
    entries.discard(entry.entry_id)
    await hass.data[DOMAIN]["hub"].unregister_entry(entry)
    if not entries:
        _remove_services(hass)
    return True


async def async_migrate_entry(hass, entry):
    """Retain player identity; old MQTT secrets cannot authenticate direct control."""
    if entry.version > 2:
        return False
    if entry.version == 1:
        player_id = entry.data["player_id"]
        # Remove only discovery sensors emitted by our old app, if MQTT is loaded.
        if "mqtt" in hass.config.components:
            from homeassistant.components import mqtt
            from .transport import PLAYER_ID
            if PLAYER_ID.fullmatch(player_id):
                for sensor in ("status", "title", "position", "regie"):
                    with suppress(HomeAssistantError):
                        await mqtt.async_publish(hass,
                            f"homeassistant/sensor/cinemaseat_{player_id}/{sensor}/config",
                            "", qos=1, retain=True)
        hass.config_entries.async_update_entry(entry, version=2,
            data={"player_id": player_id, "name": entry.data.get("name", entry.title),
                  "transport": "direct", "requires_pairing": True})
    return True
