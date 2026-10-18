> Version 0.8.0 adds NAS Play Sequence and two-mode presentation control. See [current sequence actions, events and handshake](sequence-control.md). Standalone curtain instructions below apply to older ATV builds; the current app uses the curtain only in Play Sequence.

# Actions

Use your actual CinemaSeat entity ID in place of `media_player.cinemaseat_apple_tv`. Film and track IDs belong to your library; obtain them through search and movie details rather than copying IDs from someone else's setup.

| Action | Purpose |
| --- | --- |
| `media_player.search_media` | Search via the paired tvOS app; returns film IDs and titles |
| `media_player.play_media` | Prepare and start one chosen film |
| `media_player.media_play` | Resume a paused film or start a ready film |
| `media_player.media_pause` | Pause the current film |
| `media_player.media_stop` | Stop the current presentation |
| `media_player.media_next_track` | Next chapter boundary |
| `media_player.media_previous_track` | Start of this chapter, or previous boundary when already near the start |
| `cinemaseat.movie_details` | Return film details, audio/subtitle lists, and boot ID |
| `cinemaseat.select_audio` | Switch audio in the current playing/paused film |
| `cinemaseat.select_subtitle` | Switch subtitles or turn them off |

## Search

```yaml
action: media_player.search_media
target:
  entity_id: media_player.cinemaseat_apple_tv
data:
  search_query: Skyfall
response_variable: films
```

Choose the intended version from the response. The integration never chooses a result automatically.

## Details and start

```yaml
action: cinemaseat.movie_details
target:
  entity_id: media_player.cinemaseat_apple_tv
data:
  movie_id: "YOUR_FILM_ID"
response_variable: details
```

The entity's response contains `movie` (with `id`, `title`, `audio`, and `subtitles`) and `boot_id`. Each track contains `id` and `name`.

```yaml
action: media_player.play_media
target:
  entity_id: media_player.cinemaseat_apple_tv
data:
  media_content_type: movie
  media_content_id: "YOUR_FILM_ID"
  extra:
    audio_id: "YOUR_AUDIO_ID"
    subtitle_id: "YOUR_SUBTITLE_ID"
    subtitles_off: false
    boot_id: "BOOT_ID_FROM_DETAILS"
```

Omit `extra` for default audio and subtitles off. To turn subtitles off explicitly, set `subtitles_off: true` and omit `subtitle_id`. `boot_id` is optional, but including the details response's value prevents starting with choices obtained before an app restart. Unsupported queues, announcements, and arbitrary stream URLs are rejected.

## Change tracks during playback

Read the current `session_id` from the entity attributes. A stale session is rejected rather than affecting another film.

```yaml
action: cinemaseat.select_audio
target:
  entity_id: media_player.cinemaseat_apple_tv
data:
  track_id: "YOUR_AUDIO_ID"
  session_id: "{{ state_attr('media_player.cinemaseat_apple_tv', 'session_id') }}"
```

```yaml
action: cinemaseat.select_subtitle
target:
  entity_id: media_player.cinemaseat_apple_tv
data:
  off: true
  session_id: "{{ state_attr('media_player.cinemaseat_apple_tv', 'session_id') }}"
```

For a subtitle track, use `track_id: YOUR_SUBTITLE_ID` and `off: false` instead. The film must be playing or paused and locally owned; track selection does not seize another controller's presentation.

## State attributes

`player_id`, `boot_id`, `session_id`, `status`, `owner`, `buffering`, `error_code`, `audio_tracks`, `subtitle_tracks`, `selected_audio_id`, `selected_subtitle_id`, and `subtitles_off` accompany standard media title, duration, and position. Actual app feedback supplies these values. A player that disconnects or stops reporting for 20 seconds becomes unavailable.

Volume control and waking/opening the Apple TV app are not implemented by this integration.

## Show curtain

Display or hide the closed curtain before choosing a film. The action requires an updated, connected player in HA mode with no preparation or playback in progress. Film start opens the curtain automatically.

```yaml
action: cinemaseat.show_curtain
target:
  entity_id: media_player.cinemaseat_apple_tv
data:
  show: true
```

`show` defaults to `true`; use `false` to return to the HA connection screen. The card toggle follows the selected player and its confirmed `curtain_state` (`hidden`, `closed`, or `opening`). The normal tvOS curtain preference does not control HA mode.

## Save selected film choices as an automation

Search a film and open **Options**. Choose the audio and subtitles, then press **Make automation with these choices**. The card snapshots the selected player and choices. The automation’s alias is `CinemaSeat - <film title>`, with no triggers and `mode: single`. Run it manually or add a trigger in the HA editor.

When **Show curtain** is active at creation, the action list contains `cinemaseat.show_curtain` (`show: true`), a 10-second delay, and `media_player.play_media` with the saved movie and track choices. Otherwise it contains only film playback. Player boot/session identifiers are excluded so a later restart does not invalidate the automation.

HA mode must be active at run time. The current film must be stopped before starting a new one. Creating an automation does not execute it or modify existing automations. The administrator who clicks the button saves it through the same authenticated API used by HA’s automation editor. It is stored in HA’s automation configuration and remains user-owned if the integration is removed.
