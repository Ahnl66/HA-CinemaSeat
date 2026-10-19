# Saved connection availability

Each ATV connection has a persistent enabled flag, independent of saved configuration,
reachability and HA playback permission. Missing flags default to enabled for migration.
Save commits a toggle; Discard leaves runtime state untouched. Disabling an unconfigured
connection does not require valid credentials. Re-enabling requires valid configuration.

## Transition contract

- Plex off: revoke network access including auth, metadata, subtitles, playback history,
  remote artwork and existing clients; cancel image downloads/prewarming; stop its player.
- NAS off: revoke every SMB client including secondary detail and curtain providers;
  stop streams/local HTTP proxies, scans, media preparation and the active NAS sequence.
- HA off: close WebSocket/pairing, cancel commands/retries and discard outgoing events.
  Continue playing locally, but cancel a pending HA wait. New local sequences skip that
  saved wait; its setting is retained. Keep the pairing key and playback permission.
- A source-dependent screen is removed from navigation. Home/collection snapshots lose
  disabled items immediately. Mixed rows retain active-source items. Source filters and
  HA source folders hide disabled options. Saved row definitions and pins are retained.
- Re-enable permits fresh requests. Never resume a film/scan or replay events/commands
  automatically. The NAS index and saved scan roots, collections, artwork, history,
  subtitle corrections, accounts and home layout are not cleared by the switch.

`ConnectionAccess` provides one thread-safe, revocable generation per connection.
Clients register cancellation callbacks and check their original ticket after awaits.
Disable followed immediately by Enable cannot authorize old work. The source router
checks remote ID/artwork callbacks too, and HA preparation checks again after chapters
and before beginning a playback session.

The tvOS environment coordinates provider teardown and source model invalidation.
Plex HTTP uses a generation-bound URLSession; NAS reads use generation-bound SMB
connections. Local NAS history remains local and may finish its pending database write;
Plex writes from old clients cannot send requests after revocation.

## Verification

- `Tests/run_connection_lifecycle_tests.py`: all eight persisted switch combinations,
  retained accounts/pairing/permission, late registration, live URLSession cancellation,
  disabled request rejection and successful fresh reconnect.
- `Tests/run_nas_tests.py`: source routing, direct IDs, playlists, chapter/subtitle and
  remote artwork bypass protection, plus the existing local NAS HTTP tests.
- `Tests/run_movie_playback_launcher_tests.py`: a launch prepared before Disable cannot
  start after Enable; normal resume/restart and fullscreen dismissal remain valid.
- Home, presentation, HA backend and dashboard suites cover cached source removal,
  restored layout, conditional HA waits, capabilities, browser options and stale IDs.
- Full tvOS simulator compilation and five-language catalogue validation.

Physical Apple TV/real-server transition checks remain part of on-device acceptance;
a simulator build is not evidence of a real NAS transport test.
