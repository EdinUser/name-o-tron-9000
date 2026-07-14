# Mock-Backed Integration Test Matrix

## Test Layer Name

Use **mock-backed integration tests** for this suite.

Why:

- They are not unit tests because they cross module boundaries.
- They are not full desktop E2E because they do not need to drive the Tauri UI for every case.
- They should use Plex-shaped mock metadata while creating real temporary media trees and exercising settings/templates, path mappings, real filesystem apply, rollback logs, and undo.
- They are the main place to test rename-rule combinations before adding heavier desktop E2E coverage.

Suggested script names:

- `npm run test:mock:integration`
- `npm run test:mock:e2e`
- `npm run test:mock:all`

Suggested Rust test module name:

- `mock_backed_rename_integration_tests`

## Implemented Coverage

The first pass lives in `src-tauri/tests/mock_plex_harness_tests.rs` and currently covers:

- Chinese movie rename using genre folders, explicit provider IDs, subtitle auto-move, rollback log creation, and undo.
- Multilingual TV double-episode rename with Thai and Armenian subtitle sidecars, season folders, apply, rollback, and undo.
- Movie collection grouping with generated folders and undo.
- Movie year-decade organization with generated folders and undo.
- Focused undo coverage for movie-folder targets with video and subtitle restoration.
- Provisional loose-file cleanup operations for `skip`, `move_extras`, and reversible `delete` using generated `poster.jpg` and `movie.nfo` fixture files.
- Existing-target conflict detection from generated operations.
- Backend proposal wrappers for movie and episode cases so tests use the same rename proposal path as production code.
- Sanitization behavior that preserves folder separators while still sanitizing invalid characters per path segment.

The mock fixture bundle also now keeps selectable TV pagination filler shows aligned with episode leaves, so clicking those shows in the app reaches a non-empty preview path instead of an empty or broken allLeaves response.

## Fixture Expansion

Initial non-Latin examples are now present in the tracked mock bundle. Keep expanding these as new rename risks are found:

- Chinese movie with Han title and ASCII alternate ordering.
- Japanese movie with kanji/kana title and composed/decomposed Unicode filename variants.
- Thai movie with Thai title and subtitle sidecar.
- Armenian movie with Armenian title and provider IDs.
- Multilingual TV anthology with Chinese, Japanese, Thai, and Armenian episode-title cases.
- Decomposed-accent movie path for Unicode normalization checks.

Each should include:

- Plex metadata title/year/guids.
- Fake Plex file path under `/mount/server/HDD1/Movies`.
- Local generated file under `test_media/Movies`.
- At least one sidecar subtitle for one non-Latin case.
- Search coverage through `/hubs/search`.

## Core Scenario Groups

### Movie Naming

- Default template: `{title}[ ({year})]`
- Folder template: `{title}[ ({year})]/{title}[ ({year})]`
- Provider IDs template: `{title}[ ({year})][ {ids}]`
- Non-Latin title with Unicode mode.
- Non-Latin title with transliteration/ascii mode once backend support is verified.

### Movie Organization

- `folderStructure: none` with `ownFolderPerMovie: true`
- `folderStructure: alpha`
- `folderStructure: alpha_ranges`
- `folderStructure: genre`
- `folderStructure: year_decade`
- `collections.enabled: true`, `collections.mode: always`
- `collections.enabled: true`, `collections.mode: if2plus`
- `ownFolderWithinSharedFolder: add_movie_folder`
- `ownFolderWithinSharedFolder: keep_shared_folder`

### Editions

- Single edition from filename, e.g. Director's Cut.
- Multiple sibling editions with same title/year.
- Theatrical plus extended edition.
- Edition plus subtitle sidecar.

### TV Naming

- Default episode template.
- Template including `{ids}`.
- `seasonFolders: true`
- `seasonFolders: false`
- `normalizeMultiEpisode: true` for `S01E03E04`
- `normalizeMultiEpisode: false`
- `detectOVAsSeason00: true` maps season 0 to `Specials`
- `detectOVAsSeason00: false` maps season 0 to `Season 00`
- Part-style episodes: `Part1` / `Part2`

### Subtitles

- `general.subtitles.renameWithVideo: true`
- `general.subtitles.renameWithVideo: false`
- `languageCodeHandling: preserve`
- `languageCodeHandling: normalize`
- forced/SDH subtitle suffix preservation.
- subtitle target conflict.

### Media Asset Groups

Do not treat Kodi-style files or random leftovers as ordinary movie/episode rename rows. Tests should separate these cases:

- Associated subtitles follow the primary media item.
- Kodi long-name files follow and rename with the primary media item, e.g. `<old-stem>.nfo` and `<old-stem>-poster.jpg`.
- Kodi short-name files inside own-movie folders follow the folder and keep names, e.g. `movie.nfo`, `poster.jpg`, `fanart.jpg`.
- Clearly attached trailers/artwork follow only when association is strong.

### Residual Leftovers

Residual leftovers are cleanup blockers in folders touched by the current apply run.

- `leave` keeps the old folder and reports remaining leftovers.
- `move_others` moves leftovers to `_others/` while preserving source context.
- undo restores residual files to their original folders.
- unrelated folders are not scanned or modified.

### Safety And Conflicts

- Existing target with `conflictHandling: skip`
- Existing target with `conflictHandling: suffix2` once implemented for video paths.
- Duplicate target within a batch.
- Reserved filename on Windows-sensitive settings.
- Path length warning and blocking thresholds.
- Non-Latin warning with `encoding.highlightNonLatin: true`
- No non-Latin warning with `encoding.highlightNonLatin: false`

## First Real Test Status

The recommended first test is now implemented. It follows this shape:

1. Reset seeded media.
2. Load Plex-shaped movie metadata from the tracked fixture bundle.
3. Build `MovieItem` from Plex metadata.
4. Generate operations from actual settings/templates.
5. Apply operations with path mappings.
6. Assert files moved.
7. Assert rollback log entries.
8. Undo from rollback log.
9. Assert files restored.

The same file now also includes TV multi-episode, non-Latin movie cases, explicit undo checks, and provisional loose-file cleanup coverage. Next useful additions are media asset group discovery for Kodi-style `.nfo`/artwork files, residual `_others` cleanup, edition siblings, `alpha_ranges`, reserved-name/path-length blockers, and the `normalizeMultiEpisode: false` branch.
