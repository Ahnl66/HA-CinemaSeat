# Development and releases

The integration's domain remains `cinemaseat`; do not rename it when updating this repository. The tvOS app is maintained separately in CinemaPlexTV. All runtime files must stay inside `custom_components/cinemaseat` so HACS installs and removes them together.

## Tests

Use Python 3.14 and Home Assistant 2026.10.1's dependencies:

```sh
python3.14 -m venv .venv
. .venv/bin/activate
pip install -r requirements-test.txt
python tests/test_cinemaseat.py
python tests/test_pairing.py
```

Or run against an existing HA container without changing its dependencies:

```sh
docker cp . homeassistant-test:/tmp/ha-cinemaseat-tests
docker exec homeassistant-test python /tmp/ha-cinemaseat-tests/tests/test_cinemaseat.py
docker exec homeassistant-test python /tmp/ha-cinemaseat-tests/tests/test_pairing.py
```

The suite exercises real HA imports with a fake paired direct player. Media-player coverage includes sequence commands, browse pagination, proxy artwork caching, native track selectors, capability changes and progress-state throttling. It covers search, versions, boot/session isolation, confirmed start, lease/heartbeat cleanup, explicit track choices, removal during pending work, multi-entry service lifetime, setup/unload failures, card availability, and reloading. The additional suite exercises actual aiohttp sockets, code expiry/single use/rate limits, key scoping, config-flow validation, entry migration, and authenticated reconnect. It sends no commands to a physical player.

Frontend DOM regression tests are documented in [tests/README.md](../tests/README.md). They cover selection between multiple players and command/error handling.

For a release, also validate the package structure and secret-free examples, check JavaScript syntax (`node --check custom_components/cinemaseat/cinema-search-card.js`), and run an installation/removal/reinstallation cycle through HACS on a backed-up test HA instance. Test with the tvOS simulator; do not infer physical playback, HDMI, or HDR support from simulator results.

## Release

1. Update `manifest.json` version, README/resource examples, and CHANGELOG.
2. Run tests and review the exact publication file list for private data.
3. Commit and tag `vX.Y.Z`; publish a GitHub release. HACS uses GitHub releases for its version selector.
4. Verify HACS can download that release, restart HA, and check entity/actions/card.
5. Verify uninstall, restart, and reinstall. Restore the test environment's intended working state.

The HACS manifest sets the minimum HA version and uses standard directory downloads; no generated release ZIP is required. Repository registration as an Integration is essential: the dashboard card is bundled with the integration, not a separate HACS Dashboard package.
