# HA-CinemaSeat

Search and control films in the CinemaSeat Apple TV app from Home Assistant. Choose audio and subtitles, start playback, pause, resume, stop, and navigate chapters.

**Pair using six digits.** Enter your HA address and port on the Apple TV, then enter the temporary code shown on the TV in Home Assistant. The player ID and a permanent connection key are transferred automatically. You never need to type a long password.

**Search runs on the Apple TV:** Home Assistant → direct WebSocket → CinemaSeat → Plex. HA does not connect to Plex or need a Plex token. MQTT is not required. CinemaSeat remains one tvOS app with normal browsing and an HA mode.

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
6. CinemaSeat shows **Paired with Home Assistant**. Return to its main screen and select the blue **HA icon** to allow film control.

Opening the HA form starts the pairing endpoint, including on a fresh installation with no player entries. Codes expire after **two minutes**, are single-use, and become invalid if the TV disconnects or cancels pairing. Request a new code if necessary. The permanent key is saved in the private HA entry and the Apple TV Keychain (the simulator uses its own app container).

No broker username/password, manually entered player ID, or permanent pairing-code field is needed. Pairing itself does not start a film or enable control outside HA mode.

For HTTPS, enter `https://ha.example.com` and the HTTPS port (usually `443`). Certificate verification remains enabled. HTTP is supported for trusted local networks; use HTTPS for connections outside that network. Changing the saved HA destination clears the key for the old destination, so it cannot be sent to another HA server.

This is a HACS **custom repository**, not currently a default-catalogue entry. The dashboard card and brand assets are bundled in the Integration package; there is no separate frontend repository.

For manual installation, copy only `custom_components/cinemaseat` to your HA config directory, restart HA, and continue at step 3.

## Upgrade from 0.4.x (MQTT)

Update the integration **and the CinemaSeat app**, then restart HA. Existing HA player entries and entity IDs are retained, but their old MQTT pairing keys are discarded. The app retains its generated player ID and asks for an HA address instead of reusing a broker address.

Open the existing player entry in **Settings → Devices & services → CinemaSeat → ⋮ → Reconfigure**, request a new code on that same Apple TV, and enter its six digits. Pairing a different TV into an existing entry is rejected. Use Add integration for a new TV instead.

The MQTT integration/broker can remain for other devices. If MQTT is loaded during migration, the integration attempts to clear only the four discovery sensors emitted by the old CinemaSeat app. If MQTT is unavailable, remove any old CinemaSeat MQTT sensors manually. The new media player does not depend on them.

## Dashboard

In your HA profile, enable **Advanced mode** if Resources is hidden. In **Settings → Dashboards → ⋮ → Resources**, add this **JavaScript module**:

```text
/cinemaseat/cinema-search-card.js?v=0.5.0
```

Add a manual card, replacing the entity with your paired CinemaSeat player:

```yaml
type: custom:cinemaseat-search-card
entity: media_player.cinemaseat_apple_tv
```

The player selector lists configured CinemaSeat players; restrict it with an optional `entities` list. A custom `title` is supported. Add HA's **media-control** card for playback buttons, or use the complete [example dashboard](examples/dashboard.yaml).

Search a title, then choose **Start** on the intended film version. Use **Options** to choose audio/subtitles first. During playback, selectors change the current film's tracks or turn subtitles off. Actual selection is confirmed by player feedback.

Search is case/accent insensitive, accepts 1–128 characters, and returns up to 50 matches. Film versions remain separate results. Searching can run during playback. Stop the current film before starting another. A new film starts at the beginning; plain Start uses default audio and subtitles off.

## HA mode and reconnect

- **Back before playback:** return to normal browsing and cancel preparation.
- **Playing/paused:** remain in HA mode.
- **After stop, end, or playback error:** Back can return to normal browsing.
- Cold app launches start in normal mode. Leaving HA mode or backgrounding the app disconnects control.
- In active HA mode, interrupted connections reconnect automatically. The stored key is reused; another short code is only needed for re-pairing.

## Update and remove

For updates, download the release through HACS, restart HA, update the resource's `?v=` suffix, and reload the browser.

For complete removal:

1. Stop any film and exit HA mode on the Apple TV.
2. Remove CinemaSeat dashboard cards, the `/cinemaseat/cinema-search-card.js` resource, and any scripts/automations referencing its entities or actions. These are user-owned settings and are not deleted automatically.
3. Delete the CinemaSeat player entries in **Settings → Devices & services**. Their keys are revoked, their player sockets are closed, entities/timers unload, and pending requests fail. The last unload unregisters CinemaSeat actions and makes the card return 404.
4. In **HACS → HA-CinemaSeat → ⋮ → Remove**, remove the package and restart HA. HACS removes all package files, including card and icon.

HA retains HTTP routes until restart. The pairing route must remain available for a new Add integration flow; it never grants control without a configured player's key. Restarting after HACS removal also removes that route and cancels all temporary pairing sessions. No files are copied into `www/`, and no broker or dashboard is created automatically.

The tvOS app and shared HA dependencies are retained. Recorder history and backups follow HA's normal retention policy. Reinstalling and pairing again are supported. For manual installs, perform steps 1–3, remove `custom_components/cinemaseat`, then restart HA.

To replace a pairing, open HA's Reconfigure form and choose **Pair again** on the TV. The old key is replaced after the new pairing succeeds. No key is displayed or copied manually.

## Reference

- [Actions and automation examples](docs/actions.md)
- [Direct protocol and pairing lifecycle](docs/protocol.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Tests and releases](docs/development.md)
- [Changelog](CHANGELOG.md)

Packaging follows the [HACS integration layout](https://www.hacs.xyz/docs/publish/integration/). Entry setup, reconfiguration, and unload use Home Assistant's [config-entry lifecycle](https://developers.home-assistant.io/docs/config_entries_index/).
