"""CinemaSeat lifecycle and bundled dashboard resource."""
from pathlib import Path

from aiohttp import web
import voluptuous as vol

from homeassistant.components.http import HomeAssistantView
from homeassistant.const import Platform
from homeassistant.core import SupportsResponse
from homeassistant.helpers import config_validation as cv, service

DOMAIN = "cinemaseat"
SERVICES = ("movie_details", "select_audio", "select_subtitle")


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
    hass.data[DOMAIN] = {"entries": set()}
    # HA keeps HTTP routes until restart. This single view returns 404 after
    # the last entry unloads and can serve the card again after reinstall.
    hass.http.register_view(CinemaSeatCardView(hass))
    return True


async def async_setup_entry(hass, entry):
    entries = hass.data[DOMAIN]["entries"]
    if not entries:
        _register_services(hass)
    entries.add(entry.entry_id)
    try:
        await hass.config_entries.async_forward_entry_setups(entry, [Platform.MEDIA_PLAYER])
    except Exception:
        entries.discard(entry.entry_id)
        if not entries:
            _remove_services(hass)
        raise
    return True


async def async_unload_entry(hass, entry):
    if not await hass.config_entries.async_unload_platforms(entry, [Platform.MEDIA_PLAYER]):
        return False
    entries = hass.data[DOMAIN]["entries"]
    entries.discard(entry.entry_id)
    if not entries:
        _remove_services(hass)
    return True
