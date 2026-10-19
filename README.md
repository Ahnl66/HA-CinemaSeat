# HA-CinemaSeat

Search and control films in the CinemaSeat Apple TV app from Home Assistant. Choose audio and subtitles, start playback, pause, resume, stop, and navigate chapters.

**Pair using six digits.** Enter your HA address and port on the Apple TV, then enter the temporary code shown on the TV in Home Assistant. The player ID and a permanent connection key are transferred automatically. You never need to type a long password.

**Search runs on the Apple TV:** Home Assistant → direct WebSocket → CinemaSeat → Plex or its local NAS index. HA does not connect to Plex or need a Plex token. MQTT is not required. CinemaSeat remains one tvOS app with normal browsing and automatic HA connectivity while the app is open.

## Requirements

- Home Assistant Core **2026.10.0+** (tested on 2026.10.1).
- HACS, or a manual custom integration installation. HA Container is supported.
- A CinemaSeat build with direct HA connection and six-digit pairing support. The tvOS source is maintained in [CinemaPlexTV](https://github.com/Ahnl66/CinemaPlexTV).
- The Apple TV can reach the HA address and port you enter.

## Install with HACS

1. In **HACS → ⋮ → Custom repositories**, add `https://github.com/Ahnl66/HA-CinemaSeat`, type **Integration**.
2. Download the latest **HA-CinemaSeat** release and restart HA.
3. In **Settings → Devices & services → Add integration**, choose **CinemaSeat**. Keep the six-digit-code form open.
4. On the Apple TV, open **CinemaSeat → Settings → Home Assistant**. Enter your **HA address or IP** and **port** (usually `8123`). The generated **Player ID** is displayed for reference; do not copy it into HA.
5. Select **Request pairing code**. Enter the six digits shown on the TV in the HA form. Optionally give the player a friendly name, then submit.
6. CinemaSeat connects automatically after pairing. In its HA settings, enable **Allow control from Home Assistant** to start/control films. This permission is off by default; library and status access already work while CinemaSeat is open.

Opening the HA form starts the pairing endpoint, including on a fresh installation with no player entries. Codes expire after **two minutes**, are single-use, and become invalid if the TV disconnects or cancels pairing. Request a new code if necessary. The permanent key is saved in the private HA entry and the Apple TV Keychain (the simulator uses its own app container).

No broker username/password, manually entered player ID, or permanent pairing-code field is needed. Pairing itself does not start a film. When control is allowed, HA and the ATV remote can both control an active Play Sequence.

Home Assistant settings are available through **Settings → Connections → Home Assistant**. Opening settings does not switch playback mode. **Clear** removes the saved destination and local pairing key, retaining the Player ID. **Connection enabled** temporarily disconnects without removing the saved destination, key or playback permission. Delete the HA player entry separately if you also want to remove it from Home Assistant.

For HTTPS, enter `https://ha.example.com` and the HTTPS port (usually `443`). Certificate verification remains enabled. HTTP is supported for trusted local networks; use HTTPS for connections outside that network. Changing the saved HA destination clears the key for the old destination, so it cannot be sent to another HA server.

This is a HACS **custom repository**, not currently a default-catalogue entry. The dashboard card and brand assets are bundled in the Integration package; there is no separate frontend repository.

For manual installation, copy only `custom_components/cinemaseat` to your HA config directory, restart HA, and continue at step 3.

## Upgrade to 0.10.0: no separate HA mode

Update both the integration and CinemaSeat app, then restart HA. Existing player/entity IDs and pairing are retained. **Enable Allow control from Home Assistant once in the ATV HA settings**: it defaults to off for new and existing installs. Library/status reads work without granting playback control. A paired app connects automatically while open; HA starts open the player automatically. Use Settings → Connections → Home Assistant for settings/status.

HA can start a film when permission is enabled and no film/sequence is active. Stop the current presentation before starting another; it is never replaced implicitly. Disabling control leaves playback running and the ATV remote usable. Local direct playback remains outside HA control and sequence events. Existing presentation-ID release automations are retained; enable control before using Wait for Home Assistant. A changed HA destination or cleared pairing resets permission.

## Saved connection switches (0.12.0)

Update both the integration and CinemaSeat app, then restart HA. Each ATV connection (Plex, NAS, Home Assistant) has a saved **Connection enabled** switch. Missing flags default to enabled on upgrade. Disabling preserves addresses, credentials, pairing, HA playback permission, the NAS index, history and home layout. Re-enabling restores access without automatically starting playback or replaying commands/events.

Disabled movie sources disappear from app and HA libraries/search and cannot be started through saved film IDs or scripts. Disabling the source of an active film/sequence stops it. NAS-dependent sequences require NAS. Disabling only HA leaves a running film playing locally; a sequence waiting for HA is cancelled. New local sequences skip the saved HA wait while HA is disabled.

The media player exposes `enabled_sources`. The bundled dashboard hides disabled source choices and clears stale selections. Both movie sources can be off while HA remains connected. Turning the HA connection off makes the HA entity unavailable without removing entities or automations. **Allow control from Home Assistant** remains a separate permission. See [connection behavior and verification](docs/connections.md).

## Native media player controls

Update both the integration and the CinemaSeat app, then restart HA. Existing player entities and pairing are retained. The same device now includes Audio and Subtitles select entities. Standard media-player browsing provides Plex/NAS folders, film posters and Direct Play / Play Sequence choices. `media_player.play_media` accepts `extra.playback_mode: sequence`; the standard Play button releases the currently waiting sequence. Delayed room automations retain `cinemaseat.start_sequence` with the event's presentation ID.

Flat presentation/feature attributes, real curtain state, dynamic controls and anchored playback position are available directly on the media player. Timecode events remain second-by-second. See the [complete media-player reference and examples](docs/media-player.md).

## Upgrade from 0.4.x (MQTT)

Update the integration **and the CinemaSeat app**, then restart HA. Existing HA player entries and entity IDs are retained, but their old MQTT pairing keys are discarded. The app retains its generated player ID and asks for an HA address instead of reusing a broker address.

Open the existing player entry in **Settings → Devices & services → CinemaSeat → ⋮ → Reconfigure**, request a new code on that same Apple TV, and enter its six digits. Pairing a different TV into an existing entry is rejected. Use Add integration for a new TV instead.

The MQTT integration/broker can remain for other devices. If MQTT is loaded during migration, the integration attempts to clear only the four discovery sensors emitted by the old CinemaSeat app. If MQTT is unavailable, remove any old CinemaSeat MQTT sensors manually. The new media player does not depend on them.

## Dashboard

In your HA profile, enable **Advanced mode** if Resources is hidden. In **Settings → Dashboards → ⋮ → Resources**, add this **JavaScript module**:

```text
/cinemaseat/cinema-search-card.js?v=0.12.0
```

Add a manual card, replacing the entity with your paired CinemaSeat player:

```yaml
type: custom:cinemaseat-dashboard-card
entity: media_player.cinemaseat_mac
```

The dashboard has **Control**, **Library**, **Events & tests** and **Diagnostics** tabs. It includes native Plex/NAS browsing, film posters, both sequence-preparation routes, exact-presentation release, both track-control routes, a live event monitor, observational timecode tests, all attributes/capabilities and local JSON exports. See the [complete dashboard guide](docs/dashboard.md). Existing `cinemaseat-search-card` configurations also receive these features. A full-width panel-view example is supplied in JSON and YAML.

The player selector lists configured CinemaSeat players; restrict it with an optional `entities` list. A custom `title` is supported. Playback, pause, stop, chapter buttons, and audio/subtitle choices are built into this card. All controls follow the selected player. Use the complete [example dashboard](examples/dashboard.yaml) without adding separate playback buttons.

**Play Sequence** prepares an indexed NAS film with the configured curtain, intros, trailer and bumpers. CinemaSeat emits Prepare Start Sequence and waits until your HA script calls `cinemaseat.start_sequence` with that presentation ID. Direct Start remains independent and starts without this handshake. The current ATV app no longer supports standalone Show curtain; old scripts using it must be updated.

**Two initiators:** CS or HA can start a sequence. A local Play Sequence can notify HA and optionally wait for release. With control allowed, HA and the ATV remote can both control the active sequence. No mode switch is needed. Use **Skip sequence step** during preroll and **Move to Timecode** (HH:MM:SS) during the feature. [Sequence control, events and script examples](docs/sequence-control.md).

**Make automation with these choices** saves a new automation named `CinemaSeat - <film title>` for the selected player, audio and subtitles. Choose Direct Play or Play Sequence under Saved automation playback. A sequence start still waits for your separate release automation or manual release. Older apps can still expose their legacy curtain capability. Creation does not start playback. The automation has no trigger: run it manually or use **Open automation** to add a trigger. HA administrator access is required. Each click creates a separate automation and does not overwrite an existing one. Saved automations work after the player restarts; CinemaSeat must be open with HA control allowed when running them.

Search a title, then choose **Start** on the intended film version. Use **Options** to choose audio/subtitles first. During playback, selectors change the current film's tracks or turn subtitles off. Actual selection is confirmed by player feedback.

Search is case/accent insensitive, accepts 1–128 characters, and returns up to 50 matches. Film versions remain separate results. Searching can run during playback. Stop the current film before starting another. A new film starts at the beginning; plain Start uses default audio and subtitles off.

## Connection and playback

- A paired app connects while on the foreground, independently of playback permission.
- Backgrounding disconnects; returning reconnects automatically using the saved key, without starting or reclaiming playback.
- Starting a film/sequence from HA automatically presents the appropriate player in CinemaSeat.
- Back/Cancel remains available on the TV. Stopping/ending playback returns to library browsing.
- Disabling HA control keeps playback running locally. Library/status reads remain available.

## Update and remove

For updates, download the release through HACS, restart HA, update the resource's `?v=` suffix, and reload the browser.

For complete removal:

1. Stop any film and clear the Home Assistant pairing in CinemaSeat settings.
2. Remove CinemaSeat dashboard cards, the `/cinemaseat/cinema-search-card.js` resource, and any scripts/automations referencing its entities or actions. These are user-owned settings and are not deleted automatically.
3. Delete the CinemaSeat player entries in **Settings → Devices & services**. Their keys are revoked, their player sockets are closed, entities/timers unload, and pending requests fail. The last unload unregisters CinemaSeat actions and makes the card return 404.
4. In **HACS → HA-CinemaSeat → ⋮ → Remove**, remove the package and restart HA. HACS removes all package files, including card and icon.

HA retains HTTP routes until restart. The pairing route must remain available for a new Add integration flow; it never grants control without a configured player's key. Restarting after HACS removal also removes that route and cancels all temporary pairing sessions. No files are copied into `www/`, and no broker or dashboard is created automatically.

The tvOS app and shared HA dependencies are retained. Recorder history and backups follow HA's normal retention policy. Reinstalling and pairing again are supported. For manual installs, perform steps 1–3, remove `custom_components/cinemaseat`, then restart HA.

To replace a pairing, open HA's Reconfigure form and choose **Pair again** on the TV. The old key is replaced after the new pairing succeeds. No key is displayed or copied manually.

## Reference

- [Full dashboard and integration test guide](docs/dashboard.md)
- [Media player actions, attributes, library and track selectors](docs/media-player.md)
- [Actions and automation examples](docs/actions.md)
- [Direct protocol and pairing lifecycle](docs/protocol.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Tests and releases](docs/development.md)
- [Changelog](CHANGELOG.md)

Packaging follows the [HACS integration layout](https://www.hacs.xyz/docs/publish/integration/). Entry setup, reconfiguration, and unload use Home Assistant's [config-entry lifecycle](https://developers.home-assistant.io/docs/config_entries_index/).
