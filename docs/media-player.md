# CinemaSeat media player — 0.10.0

Update both the CinemaSeat app and the HA integration, then restart Home Assistant. Existing player entity IDs and pairing are retained. HA adds Audio and Subtitles select entities to the same device; their entity IDs follow your HA naming settings.

The HA home-screen icon now opens connection settings/status. HA-started playback opens its player automatically. Backgrounding closes the connection; reopening reconnects without a mode switch or restarting playback. Existing pairing/entity IDs and presentation-ID automations are retained. Enable control before using a sequence configured to wait for HA; otherwise use Start anyway on ATV.

## Standard media player actions

| HA action | Behavior |
| --- | --- |
| `media_player.play_media` | Direct film playback by default. Add `extra.playback_mode: sequence` for NAS Play Sequence. The browser also supplies content type `cinemaseat_sequence` for this choice. |
| `media_player.media_play` | Release the currently waiting presentation, start a ready film or resume a paused film. |
| `media_player.media_pause` | Pause the current feature. |
| `media_player.media_stop` | Stop the whole presentation, or the current direct film. |
| `media_player.media_next_track` | Skip a preroll step; during the feature, next chapter. |
| `media_player.media_previous_track` | Previous chapter during the feature. |
| `media_player.media_seek` | Seek the feature to `seek_position` in seconds. |
| `media_player.browse_media` | Browse Plex/NAS folders, 30 films per page. Expand a NAS film to choose Direct Play or Play Sequence. |
| `media_player.search_media` | Search the indexed library; existing source-specific search types are retained. |

There is no separate HA mode. A paired app connects automatically while open. Library/status reads remain available. Enable **Allow control from Home Assistant** in the ATV HA settings to start or control playback. This persistent permission defaults to off, including on upgrade, and resets when the HA destination or pairing is cleared. HA and the ATV remote can both control an active Play Sequence when permission is enabled. Local direct playback has no HA sequence interaction. `supported_features` follows permission, app capabilities and presentation phase. An active film/sequence must be stopped before starting another. Disabling HA control leaves current playback running locally. The app does not advertise volume, mute, power or shuffle controls.

Example using your existing player and an indexed NAS film ID from search/browse:

```yaml
action: media_player.play_media
target:
  entity_id: media_player.cinemaseat_mac
data:
  media_content_type: movie
  media_content_id: nas:YOUR_FILM_ID
  extra:
    playback_mode: sequence
```

This prepares the sequence and waits for release. It does not bypass your room-preparation automation. The standard Play button releases whichever presentation is waiting at that moment. In delayed automations continue using `cinemaseat.start_sequence` with `presentation_id: "{{ trigger.event.data.presentation_id }}"` from `prepare_start_sequence`; this prevents an old script from starting a newer presentation.

## State and attributes

| Property | Meaning |
| --- | --- |
| Entity state | `idle`, `buffering`, `playing`, `paused` or `unavailable`. Includes confirmed buffering while playing. |
| `media_title`, `media_content_id`, `media_content_type` | Current clip/film, ID and `movie` type. Preroll can show the current clip. |
| `media_duration`, `media_position`, `media_position_updated_at` | Current clip/film duration and playback position in seconds, with a UTC anchor timestamp. |
| `entity_picture` | HA image proxy serving a bounded JPEG poster fetched through the paired app. No NAS paths or Plex credentials are published. |
| `presentation_id`, `presentation_lead` | Whole sequence identity and `cs` / `ha` initiator. |
| `sequence_phase`, `waiting_for_ha`, `sequence_released` | Current sequence step, release wait and release status. |
| `feature_movie_id`, `feature_title`, `feature_duration` | Main film identity/title and indexed duration in seconds, retained through preroll. Unknown indexed duration is null. |
| `library_source` | `nas` or `plex` for the feature/current film, otherwise null. |
| `curtain_state` | Confirmed sequence curtain: `hidden`, `preparing`, `closed` or `opening`. |
| `chapter_id` | Current feature chapter identifier, if available. |
| `audio_tracks`, `subtitle_tracks` | Available track IDs and labels. |
| `selected_audio_id`, `selected_subtitle_id`, `subtitles_off` | Confirmed player track feedback. |
| `remote_control_allowed` | Persistent ATV permission for HA playback commands. |
| `can_browse_library` | Paired library/status access, independent of playback permission. |
| `can_start_playback` | Playback permission plus no active film/sequence. |
| `can_control_playback` | Playback permission plus an active sequence or HA-started film. Local direct playback remains outside HA control. |
| `ha_mode` | Deprecated compatibility alias for `remote_control_allowed`; no screen/mode switch is required. |
| `player_id`, `boot_id`, `session_id`, `owner` | Player, app run, current clip session and ownership. |
| `status`, `buffering`, `error_code`, `capabilities` | Underlying app status, buffering/error and advertised commands. |
| `pairing_required`, `presentation` | Pairing indicator and retained structured presentation for compatibility. |

The HA frontend extrapolates position from its timestamp. Normal progress updates refresh the HA state anchor at most every 30 seconds; seek/discontinuity, metadata, availability and playback-status changes update immediately. Second-by-second `cinemaseat_event` timecodes remain available for automations. Events are transient and are not replayed after reconnect.

## Native track selectors

The same CinemaSeat device contains Audio and Subtitles `select` entities. Use `select.select_option` or a standard entity card. Labels contain the track name and ID so identical language labels remain distinguishable. Subtitles includes `Off`. Options and current selection follow actual ATV feedback; a dispatched command does not optimistically change the selection. Selectors are unavailable outside controllable feature playback, or when the app lacks the relevant capability. Audio also requires an available audio track.

## Retained CinemaSeat actions and events

`cinemaseat.prepare_sequence`, `start_sequence`, `advance_sequence`, `movie_details`, `select_audio` and `select_subtitle` remain for existing automations and explicit session/presentation targeting. Native controls share their validation. `show_curtain` remains registered for compatible older apps; the current app returns an explanatory retirement error. Use the curtain configured in Play Sequence instead.

`cinemaseat_event` remains the event bus for prepare/release, sequence steps, playback changes, chapters, tracks and timecodes. These are occurrences rather than persistent media-player attributes. `curtain_state_changed` additionally signals confirmed curtain transitions; its current value is available as the media-player `curtain_state` attribute. No automations or room scripts are installed automatically.

## Verification and limits

Regression coverage includes sequence release correlation, paginated/sanitized browsing, image limits/caching, concurrent artwork and playback commands, native track choices, capability changes, state throttling and retained timecode events. The arm64 tvOS simulator build is checked. Physical Apple TV/NAS playback and room-script timing require device validation. A built app is not installed over a running presentation automatically.


`enabled_sources` lists currently configured and enabled movie sources (`plex`, `nas`). An empty list prevents browsing/starting movies while the paired HA connection stays available. Turning off the HA connection on ATV makes the entity unavailable without deleting it. See [connection switches](connections.md).
