# Frontend tests

Install Node.js and the jsdom test dependency, then run from the repository root:

```sh
npm install --no-save --package-lock=false jsdom
node --test tests/test_search_card.cjs
```

These DOM tests verify that all playback commands target the selected player, switching players updates button availability, pending commands lock selection, failures restore controls, and search/start/track selection use the same target.

The Python integration and pairing tests require Home Assistant and aiohttp.
