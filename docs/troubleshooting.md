# Troubleshooting

- **CinemaSeat cannot be found under Add integration:** confirm that HACS downloaded an Integration, the directory is `custom_components/cinemaseat`, HA is at least 2026.10.0, and HA was restarted.
- **Player unavailable:** open CinemaSeat and select the HA icon. Check the app and HA MQTT settings, broker reachability, topic ACLs, exact player ID, and pairing code. The entity also becomes unavailable after 20 seconds without fresh state.
- **No search/track support:** update the tvOS app to the build with integrated HA mode and the required capabilities.
- **Custom element doesn't exist:** add `/cinemaseat/cinema-search-card.js?v=0.4.0` as a JavaScript module, keep at least one CinemaSeat entry loaded, and reload the browser. A 404 with no configured player is intentional.
- **No results:** searching occurs in the app's configured library. Check the library in normal CinemaSeat mode. Shorten or refine the search; only 50 results are returned.
- **Cannot start another film:** stop the current playing, paused, preparing, or ready film first.
- **Stale film/boot error:** refresh details after an app restart or film change. Obtain track IDs from the selected film and use the current session ID.
- **Track choice is not immediately shown:** commands are dispatched asynchronously; the controls reflect subsequent player feedback. Audio switching can briefly rebuild the player pipeline.
- **Pairing changes:** delete the HA player entry and add it again with the matching app settings. Broker credentials remain in HA's MQTT integration.
- **Removal leaves a missing-card warning:** remove the old dashboard card and resource as described in the README. HACS removes package files, not your dashboard configuration.

When reporting an issue, include HA/integration/app versions, the operation attempted, and sanitized logs. Omit passwords, pairing codes, Plex tokens, authenticated URLs, and private library details you do not want to share.
