# Name-o-Tron 9000™ – First Commits Plan

This document outlines the initial development steps for building **Name-o-Tron 9000™** using **Tauri + React**.

---

## 📂 Repository Structure (Initial)

```
name-o-tron-9000/
│
├── src-tauri/              # Rust backend (Tauri)
│   ├── Cargo.toml
│   ├── src/
│   │   └── main.rs
│
├── src/                    # React frontend
│   ├── components/         # UI components (PreviewTable, SettingsTabs, etc.)
│   ├── pages/              # Pages (Home, Settings, Logs)
│   ├── hooks/              # React hooks (usePlexAPI, useRenameQueue)
│   ├── App.tsx
│   └── index.tsx
│
├── docs/                   # Specifications & project docs
│   ├── plex-renamer-overview.md
│   ├── plex-renamer-settings.md
│   ├── plex-renamer-safety.md
│   └── developer-guide.md
│
├── public/                 # Static assets (icons, splash screens)
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🛠️ Tech Stack Setup

1. **Initialize Repo**
   ```bash
   git init name-o-tron-9000
   cd name-o-tron-9000
   ```

2. **Create Tauri + React project**
   ```bash
   npm create tauri-app@latest
   ```
   - Select **React (TypeScript)** as frontend.
   - Confirm Rust toolchain installed.

3. **Install Dependencies**
   ```bash
   npm install
   cargo build
   ```

4. **Run Dev Build**
   ```bash
   npm run tauri dev
   ```

---

## 🚀 First Features to Implement

### 1. Plex API Connector (Rust)
- Create module to handle:
  - Server discovery (LAN GDM).
  - Plex.tv authentication fallback.
  - Basic endpoint calls (list libraries, refresh section).

### 2. Renaming Engine (Rust)
- Functions for:
  - Template application (`{title} ({year})`, etc.).
  - Safety checks (invalid chars, duplicates, long paths).
  - Dry-run mode → returns `old → new` mapping without renaming.

### 3. Frontend Scaffolding (React)
- **Pages:**
  - Home (select library, start preview).
  - Preview & Confirm (table with ✅/⚠/🟥 states).
  - Settings (tabs: General, Movies, TV, Music, Misc).
  - Logs & Restore.

- **Components:**
  - `PreviewTable.tsx` → shows rename mappings with status colors.
  - `SettingsTabs.tsx` → settings navigation.
  - `LogsViewer.tsx` → displays rollback/export logs.

### 4. Logging & Rollback
- Backend generates JSON log:
  ```json
  [
    { "old": "Inception.1080p.mkv", "new": "Inception (2010).mkv", "status": "success" }
  ]
  ```
- Stored in `~/.nameotron/logs/` (cross-platform safe path).
- Undo command → reads log, reverses renames.

---

## 🧪 Phase 1 Goals (MVP)
- Select Plex library.  
- Run preview → show rename table with ✅/⚠/🟥.  
- Apply rename → generate rollback log.  
- Rescan Plex library (via API).  
- Settings page with **General tab only** (safe defaults).  

---

## 📌 Next Phases
- Add Movies/TV/Music/Misc tabs with full options.  
- Implement Auto-Fix Reds + Skip Reds logic.  
- Add Restore & Retry Skipped workflow.  
- Webhook listener for Plex (future).  
- Geek Slang Mode (UI toggle).  

---
