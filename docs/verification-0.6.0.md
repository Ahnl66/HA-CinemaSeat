# CinemaSeat 0.6.0 verification

Verified on Home Assistant Core 2026.10.1 Container and the CinemaSeat tvOS 27.0 and tvOS 26.5 simulators. No physical Apple TV was controlled.

- Entering HA mode shows the HA connection screen.
- Show curtain displays the closed first frame of the bundled curtain clip on both simulators.
- Film start through the actual HA service API retains the closed curtain during preparation and opens the existing animation with playback.
- The tvOS 26.5 state trace confirmed `preparing/closed → ready/closed → ready/opening → playing/opening → playing/hidden`.
- The normal curtain preference was off on tvOS 26.5; HA explicitly showing its curtain still worked.
- Sending Show curtain to one player did not alter the other player.
- Stop and Hide curtain return to the HA waiting screen. Both players were left stopped with the curtain hidden.

The native Safari UI became unresponsive during testing; live service requests were therefore made using the existing test session, with explicit user permission, inside the HA-test container. No keys were displayed, exported, or included in the repository.

Automated validation: production Swift session/protocol tests, a tvOS simulator build, 23 HA integration tests, 14 pairing tests, and four frontend DOM tests passed.
