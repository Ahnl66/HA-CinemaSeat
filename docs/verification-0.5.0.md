# Release 0.5.0 verification

Validated on 2026-10-14 with HA Core 2026.10.1 (Container) and the normal CinemaSeat app in the tvOS 27 simulator.

## Automated validation

- **22 integration tests passed:** search, confirmed start/leases, timeout/failure cleanup, explicit track selection, boot/session protection, multi-entry lifecycle, service/card unload, and pending-request cleanup.
- **14 pairing/WebSocket tests passed:** single-use codes, leading zeros, expiry, collision handling, request limits, per-player authentication, migration, config-flow validation, wrong-player rejection, actual socket exchange, cancellation, and reconnect/replacement isolation.
- Production Swift remote-protocol and cinema-session suites passed.
- Production Swift settings suite passed: identity migration, normalized HA URLs, endpoint-scoped secrets, persistence, invalid destinations, and credential-storage failures.
- Full normal-app tvOS 27 Debug simulator build passed. The final client was installed and reconnected after a cold launch with its stored key.
- JavaScript syntax, Python compilation, XML parsing, and whitespace checks passed.

## Live flow

1. Opened the new HA Add integration form, requesting only a six-digit code and optional player name.
2. Requested a code in the simulator's Home Assistant settings. The TV displayed six digits and a two-minute countdown.
3. Entered only those digits in the HA form. HA derived the player ID and created its media player; the TV showed Paired with Home Assistant and Connected. No permanent secret was copied, displayed, or pre-provisioned.
4. Restarted HA. The app automatically reconnected using the stored key, without asking for another code.
5. Searched a real Plex film through the tvOS app, fetched its audio/subtitle choices, and started it with explicit audio and subtitle IDs. HA reported confirmed playing and the chosen tracks.
6. Paused via HA; turned subtitles off; verified the player remained paused at the same position. Back on the remote retained the paused film in HA mode.
7. Resumed and stopped via HA. Back after stop returned to normal browsing.
8. Installed the definitive client build and cold-launched it without a bootstrap config. Selecting the HA icon reconnected with the saved key, without re-pairing.

## Scope and limits

All player tests used the simulator; no physical Apple TV, HDMI, or HDR validation was performed. The non-secret HA test address was prefilled by the Debug simulator bootstrap because automated Device Hub text input could not reliably operate the tvOS keyboard. URL validation and settings persistence were separately tested against production Swift code; the six-digit pairing itself used the actual TV screen and authenticated HA wizard.

The old HA player entry/package had been removed before this deployment, so the live scenario used Add integration. Migration and wrong-player reconfiguration guards were exercised by automated tests. The 0.4.0 verification report records the earlier HACS install/remove/reinstall cycle; 0.5.0 retains the same package layout and card lifecycle while additionally closing authenticated sockets on unload.
