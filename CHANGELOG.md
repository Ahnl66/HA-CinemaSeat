# Changelog

## 0.9.0 — 2026-10-19

- Use standard `media_player.play_media` for NAS Play Sequence and `media_player.media_play` for manual release of the current wait point. Keep explicit presentation IDs for delayed automation releases.
- Add native Plex/NAS media browsing with pagination and Direct Play / Play Sequence choices.
- Add bounded poster images through HA's media-player proxy, with caching and independent artwork requests that do not block playback commands.
- Add Audio and Subtitles select entities to the CinemaSeat device, with confirmed track feedback and stale-session validation.
- Expose flat presentation/feature attributes, actual curtain state and confirmed buffering; advertise controls according to mode and sequence phase.
- Throttle normal HA progress state writes while retaining immediate playback changes and second-by-second timecode events.
- Retain existing CinemaSeat actions/events. Explain standalone curtain retirement on current apps.
- Requires the updated CinemaSeat app and HA integration. Verified with Swift remote/presentation and sequence regressions, 37 HA integration tests, 14 pairing/WebSocket tests, 9 dashboard tests and an arm64 tvOS simulator build. Physical device and live HACS upgrade validation remain pending.

## 0.8.1 — 2026-10-18

- Allow the paired HA media player to control a Play Sequence started locally on ATV, without entering HA mode.
- Keep the ATV remote usable alongside HA pause/resume/stop, chapter, seek and track commands.
- Expose `can_control_playback` separately from `ha_mode` and enable the dashboard controls accordingly.
- Keep selecting/starting new content from HA restricted to explicit HA mode.
- Requires the updated CinemaSeat app as well as this HA integration. Verified with Swift protocol regressions, 29 HA tests, 9 dashboard tests and an arm64 tvOS simulator build.

## 0.8.0 — 2026-10-18

- Add Plex/NAS source search, NAS Play Sequence and track choices.
- Add correlated Prepare Start Sequence / Start Sequence handshake for CS-led and HA-led presentations.
- Publish validated playback/sequence events and feature timecodes to HA.
- Keep the ATV remote available alongside HA controls; add Skip sequence step and Move to Timecode.
- Keep direct playback independent of the sequence handshake. Curtains now belong to Play Sequence in the current ATV app.
- Add protocol, sequence, HA and dashboard regression coverage. Physical Apple TV/HA/NAS validation remains pending.

## 0.7.0 — 2026-10-14

- Add Make automation with these choices next to Start with these choices.
- Save the selected film, player and audio/subtitle choices in a manual automation.
- Capture Show curtain: show it, delay 10 seconds, then start the film.
- Unique automation IDs preserve existing automations; do not save transient player boot/session IDs.
- Admin-only creation through HA’s standard automation API, with an editor link and error recovery.

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
