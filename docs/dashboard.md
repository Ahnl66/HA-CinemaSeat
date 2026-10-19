# CinemaSeat control and test dashboard — 0.11.1

The bundled JavaScript now provides `custom:cinemaseat-dashboard-card`. Existing `custom:cinemaseat-search-card` configurations still work and receive the same controls. There are no extra frontend dependencies, helper entities or automatic room actions.

Register the module `/cinemaseat/cinema-search-card.js?v=0.11.1`. Use a panel view for the complete dashboard; the card handles its own responsive columns and tabs. In an existing multi-card dashboard it can also be used as a normal card. Replace the example entity with the existing CinemaSeat media player; the dashboard's player selector discovers other CinemaSeat players automatically.

## Pages and coverage

| Page | Controls and tests |
| --- | --- |
| Control | Current poster, feature/current clip title, connection/permission chips, progress, pause/resume/stop, chapters, Move to Timecode, whole-presentation release with its exact ID, skip preroll, actual curtain state, legacy curtain action when advertised. |
| Library | Plex/NAS/all search, native media browser, source folders, movie playback choices, pagination/back, poster thumbnails, exact movie-ID lookup, full film/track details, direct playback or Play Sequence with selected tracks. |
| Events & tests | Explicit live subscription to `cinemaseat_event`, selected-player filter, event categories, complete event payloads, bounded 150-event log, JSON download, observational film-version/presentation timecode crossing test and a manual integration checklist. |
| Diagnostics | Player/boot/session/presentation IDs, HA/app states, library/control/start permissions, owner, source, errors/buffering, all capabilities and state attributes, native HA entity details, HA entity-state refresh and JSON diagnostics download. |

The current feature remains identified while preroll clips play. HA progress uses `media_position_updated_at` and is an estimate between state updates; the marker test uses actual received timecode events. Unsupported controls remain disabled or hidden.

## Compare the integration routes

**Sequence preparation route** on Control chooses standard `media_player.play_media` with `extra.playback_mode: sequence` or the retained `cinemaseat.prepare_sequence` action. Both prepare the same NAS sequence and wait for release. **Release this presentation** uses `cinemaseat.start_sequence` with the displayed exact presentation ID. Standard Play also releases the current wait point. No automatic release is installed.

**Film audio & subtitles** uses `cinemaseat.select_audio` / `select_subtitle` with the current clip session ID. **Native HA selectors** uses `select.select_option` against the same device's Audio/Subtitles entities. Both follow confirmed player feedback.

New selector attributes expose `player_id` and `track_type` for reliable discovery. The dashboard also supports existing selector entities through HA's entity registry. Optional `audio_entity` and `subtitle_entity` settings select explicit entities for the configured primary player; other players are discovered separately. Registry access failures do not disable the rest of the dashboard.

**Saved automation playback** under the selected film chooses Direct Play or Play Sequence. Creating an automation does not play anything. Sequence start automations still need your existing Prepare/Start Sequence release automation or a manual release. Saved start automations contain no boot/session/presentation IDs. Creating automations requires an HA administrator.

## Event monitor and marker test

Press **Start listening** before beginning a sequence; missed events are not replayed. Listening can require an HA administrator, and subscription errors appear in the monitor. Direct Play does not emit sequence events. Changing the selected player changes the visible event scope. Closing/removing the card stops listening, including a subscription that resolves after removal. Reopening does not silently start another subscription.

The timecode marker captures the current player's boot ID, presentation ID and exact feature movie ID. It fires once only when a genuine playing, non-buffering, continuous `timecode` sample crosses the target (`previous_position < target <= position`). Paused samples and discontinuities from skipped ranges are ignored. It executes no HA service or room script. A new film version/presentation needs a new marker. This browser-only test is not a persistent automation.

The event log retains at most 150 received events in memory. Filtering does not alter the retained log; download exports the selected player's retained events. Open payloads stay open as new events arrive. Downloads are local JSON files, with no external upload.

## Compatibility and setup

For the complete feature set, update the HA integration and use a CinemaSeat app build that supports native browsing/artwork and persistent HA control (app changes shipped with 0.10.0). Updating this dashboard requires no additional ATV code. Older apps remain controllable through their advertised capabilities; the dashboard cannot add missing app capabilities.

On a 0.10.0+ app, keep CS open and enable **Allow control from Home Assistant** in its HA settings. Paired library/status reads are independent of that permission. An active film/sequence must be stopped before a new start. Updating a dashboard does not change the ATV permission, pairing, room scripts or current playback.

After a HACS integration update, restart HA at a suitable time to activate Python changes. Refresh the versioned card resource and reload the browser. Updating the JavaScript resource alone can refresh the dashboard without interrupting a currently playing film; existing selector discovery also works through the registry.

The provided JSON/YAML example is for the dashboard UI editor/import, not an instruction to edit HA `.storage` files. Existing dashboards are user configuration: update only the CinemaSeat dashboard, retain a copy of its original config, and preserve its URL and actual player entity.

## Verification

DOM regressions cover multi-player commands, browser pagination/failure recovery, exact presentation release, preroll control boundaries, both track routes, registry sibling discovery, live subscription cleanup/late completion, event bounds/open payloads, marker exclusions, metadata escaping, capability checks and saved sequence automations. Visual QA uses mock CinemaSeat data in a browser at desktop and phone widths; it sends no playback commands to a real player.
