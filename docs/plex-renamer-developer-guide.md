# Plex Renamer – Developer Guide

This document is a quick-start reference for continuing work on the **Plex Renamer** project.  
It summarizes the project purpose, technology stack, and where to find detailed specifications.

---

## 📌 Project Overview
**Plex Renamer** is a cross-platform desktop application (Tauri + React) that:
- Renames local media files based on Plex metadata.  
- Keeps libraries compliant with Plex naming conventions.  
- Organizes large libraries into clean folder structures.  
- Provides strong safety features (preview, red flags, rollback, logs).  
- Balances **normie-friendly defaults** with **power user controls**.  

---

## 🛠️ Tech Stack
- **Frontend/UI**: React + Tailwind (inside Tauri)
- **Backend bridge**: Rust (via Tauri APIs)
- **Metadata source**: Plex API (server discovery + library fetch)
- **Platform**: Cross-platform (Windows, macOS, Linux)

---

## 📂 Documentation Files
The spec is split into two Markdown files:

1. **plex-renamer-settings.md**  
   - Full reference of all configurable settings  
   - Organized into 5 tabs: General, Movies, TV Shows, Music, Misc  

2. **plex-renamer-overview.md**  
   - Full app flow diagram (Discovery → Preview → Rename → Summary → Restore)  
   - Integrated with settings reference for complete overview  

This **Developer Guide** (you are reading it now) explains how to use those files.

---

## 🚦 How to Continue Development

1. **When starting a new chat**:  
   - Upload this `developer-guide.md` file.  
   - Upload the latest `plex-renamer-overview.md` (flow) and `plex-renamer-settings.md` (settings).  
   - This gives the assistant full context immediately.

2. **When updating features**:  
   - Modify the settings or overview `.md` files accordingly.  
   - Keep them in sync with actual code/prototypes.  

3. **When coding**:  
   - Use the spec as guidance.  
   - Focus on safety features first (preview, rollback, logs).  
   - Build out UI tabs for settings incrementally.  

---

## ✅ Notes
- Normie defaults = safe, minimal, Unicode kept.  
- Advanced tabs = editions, IDs, collections, OVAs, unmatched handling.  
- Always warn before destructive actions (delete, overwrite, expand editions).  
- Every rename run must produce a **rollback log** for undo.  

---
