import { describe, it, expect } from 'vitest';
import { deepMerge } from '../settings';

describe('deepMerge utility', () => {
  it('should merge simple objects correctly', () => {
    const target = {
      a: 1,
      b: { c: 2 }
    };

    const source = {
      b: { d: 3 },
      e: 4
    };

    const result = deepMerge(target, source);

    expect(result).toEqual({
      a: 1,
      b: { c: 2, d: 3 },
      e: 4
    });
  });

  it('should handle nested objects deeply', () => {
    const target = {
      general: {
        encoding: {
          mode: 'unicode',
          highlightNonLatin: true
        }
      },
      movies: {
        collections: {
          enabled: true
        }
      }
    };

    const source = {
      general: {
        encoding: {
          mode: 'transliterate'
        }
      },
      tv: {
        seasonFolders: true
      }
    };

    const result = deepMerge(target, source);

    expect(result.general.encoding.mode).toBe('transliterate');
    expect(result.general.encoding.highlightNonLatin).toBe(true);
    expect(result.movies.collections.enabled).toBe(true);
    expect(result.tv.seasonFolders).toBe(true);
  });

  it('should handle arrays correctly (replace, not merge)', () => {
    const target = {
      items: ['a', 'b']
    };

    const source = {
      items: ['c', 'd']
    };

    const result = deepMerge(target, source);

    expect(result.items).toEqual(['c', 'd']);
  });

  it('should handle null and undefined values', () => {
    const target = {
      a: 1,
      b: null
    };

    const source = {
      b: { c: 2 },
      d: undefined
    };

    const result = deepMerge(target, source);

    expect(result.a).toBe(1);
    expect(result.b).toEqual({ c: 2 });
    expect(result.d).toBeUndefined();
  });

  it('should handle empty objects', () => {
    const target = {};
    const source = { a: 1 };

    const result = deepMerge(target, source);

    expect(result).toEqual({ a: 1 });
  });

  it('should handle complex nested structures', () => {
    const target = {
      general: {
        encoding: {
          mode: 'unicode',
          highlightNonLatin: true
        },
        safety: {
          pathLengthCheck: true,
          reservedNamesCheck: false,
          permissionsCheck: true
        }
      },
      movies: {
        collections: {
          enabled: true,
          mode: 'always',
          naming: 'original'
        },
        editions: {
          mode: 'preserve',
          parsers: [
            { id: 'extended', name: 'Extended Edition', enabled: true }
          ]
        }
      }
    };

    const source = {
      general: {
        encoding: {
          mode: 'transliterate'
        },
        safety: {
          reservedNamesCheck: true,
          newSafetyOption: false
        },
        newGeneralOption: 'test'
      },
      movies: {
        collections: {
          mode: 'if2plus'
        },
        editions: {
          parsers: [
            { id: 'extended', name: 'Extended Edition', enabled: true },
            { id: 'directors-cut', name: 'Director\'s Cut', enabled: false }
          ]
        }
      },
      tv: {
        seasonFolders: true,
        normalizeMultiEpisode: true
      }
    };

    const result = deepMerge(target, source);

    // Test general section deep merge
    expect(result.general.encoding.mode).toBe('transliterate');
    expect(result.general.encoding.highlightNonLatin).toBe(true);
    expect(result.general.safety.pathLengthCheck).toBe(true);
    expect(result.general.safety.reservedNamesCheck).toBe(true);
    expect(result.general.safety.permissionsCheck).toBe(true);
    expect(result.general.safety.newSafetyOption).toBe(false);
    expect(result.general.newGeneralOption).toBe('test');

    // Test movies section deep merge
    expect(result.movies.collections.enabled).toBe(true);
    expect(result.movies.collections.mode).toBe('if2plus');
    expect(result.movies.collections.naming).toBe('original');

    // Test movies.editions.parsers array merge
    expect(result.movies.editions.mode).toBe('preserve');
    expect(result.movies.editions.parsers).toHaveLength(2);

    // Test that tv section was added
    expect(result.tv.seasonFolders).toBe(true);
    expect(result.tv.normalizeMultiEpisode).toBe(true);
  });

  it('should handle replacement of entire objects', () => {
    const target = {
      general: { theme: 'dark' },
      movies: { collections: { enabled: true } }
    };

    const source = {
      tv: { seasonFolders: false },
      music: { formatAAT: true }
    };

    const result = deepMerge(target, source);

    // Deep merge merges, doesn't replace - new keys are added, existing keys are preserved unless overridden
    expect(result.general.theme).toBe('dark'); // Preserved
    expect(result.movies.collections.enabled).toBe(true); // Preserved
    expect(result.tv.seasonFolders).toBe(false); // Added
    expect(result.music.formatAAT).toBe(true); // Added
  });
});
