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

export type EditionParser = {
  id: string;
  name: string;
  category: "content" | "technical";
  enabled: boolean;
};

export type MovieSettings = {
  collections: { enabled: boolean; mode: "always" | "if2plus"; naming: "original" | "prefix_" | "prefix_collection" | "suffix_collection" };
  chronologicalPrefix: "none" | "year" | "collection_order";
  folderStructure: "none" | "alpha" | "alpha_ranges" | "genre" | "year_decade";
  ownFolderPerMovie: boolean;
  editions: {
    mode: "preserve" | "expand" | "both" | "none";
    createFromFilenames: boolean;
    createMultipleTags: boolean;
    parsers: EditionParser[];
  };
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
  ids: "none" | "preserve" | "auto_append_all";
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
    editions: {
      mode: "preserve",
      createFromFilenames: true,
      createMultipleTags: true,
      parsers: [
        // Content editions
        { id: "directors-cut", name: "Director's Cut", category: "content", enabled: true },
        { id: "extended", name: "Extended Edition", category: "content", enabled: true },
        { id: "unrated", name: "Unrated", category: "content", enabled: true },
        { id: "theatrical", name: "Theatrical Cut", category: "content", enabled: true },
        { id: "remastered", name: "Remastered", category: "content", enabled: true },
        { id: "special", name: "Special Edition", category: "content", enabled: true },
        { id: "collectors", name: "Collector's Edition", category: "content", enabled: true },
        { id: "deluxe", name: "Deluxe Edition", category: "content", enabled: true },
        { id: "anniversary", name: "Anniversary Edition", category: "content", enabled: true },
        { id: "ultimate", name: "Ultimate Edition", category: "content", enabled: true },
        { id: "diamond", name: "Diamond Edition", category: "content", enabled: true },
        { id: "platinum", name: "Platinum Edition", category: "content", enabled: true },
        { id: "gold", name: "Gold Edition", category: "content", enabled: true },
        { id: "silver", name: "Silver Edition", category: "content", enabled: true },
        { id: "steelbook", name: "Steelbook Edition", category: "content", enabled: true },
        { id: "criterion", name: "Criterion Collection", category: "content", enabled: true },
        // Technical editions
        { id: "imax", name: "IMAX Edition", category: "technical", enabled: false },
        { id: "4k", name: "4K Edition", category: "technical", enabled: false },
        { id: "hdr", name: "HDR Edition", category: "technical", enabled: false },
        { id: "atmos", name: "Dolby Atmos Edition", category: "technical", enabled: false },
        { id: "bluray", name: "Blu-ray Edition", category: "technical", enabled: false },
        { id: "dvd", name: "DVD Edition", category: "technical", enabled: false },
        { id: "web", name: "Web Edition", category: "technical", enabled: false },
        { id: "hdtv", name: "HDTV Edition", category: "technical", enabled: false },
      ]
    },
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
    ids: "preserve",
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
    if (!raw) {
      console.log("No saved settings found, using defaults");
      return defaultSettings;
    }
    const parsed = JSON.parse(raw);
    const merged = deepMerge(defaultSettings, parsed);
    console.log("Loaded settings from localStorage:", merged);
    return merged;
  } catch (error) {
    console.error("Failed to load settings from localStorage:", error);
    return defaultSettings;
  }
}

export function saveSettings(s: Settings) {
  console.log("Saving settings:", s);
  // Keep local cache for synchronous reads in UI flows
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    console.log("Settings saved to localStorage");
  } catch (error) {
    console.error("Failed to save settings to localStorage:", error);
  }
  // Persist centrally via Tauri settings (deep-merged on Rust side)
  try {
    // Lazy import to avoid hard dependency at build time for web preview
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("save_settings", { settings: { ui: s } }).then(() => {
        console.log("Settings saved to Tauri backend");
      }).catch((error) => {
        console.error("Failed to save settings to Tauri backend:", error);
      });
    }).catch(() => {
      console.log("Tauri not available, skipping backend save");
    });
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}

// Settings Context for reactive updates
const SettingsContext = createContext<{
  settings: Settings;
  updateSettings: (newSettings: Settings) => void;
  settingsVersion: number;
} | null>(null);

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}

// Deep merge utility for nested objects
function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    // Load from localStorage first
    const localSettings = loadSettings();

    // Try to load from Tauri backend synchronously if available
    try {
      // Check if we're in a Tauri environment
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        // For synchronous loading, we'll use localStorage as primary source
        // and merge Tauri settings in useEffect
        return localSettings;
      }
    } catch {
      // Not in Tauri environment, use localStorage only
    }

    return localSettings;
  });

  const [settingsVersion, setSettingsVersion] = useState(0);

  // Load canonical settings from Tauri on mount and merge properly
  useEffect(() => {
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const all = await invoke<any>("get_settings");
        console.log("Loaded settings from Tauri backend:", all);
        if (all && all.ui) {
          // Properly deep merge Tauri settings with current settings
          const mergedSettings = deepMerge(settings, all.ui);
          console.log("Merged settings:", mergedSettings);
          setSettings(mergedSettings);
          // Also save merged settings to localStorage for consistency
          try {
            localStorage.setItem(KEY, JSON.stringify(mergedSettings));
            console.log("Merged settings saved back to localStorage");
          } catch (error) {
            console.error("Failed to save merged settings to localStorage:", error);
          }
        } else {
          console.log("No UI settings found in Tauri backend");
        }
      } catch (error) {
        // Tauri not available or failed to load, use localStorage settings
        console.log("Using localStorage settings (Tauri not available or failed):", error);
      }
    })();
  }, []);

  const updateSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    setSettingsVersion(prev => prev + 1);
    saveSettings(newSettings);
  };

  // Expose settings functions for debugging
  useEffect(() => {
    (window as any).nameotron = (window as any).nameotron || {};
    (window as any).nameotron.settings = {
      loadSettings,
      saveSettings,
      getCurrentSettings: () => settings,
      resetToDefaults: () => {
        console.log("Resetting settings to defaults");
        updateSettings(defaultSettings);
      }
    };
  }, [settings]);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, settingsVersion }}>
      {children}
    </SettingsContext.Provider>
  );
}
