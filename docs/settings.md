# Configuration & Settings

The Name-o-Tron 9000 settings are organized into 5 tabs, providing comprehensive control over renaming behavior. Settings are designed with **safety-first defaults** for new users while offering deep customization for power users.

## 📑 Table of Contents

1. [General Tab](#general-tab)
   - [General Behavior](#general-behavior)
   - [Filename Encoding](#filename-encoding)
   - [Conflict Handling](#conflict-handling)
   - [Safety Checks](#safety-checks)
2. [Movies Tab](#movies-tab)
   - [Collections](#collections)
   - [Chronological Prefix](#chronological-prefix)
   - [Folder Structure](#folder-structure)
   - [Editions](#editions)
   - [Versions](#versions)
   - [IDs](#ids)
   - [Special Cases](#special-cases)
3. [TV Shows Tab](#tv-shows-tab)
   - [Structure](#structure)
   - [Edition-like Handling](#edition-like-handling)
4. [Music Tab](#music-tab)
   - [Organization](#organization)
5. [Misc Tab](#misc-tab)
   - [Unmatched Files](#unmatched-files)
   - [Non-Media Files](#non-media-files)
   - [Advanced Warnings](#advanced-warnings)
6. [Settings Philosophy](#settings-philosophy)
7. [Configuration Files](#configuration-files)

---

## Settings Labels Legend

Throughout this document, settings options are marked with labels to help you understand their purpose and risk level:

- **🟢 Basic** - Safe defaults suitable for all users
- **🟡 Advanced** - Power-user customization options
- **🔴 Dangerous** - Risky/destructive options that require explicit confirmation

[settings_general.png]

## General Tab

### General Behavior 🟢 Basic
- **Preview before renaming** ✓
  - Always show proposed changes before applying
  - Required for safe operation
- **Save rename log** ✓
  - Export logs as TXT, CSV, or JSON after operations
  - Essential for audit trails
- **Auto-create rollback log** ✓
  - Enable one-click undo functionality
  - Stored in OS application data directory
- **Manual metadata fixes** ✓
  - Edit metadata for individual items through the preview interface
  - Changes persist across sessions and affect template rendering
  - Available for movies, TV episodes, and music
  - Combined with per-page “Select all” controls in the Preview table for efficient batch selection

### Filename Encoding 🟢 Basic
- **Keep Unicode** (•) - Recommended default
  - Preserve international characters and symbols
  - Best for global media libraries
- **Transliterate non-Latin → ASCII** 🟡 Advanced
  - Convert é → e, ñ → n, etc.
  - Useful for compatibility with older systems
- **Force ASCII only** 🟡 Advanced
  - Strict ASCII-only filenames
  - Most restrictive option
- **Highlight non-Latin names in preview** ✓ 🟡 Advanced
  - Flag potential encoding issues before renaming

### Conflict Handling 🟢 Basic
- **Skip** (•) - Default safe behavior
  - Skip files when target already exists
- **Overwrite** 🔴 Dangerous
  - Allow overwriting existing files
  - Use with caution
- **Append suffix "(2)"** 🟡 Advanced
  - Add numerical suffixes to avoid conflicts
  - Future enhancement

### Safety Checks 🟢 Basic
- **Path length check** ✓
  - Warn at >200 characters, block at >255
  - Prevents filesystem errors
- **Reserved filenames check** ✓
  - Flag Windows reserved names (CON, AUX, etc.)
  - Cross-platform compatibility
- **Permissions check before renaming** ✓
  - Verify file access before operations
  - Prevents partial failures

[settings_movies.png]

## Movies Tab

### Collections 🟢 Basic
- **Group movies into Plex Collections** ✓
  - **Always** (•) - Group all collection movies together
  - **Only if 2+ movies** - Group only when multiple movies exist
- **Collection naming style**:
  - **Original name** (•) - Use Plex's collection name
  - **Prefix "_"** - Add underscore prefix
  - **Prefix "Collection - "** - Descriptive prefix
  - **Suffix "(Collection)"** - Add collection indicator

### Chronological Prefix 🟡 Advanced
- **None** (•) - Default behavior
- **By year** - Prefix with release year
- **By collection order** - Future enhancement

### Folder Structure 🟢 Basic
- **None** - No special folder organization
- **Alphabetical (A-Z, 0-9)** - Letter-based folders
- **Alphabet ranges (A-C, D-F, …)** - Grouped letter ranges
- **By Genre** - Organize by primary genre
- **By Year/Decade** - Decade-based folders (1990-1999/)
- **Put every movie in its own folder** ✓
  - Create individual movie folders
  - Standard Plex organization

### Editions 🟡 Advanced
- **Preserve Plex edition tokens** (•) - Use Plex metadata
  - Example: `{edition-extended}` in filename
- **Expand to human-readable** 🔴 Dangerous
  - Convert to "- Extended Edition"
  - May break Plex matching
- **Keep both** 🔴 Dangerous
  - Include both human-readable and tokens
  - Can create very long filenames
- **Detect editions from filenames** ✓ 🟢 Basic
  - Auto-detect Extended, IMAX, Director's Cut, etc.

### Versions 🟢 Basic
- **Append version name if multiple exist** ✓
  - Example: Movie (Year) - 4K HDR.mkv
  - Handles multiple quality versions

### IDs 🟡 Advanced
- **Do not include IDs** - Clean filenames only
- **Preserve existing IDs if present** (•) - Keep existing metadata
  - Example: `{imdb-tt12345}` tokens
- **Auto-append all matched IDs** 🔴 Dangerous - Add all available identifiers
  - Can create very long filenames

### Special Cases 🟢 Basic
- **Move extras to Extras/ subfolder** ✓
  - Organize bonus content
- **Mark ISO/disc images with [ISO]** ✓
  - Special handling for disc images

[settings_tv.png]

## TV Shows Tab

### Structure 🟢 Basic
- **Always put episodes in Season folders** ✓
  - Standard TV organization
- **Treat mini-series as TV shows** ✓
  - Handle limited series appropriately

### Edition-like Handling 🟡 Advanced
- **Detect Extended / Uncut / Director's Cut episodes** ✓
  - Flag special versions
- **Detect OVA / Specials → Suggest Season 00** ✓
  - Organize anime and special content
- **Normalize multi-episode files** ✓
  - Convert `E01-02` to `E01E02` format
- **Warn if episode count doesn't match Plex DB** 🟡 Advanced
  - Detect potential metadata issues
  - May flag legitimate content variations

[settings_music.png]

## Music Tab

### Organization 🟢 Basic
- **Artist / Album / Track - Title format** ✓
  - Standard music library structure
- **Put tracks into disc subfolders if multi-disc** ✓
  - Organize multi-disc albums properly
- **Normalize track numbering** ✓
  - Convert `01-Track` to `01 - Track`

[settings_misc.png]

## Misc Tab

### Unmatched Files 🟢 Basic
- **Leave in place** (•) - Safe default
  - Don't modify unrecognized files
- **Move to "Unmatched/" folder** 🟡 Advanced
  - Organize unknown content
- **Move to "Extras/" folder** 🟡 Advanced
  - Alternative organization
- **Delete** 🔴 Dangerous - Requires confirmation
  - Permanently remove files

### Non-Media Files 🟢 Basic
- **Skip** (•) - Ignore non-media files
- **Move to "Extras/" folder** 🟡 Advanced - Organize miscellaneous files
- **Delete** 🔴 Dangerous - Requires confirmation
  - Remove non-media content

### Advanced Warnings 🟡 Advanced
- **Path length check** ✓ - Monitor long paths
- **Reserved names check** ✓ - Cross-platform compatibility
- **Non-media detection** ✓ - Identify unsupported files

---

## Support & Diagnostics

- **Open logs folder** ✓
  - Quickly open the directory containing rollback and error logs
- **Export diagnostic bundle** ✓
  - Generate an anonymized ZIP bundle containing settings summary and recent logs for bug reports
- **Preview snapshots** ✓
  - From the Preview screen, export an anonymized JSON snapshot of the current preview state to attach to issues

---

## Settings Philosophy

### Safe-First Defaults
- **Normie-friendly**: Conservative settings for new users
- **Unicode preserved**: International characters maintained by default
- **Non-destructive**: Operations require explicit confirmation for risky actions

### Power User Options
- **Deep customization**: Advanced users can enable sophisticated features
- **Edition handling**: Complex movie version management
- **Collection organization**: Advanced grouping and naming
- **ID preservation**: Metadata token handling

### Safety Warnings
- ⚠ **Destructive options** (delete, overwrite, expand editions) require explicit confirmation
- **Preview required**: All changes shown before execution
- **Rollback guaranteed**: Every operation creates undo logs

---

## Configuration Files

Settings are stored in OS-appropriate locations:
- **Windows**: `%APPDATA%\name-o-tron-9000\settings.json`
- **macOS**: `~/Library/Application Support/name-o-tron-9000/settings.json`
- **Linux**: `~/.config/name-o-tron-9000/settings.json`

Logs are stored in: `~/.nameotron/logs/` (cross-platform)

👉 See [Tips & Best Practices](tips.md) for guidance on safe configuration choices.
