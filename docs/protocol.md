# MQTT protocol and lifecycle

The integration uses HA's configured MQTT connection and CinemaSeat protocol version 1. It has no Plex client and never receives Plex tokens, authenticated stream URLs, or server headers.

## Topics

All topics are scoped to `cinemaseat/v1/<player_id>`:

| Suffix | Direction | Purpose |
| --- | --- | --- |
| `/command` | HA → app | QoS 1, never retained |
| `/reply/<controller_id>` | App → HA | Correlated acknowledgements/results |
| `/state` | App → HA | Presentation state, sequence, boot ID, capabilities, track state |
| `/availability` | App → HA | `online` / offline status |

Commands contain protocol version, UUID command ID, player ID, per-entity controller UUID, pairing code, expiry, action, and relevant boot/session/control IDs. Use broker authentication and topic ACLs appropriate to your network; the pairing code authenticates app control and is distinct from the broker password.

Search and detail actions (`search_movies`, `get_movie_details`) are read-only and do not claim a lease. Required capability names also include `select_audio_current` and `select_subtitle_current`. Older apps produce explicit update errors.

## Start transaction

`get_state → claim_control → prepare → start → release_control`

A heartbeat runs every five seconds while preparing and starting. Prepare waits for confirmed `ready`; start waits for confirmed `playing` (up to 120 seconds each). Most other requests time out after 20 seconds. Reply futures are registered before publishing and matched by command and boot IDs. Heartbeats stop before the lease is released.

Failed starts cancel only the session obtained by that transaction and release their own lease where possible. App restarts/disconnections fail pending requests. Commands for an old session or boot cannot affect a new presentation. There is no automatic retry of a failed film start or automatic takeover of an existing film.

After a successful start the app owns its presentation locally. Transport and track commands use current state and session IDs. Chapter/track acknowledgements confirm dispatch; subsequent app state confirms the result.

## Integration lifecycle

The entity registers three MQTT subscriptions and a five-second freshness timer with HA's entity-removal callbacks. Unloading fails pending requests and rejects new requests, including delayed transaction cleanup, so an unloaded integration cannot publish new commands. Normal entity removal unsubscribes and cancels the timer.

Custom actions are registered when the first config entry loads and removed when the last unloads. An unsuccessful platform unload keeps the entry and actions active. Setup failures roll back their entry membership. The dashboard HTTP view is registered once per HA process; it serves only the bundled public JavaScript and returns 404 with no loaded entries. It resumes serving after an entry is added again.

Dashboard resources, cards, and automations are user-owned and must be removed explicitly. The integration creates no external dashboard files or MQTT broker configuration. HACS manages everything inside `custom_components/cinemaseat`.
