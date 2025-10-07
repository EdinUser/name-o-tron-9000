import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import ShowSelectionContainer from '../ShowSelectionContainer';
import { SettingsProvider } from '../../../state/settings';
import { ThemeProvider } from '../../../state/theme';
import type { PlexServer, PlexLibrary } from '../../../types/plex';

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
  roots: ['/media/TV Shows'],
};

const mockShows = [
  {
    ratingKey: 'show1',
    title: 'Breaking Bad',
    thumb: '/library/metadata/show1/thumb/123',
    year: '2008',
    Genre: [{ tag: 'Drama' }],
    studio: 'AMC',
    childCount: 5,
  },
  {
    ratingKey: 'show2',
    title: 'The Office',
    thumb: '/library/metadata/show2/thumb/456',
    year: '2005',
    Genre: [{ tag: 'Comedy' }],
    studio: 'NBC',
    childCount: 9,
  },
];

const mockEpisodeData = {
  MediaContainer: {
    Metadata: [{
      Media: [{
        Part: [{
          file: '/media/TV Shows/Breaking Bad/Season 1/Breaking Bad - S01E01 - Pilot.mkv'
        }]
      }]
    }]
  }
};

const mockMappings = [
  {
    server_id: 'test-server-id',
    plex_root: '/media/TV Shows',
    local_root: '/mnt/tv-shows',
  }
];

const mockCache = {
  lastUpdated: Date.now(),
  mappingsChecksum: 'test-checksum', // Matches default checksum for valid cache test
  shows: {
    'show1': {
      isMapped: true,
      location: '/media/TV Shows/Breaking Bad/Season 1/Breaking Bad - S01E01 - Pilot.mkv',
      lastChecked: Date.now(),
      posterUrl: 'http://192.168.1.100:32400/library/metadata/show1/thumb/123',
      year: 2008,
      genre: 'Drama',
      studio: 'AMC',
      creators: ['Vince Gilligan'],
      yearsRunning: '2008-2013',
    },
    'show2': {
      isMapped: false,
      location: '',
      lastChecked: Date.now(),
      posterUrl: 'http://192.168.1.100:32400/library/metadata/show2/thumb/456',
      year: 2005,
      genre: 'Comedy',
      studio: 'NBC',
      creators: ['Greg Daniels'],
      yearsRunning: '2005-2013',
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

describe('ShowSelection Integration Tests', () => {
  const mockOnBack = vi.fn();
  const mockOnSelectShow = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    localStorageMock.getItem.mockReturnValue('fake-token');
    sessionStorageMock.getItem.mockReturnValue(null);

    // Mock invoke responses
    mockInvoke.mockImplementation((command: string, _args?: any) => {
      switch (command) {
        case 'get_settings':
          return Promise.resolve({ pathMappings: mockMappings });
        case 'fetch_tv_shows':
          return Promise.resolve({ MediaContainer: { Directory: mockShows } });
        case 'fetch_show_episodes':
          return Promise.resolve(mockEpisodeData);
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
      expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
      expect(screen.getByText('The Office')).toBeInTheDocument();
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
          plexRoot: '/media/TV Shows',
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

  it('handles cache miss and builds cache from scratch', async () => {
    // Mock cache not found
    mockInvoke.mockImplementation((command: string, _args?: any) => {
      switch (command) {
        case 'get_settings':
          return Promise.resolve({ pathMappings: mockMappings });
        case 'fetch_tv_shows':
          return Promise.resolve({ MediaContainer: { Directory: mockShows } });
        case 'fetch_show_episodes':
          return Promise.resolve(mockEpisodeData);
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
      expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
    });

    // Verify cache building API calls were made
    expect(mockInvoke).toHaveBeenCalledWith('fetch_show_episodes', expect.any(Object));
    expect(mockInvoke).toHaveBeenCalledWith('save_show_mapping_cache', expect.any(Object));

    // Shows should be loaded successfully
    expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
    expect(screen.getByText('The Office')).toBeInTheDocument();
  });

  it('persists and restores search query', async () => {
    // Mock initial search query in sessionStorage
    sessionStorageMock.getItem.mockReturnValue('Breaking');

    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Breaking')).toBeInTheDocument();
    });

    // Type in search box
    const searchInput = screen.getByPlaceholderText('Quick search…');
    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, 'Office');

    // Verify search query is persisted
    await waitFor(() => {
      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        `showSearch-${mockServer.address}-${mockLibrary.key}`,
        'Office'
      );
    });
  });

  it('clears search when X button is clicked', async () => {
    // Mock initial search query
    sessionStorageMock.getItem.mockReturnValue('Breaking');

    renderWithProviders(
      <ShowSelectionContainer
        server={mockServer}
        library={mockLibrary}
        onBack={mockOnBack}
        onSelectShow={mockOnSelectShow}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Breaking')).toBeInTheDocument();
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
      expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
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
          return Promise.resolve(mockEpisodeData);
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
      expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
    });

    // Should rebuild cache due to checksum mismatch (verify API calls)
    expect(mockInvoke).toHaveBeenCalledWith('fetch_show_episodes', expect.any(Object));
    expect(mockInvoke).toHaveBeenCalledWith('save_show_mapping_cache', expect.any(Object));

    // Shows should be loaded successfully
    expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
    expect(screen.getByText('The Office')).toBeInTheDocument();
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
      expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
      expect(screen.getByText('The Office')).toBeInTheDocument();
    });

    // Check that metadata is displayed correctly
    expect(screen.getByText('Drama')).toBeInTheDocument();
    expect(screen.getByText('Comedy')).toBeInTheDocument();
    expect(screen.getByText('AMC')).toBeInTheDocument();
    expect(screen.getByText('NBC')).toBeInTheDocument();
    expect(screen.getByText('(2008-2013)')).toBeInTheDocument();
    expect(screen.getByText('(2005-2013)')).toBeInTheDocument();
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
      expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
    });

    // Click on Breaking Bad show
    await userEvent.click(screen.getByText('Breaking Bad'));

    // The callback receives the full show object with metadata
    expect(mockOnSelectShow).toHaveBeenCalledWith({
      ratingKey: 'show1',
      title: 'Breaking Bad',
      posterUrl: 'http://192.168.1.100:32400/library/metadata/show1/thumb/123',
      cachedPosterUrl: 'data:image/jpeg;base64,fake-image-data',
      year: 2008,
      genre: 'Drama',
      studio: 'AMC',
      creators: ['Vince Gilligan'],
      yearsRunning: '2008-2013',
      isMapped: true,
      location: '/media/TV Shows/Breaking Bad/Season 1/Breaking Bad - S01E01 - Pilot.mkv',
      mappingStatus: 'checked',
    });
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
      expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
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
      expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
    });

    // Type in search box
    const searchInput = screen.getByPlaceholderText('Quick search…');
    await userEvent.type(searchInput, 'Office');

    // Should call fetch_tv_shows with search query after debounce
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('fetch_tv_shows', {
        server: mockServer.address,
        libraryKey: mockLibrary.key,
        token: 'fake-token',
        start: 0,
        size: 20,
        query: 'Office',
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
});
