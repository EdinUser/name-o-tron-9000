# Name-o-Tron 9000 — User Guide

<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:16px;">
  <img src="assets/name-o-tron-animate.svg" alt="Name-o-Tron 9000 animated logo" style="max-width:180px;min-width:140px;">
  <div>
    <p><strong>Rename with safety-first defaults, live previews, and full rollback.</strong></p>
    <p>Desktop Plex renamer — discover servers, map paths, preview, rename, and undo across your Plex libraries.</p>
    <p style="margin-top:4px;color:#9ca3af;">Keywords: Plex renamer, Plex library rename, Plex file naming, Plex metadata rename.</p>
  </div>
</div>

## Why Name-o-Tron 9000 for Plex renaming?

- Purpose-built Plex renamer with traffic-light safety (🟩/🟨/🟥) so you never apply risky changes.
- Works for full Plex library rename jobs or targeted fixes (Movies, TV, Music).
- Keeps Plex naming conventions aligned with metadata (titles, years, seasons/episodes, editions).
- Runs locally with rollback logs, so you can undo any batch instantly.

Welcome to the **Name-o-Tron 9000** user documentation.
This guide explains how to install, configure, and safely use the app to rename your media files with Plex metadata.

Name-o-Tron 9000 is a cross-platform desktop application that renames local media files using Plex metadata while enforcing Plex naming conventions and providing comprehensive safety and rollback capabilities.

## Audience & Scope

Name-o-Tron 9000 is designed exclusively for Plex users.
It requires access to a Plex Media Server and its metadata.

**Intended users:**

- Plex users with Movies, TV, or Music libraries
- Plex power-users who want strict naming compliance
- Developers/testers extending or debugging the tool

**Not intended for:**

- Users without Plex (this tool will not function without Plex metadata).

👉 If you need a general-purpose renamer, consider alternatives such as FileBot or Advanced Renamer.

## Who is this for?

Name-o-Tron 9000 is designed specifically for Plex users who want to maintain proper naming conventions for their media libraries.

**This tool is perfect for you if:**

- You have a Plex Media Server with organized Movies, TV Shows, or Music libraries
- You want your local files to match Plex's expected naming conventions exactly
- You value safety and want to preview all changes before applying them
- You need robust rollback capabilities in case something goes wrong
- You're comfortable with basic Plex concepts like libraries, metadata, and server access

**This tool is NOT for you if:**

- You don't have a Plex Media Server or don't plan to use Plex
- You need a general-purpose file renamer for non-media files
- You prefer manual file management over automated tools
- You're looking for cloud-based or web-based renaming solutions

## What It Does

- **Plex Integration**: Discover and authenticate with Plex Media Servers using automatic server discovery and PIN-based authentication
- **Safety-First Design**: Traffic-light status system (Green/Yellow/Red) with comprehensive validation and batch guards
- **Preview System**: Generate rename proposals with real filesystem validation before applying changes
- **Manual Metadata Editing**: Edit metadata for individual items directly in the preview interface for customized naming
- **Rollback Support**: Complete rollback logging with one-click undo functionality for all operations (see [Rollback & Recovery](features.md#rollback--recovery))
- **Subtitle Handling**: Full subtitle detection, classification, renaming, and encoding conversion support
- **Cross-Platform Path Mapping**: Robust path resolution for different operating systems and network configurations

---

## 📑 Table of Contents

1. [Quick Start](#quick-start)
2. [Installation](#installation)
3. [First Launch](#first-launch)
4. [Features Overview](features.md)
5. [Configuration & Settings](settings.md)
6. [Tips & Best Practices](tips.md)
7. [FAQ & Troubleshooting](faq.md)
8. [Community](#community)

---

## Quick Start

### Prerequisites
- **Plex Media Server** running and accessible on your network
- **Media files** organized in folders that Plex can scan
- **Administrative access** to both Plex server and local files

### Installation
- **Download** from https://name-o-tron.kirilov.dev/downloads/ (Linux/macOS/Windows installers published by CI)
- **For developers**: build instructions live in `dev_docs/` inside the repository.

### First Launch Workflow

1. **Server Discovery**: App automatically discovers Plex servers on your network
2. **Authentication**: Login with your Plex account (PIN-based authentication)
3. **Path Mapping**: Map Plex library paths to your local folder structure
4. **Library Selection**: Choose Movies, TV Shows, or Music libraries
5. **Preview Changes**: Review proposed renames with safety indicators

[preview.png]
6. **Apply Renames**: Execute changes (with automatic rollback logs)
7. **Verify & Undo**: Check results and use one-click undo if needed (see [Rollback & Recovery](features.md#rollback--recovery))

[server_discovery.png]

---

## App Flow Overview

```
[START APP]
    |
    v
[Welcome / Server Discovery]
    - Auto-discover Plex servers on your network
    - OR login with your Plex account
    |
    v
[Library Selection]
    - Pick Movies / TV / Music
    - Whole library OR per-entry selection
    |
    v
[Preview & Confirm]
    - Table: Current → New filename
    - Status indicators:
         🟩 Green  = compliant (no rename needed)
         🟨 Yellow = warning (non-Latin, missing metadata, etc.)
         🟥 Red    = blocking (must skip/fix)
         ❌ Unmatched = not in Plex DB
    - Manual editing: Click edit icon (✏️) to modify metadata for customized naming
    - Status filtering: Filter by status type (all, good, warning, error, unmatched)
    - Options:
         [⚡ Proceed to Rename] (enabled only if no 🟥 selected)
         [❌ Skip All Reds] → unselects red-flagged items
         [🛠 Auto-Fix Reds] → sanitizes fixable errors
    |
    v
[Apply Renames]
    - Batched renaming with checkpoints
    - Errors skipped, warnings logged
    |
    v
[Summary Screen]

[summary_screen.png]

    - ✅ Success count
    - ⚠ Warnings
    - ❌ Failures
    - Skipped (red/unmatched)
    - Options: Retry skipped
    |
    v
[Restore & Logs]

[undo_button.png]

    - 🔄 Undo Last Rename (see [Rollback & Recovery](features.md#rollback--recovery))
    - ▶️ Retry Skipped Items
    - 📝 View Log (export TXT | CSV | JSON)
    - Backup options (auto-log, filenames_backup.json)
    |
    v
[END]
```

---

## Safety & Recovery

### Preview Before Action
Every rename operation shows exactly what will change before execution.

### Traffic-Light Status System
- **🟩 Green**: File already compliant - no action needed
- **🟨 Yellow**: Warning - review before proceeding (non-Latin characters, missing metadata)
- **🟥 Red**: Blocking error - must be fixed or skipped (invalid characters, path too long)
- **❌ Unmatched**: File not found in Plex database

### Batch Guards
Cannot proceed with any selected red-flagged items - ensures safe operation.

### Rollback & Undo
Every rename run creates a detailed rollback log. Use "Undo Last Rename" to restore all changes.

For comprehensive information about rollback capabilities, logging, and recovery options, see [Rollback & Recovery](features.md#rollback--recovery) in the Features Overview.

### Logs & Export
All operations logged with timestamps. Export as TXT, CSV, or JSON for analysis.

👉 Continue to [Features Overview](features.md) for detailed capabilities.

## Community

Looking for help or want to share feedback? Join the Community forum (Flarum-powered) for Q&A, bug reports, and release updates: [https://community.kirilov.dev/](https://community.kirilov.dev/).
