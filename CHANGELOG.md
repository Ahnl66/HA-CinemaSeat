# Changelog

## 0.6.0 — 2026-10-14

- Add Show curtain to the selected-player card and a `cinemaseat.show_curtain` action.
- The updated tvOS app shows the closed first frame until film start, then opens the existing curtain animation.
- Curtain state is confirmed by the player; older apps disable the new button until updated.
- HA curtain control is independent of the normal app setting and resets when leaving HA mode or ending playback.

## 0.5.1 — 2026-10-14

- Playback, pause, stop, and chapter controls are built into the search card and follow its player selector.
- Show the selected player’s current film and playback state; disable commands that do not apply.
- Simplify example dashboards to avoid buttons bound to a different player.

## 0.5.0 — 2026-10-14

- Direct Home Assistant WebSocket connection; no MQTT configuration or broker required.
- Six-digit, single-use pairing codes valid for two minutes, with permanent keys stored automatically.
- Simplified tvOS settings: HA address, port, generated player ID, and Request pairing code.
- HA derives the player ID automatically and supports Reconfigure for re-pairing.
- Existing entries retain entity identity during migration and require a fresh direct pairing.
- Scoped keys, pairing limits, authenticated reconnect, socket cleanup, and expanded tests.


## 0.4.0 — 2026-10-14

- First standalone HA-CinemaSeat repository and HACS release.
- Bundled search/track card, brand icon, and English installation, update, removal, action, and protocol documentation.
- Unregister CinemaSeat actions after the last player unloads; keep other loaded players working.
- Disable the bundled card endpoint when no player is loaded.
- Fail pending operations on unload and prevent subsequent commands from an unloaded entity.
- Preserve the `cinemaseat` domain and existing player entries for migration from manual installations.

## Earlier versions

0.2.0 introduced searching and confirmed film start through the paired tvOS app. 0.3.0 added audio/subtitle selection; 0.3.1 documented the single CinemaSeat app with an HA mode. These versions were maintained inside the CinemaPlexTV project.
