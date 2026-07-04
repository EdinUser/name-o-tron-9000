import { createContext, useContext, useState, useEffect, ReactNode } from "react";

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);
}

function debugSettings(...args: unknown[]) {
  if (typeof window !== "undefined" && (window as any).__NAMEOTRON_DEBUG_SETTINGS__) {
    console.debug(...args);
  }
}

export type EncodingMode = "unicode" | "transliterate" | "ascii";

export type GeneralSettings = {
  previewBeforeRename: boolean;
  saveRenameLog: { txt: boolean; csv: boolean; json: boolean };
  autoRollbackLog: boolean;
  /** Where to persist Plex auth token */
  authPersistence?: "none" | "secure" | "file";
  /** Theme preference */
  theme: "light" | "dark" | "system";
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
  subtitles: {
    renameWithVideo: boolean;
    preserveLanguageCodes: boolean;
    languageCodeHandling: "preserve" | "normalize" | "strip";
    skipSubtitles: boolean;
    convertToUtf8: boolean;
    backupBeforeConversion: boolean;
    skipUncertainEncoding: boolean;
  };
  /** View mode preferences for preview pages */
  viewMode: {
    movies: "table" | "blocks";
    tv: "table" | "blocks";
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
  alphaArticleHandling: "ignore" | "include";
  folderStructureBehavior: "preserve_existing" | "reorganize_all" | "intelligent";
  ownFolderPerMovie: boolean;
  editions: {
    mode: "preserve" | "expand" | "both" | "none";
    createFromFilenames: boolean;
    createMultipleTags: boolean;
    parsers: EditionParser[];
  };
  ids: "none" | "preserve" | "auto_append_all";
  specials: { moveExtras: boolean; markISO: boolean };
  subtitles: {
    forcedSdhHandling: "preserve" | "normalize" | "strip";
    unknownSubtitleHandling: "preserve" | "append_unk";
  };
};

export type TvSettings = {
  seasonFolders: boolean;
  treatMiniSeriesAsTv: boolean;
  detectCuts: boolean;
  detectOVAsSeason00: boolean;
  normalizeMultiEpisode: boolean;
  warnEpisodeCountMismatch: boolean;
  ids: "none" | "preserve" | "auto_append_all";
  specials: { moveExtras: boolean; markISO: boolean };
  subtitles: {
    flattenPerEpisodeSubfolders: boolean;
    handleNonMatchingNames: boolean;
    multiSubHandling: "preserve" | "number" | "first_only";
  };
};

export type MusicSettings = {
  formatAAT: boolean;
  discSubfolders: boolean;
  normalizeTrackNumbers: boolean;
};

export type CharacterReplacement = {
  separators: "-" | "_" | "remove";
  quotes: "'" | "`" | "remove";
  wildcards: "-" | "remove";
  brackets: "()" | "[]" | "remove";
  general: "-" | "_" | "remove";
};

export type MiscSettings = {
  unmatchedHandling: "leave" | "move_unmatched" | "move_extras" | "delete";
  nonMediaHandling: "skip" | "move_extras" | "delete";
  warnings: { pathLength: boolean; reservedNames: boolean; nonMediaDetection: boolean };
  characterReplacement: CharacterReplacement;
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
  /**
   * Template for Music track path (relative).
   * Supported placeholders include {artist}, {album}, {track}, {trackNumber}, {disc}, {ext}.
   * Example: "{artist}/{album}/{trackNumber:02} - {track}{ext}"
   */
  music: string;
};

export type PaginationSettings = {
  defaultMovieLimit: number;
  defaultShowLimit: number;
  defaultMusicLimit: number;
};

export type ManualFix = {
  /** Plex ratingKey this fix applies to */
  ratingKey: string;
  /** Type of media this fix applies to */
  mediaType: "movie" | "episode" | "music";
  /** Manual overrides for metadata fields */
  overrides: {
    title?: string;
    year?: number;
    season?: number;
    episode?: number;
    edition?: string;
    editionTitle?: string;
  };
  /** When this fix was created (for cleanup of old fixes) */
  createdAt: number;
};

export type Settings = {
  general: GeneralSettings;
  movies: MovieSettings;
  tv: TvSettings;
  music: MusicSettings;
  misc: MiscSettings;
  templates: TemplateSettings;
  /** Manual fixes for specific Plex items */
  manualFixes: ManualFix[];
};

const defaultSettings: Settings = {
  general: {
    previewBeforeRename: true,
    saveRenameLog: { txt: false, csv: false, json: true },
    autoRollbackLog: true,
    authPersistence: "secure",
    theme: "dark",
    encoding: { mode: "unicode", highlightNonLatin: true },
    conflictHandling: "skip",
    safety: { pathLengthCheck: true, reservedNamesCheck: true, permissionsCheck: true },
    pagination: {
      defaultMovieLimit: 25,
      defaultShowLimit: 20,
      defaultMusicLimit: 200,
    },
    subtitles: {
      renameWithVideo: true,
      preserveLanguageCodes: true,
      languageCodeHandling: "preserve",
      skipSubtitles: false,
      convertToUtf8: false,
      backupBeforeConversion: true,
      skipUncertainEncoding: true,
    },
    viewMode: {
      movies: "table",
      tv: "blocks",
    },
  },
  movies: {
    collections: { enabled: true, mode: "always", naming: "original" },
    chronologicalPrefix: "none",
    folderStructure: "none",
    alphaArticleHandling: "ignore",
    folderStructureBehavior: "intelligent",
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
    subtitles: {
      forcedSdhHandling: "preserve",
      unknownSubtitleHandling: "preserve",
    },
  },
  tv: {
    seasonFolders: true,
    treatMiniSeriesAsTv: true,
    detectCuts: true,
    detectOVAsSeason00: true,
    normalizeMultiEpisode: true,
    warnEpisodeCountMismatch: true,
    ids: "preserve",
    specials: { moveExtras: true, markISO: true },
    subtitles: {
      flattenPerEpisodeSubfolders: true,
      handleNonMatchingNames: true,
      multiSubHandling: "preserve",
    },
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
    characterReplacement: {
      separators: "-",
      quotes: "'",
      wildcards: "-",
      brackets: "()",
      general: "-",
    },
  },
  templates: {
    movie: "{title}[ ({year})]{ext}",
    episode: "{showTitle} - S{season:02}E{episode:02} - {title}{ext}",
    music: "{artist}/{album}/{trackNumber:02} - {track}{ext}",
  },
  manualFixes: [],
};

const KEY = "nameotron.settings.v1";

/**
 * Get manual fix for a specific Plex item
 */
export function getManualFix(settings: Settings, ratingKey: string): ManualFix | undefined {
  return settings.manualFixes.find(fix => fix.ratingKey === ratingKey);
}

/**
 * Add or update a manual fix
 */
export function addOrUpdateManualFix(settings: Settings, fix: ManualFix): Settings {
  const existingIndex = settings.manualFixes.findIndex(f => f.ratingKey === fix.ratingKey);

  if (existingIndex >= 0) {
    // Update existing fix
    const updatedFixes = [...settings.manualFixes];
    updatedFixes[existingIndex] = { ...fix, createdAt: Date.now() };
    return { ...settings, manualFixes: updatedFixes };
  } else {
    // Add new fix
    return { ...settings, manualFixes: [...settings.manualFixes, { ...fix, createdAt: Date.now() }] };
  }
}

/**
 * Remove a manual fix
 */
export function removeManualFix(settings: Settings, ratingKey: string): Settings {
  return {
    ...settings,
    manualFixes: settings.manualFixes.filter(fix => fix.ratingKey !== ratingKey)
  };
}

/**
 * Clean up old manual fixes (older than 90 days)
 */
export function cleanupOldManualFixes(settings: Settings): Settings {
  const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
  return {
    ...settings,
    manualFixes: settings.manualFixes.filter(fix => fix.createdAt > ninetyDaysAgo)
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      debugSettings("No saved settings found, using defaults");
      return defaultSettings;
    }

    // Check if the raw data looks like valid JSON (starts with { or [)
    if (!raw.trim().match(/^[{\[]/)) {
      console.warn("Invalid settings format in localStorage, using defaults");
      return defaultSettings;
    }

    const parsed = JSON.parse(raw);
    const merged = deepMerge(defaultSettings, parsed);
    debugSettings("Loaded settings from localStorage:", merged);
    return merged;
  } catch (error) {
    console.error("Failed to load settings from localStorage:", error);
    return defaultSettings;
  }
}

export function saveSettings(s: Settings) {
  debugSettings("Saving settings:", s);
  // Keep local cache for synchronous reads in UI flows
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    debugSettings("Settings saved to localStorage");
  } catch (error) {
    console.error("Failed to save settings to localStorage:", error);
  }
  // Persist centrally via Tauri settings (deep-merged on Rust side)
  if (!hasTauriRuntime()) {
    return;
  }
  void import("@tauri-apps/api/core").then(async ({ invoke }) => {
    try {
      await invoke("save_settings", { settings: { ui: s } });
      debugSettings("Settings saved to Tauri backend");
    } catch (error) {
      console.error("Failed to save settings to Tauri backend:", error);
    }
  }).catch((error) => {
    console.error("Error saving settings:", error);
  });
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
export function deepMerge(target: any, source: any): any {
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
      if (hasTauriRuntime()) {
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
    if (!hasTauriRuntime()) {
      return;
    }
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const all = await invoke<any>("get_settings");
        debugSettings("Loaded settings from Tauri backend:", all);
        if (all && all.ui) {
          // Properly deep merge Tauri settings with current settings (Tauri takes precedence for UI settings)
          const mergedSettings = deepMerge(settings, all.ui);
          debugSettings("Merged settings:", mergedSettings);
          setSettings(mergedSettings);
          // Also save merged settings to localStorage for consistency
          try {
            localStorage.setItem(KEY, JSON.stringify(mergedSettings));
            debugSettings("Merged settings saved back to localStorage");
          } catch (error) {
            console.error("Failed to save merged settings to localStorage:", error);
          }
        }
      } catch (error) {
        // Tauri not available or failed to load, use localStorage settings
        debugSettings("Using localStorage settings (Tauri not available or failed):", error);
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
        debugSettings("Resetting settings to defaults");
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
