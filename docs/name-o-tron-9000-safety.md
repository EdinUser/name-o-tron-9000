# Name-o-Tron 9000™ – Safety, Recovery & Auto-Fix Systems

This document collects all mechanisms we’ve discussed to ensure **safety, reliability, and fix options** in the renaming process.

---

## 🔄 Renaming Safety

- **Preview Mode**
  - Always shows current filename → new filename before applying.
  - Traffic-light system for status:
    - 🟩 Green = compliant, no change needed.
    - 🟨 Yellow = warning (non-Latin, edition guessed, missing metadata).
    - 🟥 Red = blocking (must skip or fix).
    - ❌ Unmatched = not found in Plex DB.

- **Batch Blocking**
  - Renaming cannot proceed while any 🟥 red-flagged items remain selected.
  - User must either skip them or auto-fix them.

- **Red Flags (Blocking Errors)**
  - Permission denied (cannot rename/move).
  - Duplicate target filename.
  - Invalid characters (Windows: `:*?"<>|`).
  - Reserved names (Windows: `CON`, `AUX`, etc.).
  - Too long path (>255 chars).
  - Target file already exists (different content).
  - Unsupported file type (e.g., `.txt`, `.nfo`).

- **Yellow Flags (Warnings)**
  - Non-Latin characters (if not ASCII-ized).
  - Missing metadata (year, episode title).
  - Edition guessed from filename (Extended, IMAX, etc.).
  - Path length warning (>200 chars but <255).
  - Multi-version movie/TV not clearly marked.
  - Subtitle/audio orphaned.

---

## 🛡️ Ownership & Permissions Checks

- Files checked for read/write permissions before rename.
- If rights insufficient → flagged as 🟥 blocking error.
- Prevents half-renamed sets where some files are updated and others fail.

---

## 📑 Template Matching

- **Full Match**  
  File already matches the naming template → 🟩 Green.

- **Partial Match**  
  File has some correct elements but deviates (e.g., missing year, wrong spacing) → 🟨 Yellow.

- **Non-Match**  
  File doesn’t fit the template at all → flagged for rename attempt.

- **Unmatched Files**  
  - Not recognized by Plex DB.  
  - Options: Leave in place, move to `Unmatched/`, move to `Extras/`, or delete (⚠ confirmation).

---

## 🛠️ Auto-Fix & Detection Features

- **Skip All Reds**
  - Automatically unselects all 🟥 red-flagged items.
  - Allows safe renaming of remaining files.
  - Skipped items logged as “Skipped – Red Flag.”

- **Auto-Fix Reds**
  - Built-in sanitizers for common blocking issues:
    - Replace invalid symbols with `_`.
    - Truncate overly long names safely.
    - Move duplicates into `Conflicts/` folder instead of overwriting.
  - Reclassifies fixed items as 🟨 Yellow (requires confirmation).

- **Edition Detection from Filenames**
  - Detects keywords: Director’s Cut, Extended Edition, IMAX, 4K, HDR, Remastered.
  - Applies them as edition tags if Plex doesn’t supply them.
  - Always marked as 🟨 Yellow → user must confirm.

- **TV Episode Detection**
  - Detects Extended/Uncut/OVA specials in filenames.
  - Detects multi-episode ranges (`E01-02 → E01E02`).
  - Suggests placing OVAs/Specials in `Season 00`.

- **Music Cleanup**
  - Normalizes track numbering (`01-Track` → `01 - Track`).
  - Adds disc subfolders if multiple discs detected.

---

## 🔄 Restore & Recovery

- **Rollback Logs**
  - Every rename run produces a log: `old → new`.
  - “Undo Last Rename” restores all files using this log.

- **Retry Skipped Items**
  - Loads only skipped/red-flagged files into Preview for retry.

- **Logs & Export**
  - Detailed log includes successes, warnings, skips, and errors.
  - Exportable as TXT, CSV, or JSON.

- **Backup Files**
  - Optionally creates `filenames_backup.json` before renaming.

---

## 🧪 Future-Proof Safety Ideas

- Quarantine unmatched/invalid files in a special folder (`Quarantine/`).  
- Allow inline edit of proposed filenames in Preview table.  
- Offer “dry run” mode → log-only, no actual renames.  

---
