export type EncodingMode = "unicode" | "transliterate" | "ascii";

export type GeneralSettings = {
  previewBeforeRename: boolean;
  saveRenameLog: { txt: boolean; csv: boolean; json: boolean };
  autoRollbackLog: boolean;
  encoding: {
    mode: EncodingMode; // unicode | transliterate | ascii
    highlightNonLatin: boolean;
  };
  conflictHandling: "skip" | "overwrite" | "suffix2";
  safety: { pathLengthCheck: boolean; reservedNamesCheck: boolean; permissionsCheck: boolean };
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

export type Settings = {
  general: GeneralSettings;
  movies: MovieSettings;
  tv: TvSettings;
  music: MusicSettings;
  misc: MiscSettings;
};

const defaultSettings: Settings = {
  general: {
    previewBeforeRename: true,
    saveRenameLog: { txt: false, csv: false, json: true },
    autoRollbackLog: true,
    encoding: { mode: "unicode", highlightNonLatin: true },
    conflictHandling: "skip",
    safety: { pathLengthCheck: true, reservedNamesCheck: true, permissionsCheck: true },
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
};

const KEY = "nameotron.settings.v1";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw);
    return { ...defaultSettings, ...parsed, general: { ...defaultSettings.general, ...parsed.general } } as Settings;
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

