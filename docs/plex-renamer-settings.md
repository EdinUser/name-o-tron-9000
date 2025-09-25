# Plex Renamer – Settings

This document describes the proposed **settings layout** for the Plex Renamer app, organized into 5 tabs: **General**, **Movies**, **TV Shows**, **Music**, and **Misc**.

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

# Notes
- Defaults are **safe-first** for normies.  
- Advanced users can enable editions, IDs, and collection tweaks.  
- All dangerous options (delete, overwrite, expand editions) have ⚠ warnings.  
