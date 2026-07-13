<p align="center">
  <img src="public/name-o-tron-9000.svg" alt="Name‑o‑Tron 9000 logo" width="140">
</p>

# Name-o-Tron 9000

Name-o-Tron 9000 is a safety-first, Plex-metadata-powered media-library normalization tool. It uses matches already curated in Plex to reorganize Movies, TV Shows, Music, subtitles, and folders into consistent, portable, reliably identifiable filesystem structures.

Your media library should outlive your media server.

## Audience & Scope

Name-o-Tron currently requires access to a Plex Media Server because Plex provides the matched metadata used as its source of truth. The resulting files and folders are intended to remain useful beyond one media-server database.

**Intended users:**

- Plex users with Movies, TV, or Music libraries
- Plex users who want clean, portable, media-server-friendly filesystem organization
- Developers/testers extending or debugging the tool

**Not intended for:**

- Users without Plex metadata access (this tool will not function without Plex as the current metadata source).

👉 If you need a general-purpose renamer, consider alternatives such as FileBot or Advanced Renamer.

## Features

- **Plex Integration**: Discover and authenticate with Plex Media Servers using automatic server discovery, remembered server entries, and PIN-based authentication
- **Safety-First Design**: Traffic-light status system (Green/Yellow/Red) with comprehensive validation and batch guards
- **Preview System**: Generate rename proposals with real filesystem validation before applying changes
- **Rollback Support**: Operation logging with undo support for the latest supported rename batch (see [Rollback & Recovery](docs/features.md#rollback-recovery))
- **Subtitle Handling**: Full subtitle detection, classification, renaming, and encoding conversion support
- **Cross-Platform Path Mapping**: Robust path resolution for different operating systems and network configurations
- **Diagnostics & Snapshots**: Export support bundles and preview snapshots with machine/environment details redacted while keeping rename-relevant item names and proposals for bug reports

## Architecture

- **Frontend**: React/TypeScript application with custom UI components
- **Backend**: Rust via Tauri framework for filesystem operations and Plex API integration
- **Storage**: OS-appropriate application data directories for settings and logs

## Installation

### Download & Install

**Official Releases** are available for:
- **Windows** (x64, portable .exe)
- **macOS** (Intel/Apple Silicon, .dmg installer)
- **Linux** (AppImage, .deb, .rpm packages)

Download directly from the live site: https://name-o-tron.kirilov.dev/downloads/  
Docs are hosted at https://name-o-tron.kirilov.dev/ (built from the `docs/` folder).

### Building from Source

#### Prerequisites

- **Node.js** 18+ (for frontend development)
- **Rust** 1.70+ (for backend development)
- **System dependencies**:
  - Windows: Microsoft Visual C++ Build Tools
  - macOS: Xcode Command Line Tools
  - Linux: `build-essential`, `pkg-config`, `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libjavascriptcoregtk-4.1-dev`, `libsoup-3.0-dev`, `libglib2.0-dev`, `libpango1.0-dev`, `libatk1.0-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`

#### Quick Start

1. **Clone and setup**:
   ```bash
   git clone <repository-url>
   cd name-o-tron-9000
   npm install
   ```

2. **Development with mock server**:
   ```bash
   npm run mock:setup # Optional: rebuild local mock media tree
   npm run mock:plex  # Terminal A - starts mock Plex server
   npm run tauri dev  # Terminal B - starts the app
   ```

3. **Production build**:
   ```bash
   npm run tauri build
   ```

4. **Linux installer smoke test on your machine**:
   ```bash
   npm run bundle:linux
   ```
   Output lands under `src-tauri/target/release/bundle/` with `.AppImage`, `.deb`, and `.rpm` artifacts so you can install or run them locally before pushing to GitHub Actions.

## User Guide

Complete documentation is available in the [`docs/`](./docs/) folder:

- **[Quick Start Guide](docs/index.md)** - First-time setup and basic usage
- **[Features Overview](docs/features.md)** - Detailed capabilities by category
- **[Settings Reference](docs/settings.md)** - Complete configuration options
- **[Tips & Best Practices](docs/tips.md)** - Practical advice and common patterns
- **[FAQ & Troubleshooting](docs/faq.md)** - Common questions and solutions
- **[Technical Appendix](docs/appendix.md)** - Advanced technical details

### First Launch Workflow

1. **Server Discovery** - App automatically finds Plex servers on your network and keeps discovered/manual entries until you remove them
2. **Authentication** - Login with your Plex account (PIN-based flow)
3. **Path Mapping** - Map Plex library paths to your local folder structure
4. **Library Selection** - Choose Movies, TV Shows, or Music libraries
5. **Preview Changes** - Review proposed renames with safety indicators
6. **Apply Renames** - Execute changes with operation logs
7. **Verify & Undo** - Check results and use undo for the latest supported rename batch if needed (see [Rollback & Recovery](docs/features.md#rollback-recovery))

During preview you can:
- Filter by status, search, and use per-page “Select all” to quickly choose items
- For TV libraries, filter episodes by season or view all seasons
- Export an environment-redacted preview snapshot for troubleshooting

## Configuration

The application supports comprehensive settings organized into 5 tabs:

### General Settings
- **Preview & Logging** - Always preview changes, export logs as TXT/CSV/JSON
- **Filename Encoding** - Unicode preservation, transliteration options
- **Conflict Handling** - Skip, overwrite, or auto-number conflicts
- **Safety Checks** - Path length, reserved names, permissions validation

### Media-Specific Settings
- **Movies** - Collections, folder structure, editions, IDs, extras handling
- **TV Shows** - Season folders, specials/OVAs, multi-episode normalization
- **Music** - Artist/Album/Track formatting, disc subfolder organization

### Advanced Features
- **Path Mapping** - Cross-platform path resolution for NAS/remote libraries
- **Unmatched Files** - Handle files not found in Plex database
- **Non-Media Files** - Process .txt, .nfo, .jpg and other associated files

## Safety & Recovery

All rename operations include multiple safety layers:

### Pre-Flight Validation
- **Traffic-Light Status System**:
  - Green: Already compliant (no change needed)
  - Yellow: Warning (review before proceeding)
  - Red: Blocking error (must be fixed or skipped)
  - Unmatched: Not found in Plex database

### Execution Safety
- **Batch Guards** - Cannot proceed with selected red-flagged items
- **Atomic Operations** - Prefer rename within filesystem; fallback to copy+delete
- **Permission Checks** - Verify access before operations
- **Rollback Logging** - Operations are recorded for supported rollback and audit

### Recovery Options
- **One-Click Undo** - Restore supported files from the latest rename batch when sources, destinations, mounts, and permissions still allow it (see [Rollback & Recovery](docs/features.md#rollback-recovery))
- **Selective Retry** - Re-run only skipped or failed items
- **Log Export** - Export operation history as TXT, CSV, or JSON
- **Backup Files** - Optional `filenames_backup.json` before operations

## Troubleshooting

### Common Issues

**"No Plex servers found"**
- Ensure Plex Media Server is running and accessible on your network
- Check firewall settings allow network discovery
- Try Home → Advanced Scan or manual server addition
- Remove stale saved entries from Home if an old server address keeps reappearing

**"Path mapping failed"**
- Verify Plex library root paths match your local folder structure
- Test mappings using the "Test Mapping" button in settings
- Ensure network drives are mounted and accessible

**"Rename blocked by red status"**
- Use "Skip All Reds" to unselect problematic items
- Use "Auto-Fix Reds" for common issues (invalid characters, long paths)
- Review individual items in the preview table

**"Subtitle encoding errors"**
- Enable UTF-8 conversion in settings (General tab)
- Check subtitle file permissions and format support
- Review logs in `~/.nameotron/logs/` for detailed error information

### Getting Help

1. **Check the FAQ** - [docs/faq.md](docs/faq.md) for common questions
2. **Review Logs** - Operation logs in `~/.nameotron/logs/`
3. **Export Settings** - Use settings export for troubleshooting
4. **Discord** - Join https://discord.gg/Hp9B3Ayuj7 for discussion and release questions
5. **Community Support** - GitHub issues for bugs and feature requests

### Manual Rollback

If the application cannot start or "Undo Last Rename" fails:
1. Locate rollback logs in `~/.nameotron/logs/` (see [Rollback & Recovery](docs/features.md#rollback-recovery))
2. Open the most recent `rollback_*.json` file
3. Manually restore files listed as "success" operations
4. Backup files are preserved with `.backup` extension where applicable

## Contributing

We welcome contributions! Please see [docs/roadmap.md](docs/roadmap.md) for planned enhancements and [AGENTS.md](AGENTS.md) for developer guidelines.

### Development Philosophy
- **Safety-first** - All changes must maintain rollback capabilities
- **User-focused** - Balance power-user features with safe defaults
- **Cross-platform** - Support Windows, macOS, and Linux equally
- **Comprehensive** - Update documentation when adding features

---

**Made with love for the Plex community**
