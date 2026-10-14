# HA-CinemaSeat

Control the CinemaSeat Apple TV app from Home Assistant: search for a film, choose audio and subtitles, start playback, pause, resume, stop, and navigate chapters.

**Search runs on the Apple TV.** The path is Home Assistant → MQTT → CinemaSeat → Plex. Home Assistant does not connect to Plex or need a Plex token. CinemaSeat remains a single tvOS app with normal browsing and a Home Assistant mode.

## Requirements

- Home Assistant Core **2026.10.0 or later** (tested on 2026.10.1).
- HACS, or a manual custom-integration installation. HA Container is supported; no Supervisor app is required.
- Home Assistant's standard **MQTT integration**, connected to a broker reachable by the Apple TV.
- A CinemaSeat build with the integrated HA icon and search/track-control support. The tvOS source lives in [CinemaPlexTV](https://github.com/Ahnl66/CinemaPlexTV); this repository contains the Home Assistant integration, bundled dashboard card, examples, and tests.

## Install with HACS

1. In **HACS → ⋮ → Custom repositories**, enter `https://github.com/Ahnl66/HA-CinemaSeat` and select **Integration** as the type.
2. Search for **HA-CinemaSeat** and download the latest release.
3. Restart Home Assistant.
4. Ensure the MQTT integration is configured for the broker used by CinemaSeat.
5. In **Settings → Devices & services → Add integration**, choose **CinemaSeat**.
6. Enter a friendly name, the exact **player ID** from CinemaSeat, and its **control pairing code** (at least 32 characters).

This is a HACS custom repository; it is not currently part of the HACS default catalogue. HACS installs the entire `custom_components/cinemaseat` directory, including the dashboard JavaScript and brand icon. A separate frontend repository is not needed.

For manual installation, copy `custom_components/cinemaseat` to your HA configuration directory's `custom_components/cinemaseat`, restart HA, then continue at step 4. Do not copy this repository's entire root into `custom_components`.

## Set up CinemaSeat

In the tvOS app, open **Settings → Home Assistant** and configure the broker address, port, credentials, player ID, and control pairing code. Use the same broker as HA and the same player ID/pairing code as the HA entry. Each player needs a unique ID.

Return to the main screen and select the blue **HA icon**. Keep CinemaSeat open in HA mode while using Home Assistant.

- **Back before playback starts:** return to normal browsing and cancel any preparation.
- **While playing or paused:** stay in HA mode.
- **After stopping, ending, or a playback error:** Back can return to normal browsing.
- A cold app launch starts in normal mode. Leaving HA mode or backgrounding the app disconnects MQTT; HA reports the player unavailable.

The integration reuses HA's MQTT connection. Broker credentials are configured in MQTT, not in this integration. The pairing code is stored in the private HA config entry and must not be committed to GitHub.

## Add the dashboard card

Enable **Advanced mode** in your HA profile if the Resources menu is hidden. In **Settings → Dashboards → ⋮ → Resources**, add this resource as a **JavaScript module**:

```text
/cinemaseat/cinema-search-card.js?v=0.4.0
```

Add a manual dashboard card, replacing the entity with your CinemaSeat media player:

```yaml
type: custom:cinemaseat-search-card
entity: media_player.cinemaseat_apple_tv
```

The player selector lists configured CinemaSeat players. To restrict it, add an `entities` list. A custom `title` is optional. Use the built-in **media-control** card for pause/resume/stop, or the complete [example dashboard](examples/dashboard.yaml) for chapter buttons as well.

Search a title and select **Start** on the correct result. Use **Options** first to choose audio and subtitles. During playback, the current-film selectors let you change tracks or turn subtitles off. Changes are confirmed by subsequent player state; a dispatched command is not itself proof that a track is active.

Search is case/accent insensitive, accepts 1–128 characters, and returns at most 50 matches. Distinct film versions remain separate results. Searching can run during playback. Stop the current film before starting another. A new film starts at the beginning; the plain Start button uses default audio and subtitles off.

## Update

Download the new version through HACS and restart HA. Update the resource's `?v=` suffix to the installed version and reload the browser. Keep the CinemaSeat app compatible with the search and track capabilities listed in [the protocol](docs/protocol.md).

## Remove cleanly

1. Stop any active film and exit HA mode on the Apple TV.
2. Remove CinemaSeat cards and any automations/scripts that reference its entities or actions. Remove the `/cinemaseat/cinema-search-card.js` entry from **Dashboard Resources**. These are user-owned dashboard/automation settings, so the integration does not delete them automatically.
3. In **Settings → Devices & services → CinemaSeat**, delete each CinemaSeat player entry.
4. In **HACS → HA-CinemaSeat → ⋮**, choose **Remove**, confirm, and restart HA. If desired, also remove it from Custom repositories.

Deleting a player unloads its entity, MQTT subscriptions, periodic timer, and pending requests. When the last player unloads, the three CinemaSeat actions are unregistered and the card endpoint returns 404. HA retains the dormant HTTP route until restart; it does not serve the JavaScript while no player is loaded. HACS removes all integration files, including the card and icon. No files are copied to `www/` and no broker or dashboard is created automatically.

The MQTT integration/broker and the tvOS app are shared dependencies and are retained. Historical Recorder data and HA backups follow Home Assistant's normal retention rules. Reinstalling through HACS and adding a player entry again is supported.

For a manual installation, follow steps 1–3, remove only `custom_components/cinemaseat`, then restart HA.

## Actions, troubleshooting, and development

- [Action reference and automation examples](docs/actions.md)
- [MQTT protocol and lifecycle](docs/protocol.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Tests and release procedure](docs/development.md)
- [Changelog](CHANGELOG.md)

Installation and removal follow the [HACS integration layout](https://www.hacs.xyz/docs/publish/integration/) and Home Assistant's [config-entry lifecycle](https://developers.home-assistant.io/docs/config_entries_index/).
