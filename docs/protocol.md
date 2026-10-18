> Version 0.8.0 adds NAS Play Sequence and two-mode presentation control. See [current sequence actions, events and handshake](sequence-control.md). Standalone curtain instructions below apply to older ATV builds; the current app uses the curtain only in Play Sequence.

# Direct protocol and pairing

The tvOS app connects to `/api/cinemaseat/player` on the configured HA server using a direct WebSocket (WS for HTTP, WSS for HTTPS). HA does not connect to Plex and never receives Plex tokens, server headers, or authenticated stream URLs. No MQTT broker is involved in version 0.5.0.

## Pairing

1. An authenticated HA administrator opens Add integration or Reconfigure. This loads the pairing endpoint even without existing player entries.
2. The TV opens a temporary socket and sends `{type: "pair", version: 1, player_id: "<generated ID>"}`.
3. HA generates a collision-checked, cryptographically random six-digit code and sends `{type: "pairing", code, expires_in: 120, player_id}`. Leading zeros are significant. The TV displays it.
4. The administrator submits those six digits in the HA config flow. The player ID is derived from the matching temporary socket. Codes are single-use, expire after two minutes, and are cancelled on disconnect.
5. HA generates a 48-byte random permanent key, stores it in the config entry, and delivers it only to that same waiting socket after entry setup succeeds: `{type: "paired", secret, player_id}`. The app stores it automatically and closes the pairing socket.

There is no unauthenticated HTTP API for redeeming or guessing a short code. The authenticated HA config flow approves pairing. Pairing requests are limited to ten per remote address per five minutes, at most 32 pending/claimed sessions, and 64 open player sockets. Initial handshakes time out after ten seconds; frame sizes are limited.

Pairing is not a playback-control connection. In normal mode the app closes the pairing socket after saving the key. If it is already in HA mode, it reconnects using its saved key. Reconfiguration validates the existing player ID before replacing a key; a code from another TV is rejected.

## Authenticated control

On entering HA mode, the app sends `{type: "hello", version: 1, player_id, secret}`. HA validates the key against the loaded entry with constant-time comparison and replies `{type: "connected"}`. Deleted, disabled, unknown, or unpaired entries cannot authenticate. Keys are sent in WebSocket frames, never URLs or logs. The app scopes stored keys to a normalized HA endpoint and clears them when the destination changes.

HA sends `{type: "command", command: ...}`. The app sends state/reply/event envelopes with `type` and the corresponding `state`, `reply`, or `event` payload. These reuse the established CinemaSeat command protocol version 1: command UUID, player/controller IDs, expiry, boot/session/control IDs, action, and internal key. State and replies contain sanitized library information only.

The app serializes normal commands but handles `get_state` and lease heartbeats independently of slow library fetches. HA tracks pending commands and matches replies by command and boot IDs. State is sent at least once per second; the entity becomes unavailable after 20 seconds without fresh state. WebSocket heartbeat and a bounded reconnect backoff detect interrupted connections. Leaving HA mode, backgrounding, or unloading an entry closes control.

A replaced socket cannot disconnect or publish feedback through the newer socket. Disconnect fails pending commands; no film starts are retried automatically. Commands for old boots/sessions cannot affect another presentation.

## Start transaction and tracks

`get_state → claim_control → prepare → start → release_control`

A heartbeat runs every five seconds while preparing/starting. Prepare waits for confirmed ready and start for confirmed playing, up to 120 seconds each. Most other requests time out after 20 seconds. Failed starts cancel only their own session and release their own lease where possible. Unloaded entities reject late requests and publish no new commands.

Read-only search/details do not claim control. Track/chapter acknowledgements confirm dispatch; actual state confirms the result. After a successful start, the app owns the presentation locally. Existing audio, subtitle, chapter, and Back rules are reused.

## Lifecycle and migration

The hub tracks loaded entries, authenticated sockets, and temporary pairing sessions. Entity removal cancels its freshness timer, fails pending requests, and detaches it from the hub. Entry unload revokes authentication and closes that player's socket. The last unload removes custom actions and disables the bundled card. HA shutdown cancels temporary sessions and closes all sockets.

Version-1 MQTT entries migrate to version 2 with their player identity retained and `requires_pairing` set. Their old keys are discarded. Reconfigure obtains a direct key without renaming the media entity. Legacy discovery cleanup is attempted only if MQTT is already loaded; the new integration's only component dependency is HTTP.

For HTTPS, certificate verification remains enabled. HTTP pairing/control is intended for trusted local networks; use HTTPS when the network is untrusted. HACS removal requires an HA restart to remove process-level HTTP routes, as described in the README.

## HA curtain presentation

Updated players advertise `show_curtain` in capabilities and report `curtain_state` as `hidden`, `closed`, or `opening`. The boot-scoped `show_curtain` command has an optional boolean `show` (default true); it is authenticated like all other commands and requires no active film. It returns executed with player state.

The closed overlay remains mounted across preparation/start. Preparation arms the player’s existing curtain barrier only when HA has requested a curtain. The start command releases preparation; native readiness triggers the curtain opening and releases playback together. Stop, end, error, and returning to normal browsing clear the curtain. Connection recovery retains the current presentation without granting a new start.
