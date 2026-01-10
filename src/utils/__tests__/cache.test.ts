import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  generateMappingsChecksum,
  loadShowMappingCache,
  saveShowMappingCache,
  invalidateShowMappingCache,
  isCacheValid,
  extractLocationFromEpisode,
  extractMetadataFromShow,
  generateServerId,
  clearAllShowMappingCaches,
  getCacheDirectoryPath,
  getCacheKey,
} from '../cache';

// Mock the Tauri invoke function
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe('cache utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateMappingsChecksum', () => {
    it('should generate a consistent checksum for the same mappings', async () => {
      const mappings = [
        { server_id: 'server1', plex_root: '/media/movies', local_root: '/mnt/movies', platform: 'linux' },
        { server_id: 'server1', plex_root: '/media/tv', local_root: '/mnt/tv', platform: 'linux' },
      ];

      const expectedCamelMappings = [
        { serverId: 'server1', plexRoot: '/media/movies', localRoot: '/mnt/movies', platform: 'linux' },
        { serverId: 'server1', plexRoot: '/media/tv', localRoot: '/mnt/tv', platform: 'linux' },
      ];

      mockInvoke.mockResolvedValue('abc123');

      const checksum1 = await generateMappingsChecksum(mappings, 'server1');
      const checksum2 = await generateMappingsChecksum(mappings, 'server1');

      expect(checksum1).toBe('abc123');
      expect(checksum2).toBe('abc123');
      expect(checksum1).toBe(checksum2);
      expect(mockInvoke).toHaveBeenCalledTimes(2);
      expect(mockInvoke).toHaveBeenCalledWith('generate_mappings_checksum_cmd', { serverId: 'server1', server_id: 'server1', mappings: expectedCamelMappings });
    });

    it('should generate different checksums for different mappings', async () => {
      const mappings1 = [
        { server_id: 'server1', plex_root: '/media/movies', local_root: '/mnt/movies', platform: 'linux' },
      ];

      const mappings2 = [
        { server_id: 'server1', plex_root: '/media/tv', local_root: '/mnt/tv', platform: 'linux' },
      ];

      mockInvoke.mockResolvedValueOnce('abc123').mockResolvedValueOnce('def456');

      const checksum1 = await generateMappingsChecksum(mappings1, 'server1');
      const checksum2 = await generateMappingsChecksum(mappings2, 'server1');

      expect(checksum1).toBe('abc123');
      expect(checksum2).toBe('def456');
      expect(checksum1).not.toBe(checksum2);
    });

    it('should handle empty mappings array', async () => {
      mockInvoke.mockResolvedValue('empty');

      const checksum = await generateMappingsChecksum([], 'server1');

      expect(checksum).toBe('empty');
      expect(mockInvoke).toHaveBeenCalledWith('generate_mappings_checksum_cmd', { serverId: 'server1', server_id: 'server1', mappings: [] });
    });

    it('should throw error when serverId is not provided', async () => {
      const mappings = [
        { server_id: 'server1', plex_root: '/media/movies', local_root: '/mnt/movies', platform: 'linux' },
      ];

      // Should throw before calling invoke
      await expect(generateMappingsChecksum(mappings)).rejects.toThrow('serverId is required for checksum generation');
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  describe('loadShowMappingCache', () => {
    it('should load cache successfully', async () => {
      const mockCache = {
        lastUpdated: Date.now(),
        mappingsChecksum: 'test-checksum',
        shows: {
          '123': { isMapped: true, location: '/media/show1', lastChecked: Date.now() }
        }
      };

      mockInvoke.mockResolvedValue(mockCache);

      const result = await loadShowMappingCache('server1', 'library1');

      expect(result).toEqual(mockCache);
      expect(mockInvoke).toHaveBeenCalledWith('load_show_mapping_cache', {
        serverId: 'server1',
        server_id: 'server1',
        libraryId: 'library1',
        library_id: 'library1'
      });
    });

    it('should return null when cache load fails', async () => {
      mockInvoke.mockRejectedValue(new Error('Cache not found'));

      const result = await loadShowMappingCache('server1', 'library1');

      expect(result).toBeNull();
    });

    it('should return null when invoke throws', async () => {
      mockInvoke.mockRejectedValue(new Error('Network error'));

      const result = await loadShowMappingCache('server1', 'library1');

      expect(result).toBeNull();
    });
  });

  describe('saveShowMappingCache', () => {
    it('should save cache successfully', async () => {
      const mockCache = {
        lastUpdated: Date.now(),
        mappingsChecksum: 'test-checksum',
        shows: {
          '123': { isMapped: true, location: '/media/show1', lastChecked: Date.now() }
        }
      };

      mockInvoke.mockResolvedValue(undefined);

      await saveShowMappingCache('server1', 'library1', mockCache);

      expect(mockInvoke).toHaveBeenCalledWith('save_show_mapping_cache', {
        serverId: 'server1',
        server_id: 'server1',
        libraryId: 'library1',
        library_id: 'library1',
        cache: mockCache
      });
    });

    it('should handle save errors gracefully', async () => {
      const mockCache = {
        lastUpdated: Date.now(),
        mappingsChecksum: 'test-checksum',
        shows: {}
      };

      mockInvoke.mockRejectedValue(new Error('Disk full'));

      // Should not throw, just log warning
      await expect(saveShowMappingCache('server1', 'library1', mockCache)).resolves.toBeUndefined();
    });
  });

  describe('invalidateShowMappingCache', () => {
    it('should invalidate cache successfully', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await invalidateShowMappingCache('server1', 'library1');

      expect(mockInvoke).toHaveBeenCalledWith('invalidate_show_mapping_cache', {
        serverId: 'server1',
        server_id: 'server1',
        libraryId: 'library1',
        library_id: 'library1'
      });
    });

    it('should handle invalidation errors gracefully', async () => {
      mockInvoke.mockRejectedValue(new Error('File not found'));

      await expect(invalidateShowMappingCache('server1', 'library1')).resolves.toBeUndefined();
    });
  });

  describe('isCacheValid', () => {
    it('should return false for null cache', () => {
      const result = isCacheValid(null, 'current-checksum');
      expect(result).toBe(false);
    });

    it('should return false for undefined cache', () => {
      const result = isCacheValid(undefined, 'current-checksum');
      expect(result).toBe(false);
    });

    it('should return true when checksums match', () => {
      const cache = {
        lastUpdated: Date.now(),
        mappingsChecksum: 'matching-checksum',
        shows: {}
      };

      const result = isCacheValid(cache, 'matching-checksum');
      expect(result).toBe(true);
    });

    it('should return false when checksums do not match', () => {
      const cache = {
        lastUpdated: Date.now(),
        mappingsChecksum: 'old-checksum',
        shows: {}
      };

      const result = isCacheValid(cache, 'new-checksum');
      expect(result).toBe(false);
    });
  });

  describe('extractLocationFromEpisode', () => {
    it('should extract location from valid episode data', () => {
      const episodeData = {
        MediaContainer: {
          Metadata: [{
            Media: [{
              Part: [{
                file: '/media/shows/Breaking Bad/Season 1/Breaking Bad - S01E01 - Pilot.mkv'
              }]
            }]
          }]
        }
      };

      const result = extractLocationFromEpisode(episodeData);
      expect(result).toBe('/media/shows/Breaking Bad/Season 1/Breaking Bad - S01E01 - Pilot.mkv');
    });

    it('should handle Video array instead of Metadata', () => {
      const episodeData = {
        MediaContainer: {
          Video: [{
            Media: [{
              Part: [{
                file: '/media/shows/Show/file.mkv'
              }]
            }]
          }]
        }
      };

      const result = extractLocationFromEpisode(episodeData);
      expect(result).toBe('/media/shows/Show/file.mkv');
    });

    it('should return empty string for missing file', () => {
      const episodeData = {
        MediaContainer: {
          Metadata: [{
            Media: [{
              Part: [{}]
            }]
          }]
        }
      };

      const result = extractLocationFromEpisode(episodeData);
      expect(result).toBe('');
    });

    it('should return empty string for empty data', () => {
      const result = extractLocationFromEpisode({});
      expect(result).toBe('');
    });

    it('should return empty string for null/undefined data', () => {
      expect(extractLocationFromEpisode(null)).toBe('');
      expect(extractLocationFromEpisode(undefined)).toBe('');
    });
  });

  describe('extractMetadataFromShow', () => {
  it('should extract all metadata fields', () => {
    const showData = {
      thumb: '/library/metadata/123/thumb/456',
      year: '2020',
      Genre: [{ tag: 'Drama' }],
      studio: 'Test Studio',
      Writer: [{ tag: 'Writer 1' }],
      Director: [{ tag: 'Director 1' }],
      Role: [{ tag: 'Actor 1' }, { tag: 'Actor 2' }, { tag: 'Actor 3' }, { tag: 'Actor 4' }],
      childCount: 2
    };

    const result = extractMetadataFromShow(showData, 'http://server:32400');

    expect(result.posterUrl).toBe('http://server:32400/library/metadata/123/thumb/456');
    expect(result.year).toBe(2020);
    expect(result.genre).toBe('Drama');
    expect(result.studio).toBe('Test Studio');
    expect(result.creators).toEqual(['Writer 1', 'Director 1', 'Actor 1', 'Actor 2', 'Actor 3']);
    expect(result.yearsRunning).toBe('2020-2021'); // 2020 + Math.ceil(2/2) = 2020 + 1
  });

    it('should handle array format for Genre, Writer, Director, Role', () => {
      const showData = {
        year: '2019',
        Genre: [{ tag: 'Comedy' }, { tag: 'Action' }], // Should be objects with tag property
        Writer: [{ tag: 'Writer 1' }, { tag: 'Writer 2' }],
        Director: [{ tag: 'Director 1' }],
        Role: [{ tag: 'Actor 1' }],
        childCount: 1
      };

      const result = extractMetadataFromShow(showData, 'http://server:32400');

      expect(result.genre).toBe('Comedy'); // Takes first genre
      expect(result.creators).toEqual(['Writer 1', 'Writer 2', 'Director 1', 'Actor 1']);
      expect(result.yearsRunning).toBe('2019-2020');
    });

    it('should handle string format for single-value fields', () => {
      const showData = {
        year: '2021',
        Genre: { tag: 'Thriller' },
        studio: 'Single Studio',
        Writer: { tag: 'Single Writer' },
        Director: { tag: 'Single Director' },
        Role: { tag: 'Single Actor' },
        childCount: 3
      };

      const result = extractMetadataFromShow(showData, 'http://server:32400');

      expect(result.genre).toBe('Thriller');
      expect(result.studio).toBe('Single Studio');
      expect(result.creators).toEqual(['Single Writer', 'Single Director', 'Single Actor']);
      expect(result.yearsRunning).toBe('2021-2023');
    });

    it('should limit cast members to 3', () => {
      const showData = {
        Role: [
          { tag: 'Actor 1' }, { tag: 'Actor 2' }, { tag: 'Actor 3' },
          { tag: 'Actor 4' }, { tag: 'Actor 5' }
        ]
      };

      const result = extractMetadataFromShow(showData, 'http://server:32400');

      expect(result.creators).toEqual(['Actor 1', 'Actor 2', 'Actor 3']);
    });

    it('should remove duplicate creators', () => {
      const showData = {
        Writer: [{ tag: 'Same Person' }],
        Director: [{ tag: 'Same Person' }],
        Role: [{ tag: 'Same Person' }]
      };

      const result = extractMetadataFromShow(showData, 'http://server:32400');

      expect(result.creators).toEqual(['Same Person']);
    });

    it('should handle missing optional fields', () => {
      const showData = {
        title: 'Test Show',
        ratingKey: '123'
      };

      const result = extractMetadataFromShow(showData, 'http://server:32400');

      expect(result.posterUrl).toBeUndefined();
      expect(result.year).toBeUndefined();
      expect(result.genre).toBeUndefined();
      expect(result.studio).toBeUndefined();
      expect(result.creators).toBeUndefined();
      expect(result.yearsRunning).toBeUndefined();
    });
  });

  describe('generateServerId', () => {
    it('should use machineIdentifier when available and not empty', () => {
      const server = {
        machineIdentifier: 'plex-server-123',
        address: 'http://192.168.1.100:32400'
      };

      const result = generateServerId(server);
      expect(result).toBe('plex-server-123');
    });

    it('should trim whitespace from machineIdentifier', () => {
      const server = {
        machineIdentifier: '  plex-server-123  ',
        address: 'http://192.168.1.100:32400'
      };

      const result = generateServerId(server);
      expect(result).toBe('plex-server-123');
    });

    it('should extract hostname from URL when machineIdentifier is empty', () => {
      const server = {
        machineIdentifier: '',
        address: 'http://192.168.1.100:32400'
      };

      const result = generateServerId(server);
      // The function should extract hostname properly
      expect(result).toMatch(/192\.168\.1\.100/);
    });

    it('should extract hostname from URL when machineIdentifier is missing', () => {
      const server = {
        address: 'https://plex.example.com:32400'
      };

      const result = generateServerId(server);
      // The function should extract hostname properly
      expect(result).toMatch(/plex\.example\.com/);
    });

    it('should handle URL without protocol', () => {
      const server = {
        machineIdentifier: '',
        address: '192.168.1.100:32400'
      };

      const result = generateServerId(server);
      // The function should extract hostname properly
      expect(result).toMatch(/192\.168\.1\.100/);
    });

    it('should handle malformed URL gracefully', () => {
      const server = {
        machineIdentifier: '',
        address: 'not-a-url'
      };

      const result = generateServerId(server);
      expect(result).toBe('not-a-url');
    });

    it('should fallback to address when URL parsing fails', () => {
      // Create a server object that will cause URL parsing to fail
      const server = Object.create({
        machineIdentifier: '',
        address: 'http://192.168.1.100:32400'
      });

      // Mock URL constructor to throw
      const originalURL = globalThis.URL;
      globalThis.URL = vi.fn(() => {
        throw new Error('Invalid URL');
      }) as any;

      const result = generateServerId(server);
      expect(result).toBe('192.168.1.100');

      // Restore original URL
      globalThis.URL = originalURL;
    });
  });

  describe('clearAllShowMappingCaches', () => {
    it('should clear all caches successfully', async () => {
      mockInvoke.mockResolvedValue({
        total_files_found: 2,
        files_removed: ['server_lib.json'],
        cache_directory_exists: true,
      });

      const result = await clearAllShowMappingCaches();

      expect(mockInvoke).toHaveBeenCalledWith('clear_all_show_mapping_caches');
      expect(result).toEqual({
        total_files_found: 2,
        files_removed: ['server_lib.json'],
        cache_directory_exists: true,
      });
    });

    it('should handle clear errors gracefully', async () => {
      mockInvoke.mockRejectedValue(new Error('Permission denied'));

      await expect(clearAllShowMappingCaches()).resolves.toBeUndefined();
    });
  });

  describe('getCacheDirectoryPath', () => {
    it('should get cache directory path successfully', async () => {
      mockInvoke.mockResolvedValue('/app/cache/show-mappings');

      const result = await getCacheDirectoryPath();

      expect(result).toBe('/app/cache/show-mappings');
      expect(mockInvoke).toHaveBeenCalledWith('get_cache_directory_path');
    });

    it('should return unknown when getting path fails', async () => {
      mockInvoke.mockRejectedValue(new Error('Path not accessible'));

      const result = await getCacheDirectoryPath();

      expect(result).toBe('unknown');
    });
  });

  describe('getCacheKey', () => {
    it('should generate correct cache key', () => {
      const result = getCacheKey('server1', 'library1');
      expect(result).toBe('showMappingCache:server1:library1');
    });

    it('should handle special characters in IDs', () => {
      const result = getCacheKey('server-123', 'library_456');
      expect(result).toBe('showMappingCache:server-123:library_456');
    });
  });
});
