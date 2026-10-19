> Current behavior (0.10.0): no separate HA mode. See the [media-player and permission reference](media-player.md). Enable Allow control from Home Assistant once in the ATV HA settings; pairing alone grants library/status access.

# CinemaSeat / Home Assistant sequence control

## Two presentation initiators

**CS leads:** start Play Sequence on Apple TV in normal browsing. The per-NAS-source Sequence option **Wait for Home Assistant before starting** is off by default. When enabled, CinemaSeat emits `prepare_start_sequence` and holds the first content and curtain until HA releases this specific presentation. The TV offers **Start anyway** and **Cancel**. While the sequence is active, the paired HA media player and ATV remote can both control it. Starting/controlling playback from HA requires the persistent Allow control from Home Assistant permission. Sequence events and feature timecode are sent while a paired connection is available, including when waiting is disabled.

**HA leads:** keep CinemaSeat open, enable Allow control from Home Assistant in its HA settings, and search Plex, NAS, or both in the HA card. For an indexed NAS film, **Play Sequence** / `cinemaseat.prepare_sequence` requests the same sequence and always waits for HA's explicit release. The TV remote stays usable. During preroll HA can release, skip a step, or stop the whole presentation. During the feature HA can pause, resume, stop, navigate chapters, select audio/subtitles and use `media_player.media_seek`. The card exposes **Move to Timecode** in HH:MM:SS. Sequence playback always starts the feature at zero. Audio/subtitle choices are retained through preroll; explicit choices override saved defaults.

**Direct Play** never creates a presentation or runs the HA sequence handshake/events. Normal local direct playback remains outside HA control and sequence events; its status is readable through the paired foreground connection. Existing direct `media_player.play_media` with playback permission is retained and starts without a sequence or presentation events. Browsing elsewhere in the app remains unchanged.

## Connection and ownership

Keep existing six-digit pairing and direct WebSocket transport. The paired app connects while on the foreground, independently of a sequence or playback permission. Backgrounding disconnects the socket. Returning reconnects automatically, without restarting or reclaiming playback. Events are not replayed after reconnect. A pending Prepare is sent once, when the first connection becomes available; a reconnect does not rerun an already sent preparation script. The waiting TV remains usable when HA is offline.

The presentation ID spans all preroll clips and the feature. Clip session IDs continue to identify individual player sessions. HA commands also retain boot/session/expiry validation. `start_sequence` requires the exact presentation ID from the preparation event; duplicate release is harmless, stale release is rejected. The sequence starts only after both release and actual local readiness. If release arrives before preparation is complete, it is remembered. Once HA releases, the ready curtain/content start together without another remote press.

HA-led sequence playback uses local session ownership so physical remote actions and HA commands work together. The presentation's `lead` identifies who initiated the sequence. Both local and HA-led active sequences allow HA transport when playback permission is enabled. `can_start_playback`, `can_browse_library`, `remote_control_allowed` and `can_control_playback` expose the permissions; `ha_mode` is retained only as a compatibility alias. New film starts and legacy control leases require playback permission; a legacy exclusive control lease is not used for the sequence route. The previous direct-play lease workflow remains available for older automations.

## HA interface

Services target the paired `media_player` entity:

| Action | Fields / behavior |
| --- | --- |
| `cinemaseat.prepare_sequence` | Required `movie_id` (`nas:` indexed ID); optional `audio_id`, `subtitle_id`, `subtitles_off` (default true). Returns `presentation_id` when response data is requested. Requests preparation only, never releases the start. |
| `cinemaseat.start_sequence` | Required `presentation_id` copied from the Prepare event. Releases a CS-led or HA-led pending start. |
| `cinemaseat.advance_sequence` | Starts a ready curtain opening or skips current preroll content. Does not bypass HA wait or affect the feature. |
| `media_player.media_stop` | Stops the whole active sequence, including preparation and black transitions. |
| `media_player.media_seek` | Required `seek_position`, finite seconds within the feature. Applies while playing or paused; no seeking in bumpers. |
| Standard media-player and track actions | Pause/resume, next/previous chapter, audio/subtitle selection during the feature, still with current session validation. |

Search accepts movie content types `cinemaseat_nas` / `cinemaseat_plex` to limit source, and ordinary movie search to combine both. Results include a source label and stable film ID; equal titles are separate results. Detail probing uses an independent NAS provider so inspecting options does not tear down an active NAS stream. SMB locations and credentials are not exposed to HA.

The legacy standalone Show curtain action is not supported by the current ATV app. The current card hides it based on capabilities. Use Play Sequence for a curtain. Existing saved automations that explicitly call Show curtain must be updated.

## Events

The integration fires `cinemaseat_event` on HA's event bus. Filter on `event`, `entity_id` and optionally `movie_id` (specific film version) or `lead` (`cs` / `ha`). Events carry `player_id`, `boot_id`, `presentation_id`, `session_id`, event sequence, `source`, phase, position, duration, status, buffering, chapter ID, selected audio/subtitle IDs and subtitles-off state. Only validated presentation events are exposed; generic internal state changes are not automations. Duplicate/out-of-order and foreign-boot/presentation messages are discarded.

- Handshake: `prepare_start_sequence`, `sequence_released`.
- Curtain: `curtain_opening_started`, `curtain_opening_ended` (also when skipped).
- Content: `theater_intro_started/ended`, `trailer_intro_started/ended`, `trailer_started/ended`, `rating_started/ended`, `audio_started/ended`.
- Feature: `start_movie`, `pause_movie`, `resume_movie`, `change_chapter`, `change_audio`, `change_subtitle`, `stop_movie`, `movie_ended`.
- Whole presentation: `sequence_stopped`, `sequence_ended`, `playback_error`, `step_skipped` (phase identifies the skipped step).
- Feature telemetry: `timecode` each second, plus immediate confirmed pause/resume, chapter and substantial position changes. Never emitted for preroll.

Timecodes refer to the original feature timeline. `previous_position` is the previous emitted timecode; `discontinuity` is true for the initial sample, backward movement or a jump greater than two seconds between emitted samples. Use it to avoid firing timecode actions for skipped ranges. It is a conservative telemetry indicator, not frame-accurate seek detection. HA owns film-specific threshold rules, pause/resume behavior and once-per-presentation bookkeeping. CS does not store or execute timecode actions. No global minutes-before-end rules are installed.

## Example: HA prepares the room and releases the sequence

Create this automation in HA, substituting your player and existing script. The room-preparation script must complete (including any device readiness checks) before Start Sequence is called. You can instead put the Start Sequence action inside that script wherever release should occur, passing the presentation ID as a field.

```yaml
alias: CinemaSeat - prepare room and release
triggers:
  - trigger: event
    event_type: cinemaseat_event
    event_data:
      entity_id: media_player.cinemaseat_apple_tv
      event: prepare_start_sequence
actions:
  - action: script.cinema_prepare_room
  - action: cinemaseat.start_sequence
    target:
      entity_id: media_player.cinemaseat_apple_tv
    data:
      presentation_id: "{{ trigger.event.data.presentation_id }}"
mode: queued
max: 5
```

A script error leaves the TV waiting. No automatic timeout releases playback. Cancelling on TV invalidates a late script release. Use `sequence_stopped` for any desired room cleanup; CS does not assume which lighting state to restore.

Fire-and-forget lighting example:

```yaml
alias: CinemaSeat - feature lighting
triggers:
  - trigger: event
    event_type: cinemaseat_event
    event_data:
      entity_id: media_player.cinemaseat_apple_tv
      event: start_movie
actions:
  - action: script.cinema_film_lighting
mode: restart
```

For a specific version's timecode rule, filter `movie_id`, `event: timecode`, `status: playing`, `buffering: false`, `discontinuity: false`, and check `previous_position < target <= position`. Store the last fired presentation ID in a dedicated HA helper if the action must not repeat after rewinding. Nothing is installed into the user's HA configuration automatically.

## Verification

- `python3 Tests/run_cinema_remote_tests.py`: production command validation, correlated/idempotent releases, both control modes, preroll boundary, shared local/HA controls, confirmed events and direct-play isolation.
- `python3 Tests/run_nas_sequence_controller_tests.py`: production sequence with deterministic media I/O, both readiness/release orders, synchronized curtain start, local bypass, cancellation and existing sequence regressions.
- `python3 Tests/run_nas_bumper_tests.py`, cinema session, NAS library/source routing and localization tests.
- Run `Tests/test_ha_cinemaseat.py` and `Tests/test_ha_pairing.py` with Home Assistant 2026.10.1 dependencies. Pairing tests require localhost socket access.
- `node --test Tests/test_ha_search_card.cjs` with jsdom.
- Build the tvOS app for the arm64 simulator (the supplied FFmpeg simulator libraries are arm64).

A real Apple TV/NAS/HA run is still needed for HDMI/HDR transitions and actual room scripts. Automated tests do not establish physical device timing.

### Implementation verification — 2026-10-18

The arm64 tvOS 27 simulator build succeeds. The production remote/presentation protocol, sequence controller, NAS bumper planner and persistence, cinema sessions, NAS library, NAS HTTP/source routing and five-language localization suites pass. HA 2026.10.1 passes 28 integration tests and 14 pairing/localhost WebSocket tests; the card passes 8 jsdom tests. Both integration source copies were checked. No HA server configuration, device install or HACS release was performed. Physical Apple TV/NAS/room-script verification remains pending.

### 0.8.1 — shared control for local sequences

A sequence started on ATV can be controlled by the paired HA media player without entering HA mode. The app explicitly distinguishes `can_control_playback` from `ha_mode`, and the dashboard uses this for transport, skip, seek and track controls. Starting/replacing content from HA still requires HA mode. Commands retain session/presentation validation. Direct local playback remains outside the sequence integration. Update both the ATV app and HA integration; use card resource `?v=0.8.1` when registered manually.

### 0.9.0 — native media-player integration

Standard Play now releases the currently waiting presentation. For delayed automation release keep `cinemaseat.start_sequence` with the Prepare event’s exact presentation ID. `media_player.play_media` accepts `extra.playback_mode: sequence`; preparation still waits for release. Native Plex/NAS browsing, HA-proxied posters, Audio/Subtitles select entities, flat presentation attributes and real curtain state are documented in the [media-player reference](media-player.md). Normal HA progress writes use a 30-second timestamp anchor; state changes and seek jumps update immediately, while timecode events remain second-by-second. Update both app and HA integration; card resource `?v=0.9.0`.
