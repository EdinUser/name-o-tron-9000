# Mock Plex Fixture Manifest Contract

Schema version: `1`

This directory defines the manifest-driven local filesystem side of the mock Plex harness. The HTTP mock stays under `tests/mock-plex/`. These manifests only describe what should exist on disk for backend rename/apply/undo tests.

## Required top-level keys

- `schema_version`
- `name`
- `server_id`
- `libraries`
- `directories`
- `conflicts`
- `assertions`

## Library contract

Each entry in `libraries[]` must include:

- `key`
- `type`
- `title`
- `plex_root`
- `local_root`
- `items`

`plex_root` is the fake Plex-reported root.

`local_root` is a path relative to the generated output root. It must stay different from `plex_root` so path mapping is exercised for real.

## Item contract

Each item in `libraries[].items[]` must include:

- `ratingKey`
- `type`
- `title`
- `plex_file`
- `local_file`

Optional:

- `year`
- `guids`
- `subtitles`
- `seed_contents`

`plex_file` is the fake Plex path returned by metadata payloads.

`local_file` is the relative path created under the library's generated local root.

## Subtitle contract

`subtitles` is an array of objects with:

- `plex_file`
- `local_file`
- `contents`

Subtitles are written as small UTF-8 text files.

## Directory contract

`directories[]` describes extra directory states to create.

Each entry includes:

- `library_key`
- `relative_path`
- `state`

Allowed `state` values:

- `empty`
- `non_empty`

For `non_empty`, provide:

- `seed_file`
- `contents`

## Conflict contract

`conflicts[]` pre-creates destination files that should already exist before apply.

Each entry includes:

- `library_key`
- `relative_path`

Optional:

- `contents`

## Assertions contract

`assertions.operations[]` is the expected apply input for the scenario. Keep `original_path` in fake Plex form and keep `new_path` relative when you want the harness to prove mapped-relative apply behavior.

Each assertion operation includes:

- `operation_id`
- `operation_type`
- `original_path`
- `new_path`

`assertions.cleanup_original_paths[]` lists fake Plex paths whose parent directories should be considered during cleanup checks.

## Builder output

`build_fixture_tree.sh` writes `resolved-fixture.json` into the chosen output root. That file contains:

- resolved absolute local roots
- resolved absolute file paths
- generated path mappings
- the original assertion block

The Rust integration suite consumes that resolved file instead of reconstructing paths by guesswork.
