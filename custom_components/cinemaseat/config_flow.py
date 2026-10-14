"""Pair a player without exposing broker credentials."""
import re
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.helpers import selector

class CinemaSeatConfigFlow(config_entries.ConfigFlow, domain="cinemaseat"):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        errors = {}
        if user_input is not None:
            player = user_input["player_id"].strip()
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", player):
                errors["player_id"] = "invalid_player"
            elif len(user_input["auth_token"].encode()) < 32:
                errors["auth_token"] = "invalid_token"
            else:
                await self.async_set_unique_id(player)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=user_input["name"], data={**user_input, "player_id": player})
        return self.async_show_form(step_id="user", data_schema=vol.Schema({
            vol.Required("name", default="CinemaSeat Apple TV"): str,
            vol.Required("player_id"): str,
            vol.Required("auth_token"): selector.TextSelector(selector.TextSelectorConfig(type=selector.TextSelectorType.PASSWORD)),
        }), errors=errors)
