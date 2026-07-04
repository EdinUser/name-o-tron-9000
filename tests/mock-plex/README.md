# Mock Plex Server

Tracked mock server resources live here so a fresh clone can run the basic Plex demo flow without relying on local-only `_helpers/`.

## Quick start

```bash
npm run mock:plex
npm run tauri dev
```

## Files

- `mock-plex-server.cjs` - Express server that mimics the Plex endpoints used by the app
- `_source/libraries.json` - library listing fixture
- `_source/movies_section_1.json` - movies fixture
- `_source/tv_section_2.json` - TV fixture

## Notes

- `_helpers/` remains intentionally local-only for large test media, scratch scripts, and personal resources.
- If you need richer local demo media, keep it under `_helpers/` and do not reference it from tracked repo scripts.
