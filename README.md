<p align="center">
  <img src="public/name-o-tron-9000.svg" alt="Name-o-Tron 9000 logo" width="140">
</p>

# Name-o-Tron 9000

Name-o-Tron 9000 is a safety-first Plex file renamer and media-library organizer. It uses metadata already matched and curated in Plex to normalize Movies, TV Shows, Music, subtitles, files, and folders into cleaner, portable filesystem structures.

Your media library should outlive your media server.

- **Website:** https://name-o-tron.kirilov.dev/
- **Downloads:** https://name-o-tron.kirilov.dev/downloads/
- **Discord:** https://discord.gg/Hp9B3Ayuj7
- **Community:** https://community.kirilov.dev/

## What It Is

Name-o-Tron is a cross-platform desktop app for media libraries that are already managed in Plex. Plex remains the source of truth for titles, years, seasons, episodes, albums, editions, artwork references, and provider IDs; Name-o-Tron applies that resolved identity to your local filesystem.

It is intended for users whose media is already matched correctly in Plex but whose filenames, folders, subtitles, or library layout are inconsistent, ambiguous, or hard to migrate.

Name-o-Tron currently requires Plex access. It is not a raw-folder scraper, a second metadata matcher, or a fully media-server-agnostic metadata exporter today.

## Implemented Today

- Plex server discovery, remembered/manual server entries, and PIN authentication
- Movies, TV Shows, and Music library access
- Configurable filename and folder templates
- Folder organization for movies, TV seasons, music albums, collections, genres, years, and alphabetical layouts
- Provider ID preservation/appending where Plex exposes IDs
- Subtitle detection, renaming, language-code handling, and encoding workflows
- Cross-platform path mapping for local disks, NAS paths, and server/client path differences
- Preview-first rename workflow with traffic-light statuses
- Manual metadata fixes from the Preview screen, persisted across sessions
- Table and blocks preview modes, including poster thumbnails where available
- Local filtering plus Plex remote search fallback when preview search finds no local matches
- Operation logs, preview snapshots, support bundles, and rollback for the latest supported rename batch
- Focused Plex follow-up refreshes after rename and undo flows

## Example Output

```text
Bad.Movie.Name.1080p.x264.mkv
Bad.Movie.Name.1080p.x264.eng.srt
```

can become:

```text
Movies/
`-- Blade Runner (1982) {imdb-tt0083658}/
    |-- Blade Runner (1982) {imdb-tt0083658}.mkv
    `-- Blade Runner (1982) {imdb-tt0083658}.eng.srt
```

For TV episodes:

```text
show.s01e01-e02.web.mkv
```

can become:

```text
Show Name/
`-- Season 01/
    `-- Show Name - S01E01-E02 - Episode Title.mkv
```

The exact output depends on your templates and settings.

## Safety Model

Name-o-Tron never treats renaming as blind text replacement. It previews proposed operations first, validates them, and blocks selected red-status rows before apply.

Preview statuses:

- **Green:** proposed name is safe under the active template/settings
- **Yellow:** warning for review, such as long paths, missing metadata, guessed editions, or character compatibility concerns
- **Red:** blocking issue, such as unsafe destination names, duplicate targets, path limits, target conflicts, or permission problems
- **Unmatched:** item is not resolved to usable Plex metadata and an accessible local path

Apply-time protections include batch guards, permission checks, duplicate-target detection, parent directory creation, rollback logging, and copy-plus-cleanup fallback for cross-device moves where needed.

Rollback has boundaries. Later manual edits, moved files, mount changes, destination collisions, permissions, or unavailable NAS storage can prevent reversal. Test with a small subset first and keep backups for major library changes.

## Quick Start

1. Install Name-o-Tron from the [Downloads](https://name-o-tron.kirilov.dev/downloads/) page.
2. Open the app and accept the startup risk acknowledgement only when you are ready to work with real files.
3. Connect to Plex through discovery, manual server entry, and PIN authentication.
4. Select a Movies, TV Shows, or Music library.
5. Configure path mappings so Plex server paths resolve to local filesystem paths.
6. Choose or edit templates for filenames and folders.
7. Preview proposed operations and review green, yellow, red, and unmatched statuses.
8. Apply only selected safe operations.
9. Use operation logs or rollback if a completed batch needs to be reversed.

## Documentation

The public documentation starts at [docs/index.md](docs/index.md) and is published at https://name-o-tron.kirilov.dev/.

- [What is Name-o-Tron?](docs/what-is-name-o-tron.md)
- [Rename Files Using Plex Metadata](docs/rename-files-using-plex-metadata.md)
- [Renaming & Templates](docs/renaming-and-templates.md)
- [Folder Structures](docs/plex-folder-structure.md)
- [Subtitle Renaming](docs/plex-subtitle-renamer.md)
- [Features](docs/features.md)
- [Settings](docs/settings.md)
- [Tips & Best Practices](docs/tips.md)
- [FAQ & Troubleshooting](docs/faq.md)
- [Downloads & Releases](docs/releases.md)

Contributor documentation starts at [dev_docs/README.md](dev_docs/README.md).

## Configuration

Settings are organized into five tabs:

- **General:** preview, logging, rollback, filename encoding, conflict handling, safety checks, pagination, search, view modes, and manual metadata fixes
- **Movies:** collections, chronology, folder structure, editions, versions, provider IDs, extras, and subtitles
- **TV Shows:** season folders, specials/OVAs, multi-episode normalization, provider IDs, and subtitles
- **Music:** artist, album, track, disc, and folder organization
- **Misc:** unmatched files, non-media sidecars, and advanced warnings

Defaults are intentionally conservative: preview before rename, keep Unicode, log operations, create rollback data, and require explicit user decisions for risky behavior.

## Installation

Official releases are published for:

- Windows: `.exe`
- macOS: `.dmg`
- Linux: AppImage, `.deb`, and `.rpm`

Download installers from https://name-o-tron.kirilov.dev/downloads/ or [GitHub Releases](https://github.com/EdinUser/name-o-tron-9000/releases).

## Building From Source

Prerequisites:

- Node.js 18+
- Rust 1.70+
- Platform build tools:
  - Windows: Microsoft Visual C++ Build Tools and WebView2 runtime
  - macOS: Xcode Command Line Tools
  - Linux: `build-essential`, `pkg-config`, `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libjavascriptcoregtk-4.1-dev`, `libsoup-3.0-dev`, `libglib2.0-dev`, `libpango1.0-dev`, `libatk1.0-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`

```bash
git clone <repository-url>
cd name-o-tron-9000
npm install
```

Development with the mock Plex server:

```bash
npm run mock:reset
npm run mock:start
npm run mock:verify
npm run tauri dev
```

Production build:

```bash
npm run tauri build
```

Linux installer smoke test:

```bash
npm run bundle:linux
```

Linux bundle output lands under `src-tauri/target/release/bundle/`.

## Verification Commands

Common checks from the repo root:

```bash
npm run test:types
npm test
npm run test:rust
npm run test:mock:http
npm run test:all
npm run build
```

Mock Plex helpers:

```bash
npm run mock:reset
npm run mock:start
npm run mock:verify
npm run mock:stop
npm run test:mock:http
cargo test --manifest-path src-tauri/Cargo.toml --test mock_plex_harness_tests
```

`npm run test:mock:http` runs the mock HTTP server verification path: reset generated media, start the tracked server, verify endpoints and files, then stop the server.

The mock-backed Rust suite uses Plex-shaped fixture metadata but performs real filesystem apply/undo work in temporary media trees, including folders, subtitles, rollback logs, and cleanup-related files.

## Troubleshooting

**No Plex servers found**

- Confirm Plex Media Server is running and reachable.
- Check firewall and network discovery settings.
- Try Home -> Advanced Scan or manual server addition.
- Remove stale saved entries from Home if old addresses keep reappearing.

**Path mapping failed**

- Confirm Plex library roots match the paths visible from the machine running Name-o-Tron.
- Test mappings from the app before applying rename operations.
- Ensure network drives or NAS mounts are mounted and writable.

**Rename blocked by red status**

- Fix the item, use Auto-Fix Reds where appropriate, or skip red rows.
- Review duplicate targets, invalid characters, path length, target existence, and permissions.

**Subtitle encoding errors**

- Enable UTF-8 conversion if appropriate.
- Check subtitle file permissions and format support.
- Review logs under the app data logs directory for details.

For more help, see [FAQ & Troubleshooting](docs/faq.md), join Discord, or use the community site linked above.

## Contributing

Use [`AGENTS.md`](AGENTS.md) for repository-specific agent/developer rules and [dev_docs/README.md](dev_docs/README.md) for contributor-facing architecture, build, testing, and workflow notes.

Keep changes small, safety-first, and documented. Update public docs when behavior, settings, release process, or user-visible workflows change.
