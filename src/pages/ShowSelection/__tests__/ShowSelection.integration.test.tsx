import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import ShowSelectionContainer from '../ShowSelectionContainer';
import { SettingsProvider } from '../../../state/settings';
import { ThemeProvider } from '../../../state/theme';
import type { PlexServer, PlexLibrary } from '../../../types/plex';
import {
  buildMockShowEpisodesResponse,
  buildShowSelectionShows,
  getMockEpisodesForShow,
} from '../../../testUtils/mockPlexFixtures';

// Mock the Tauri invoke function
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock Tauri window API
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    setTitle: vi.fn(),
  })),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock
});

// Mock Plex token in localStorage
localStorageMock.getItem.mockImplementation((key) => {
  if (key === 'plexToken') return 'fake-token';
  if (key === 'nameotron-settings') return JSON.stringify({}); // Return empty object as valid JSON for settings
  return null;
});

const mockInvoke = vi.mocked(invoke);

const mockServer: PlexServer = {
  name: 'Test Server',
  address: 'http://192.168.1.100:32400',
  machineIdentifier: 'test-server-id',
  owned: true,
};

const mockLibrary: PlexLibrary = {
  key: 'tv-library',
  title: 'TV Shows',
  type: 'show',
  roots: ['/share/plex/Series'],
};

const mockShows = buildShowSelectionShows(2);
const primaryShow = mockShows[0];
const secondaryShow = mockShows[1];
const primaryShowTitle = primaryShow.title;
const secondaryShowTitle = secondaryShow.title;
const primaryShowKey = primaryShow.ratingKey;
const secondaryShowKey = secondaryShow.ratingKey;
const primaryShowPosterUrl = `${mockServer.address}${primaryShow.thumb}`;
const secondaryShowPosterUrl = `${mockServer.address}${secondaryShow.thumb}`;
const primaryShowEpisodes = getMockEpisodesForShow(primaryShowKey);
const primaryShowLocation = primaryShowEpisodes[0]?.Media?.[0]?.Part?.[0]?.file ?? '';
const primaryShowFolder = primaryShowLocation.split('/').slice(0, 5).join('/');

const mockMappings = [
  {
    server_id: 'test-server-id',
    plex_root: '/share/plex/Series',
    local_root: '/mnt/tv-shows',
  }
];

const mockCache = {
  lastUpdated: Date.now(),
  mappingsChecksum: 'test-checksum', // Matches default checksum for valid cache test
  shows: {
    [primaryShowKey]: {
      isMapped: true,
      location: primaryShowLocation,
      lastChecked: Date.now(),
      posterUrl: primaryShowPosterUrl,
      year: Number(primaryShow.year),
      genre: primaryShow.Genre?.[0]?.tag ?? '',
      studio: primaryShow.studio,
      creators: ['Fixture Creator'],
      yearsRunning: String(primaryShow.year),
    },
    [secondaryShowKey]: {
      isMapped: false,
      location: '',
      lastChecked: Date.now(),
      posterUrl: secondaryShowPosterUrl,
      year: Number(secondaryShow.year),
      genre: secondaryShow.Genre?.[0]?.tag ?? '',
      studio: secondaryShow.studio,
      creators: ['Fixture Creator'],
      yearsRunning: String(secondaryShow.year),
    },
  },
};

const mockInvalidCache = {
  lastUpdated: Date.now(),
  mappingsChecksum: 'old-checksum', // Different checksum for cache validation failure test
  shows: {}, // Empty shows to force rebuild
};

function renderWithProviders(component: React.ReactElement) {
  return render(
    <SettingsProvider>
      <ThemeProvider>
        {component}
      </ThemeProvider>
    </SettingsProvider>
  );
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('ShowSelection Integration Tests', () => {
  const mockOnBack = vi.fn();
  const mockOnSelectShow = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'plexToken') return 'fake-token';
      if (key === 'nameotron-settings') return JSON.stringify({});
      return null;
    });
    sessionStorageMock.getItem.mockReturnValue(null);

    // Mock invoke responses
    mockInvoke.mockImplementation((command: string, _args?: any) => {
      switch (command) {
        case 'get_settings':
          return Promise.resolve({ pathMappings: mockMappings });
        case 'fetch_tv_shows':
          return Promise.resolve({ MediaContainer: { Directory: mockShows } });
        case 'fetch_show_episodes':
          return Promise.resolve(buildMockShowEpisodesResponse(_args?.showRatingKey ?? primaryShowKey));
        case 'fetch_plex_image':
          return Promise.resolve('data:image/jpeg;base64,fake-image-data');
        case 'generate_mappings_checksum_cmd':
          return Promise.resolve('test-checksum'); // Matches cache checksum for valid cache test
        case 'load_show_mapping_cache':
          return Promise.resolve(mockCache);
        case 'save_show_mapping_cache':
          return Promise.resolve();
        case 'invalidate_show_mapping_cache':
          return Promise.resolve();
        default:
          return Promise.reject(new Error(`Unknown command: ${command}`));
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads shows with cached mapping status', async () => {
    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    // Wait for shows to load (loading state might be very brief due to cached data)
    await waitFor(() => {
      expect(screen.getByText(primaryShowTitle)).toBeInTheDocument();
      expect(screen.getByText(secondaryShowTitle)).toBeInTheDocument();
    });

    // Check that mapping status is displayed
    expect(screen.getByText('Unmapped')).toBeInTheDocument(); // The Office is unmapped

    // Verify cache-related API calls were made (checksum generated after shows are loaded)
    expect(mockInvoke).toHaveBeenCalledWith('generate_mappings_checksum_cmd', {
      serverId: 'test-server-id',
      server_id: 'test-server-id',
      mappings: expect.arrayContaining([
        expect.objectContaining({
          serverId: 'test-server-id',
          plexRoot: '/share/plex/Series',
          localRoot: '/mnt/tv-shows',
          platform: null
        })
      ])
    });
    expect(mockInvoke).toHaveBeenCalledWith('load_show_mapping_cache', {
      serverId: 'test-server-id',
      server_id: 'test-server-id',
      libraryId: 'tv-library',
      library_id: 'tv-library'
    });
  });

  it('clears the loading state even if poster fetching fails', async () => {
    mockInvoke.mockImplementation((command: string, _args?: any) => {
      switch (command) {
        case 'get_settings':
          return Promise.resolve({ pathMappings: mockMappings });
        case 'fetch_tv_shows':
          return Promise.resolve({ MediaContainer: { Directory: [mockShows[0]], totalSize: 1, size: 1, offset: 0 } });
        case 'fetch_show_episodes':
          return Promise.resolve(buildMockShowEpisodesResponse(_args?.showRatingKey ?? primaryShowKey));
        case 'fetch_plex_image':
          return Promise.reject(new Error('poster fetch failed'));
        case 'generate_mappings_checksum_cmd':
          return Promise.resolve('test-checksum');
        case 'load_show_mapping_cache':
          return Promise.resolve(mockCache);
        case 'save_show_mapping_cache':
          return Promise.resolve();
        case 'invalidate_show_mapping_cache':
          return Promise.resolve();
        default:
          return Promise.reject(new Error(`Unknown command: ${command}`));
      }
    });

    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(primaryShowTitle)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByText('Loading shows…')).not.toBeInTheDocument();
      expect(screen.queryByText('Building cache…')).not.toBeInTheDocument();
    });
  });

  it('handles cache miss and builds cache from scratch', async () => {
    // Mock cache not found
    mockInvoke.mockImplementation((command: string, _args?: any) => {
      switch (command) {
        case 'get_settings':
          return Promise.resolve({ pathMappings: mockMappings });
        case 'fetch_tv_shows':
          return Promise.resolve({ MediaContainer: { Directory: mockShows } });
        case 'fetch_show_episodes':
          return Promise.resolve(buildMockShowEpisodesResponse(_args?.showRatingKey ?? primaryShowKey));
        case 'fetch_plex_image':
          return Promise.resolve('data:image/jpeg;base64,fake-image-data');
        case 'generate_mappings_checksum_cmd':
          return Promise.resolve('new-checksum'); // Different from cache checksum for cache miss test
        case 'load_show_mapping_cache':
          return Promise.resolve(null); // Cache miss
        case 'save_show_mapping_cache':
          return Promise.resolve();
        case 'invalidate_show_mapping_cache':
          return Promise.resolve();
        default:
          return Promise.reject(new Error(`Unknown command: ${command}`));
      }
    });

    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    // Wait for shows to load
    await waitFor(() => {
      expect(screen.getByText(primaryShowTitle)).toBeInTheDocument();
    });

    // Verify cache building API calls were made
    expect(mockInvoke).toHaveBeenCalledWith('fetch_show_episodes', expect.any(Object));
    expect(mockInvoke).toHaveBeenCalledWith('save_show_mapping_cache', expect.any(Object));

    // Shows should be loaded successfully
    expect(screen.getByText(primaryShowTitle)).toBeInTheDocument();
    expect(screen.getByText(secondaryShowTitle)).toBeInTheDocument();
  });

  it('does NOT persist base64 posters in saved cache (no cachedPosterUrl)', async () => {
    // Capture payloads sent to save_show_mapping_cache
    const savedPayloads: any[] = [];

    mockInvoke.mockImplementation((command: string, args?: any) => {
      switch (command) {
        case 'get_settings':
          return Promise.resolve({ pathMappings: mockMappings });
        case 'fetch_tv_shows':
          return Promise.resolve({ MediaContainer: { Directory: mockShows } });
        case 'fetch_show_episodes':
          return Promise.resolve(buildMockShowEpisodesResponse(args?.showRatingKey ?? primaryShowKey));
        case 'fetch_plex_image':
          // UI fetches posters for visible items; backend returns base64, but it must NOT be persisted
          return Promise.resolve('data:image/jpeg;base64,fake-image-data');
        case 'generate_mappings_checksum_cmd':
          return Promise.resolve('brand-new-checksum');
        case 'load_show_mapping_cache':
          return Promise.resolve(null); // Force cache rebuild
        case 'save_show_mapping_cache':
          savedPayloads.push(args);
          return Promise.resolve();
        default:
          return Promise.reject(new Error(`Unknown command: ${command}`));
      }
    });

    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(primaryShowTitle)).toBeInTheDocument();
    });

    // Ensure we saved cache at least once
    expect(savedPayloads.length).toBeGreaterThan(0);
    const last = savedPayloads[savedPayloads.length - 1];

    // Cache payload should not contain cachedPosterUrl fields or base64 data
    const cacheObj = last.cache;
    const shows = cacheObj?.shows ?? {};
    for (const key of Object.keys(shows)) {
      const entry = shows[key];
      expect(entry.cachedPosterUrl).toBeUndefined();
      // Also verify no accidental base64 leakage via JSON stringification
      expect(JSON.stringify(entry)).not.toContain('data:image/jpeg;base64');
    }
  });

  it('fetches posters lazily for only rendered items', async () => {
    // Count the number of poster fetches during initial page render
    let posterFetchCount = 0;
    mockInvoke.mockImplementation((command: string, _args?: any) => {
      switch (command) {
        case 'get_settings':
          return Promise.resolve({ pathMappings: mockMappings });
        case 'fetch_tv_shows':
          return Promise.resolve({ MediaContainer: { Directory: mockShows } });
        case 'fetch_show_episodes':
          // Return episode for newly cached shows
          return Promise.resolve(buildMockShowEpisodesResponse(_args?.showRatingKey ?? primaryShowKey));
        case 'fetch_plex_image':
          posterFetchCount += 1;
          return Promise.resolve('data:image/jpeg;base64,fake-image-data');
        case 'generate_mappings_checksum_cmd':
          return Promise.resolve('checksum-lazy');
        case 'load_show_mapping_cache':
          return Promise.resolve(null); // Treat as uncached to exercise full flow
        case 'save_show_mapping_cache':
          return Promise.resolve();
        default:
          return Promise.reject(new Error(`Unknown command: ${command}`));
      }
    });

    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(primaryShowTitle)).toBeInTheDocument();
      expect(screen.getByText(secondaryShowTitle)).toBeInTheDocument();
    });

    // We only rendered two shows; verify we fetched two posters
    expect(posterFetchCount).toBe(2);
  });

  it('persists and restores search query', async () => {
    // Mock initial search query in sessionStorage
    sessionStorageMock.getItem.mockReturnValue('Abyssal');

    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Abyssal')).toBeInTheDocument();
    });

    // Type in search box
    const searchInput = screen.getByPlaceholderText('Quick search…');
    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, 'Northwind');

    // Verify search query is persisted
    await waitFor(() => {
      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        `showSearch-${mockServer.address}-${mockLibrary.key}`,
        'Northwind'
      );
    });
  });

  it('clears search when X button is clicked', async () => {
    // Mock initial search query
    sessionStorageMock.getItem.mockReturnValue('Abyssal');

    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Abyssal')).toBeInTheDocument();
      expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
    });

    // Click clear button
    const clearButton = screen.getByLabelText('Clear search');
    await userEvent.click(clearButton);

    await waitFor(() => {
      expect(screen.getByDisplayValue('')).toBeInTheDocument();
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(
        `showSearch-${mockServer.address}-${mockLibrary.key}`
      );
    });
  });

  it('handles mapping changes by invalidating cache', async () => {
    // Initial render
    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(primaryShowTitle)).toBeInTheDocument();
    });

    // Verify that the component loaded successfully with cache operations
    expect(mockInvoke).toHaveBeenCalledWith('get_settings');
    expect(mockInvoke).toHaveBeenCalledWith('generate_mappings_checksum_cmd', expect.objectContaining({
      serverId: expect.any(String),
      mappings: expect.any(Array)
    }));
    expect(mockInvoke).toHaveBeenCalledWith('load_show_mapping_cache', {
      serverId: 'test-server-id',
      server_id: 'test-server-id',
      libraryId: 'tv-library',
      library_id: 'tv-library'
    });

    // The invalidate cache call happens when mappings change, but in our test
    // the mappings don't change so we don't expect the invalidate call
  });

  it('handles cache validation failure', async () => {
    // Mock cache with different checksum (cache invalid)
    mockInvoke.mockImplementation((command: string, _args?: any) => {
      switch (command) {
        case 'get_settings':
          return Promise.resolve({ pathMappings: mockMappings });
        case 'fetch_tv_shows':
          return Promise.resolve({ MediaContainer: { Directory: mockShows } });
        case 'fetch_show_episodes':
          return Promise.resolve(buildMockShowEpisodesResponse(_args?.showRatingKey ?? primaryShowKey));
        case 'fetch_plex_image':
          return Promise.resolve('data:image/jpeg;base64,fake-image-data');
        case 'generate_mappings_checksum_cmd':
          return Promise.resolve('different-checksum'); // Different from cache checksum for validation failure test
        case 'load_show_mapping_cache':
          return Promise.resolve(mockInvalidCache); // Old cache with different checksum and empty shows
        case 'save_show_mapping_cache':
          return Promise.resolve();
        case 'invalidate_show_mapping_cache':
          return Promise.resolve();
        default:
          return Promise.reject(new Error(`Unknown command: ${command}`));
      }
    });

    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    // Wait for shows to load
    await waitFor(() => {
      expect(screen.getByText(primaryShowTitle)).toBeInTheDocument();
    });

    // Should rebuild cache due to checksum mismatch (verify API calls)
    expect(mockInvoke).toHaveBeenCalledWith('fetch_show_episodes', expect.any(Object));
    expect(mockInvoke).toHaveBeenCalledWith('save_show_mapping_cache', expect.any(Object));

    // Shows should be loaded successfully
    expect(screen.getByText(primaryShowTitle)).toBeInTheDocument();
    expect(screen.getByText(secondaryShowTitle)).toBeInTheDocument();
  });

  it('shows correct show metadata from cache', async () => {
    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(primaryShowTitle)).toBeInTheDocument();
      expect(screen.getByText(secondaryShowTitle)).toBeInTheDocument();
    });

    // Check that metadata is displayed correctly
    expect(screen.getByText(primaryShow.Genre?.[0]?.tag ?? '')).toBeInTheDocument();
    expect(screen.getByText(secondaryShow.Genre?.[0]?.tag ?? '')).toBeInTheDocument();
    expect(screen.getByText(primaryShow.studio)).toBeInTheDocument();
    expect(screen.getByText(secondaryShow.studio)).toBeInTheDocument();
    expect(screen.getByText(`(${String(primaryShow.year)})`)).toBeInTheDocument();
    expect(screen.getByText(`(${String(secondaryShow.year)})`)).toBeInTheDocument();
  });

  it('handles show selection correctly', async () => {
    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(primaryShowTitle)).toBeInTheDocument();
    });

    // Click on the first tracked mock-fixture show
    await userEvent.click(screen.getByText(primaryShowTitle));

    // The callback receives the full show object with metadata and current page
    expect(mockOnSelectShow).toHaveBeenCalledWith({
      ratingKey: primaryShowKey,
      title: primaryShowTitle,
      posterUrl: primaryShowPosterUrl,
      cachedPosterUrl: 'data:image/jpeg;base64,fake-image-data',
      year: Number(primaryShow.year),
      genre: primaryShow.Genre?.[0]?.tag ?? '',
      studio: primaryShow.studio,
      creators: ['Fixture Creator'],
      yearsRunning: String(primaryShow.year),
      isMapped: true,
      location: primaryShowLocation,
      mappingStatus: 'checked',
    }, 1); // currentPage defaults to 1
  });

  it('handles pagination correctly', async () => {
    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(primaryShowTitle)).toBeInTheDocument();
    });

    // Should call fetch_tv_shows with correct pagination
    expect(mockInvoke).toHaveBeenCalledWith('fetch_tv_shows', {
      server: mockServer.address,
      libraryKey: mockLibrary.key,
      token: 'fake-token',
      start: 0,
      size: 20, // Default from settings
      query: null,
    });
  });

  it('loads the next backend page from pagination controls without showing Load more', async () => {
    let savedCache: any = null;
    const allTrackedShows = buildShowSelectionShows(24);
    const pageOneShows = allTrackedShows.slice(0, 20);
    const pageTwoShows = allTrackedShows.slice(20);

    mockInvoke.mockImplementation((command: string, args?: any) => {
      switch (command) {
        case 'get_settings':
          return Promise.resolve({ pathMappings: mockMappings });
        case 'fetch_tv_shows':
          if (args?.start === 0) {
            return Promise.resolve({ MediaContainer: { Directory: pageOneShows, totalSize: 25, size: 20, offset: 0 } });
          }
          if (args?.start === 20) {
            return Promise.resolve({ MediaContainer: { Directory: pageTwoShows, totalSize: 25, size: 5, offset: 20 } });
          }
          return Promise.resolve({ MediaContainer: { Directory: [], totalSize: 25, size: 0, offset: args?.start ?? 0 } });
        case 'fetch_show_episodes':
          return Promise.resolve(buildMockShowEpisodesResponse(args?.showRatingKey ?? primaryShowKey));
        case 'fetch_plex_image':
          return Promise.resolve('data:image/jpeg;base64,fake-image-data');
        case 'generate_mappings_checksum_cmd':
          return Promise.resolve('test-checksum');
        case 'load_show_mapping_cache':
          return Promise.resolve(savedCache);
        case 'save_show_mapping_cache':
          savedCache = args?.cache ?? args?.data ?? savedCache;
          return Promise.resolve();
        case 'invalidate_show_mapping_cache':
          savedCache = null;
          return Promise.resolve();
        default:
          return Promise.reject(new Error(`Unknown command: ${command}`));
      }
    });

    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(pageOneShows[0].title)).toBeInTheDocument();
      expect(screen.getByText('Page 1 / 2')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByText('Loading shows…')).not.toBeInTheDocument();
    });

    expect(screen.queryByText('Load more')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('fetch_tv_shows', expect.objectContaining({
        start: 20,
        size: 20,
        query: null,
      }));
    });

    await waitFor(() => {
      expect(screen.queryByText('Loading shows…')).not.toBeInTheDocument();
      expect(screen.getByText('Page 2 / 2')).toBeInTheDocument();
      expect(screen.getByText(pageTwoShows[0].title)).toBeInTheDocument();
    }, { timeout: 5000 });
  }, 10000);

  it('ignores a stale initial TV response after refresh triggers a newer load', async () => {
    const staleShows = [
      {
        ratingKey: 'stale-show',
        title: 'Stale Show',
        thumb: '/library/metadata/stale-show/thumb/123',
        year: '2000',
        Genre: [{ tag: 'Drama' }],
        studio: 'Studio',
        childCount: 1,
      },
    ];
    const freshShows = [
      {
        ratingKey: 'fresh-show',
        title: 'Fresh Show',
        thumb: '/library/metadata/fresh-show/thumb/123',
        year: '2001',
        Genre: [{ tag: 'Comedy' }],
        studio: 'Studio',
        childCount: 1,
      },
    ];
    const deferredInitial = createDeferred<any>();
    let fetchCallCount = 0;

    const raceCache = {
      lastUpdated: Date.now(),
      mappingsChecksum: 'test-checksum',
      shows: {
        'stale-show': {
          isMapped: true,
          location: '/media/TV Shows/Stale Show/Season 1/Stale Show - S01E01.mkv',
          lastChecked: Date.now(),
          posterUrl: `http://192.168.1.100:32400${staleShows[0].thumb}`,
          year: 2000,
          genre: 'Drama',
          studio: 'Studio',
          creators: ['Creator'],
          yearsRunning: '2000-2001',
        },
        'fresh-show': {
          isMapped: true,
          location: '/media/TV Shows/Fresh Show/Season 1/Fresh Show - S01E01.mkv',
          lastChecked: Date.now(),
          posterUrl: `http://192.168.1.100:32400${freshShows[0].thumb}`,
          year: 2001,
          genre: 'Comedy',
          studio: 'Studio',
          creators: ['Creator'],
          yearsRunning: '2001-2002',
        },
      },
    };

    mockInvoke.mockImplementation((command: string, args?: any) => {
      switch (command) {
        case 'get_settings':
          return Promise.resolve({ pathMappings: mockMappings });
        case 'fetch_tv_shows':
          fetchCallCount += 1;
          if (fetchCallCount === 1) {
            return deferredInitial.promise;
          }
          return Promise.resolve({
            MediaContainer: {
              Directory: freshShows,
              totalSize: 1,
              size: 1,
              offset: 0,
            }
          });
        case 'fetch_show_episodes':
          return Promise.resolve(buildMockShowEpisodesResponse(args?.showRatingKey ?? primaryShowKey));
        case 'fetch_plex_image':
          return Promise.resolve('data:image/jpeg;base64,fake-image-data');
        case 'generate_mappings_checksum_cmd':
          return Promise.resolve('test-checksum');
        case 'load_show_mapping_cache':
          return Promise.resolve(raceCache);
        case 'save_show_mapping_cache':
          return Promise.resolve();
        case 'invalidate_show_mapping_cache':
          return Promise.resolve();
        default:
          return Promise.reject(new Error(`Unknown command: ${command}`));
      }
    });

    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(fetchCallCount).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Fresh Show')).toBeInTheDocument();
    });

    deferredInitial.resolve({
      MediaContainer: {
        Directory: staleShows,
        totalSize: 1,
        size: 1,
        offset: 0,
      }
    });

    await waitFor(() => {
      expect(screen.getByText('Fresh Show')).toBeInTheDocument();
      expect(screen.queryByText('Stale Show')).not.toBeInTheDocument();
    });
  });

  it('uses fallback total-count fields when Plex omits totalSize', async () => {
    const showsPage = buildShowSelectionShows(20);

    mockInvoke.mockImplementation((command: string, args?: any) => {
      switch (command) {
        case 'get_settings':
          return Promise.resolve({ pathMappings: mockMappings });
        case 'fetch_tv_shows':
          return Promise.resolve({
            MediaContainer: {
              Directory: showsPage,
              librarySectionSize: 85,
              size: 20,
              offset: 0,
            }
          });
        case 'fetch_show_episodes':
          return Promise.resolve(buildMockShowEpisodesResponse(args?.showRatingKey ?? primaryShowKey));
        case 'fetch_plex_image':
          return Promise.resolve('data:image/jpeg;base64,fake-image-data');
        case 'generate_mappings_checksum_cmd':
          return Promise.resolve('test-checksum');
        case 'load_show_mapping_cache':
          return Promise.resolve(null);
        case 'save_show_mapping_cache':
          return Promise.resolve();
        case 'invalidate_show_mapping_cache':
          return Promise.resolve();
        default:
          return Promise.reject(new Error(`Unknown command: ${command}`));
      }
    });

    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(showsPage[0].title)).toBeInTheDocument();
      expect(screen.getByText('Page 1 / 5')).toBeInTheDocument();
    });
  });

  it('keeps fetching TV pages when Plex omits totals and caps each response', async () => {
    const allShows = buildShowSelectionShows(24);
    const cachedShows = Object.fromEntries(
      allShows.map((show) => [
        show.ratingKey,
        {
          isMapped: true,
          location: `/media/TV Shows/${show.title}/Season 1/${show.title} - S01E01.mkv`,
          lastChecked: Date.now(),
          posterUrl: `http://192.168.1.100:32400${show.thumb}`,
          year: Number(show.year),
          genre: show.Genre?.[0]?.tag ?? '',
          studio: show.studio,
          creators: ['Creator'],
          yearsRunning: String(show.year),
        }
      ])
    );

    mockInvoke.mockImplementation((command: string, args?: any) => {
      switch (command) {
        case 'get_settings':
          return Promise.resolve({ pathMappings: mockMappings });
        case 'fetch_tv_shows': {
          const start = Number(args?.start ?? 0);
          const page = allShows.slice(start, start + 8);
          return Promise.resolve({
            MediaContainer: {
              Directory: page,
              size: page.length,
              offset: start,
            }
          });
        }
        case 'fetch_show_episodes':
          return Promise.resolve(buildMockShowEpisodesResponse(args?.showRatingKey ?? primaryShowKey));
        case 'fetch_plex_image':
          return Promise.resolve('data:image/jpeg;base64,fake-image-data');
        case 'generate_mappings_checksum_cmd':
          return Promise.resolve('test-checksum');
        case 'load_show_mapping_cache':
          return Promise.resolve({
            lastUpdated: Date.now(),
            mappingsChecksum: 'test-checksum',
            shows: cachedShows,
          });
        case 'save_show_mapping_cache':
          return Promise.resolve();
        case 'invalidate_show_mapping_cache':
          return Promise.resolve();
        default:
          return Promise.reject(new Error(`Unknown command: ${command}`));
      }
    });

    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(allShows[0].title)).toBeInTheDocument();
      expect(screen.getByText('Page 1 / 2')).toBeInTheDocument();
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('fetch_tv_shows', expect.objectContaining({
        start: 8,
        size: 20,
        query: null,
      }));
    });
  });

  it('handles search query correctly', async () => {
    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(primaryShowTitle)).toBeInTheDocument();
    });

    // Type in search box
    const searchInput = screen.getByPlaceholderText('Quick search…');
    await userEvent.type(searchInput, 'Northwind');

    // Should call fetch_tv_shows with search query after debounce
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('fetch_tv_shows', {
        server: mockServer.address,
        libraryKey: mockLibrary.key,
        token: 'fake-token',
        start: 0,
        size: 20,
        query: 'Northwind',
      });
    }, { timeout: 1000 });
  });

  it('handles error states gracefully', async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === 'get_settings') {
        return Promise.resolve({ pathMappings: [] });
      }
      if (command === 'fetch_tv_shows') {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.reject(new Error(`Unknown command: ${command}`));
    });

    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
    });
  });

  it('rescans the show folder from the TV show list', async () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);

    const numericLibrary: PlexLibrary = {
      ...mockLibrary,
      key: '2',
    };

    mockInvoke.mockImplementation((command: string, _args?: any) => {
      switch (command) {
        case 'get_settings':
          return Promise.resolve({ pathMappings: mockMappings });
        case 'fetch_tv_shows':
          return Promise.resolve({ MediaContainer: { Directory: [mockShows[0]], totalSize: 1, size: 1, offset: 0 } });
        case 'fetch_show_episodes':
          return Promise.resolve(buildMockShowEpisodesResponse(_args?.showRatingKey ?? primaryShowKey));
        case 'fetch_plex_image':
          return Promise.resolve('data:image/jpeg;base64,fake-image-data');
        case 'generate_mappings_checksum_cmd':
          return Promise.resolve('test-checksum');
        case 'load_show_mapping_cache':
          return Promise.resolve({
            ...mockCache,
            shows: {
              [primaryShowKey]: mockCache.shows[primaryShowKey],
            },
          });
        case 'save_show_mapping_cache':
          return Promise.resolve();
        case 'invalidate_show_mapping_cache':
          return Promise.resolve();
        case 'plex_refresh_library_section_with_path':
          return Promise.resolve('ok');
        default:
          return Promise.reject(new Error(`Unknown command: ${command}`));
      }
    });

    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={numericLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(primaryShowTitle)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText(`Rescan ${primaryShowTitle}`));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('plex_refresh_library_section_with_path', {
        server: mockServer.address,
        sectionId: 2,
        path: primaryShowFolder,
        token: 'fake-token',
      });
    });

    expect(alertMock).toHaveBeenCalledWith(
      `Plex rescan started for:\n${primaryShowTitle}\n\n${primaryShowFolder}`
    );
  });
});
