# Repository review — 14 October 2026

The HA integration source matches the copy in CinemaPlexTV. The current 0.7.0 package passed 23 integration tests and 14 pairing/socket tests using Home Assistant 2026.10.1 in an isolated temporary directory in the test container. Seven dashboard DOM tests passed, including multi-player controls, curtain state, saved automation choices, and error recovery.

The companion tvOS app passed its Debug and Release simulator builds. Session, remote protocol, HA settings, curtain startup, player UI state, playback readiness, native bridge lifecycle, chapter navigation, Plex home, poster image, subtitle selection, and shared subtitle state regression suites passed. The latest Back fix was checked live on tvOS 27.0 and 26.5: both the connection screen and closed curtain return to the normal library without leaving the app. The 26.5 simulator also passed repeated entry/exit and curtain cleanup on re-entry.

Repository JSON and whitespace checks passed. Source and pending publication files were scanned for credential literals, private keys, GitHub tokens, JWTs, and merge markers; none were found. Test credentials were not included. No physical Apple TV was tested. HA runtime files did not change during this final review, so the HACS release remains 0.7.0.
