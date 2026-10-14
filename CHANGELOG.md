# Changelog

## 0.4.0 — 2026-10-14

- First standalone HA-CinemaSeat repository and HACS release.
- Bundled search/track card, brand icon, and English installation, update, removal, action, and protocol documentation.
- Unregister CinemaSeat actions after the last player unloads; keep other loaded players working.
- Disable the bundled card endpoint when no player is loaded.
- Fail pending operations on unload and prevent subsequent commands from an unloaded entity.
- Preserve the `cinemaseat` domain and existing player entries for migration from manual installations.

## Earlier versions

0.2.0 introduced searching and confirmed film start through the paired tvOS app. 0.3.0 added audio/subtitle selection; 0.3.1 documented the single CinemaSeat app with an HA mode. These versions were maintained inside the CinemaPlexTV project.
