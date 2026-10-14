# CinemaSeat 0.7.0 verification

Seven frontend DOM tests passed, covering saved movie/player/track choices, curtain action order and a ten-second delay, default audio/subtitles off, administrator checks, unique IDs, and pending/error handling.

The actual card handler generated a test automation payload, which was submitted to Home Assistant Core 2026.10.1’s standard automation API in a test container. The automation was read back unchanged and loaded as an automation entity. It had no triggers; creation did not start a film.

Manually executing it on the free tvOS 26.5 simulator confirmed:

- Closed curtain immediately.
- Film preparation at 10.13 seconds after execution.
- Curtain opening and confirmed playback at approximately 19.25 seconds.
- Curtain hidden at 30.48 seconds, with the saved audio and subtitle selections confirmed by player state.

The temporary test automation was deleted and the test film stopped. An existing film on another simulator was left playing. No physical Apple TV was used, and no credentials were exported or included in this report.
