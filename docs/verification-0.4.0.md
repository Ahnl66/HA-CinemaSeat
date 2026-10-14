# Release 0.4.0 verification

Validated on 2026-10-14 with Home Assistant Core 2026.10.1 (Container) and HACS 2.0.5, in a backed-up test environment.

## Automated checks

- All **22 async integration tests passed** against the installed Home Assistant runtime.
- JavaScript syntax check passed using Node.js.
- Python compilation and Git whitespace checks passed.
- Reviewed the publication file list: no live credentials, private server addresses, simulator configs, or authenticated Plex URLs are included.

The test suite covers search/result identity, invalid queries, old-app capability errors, stale-boot replies, confirmed prepare/start, heartbeat/lease cleanup, failed starts, active-film protection, track selections and session isolation, three subscription/freshness-timer removal callbacks, unloading during preparation, multiple entries, failed setup/unload, card availability, and reload.

## Live HACS cycle

1. Added `Ahnl66/HA-CinemaSeat` as a custom repository of type Integration.
2. HACS offered release **v0.4.0** and downloaded it to `custom_components/cinemaseat`.
3. Confirmed the manifest, bundled card, and brand icon were installed.
4. Restarted HA: the existing player entry loaded as version 0.4.0 and the card returned **HTTP 200** with `Cache-Control: no-cache`.
5. Temporarily disabled the existing player entry through HA, triggering its normal unload without discarding pairing settings. The card immediately returned **HTTP 404**.
6. Removed the package through HACS. For this controlled test, HACS's configured-entry warning was acknowledged because the retained entry was disabled and would be restored. Confirmed the entire `custom_components/cinemaseat` directory was gone.
7. Restarted HA: the integration directory remained absent and the card returned **404**.
8. Added the repository again and reinstalled **v0.4.0** through HACS. Confirmed the card and icon were restored.
9. Restarted HA and enabled the retained player entry. The card returned **200** again and the dashboard rendered its English controls. The existing dashboard resource was updated to `?v=0.4.0`.

The test environment was left with release 0.4.0 installed, the original pairing enabled, and the existing dashboard working. No movie was started during this package-management test.

## Limits

This live cycle preserved the player config entry by disabling/enabling it. It did not permanently delete that entry or its entity/device registries. Full removal instructions in the README require deleting the entries first, then removing the package in HACS. Shared-resource cleanup and pending-operation cleanup were additionally exercised by the automated tests.

No physical Apple TV, HDMI, HDR, or new playback validation was performed for this packaging release. The tvOS app was not changed by this release.
