"""Pair with the six-digit code displayed on the Apple TV."""
import re

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.setup import async_setup_component

from .transport import DOMAIN


class CinemaSeatConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 2

    async def async_step_user(self, user_input=None):
        return await self._pair(user_input)

    async def async_step_reconfigure(self, user_input=None):
        return await self._pair(user_input, entry=self._get_reconfigure_entry())

    async def _pair(self, user_input, entry=None):
        # HACS files alone do not load HA components. Opening this flow starts
        # the pairing endpoint even on a brand-new installation with no entries.
        if not await async_setup_component(self.hass, DOMAIN, {}):
            return self.async_abort(reason="cannot_connect")
        hub = self.hass.data[DOMAIN]["hub"]
        errors = {}
        if user_input is not None:
            code = str(user_input.get("pairing_code", "")).strip()
            try:
                if not re.fullmatch(r"[0-9]{6}", code):
                    raise ValueError("invalid_code")
                pairing = hub.peek_pairing(code)
                if entry and pairing.player_id != entry.data["player_id"]:
                    raise ValueError("wrong_player")
                await self.async_set_unique_id(pairing.player_id)
                if not entry:
                    self._abort_if_unique_id_configured()
                data = hub.claim_pairing(code)
            except ValueError as err:
                errors["pairing_code"] = str(err)
            else:
                name = user_input.get("name", entry.title if entry else "CinemaSeat Apple TV").strip()
                name = name or "CinemaSeat Apple TV"
                data["name"] = name
                if entry:
                    # Replace rather than merge to remove requires_pairing/legacy fields.
                    return self.async_update_reload_and_abort(entry, title=name, data=data)
                return self.async_create_entry(title=name, data=data)
        return self.async_show_form(step_id="reconfigure" if entry else "user",
            data_schema=vol.Schema({
                vol.Required("pairing_code"): str,
                vol.Optional("name", default=entry.title if entry else "CinemaSeat Apple TV"): str,
            }), errors=errors)
