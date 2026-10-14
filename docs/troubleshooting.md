# Troubleshooting

- **No pairing code / could not connect:** keep HA's Add integration → CinemaSeat form open before requesting a code on the TV. Check the HA address/port and reachability from the Apple TV. Enter HA's address, not a Plex or former MQTT broker address.
- **Code expired or invalid:** request a fresh code on the TV and enter all six digits, including leading zeros, within two minutes. Keep the TV's pairing screen open. Cancelling/closing it invalidates the code.
- **Already configured:** open the existing CinemaSeat player entry and choose Reconfigure. Use a code from that same TV.
- **Wrong player:** reconfiguration preserves the original player identity. Add a separate integration entry for another TV.
- **Too many requests:** wait five minutes before requesting another code. Pairing limits protect the public handshake endpoint.
- **Old MQTT fields still shown in HA:** update to 0.5.0+, restart HA, close old setup dialogs, and reload the browser. Also update the tvOS app. Existing entries must be re-paired through Reconfigure.
- **Player unavailable after pairing:** return to CinemaSeat's main screen and select the HA icon. Pairing itself does not enable control in normal mode.
- **Pairing no longer valid:** HA may have removed/reconfigured the entry or restored an older backup. Pair again using the corresponding Add integration/Reconfigure form. The old key is not displayed and never needs to be typed.
- **HTTPS fails:** use the correct HTTPS port and a certificate trusted by the Apple TV. The app does not bypass certificate checks.
- **Custom element doesn't exist:** add `/cinemaseat/cinema-search-card.js?v=0.5.0` as a JavaScript module, ensure a CinemaSeat entry is loaded, and reload the browser. The card intentionally returns 404 with no loaded entries.
- **No search/track capabilities:** update CinemaSeat. Film search uses the app's configured library; verify it in normal browsing mode.
- **Cannot start another film / stale session:** stop the current film first, then refresh details. Obtain track IDs from the intended film and the current session/boot IDs from player feedback.
- **Track change delayed:** commands are asynchronous. The UI follows actual player state. An audio change can briefly rebuild the playback pipeline.
- **Removal leaves a missing-card warning:** remove user-added dashboard cards/resources and referenced automations as described in the README.

For issue reports, include HA/integration/app versions and sanitized logs. Do not share permanent keys, passwords, Plex tokens, authenticated URLs, or private library details you do not want to publish.
