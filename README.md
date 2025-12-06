<p align="center">
  <img src="public/name-o-tron-9000.svg" alt="Name‑o‑Tron 9000 logo" width="140">
</p>

# Name-o-Tron 9000

A cross-platform desktop application for renaming local media files using Plex metadata while enforcing Plex naming conventions and providing comprehensive safety and rollback capabilities.

## Audience & Scope

**This tool is exclusively for Plex users. Non-Plex users won't benefit.**

Name-o-Tron 9000 is designed exclusively for Plex users.
It requires access to a Plex Media Server and its metadata.

**Intended users:**

- Plex users with Movies, TV, or Music libraries
- Plex power-users who want strict naming compliance
- Developers/testers extending or debugging the tool

**Not intended for:**

- Users without Plex (this tool will not function without Plex metadata).

👉 If you need a general-purpose renamer, consider alternatives such as FileBot or Advanced Renamer.

## Features

- **Plex Integration**: Discover and authenticate with Plex Media Servers using automatic server discovery and PIN-based authentication
- **Safety-First Design**: Traffic-light status system (Green/Yellow/Red) with comprehensive validation and batch guards
- **Preview System**: Generate rename proposals with real filesystem validation before applying changes
- **Rollback Support**: Complete rollback logging with one-click undo functionality for all operations (see [Rollback & Recovery](docs/features.md#rollback--recovery))
- **Subtitle Handling**: Full subtitle detection, classification, renaming, and encoding conversion support
- **Cross-Platform Path Mapping**: Robust path resolution for different operating systems and network configurations
 - **Diagnostics & Snapshots**: Export anonymized diagnostic bundles and preview snapshots to attach to bug reports

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
  - Linux: `build-essential`, `libwebkit2gtk-4.1-dev`

#### Quick Start

1. **Clone and setup**:
   ```bash
   git clone <repository-url>
   cd name-o-tron-9000
   npm install
   ```

2. **Development with mock server**:
   ```bash
   npm run mock:plex  # Terminal A - starts mock Plex server
   npm run tauri dev  # Terminal B - starts the app
   ```

3. **Production build**:
   ```bash
   npm run tauri build
   ```

## User Guide

Complete documentation is available in the [`docs/`](./docs/) folder:

- **[Quick Start Guide](docs/index.md)** - First-time setup and basic usage
- **[Features Overview](docs/features.md)** - Detailed capabilities by category
- **[Settings Reference](docs/settings.md)** - Complete configuration options
- **[Tips & Best Practices](docs/tips.md)** - Practical advice and common patterns
- **[FAQ & Troubleshooting](docs/faq.md)** - Common questions and solutions
- **[Technical Appendix](docs/appendix.md)** - Advanced technical details

### First Launch Workflow

1. **Server Discovery** - App automatically finds Plex servers on your network
2. **Authentication** - Login with your Plex account (PIN-based flow)
3. **Path Mapping** - Map Plex library paths to your local folder structure
4. **Library Selection** - Choose Movies, TV Shows, or Music libraries
5. **Preview Changes** - Review proposed renames with safety indicators
6. **Apply Renames** - Execute changes (with automatic rollback logs)
7. **Verify & Undo** - Check results and use one-click undo if needed (see [Rollback & Recovery](docs/features.md#rollback--recovery))

During preview you can:
- Filter by status, search, and use per-page “Select all” to quickly choose items
- For TV libraries, filter episodes by season or view all seasons
- Export an anonymized preview snapshot for troubleshooting

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
- **Rollback Logging** - Every operation creates detailed undo logs

### Recovery Options
- **One-Click Undo** - Restore all files from the last rename operation (see [Rollback & Recovery](docs/features.md#rollback--recovery))
- **Selective Retry** - Re-run only skipped or failed items
- **Log Export** - Export operation history as TXT, CSV, or JSON
- **Backup Files** - Optional `filenames_backup.json` before operations

## Troubleshooting

### Common Issues

**"No Plex servers found"**
- Ensure Plex Media Server is running and accessible on your network
- Check firewall settings allow network discovery
- Try manual server addition in settings

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
4. **Community Support** - GitHub issues for bugs and feature requests

### Manual Rollback

If the application cannot start or "Undo Last Rename" fails:
1. Locate rollback logs in `~/.nameotron/logs/` (see [Rollback & Recovery](docs/features.md#rollback--recovery))
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
