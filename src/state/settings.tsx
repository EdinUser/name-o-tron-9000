import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type EncodingMode = "unicode" | "transliterate" | "ascii";

export type GeneralSettings = {
  previewBeforeRename: boolean;
  saveRenameLog: { txt: boolean; csv: boolean; json: boolean };
  autoRollbackLog: boolean;
  /** Where to persist Plex auth token */
  authPersistence?: "none" | "secure" | "file";
  encoding: {
    mode: EncodingMode; // unicode | transliterate | ascii
    highlightNonLatin: boolean;
  };
  conflictHandling: "skip" | "overwrite" | "suffix2";
  safety: { pathLengthCheck: boolean; reservedNamesCheck: boolean; permissionsCheck: boolean };
  pagination: {
    defaultMovieLimit: number;
    defaultShowLimit: number;
    defaultMusicLimit: number;
  };
};

export type MovieSettings = {
  collections: { enabled: boolean; mode: "always" | "if2plus"; naming: "original" | "prefix_" | "prefix_collection" | "suffix_collection" };
  chronologicalPrefix: "none" | "year" | "collection_order";
  folderStructure: "none" | "alpha" | "alpha_ranges" | "genre" | "year_decade";
  ownFolderPerMovie: boolean;
  editions: { preserveTokens: boolean; expandHuman: boolean; keepBoth: boolean; detectFromFilenames: boolean };
  versions: { appendVersionIfMultiple: boolean };
  ids: "none" | "preserve" | "auto_append_all";
  specials: { moveExtras: boolean; markISO: boolean };
};

export type TvSettings = {
  seasonFolders: boolean;
  treatMiniSeriesAsTv: boolean;
  detectCuts: boolean;
  detectOVAsSeason00: boolean;
  normalizeMultiEpisode: boolean;
  warnEpisodeCountMismatch: boolean;
};

export type MusicSettings = {
  formatAAT: boolean;
  discSubfolders: boolean;
  normalizeTrackNumbers: boolean;
};

export type MiscSettings = {
  unmatchedHandling: "leave" | "move_unmatched" | "move_extras" | "delete";
  nonMediaHandling: "skip" | "move_extras" | "delete";
  warnings: { pathLength: boolean; reservedNames: boolean; nonMediaDetection: boolean };
};

export type TemplateSettings = {
  /**
   * Template for Movie path (relative). Use placeholders like {title}, {year}, {ext}.
   * Example: "{title}[ ({year})]{ext}" or "{title}[ ({year})]/{title}[ ({year})]{ext}"
   */
  movie: string;
  /**
   * Template for Episode path (relative).
   * Supported placeholders include {showTitle}, {season}, {episode}, {title}, {ext}.
   * Example: "{showTitle} - S{season:02}E{episode:02} - {title}{ext}"
   */
  episode: string;
};

export type PaginationSettings = {
  defaultMovieLimit: number;
  defaultShowLimit: number;
  defaultMusicLimit: number;
};

export type Settings = {
  general: GeneralSettings;
  movies: MovieSettings;
  tv: TvSettings;
  music: MusicSettings;
  misc: MiscSettings;
  templates: TemplateSettings;
};

const defaultSettings: Settings = {
  general: {
    previewBeforeRename: true,
    saveRenameLog: { txt: false, csv: false, json: true },
    autoRollbackLog: true,
    authPersistence: "secure",
    encoding: { mode: "unicode", highlightNonLatin: true },
    conflictHandling: "skip",
    safety: { pathLengthCheck: true, reservedNamesCheck: true, permissionsCheck: true },
    pagination: {
      defaultMovieLimit: 200,
      defaultShowLimit: 200,
      defaultMusicLimit: 200,
    },
  },
  movies: {
    collections: { enabled: true, mode: "always", naming: "original" },
    chronologicalPrefix: "none",
    folderStructure: "none",
    ownFolderPerMovie: true,
    editions: { preserveTokens: true, expandHuman: false, keepBoth: false, detectFromFilenames: true },
    versions: { appendVersionIfMultiple: true },
    ids: "preserve",
    specials: { moveExtras: true, markISO: true },
  },
  tv: {
    seasonFolders: true,
    treatMiniSeriesAsTv: true,
    detectCuts: true,
    detectOVAsSeason00: true,
    normalizeMultiEpisode: true,
    warnEpisodeCountMismatch: true,
  },
  music: {
    formatAAT: true,
    discSubfolders: true,
    normalizeTrackNumbers: true,
  },
  misc: {
    unmatchedHandling: "leave",
    nonMediaHandling: "skip",
    warnings: { pathLength: true, reservedNames: true, nonMediaDetection: true },
  },
  templates: {
    movie: "{title}[ ({year})]{ext}",
    episode: "{showTitle} - S{season:02}E{episode:02} - {title}{ext}",
  },
};

const KEY = "nameotron.settings.v1";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw);
    return {
      ...defaultSettings,
      ...parsed,
      general: { ...defaultSettings.general, ...parsed.general },
      templates: { ...defaultSettings.templates, ...(parsed.templates || {}) },
    } as Settings;
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(s: Settings) {
  // Keep local cache for synchronous reads in UI flows
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  // Persist centrally via Tauri settings (deep-merged on Rust side)
  try {
    // Lazy import to avoid hard dependency at build time for web preview
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("save_settings", { settings: { ui: s } }).catch(() => {});
    }).catch(() => {});
  } catch { /* no-op if Tauri not available */ }
}

// Settings Context for reactive updates
const SettingsContext = createContext<{
  settings: Settings;
  updateSettings: (newSettings: Settings) => void;
} | null>(null);

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  // Load canonical settings from Tauri on mount
  useEffect(() => {
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const all = await invoke<any>("get_settings");
        if (all && all.ui) {
          const mergedSettings = { ...settings, ...all.ui };
          setSettings(mergedSettings);
          // Also save to localStorage for consistency
          try { localStorage.setItem(KEY, JSON.stringify(mergedSettings)); } catch {}
        }
      } catch { /* ignore if not available */ }
    })();
  }, []);

  const updateSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}
