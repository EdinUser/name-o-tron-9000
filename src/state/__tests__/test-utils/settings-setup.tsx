import { vi } from 'vitest';

// Mock localStorage
export const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn(),
}));

export const setupLocalStorageMock = () => {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
  });
};

export const resetLocalStorageMock = () => {
  vi.clearAllMocks();
  localStorageMock.getItem.mockReturnValue(null);
  localStorageMock.setItem.mockImplementation(() => {});
};

export const mockTauriBackend = (_settings?: any) => {
  // The invoke function is already mocked globally in the vi.mock call
  // We don't need to mock it again here
};

export const mockTauriError = (_error: Error) => {
  // The invoke function is already mocked globally in the vi.mock call
  // We don't need to mock it again here
};

export const setTauriRuntime = (enabled: boolean) => {
  Object.defineProperty(window, '__TAURI__', {
    value: enabled,
    writable: true,
    configurable: true,
  });
};

setTauriRuntime(false);

// Default settings object for testing
export const createDefaultSettings = (overrides: any = {}) => ({
  general: {
    previewBeforeRename: true,
    saveRenameLog: { txt: false, csv: false, json: true },
    autoRollbackLog: true,
    authPersistence: 'secure',
    theme: 'dark',
    encoding: { mode: 'unicode' as const, highlightNonLatin: true },
    conflictHandling: 'skip' as const,
    safety: { pathLengthCheck: true, reservedNamesCheck: true, permissionsCheck: true },
    pagination: {
      defaultMovieLimit: 200,
      defaultShowLimit: 200,
      defaultMusicLimit: 200,
    },
    subtitles: {
      renameWithVideo: true,
      preserveLanguageCodes: true,
      languageCodeHandling: 'preserve' as const,
      skipSubtitles: false,
      convertToUtf8: false,
      backupBeforeConversion: true,
      skipUncertainEncoding: true,
    },
    viewMode: {
      movies: 'table' as const,
      tv: 'blocks' as const,
    },
  },
  movies: {
    collections: { enabled: true, mode: 'always' as const, naming: 'original' as const },
    chronologicalPrefix: 'none' as const,
    folderStructure: 'none' as const,
    alphaArticleHandling: 'ignore' as const,
    folderStructureBehavior: 'intelligent' as const,
    ownFolderPerMovie: true,
    editions: {
      mode: 'preserve' as const,
      createFromFilenames: true,
      createMultipleTags: true,
      parsers: [],
    },
    ids: 'preserve' as const,
    specials: { moveExtras: true, markISO: true },
    subtitles: {
      forcedSdhHandling: 'preserve' as const,
      unknownSubtitleHandling: 'preserve' as const,
    },
  },
  tv: {
    seasonFolders: true,
    treatMiniSeriesAsTv: true,
    detectCuts: true,
    detectOVAsSeason00: true,
    normalizeMultiEpisode: true,
    warnEpisodeCountMismatch: true,
    ids: 'preserve' as const,
    specials: { moveExtras: true, markISO: true },
    subtitles: {
      flattenPerEpisodeSubfolders: true,
      handleNonMatchingNames: true,
      multiSubHandling: 'preserve' as const,
    },
  },
  music: {
    formatAAT: true,
    discSubfolders: true,
    normalizeTrackNumbers: true,
  },
  misc: {
    unmatchedHandling: 'leave' as const,
    nonMediaHandling: 'skip' as const,
    warnings: { pathLength: true, reservedNames: true, nonMediaDetection: true },
    characterReplacement: {
      separators: '-' as const,
      quotes: "'" as const,
      wildcards: '-' as const,
      brackets: '()' as const,
      general: '-' as const,
    },
  },
  templates: {
    movie: '{title}[ ({year})]{ext}',
    episode: '{showTitle} - S{season:02}E{episode:02} - {title}{ext}',
    music: '{artist}/{album}/{trackNumber:02} - {track}{ext}',
  },
  manualFixes: [],
  ...overrides,
});

export type TestSettings = ReturnType<typeof createDefaultSettings>;
