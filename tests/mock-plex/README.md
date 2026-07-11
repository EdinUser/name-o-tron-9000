# Mock Plex

This is the tracked, current mock Plex bundle for local app work and backend-facing fixture work.

It is the supported replacement for the older `_helpers/tests/mock-plex-server.cjs` flow.

## Quick start

```bash
npm install
npm run mock:reset
npm run mock:start
npm run mock:verify
npm run mock:stop
npm run tauri dev
```

What those do:

- `npm run mock:setup-media`
  - rebuilds only the local `./test_media` tree aligned to the tracked mock fixtures
- `npm run mock:write-mappings`
  - writes only a sample path-mappings JSON file to `tests/mock-plex/generated/mock-path-mappings.json`
- `npm run mock:setup`
  - rebuilds media and writes mappings
- `npm run mock:reset`
  - rebuilds media and writes mappings; this is the preferred reset entrypoint for local work and automated tests
- `npm run mock:plex`
  - starts the tracked server in the foreground on `http://127.0.0.1:32400`
- `npm run mock:start`
  - starts the tracked server in the background, waits for readiness, and writes lifecycle state under `tests/mock-plex/generated/`
- `npm run mock:status`
  - reports whether the background mock server is running
- `npm run mock:stop`
  - stops the background mock server and removes its state file
- `npm run mock:verify`
  - checks the key endpoints and local media files

Reset workflow for local testing:

- use the app's `Undo Last Rename` for a quick rollback of the most recent apply run
- use `npm run mock:reset` for a full reset of the generated `./test_media` tree and mappings
- you do not need to restart `npm run mock:plex` or `npm run mock:start` after `mock:setup` unless you changed server code or fixture payloads

Lifecycle notes:

- the server now accepts `MOCK_PLEX_HOST` and `MOCK_PLEX_PORT`
- `npm run mock:start` defaults to `127.0.0.1:32400`
- `npm run mock:verify` still defaults to `http://localhost:32400`; pass `--base-url` explicitly when using a non-default port
- `npm run mock:reset` and `npm run mock:verify` are now Node-based and intended to be Windows-friendly
- the older shell scripts in `tests/mock-plex/bin/*.sh` remain as compatibility helpers, not the preferred automation path

## Layout

- `mock-plex-server.cjs`
  - HTTP entrypoint
- `fixtures/`
  - tracked endpoint payloads used by the server
- `bin/setup-test-media.sh`
  - tracked local media generator for the current mock bundle
- `bin/write-path-mappings.sh`
  - writes a sample path-mappings JSON fragment for the app
- `bin/verify-mock-plex.sh`
  - verifies that the server and local media line up
- `_source/`
  - legacy reference payloads only; do not add new work here

## Path mappings

The mock server intentionally reports fake Plex roots, not your local filesystem paths.

Current fake Plex roots:

- `/mount/server/HDD1/Movies`
- `/share/plex/Series`
- `/volume1/Media/Music`

The setup scripts map those to your local generated tree under `./test_media`.

The mapping script writes a sample JSON file at:

`tests/mock-plex/generated/mock-path-mappings.json`

That file is a reference/settings fragment. The app still expects path mappings to exist in its saved settings or to be entered through the UI.

## Endpoint coverage

The tracked server covers the current app/test surfaces:

- `GET /library/sections`
- `GET /library/sections/:id`
- `GET /library/sections/:id/all`
- `GET /library/sections/:id/allLeaves`
- `GET /library/sections/:id/search`
- `GET /library/metadata/:id`
- `GET /library/metadata/:id/children`
- `GET /library/metadata/:id/allLeaves`
- `GET /library/sections/:id/collection`
- `GET /library/collections/:id/items`
- `GET /hubs/search`
- Plex PIN auth test endpoints under `/api/v2/pins`
- `POST /library/sections/:id/refresh`
- `PUT /library/metadata/:id/refresh`
- `GET /_debug/refresh-events`
- `DELETE /_debug/refresh-events`

Paging through `X-Plex-Container-Start` and `X-Plex-Container-Size` is supported for array-based responses.

## Included edge cases

The tracked bundle now includes examples for:

- basic movie rename coverage
- movie with paired subtitle sidecar
- movie conflict target
- movie edition metadata: `Director's Cut`
- sibling movie editions with the same title/year:
  - `Kingdom of Heaven` theatrical + director's cut
  - `The Lord of the Rings: The Two Towers` theatrical + extended
- TV single-episode files
- TV multi-show library selection with multiple genres/studios
- TV generated season lists from episode metadata
- TV standard multi-season procedural structure
- TV limited-series structure
- TV multi-episode single-file case: `S01E03E04`
- TV part-style episodes: `Part 1` and `Part 2`
- TV specials / OVA in season 0
- TV multi-episode subtitle sidecar

## Notes

- Payloads are static in the current tracked bundle. The mock does not mutate state after apply/undo.
- Refresh endpoints are request recorders only. They return success and log what the client asked Plex to refresh, but they do not emulate Plex filesystem rescans or change media availability state.
- Thumbnail routes return a tiny placeholder PNG so image fetches do not hard-fail.
- `_helpers/full_plex_examples/` remains the source reference for keeping payload shape realistic.
- `_helpers/tests/*` should be treated as compatibility or local-only legacy helpers, not the primary tracked flow.
