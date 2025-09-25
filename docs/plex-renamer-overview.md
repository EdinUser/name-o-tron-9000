# Plex Renamer – Full App Overview

This document combines the **user flow diagram** and the **settings reference** into one master document.

---

# 📊 App Flow Diagram

```
[START APP]
    |
    v
[Welcome / Server Discovery]
    - Auto-discover Plex servers (LAN GDM)
    - OR Plex account login (plex.tv resources API)
    |
    v
[Library Selection]
    - Pick Movies / TV / Music
    - Whole library OR per-entry selection
    |
    v
[Template Selection]
    - Templates per type (Movies/TV/Music)
    - Presets + custom placeholders
    |
    v
[Preview & Confirm]
    - Table: Current → New filename
    - Status:
         🟩 Green  = compliant (no rename needed)
         🟨 Yellow = warning (non-Latin, missing metadata, etc.)
         🟥 Red    = blocking (must skip/fix)
         ❌ Unmatched = not in Plex DB
    - Options:
         [⚡ Proceed to Rename] (enabled only if no 🟥 selected)
         [❌ Skip All Reds] → unselects red-flagged items
         [🛠 Auto-Fix Reds] → sanitizes fixable errors
    |
    +--> If ❌ Unmatched → user chooses:
            - Leave in place
            - Move to "Unmatched/"
            - Move to "Extras/"
            - Delete (⚠ confirmation)
    |
    v
[Apply Renames]
    - Batched renaming with checkpoints
    - Errors skipped, warnings logged
    |
    v
[Summary Screen]
    - ✅ Success count
    - ⚠ Warnings
    - ❌ Failures
    - Skipped (red/unmatched)
    - Options: Retry skipped
    |
    v
[Restore & Logs]
    - 🔄 Undo Last Rename (rollback log)
    - ▶️ Retry Skipped Items
    - 📝 View Log (export TXT | CSV | JSON)
    - Backup options (auto-log, filenames_backup.json)
    |
    v
[END]
```

---

# ⚙️ Settings Reference

The app settings are divided into 5 tabs: **General, Movies, TV Shows, Music, Misc**.

---

## General

### General Behavior
- (✓) Preview before renaming  
- (✓) Save rename log [txt|csv|json]  
- (✓) Auto-create rollback log (undo support)  

### Filename Encoding
- (•) Keep Unicode (recommended)  
- ( ) Transliterate non-Latin → ASCII  
- ( ) Force ASCII only  
- (✓) Highlight non-Latin names in preview ⚠  

### Conflict Handling
- (•) Skip  
- ( ) Overwrite  
- ( ) Append suffix "(2)"  

### Safety
- (✓) Path length check (warn at >200 chars, block >255)  
- (✓) Reserved filenames check (Windows: CON, AUX, etc.)  
- (✓) Permissions check before renaming  

---

## Movies

### Collections
- (✓) Group movies into Plex Collections  
  - (•) Always  
  - ( ) Only if 2+ movies  
- Collection naming style:  
  - (•) Original name  
  - ( ) Prefix "_"  
  - ( ) Prefix "Collection - "  
  - ( ) Suffix "(Collection)"  

### Chronological Prefix
- (•) None  
- ( ) By year  
- ( ) By collection order  

### Folder Structure
- ( ) None  
- ( ) Alphabetical (A-Z, 0-9)  
- ( ) Alphabet ranges (A-C, D-F, …)  
- ( ) By Genre  
- ( ) By Year/Decade  
- (✓) Put every movie in its own folder  

### Editions
- (•) Preserve Plex edition tokens ({edition-extended})  
- ( ) Expand to human-readable (- Extended Edition) ⚠  
- ( ) Keep both: "Movie (Year) - Extended Edition {edition-extended}"  
- (✓) Detect editions from filenames (Extended, IMAX, Director’s Cut…)  

### Versions
- (✓) Append version name if multiple exist  
  - Example: Movie (Year) - 4K HDR.mkv  

### IDs
- ( ) Do not include IDs  
- (•) Preserve existing IDs if present  
- ( ) Auto-append all matched IDs  
  - Example: Movie (Year) {imdb-tt12345} {tmdb-67890}  

### Special Cases
- (✓) Move extras to Extras/ subfolder  
- (✓) Mark ISO/disc images with [ISO]  

---

## TV Shows

### Structure
- (✓) Always put episodes in Season folders  
- (✓) Treat mini-series as TV shows  

### Edition-like Handling
- (✓) Detect Extended / Uncut / Director’s Cut episodes  
- (✓) Detect OVA / Specials → Suggest Season 00  
- (✓) Normalize multi-episode files (E01-02 → E01E02)  
- (✓) Warn if episode count doesn’t match Plex DB  

---

## Music

### Organization
- (✓) Artist / Album / Track - Title format  
- (✓) Put tracks into disc subfolders if multi-disc  
- (✓) Normalize track numbering (01-Track → 01 - Track)  

---

## Misc

### Unmatched Files
- (•) Leave in place  
- ( ) Move to "Unmatched/" folder  
- ( ) Move to "Extras/" folder  
- ( ) Delete (⚠ requires confirmation)  

### Non-Media Files
- (•) Skip  
- ( ) Move to "Extras/" folder  
- ( ) Delete (⚠ requires confirmation)  

### Advanced Warnings
- (✓) Path length check  
- (✓) Reserved names check  
- (✓) Non-media detection (e.g., .txt, .nfo, .jpg)  

---

# ✅ Notes
- Normies stick to **General** tab defaults (safe-first).  
- Power users dive into **Movies/TV/Music/Misc** for deep customization.  
- All destructive options (delete, overwrite, expand editions) are ⚠ flagged.  
- Every rename run creates a **rollback log** for undo/recovery.  
