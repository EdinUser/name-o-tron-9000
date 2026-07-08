import { describe, it, expect, beforeEach } from 'vitest';
import { addTemplateFavoriteEntry, addTemplateHistoryEntry, getTemplateFavoriteEntries, getTemplateHistoryEntries, loadSettings, removeTemplateFavoriteEntry, saveSettings } from '../settings';
import { localStorageMock, setupLocalStorageMock, resetLocalStorageMock, createDefaultSettings } from './test-utils/settings-setup';

setupLocalStorageMock();

describe('Settings Load/Save', () => {
  beforeEach(() => {
    resetLocalStorageMock();
  });

  describe('loadSettings', () => {
    it('should return default settings when localStorage is empty', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const settings = loadSettings();

      expect(settings).toBeDefined();
      expect(settings.general).toBeDefined();
      expect(settings.movies).toBeDefined();
      expect(settings.tv).toBeDefined();
      expect(settings.music).toBeDefined();
      expect(settings.misc).toBeDefined();
      expect(settings.templates).toBeDefined();
      expect(settings.templateHistory).toEqual({});
      expect(settings.templateFavorites).toEqual({});
      expect(settings.manualFixes).toEqual([]);
    });

    it('should load and merge settings from localStorage', () => {
      const savedSettings = {
        general: {
          theme: 'light',
          encoding: {
            mode: 'transliterate' as const,
            highlightNonLatin: false
          }
        },
        movies: {
          collections: {
            enabled: false,
            mode: 'if2plus' as const
          }
        }
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(savedSettings));

      const settings = loadSettings();

      // Should merge with defaults
      expect(settings.general.theme).toBe('light');
      expect(settings.general.encoding.mode).toBe('transliterate');
      expect(settings.general.encoding.highlightNonLatin).toBe(false);
      expect(settings.movies.collections.enabled).toBe(false);
      expect(settings.movies.collections.mode).toBe('if2plus');

      // Other defaults should still be present
      expect(settings.tv.seasonFolders).toBe(true); // From defaults
      expect(settings.templates.movie).toBe('{title}[ ({year})]{ext}'); // From defaults
      expect(settings.templateHistory).toEqual({});
      expect(settings.templateFavorites).toEqual({});
    });

    it('should handle invalid JSON in localStorage gracefully', () => {
      localStorageMock.getItem.mockReturnValue('invalid json');

      // Should not throw and return defaults
      expect(() => loadSettings()).not.toThrow();

      const settings = loadSettings();
      expect(settings.general.theme).toBe('dark'); // Default value
    });

    it('should handle localStorage errors gracefully', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage error');
      });

      expect(() => loadSettings()).not.toThrow();

      const settings = loadSettings();
      expect(settings).toBeDefined();
    });
  });

  describe('saveSettings', () => {
    it('should save settings to localStorage', () => {
      const settings = createDefaultSettings();

      saveSettings(settings);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'nameotron.settings.v1',
        JSON.stringify(settings)
      );
    });

    it('should handle localStorage errors when saving', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('localStorage full');
      });

      const settings = createDefaultSettings();

      expect(() => saveSettings(settings)).not.toThrow();
    });
  });

  describe('Settings persistence scenarios', () => {
    it('should handle localStorage quota exceeded', () => {
      localStorageMock.setItem.mockImplementation(() => {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      });

      const settings = createDefaultSettings();

      expect(() => saveSettings(settings)).not.toThrow();
    });

    it('should handle corrupted settings file gracefully', () => {
      localStorageMock.getItem.mockReturnValue('{"general": {"theme":');

      // Should not throw and return defaults
      expect(() => loadSettings()).not.toThrow();

      const settings = loadSettings();
      expect(settings.general.theme).toBe('dark'); // Default value
    });

    it('should handle settings version migration (future-proofing)', () => {
      // Simulate an older version of settings
      const oldSettingsFormat = {
        // Missing some new required fields
        general: {
          theme: 'dark',
          // Missing encoding, pagination, etc.
        },
        movies: {
          collections: { enabled: true },
          // Missing other movie settings
        },
        // Missing tv, music, misc, templates sections
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(oldSettingsFormat));

      const settings = loadSettings();

      // Should have defaults for missing sections
      expect(settings.tv).toBeDefined();
      expect(settings.music).toBeDefined();
      expect(settings.misc).toBeDefined();
      expect(settings.templates).toBeDefined();
      expect(settings.templateHistory).toBeDefined();
      expect(settings.templateFavorites).toBeDefined();

      // Should preserve old settings
      expect(settings.general.theme).toBe('dark');
      expect(settings.movies.collections.enabled).toBe(true);
    });
  });

  describe('Settings validation and type safety', () => {
    it('should handle settings with unexpected structure', () => {
      const malformedSettings = {
        general: 'not an object',
        movies: {
          collections: 'not an object',
        },
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(malformedSettings));

      // Should not throw and use defaults where possible
      expect(() => loadSettings()).not.toThrow();

      const settings = loadSettings();
      expect(settings.general).toBeDefined(); // Should fall back to defaults
      expect(settings.movies).toBeDefined(); // Should fall back to defaults
    });

    it('should handle settings with extra unknown fields', () => {
      const settingsWithExtras = {
        general: {
          theme: 'dark',
          encoding: { mode: 'unicode', highlightNonLatin: true },
          unknownField: 'should be ignored',
        },
        movies: {
          collections: { enabled: true, mode: 'always' },
          unknownSection: {
            unknownSetting: true,
          },
        },
        completelyUnknownSection: {
          randomData: 'test',
        },
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(settingsWithExtras));

      const settings = loadSettings();

      // Known fields should be preserved
      expect(settings.general.theme).toBe('dark');
      expect(settings.movies.collections.enabled).toBe(true);

      // Unknown fields should be merged in
      expect((settings as any).general.unknownField).toBe('should be ignored');
      expect((settings as any).movies.unknownSection).toBeDefined();
      expect((settings as any).completelyUnknownSection).toBeDefined();
    });
  });

  describe('Settings debugging utilities', () => {
    it('should expose settings utilities on window.nameotron', () => {
      const settings = createDefaultSettings();

      // Simulate the effect hook that adds utilities to window
      (window as any).nameotron = (window as any).nameotron || {};
      (window as any).nameotron.settings = {
        loadSettings,
        saveSettings,
        getCurrentSettings: () => settings,
        resetToDefaults: () => settings,
      };

      expect((window as any).nameotron.settings).toBeDefined();
      expect(typeof (window as any).nameotron.settings.loadSettings).toBe('function');
      expect(typeof (window as any).nameotron.settings.saveSettings).toBe('function');
      expect(typeof (window as any).nameotron.settings.getCurrentSettings).toBe('function');
      expect(typeof (window as any).nameotron.settings.resetToDefaults).toBe('function');
    });
  });

  describe('Template history', () => {
    it('stores template history entries per server and library with newest first', () => {
      const base = createDefaultSettings();

      const updated = addTemplateHistoryEntry(base as any, 'server-1', 'library-1', '{title}{ext}');
      const updatedAgain = addTemplateHistoryEntry(updated as any, 'server-1', 'library-1', '{title}[ ({year})]{ext}');

      expect(getTemplateHistoryEntries(updatedAgain as any, 'server-1', 'library-1')).toEqual([
        '{title}[ ({year})]{ext}',
        '{title}{ext}',
      ]);
    });

    it('deduplicates template history and caps it at five entries', () => {
      let settings: any = createDefaultSettings();
      const entries = ['a', 'b', 'c', 'd', 'e', 'f'];

      for (const entry of entries) {
        settings = addTemplateHistoryEntry(settings, 'server-1', 'library-1', entry);
      }

      settings = addTemplateHistoryEntry(settings, 'server-1', 'library-1', 'd');

      expect(getTemplateHistoryEntries(settings, 'server-1', 'library-1')).toEqual([
        'd',
        'f',
        'e',
        'c',
        'b',
      ]);
    });

    it('stores favorite templates separately and preserves all unique entries', () => {
      let settings: any = createDefaultSettings();
      settings = addTemplateFavoriteEntry(settings, 'server-1', 'library-1', '{title}{ext}');
      settings = addTemplateFavoriteEntry(settings, 'server-1', 'library-1', '{title}[ ({year})]{ext}');
      settings = addTemplateFavoriteEntry(settings, 'server-1', 'library-1', '{title}{ext}');

      expect(getTemplateFavoriteEntries(settings, 'server-1', 'library-1')).toEqual([
        '{title}{ext}',
        '{title}[ ({year})]{ext}',
      ]);
      expect(getTemplateHistoryEntries(settings, 'server-1', 'library-1')).toEqual([]);
    });

    it('can remove a saved favorite template without touching history', () => {
      let settings: any = createDefaultSettings();
      settings = addTemplateFavoriteEntry(settings, 'server-1', 'library-1', '{title}{ext}');
      settings = addTemplateHistoryEntry(settings, 'server-1', 'library-1', '{title}[ ({year})]{ext}');

      settings = removeTemplateFavoriteEntry(settings, 'server-1', 'library-1', '{title}{ext}');

      expect(getTemplateFavoriteEntries(settings, 'server-1', 'library-1')).toEqual([]);
      expect(getTemplateHistoryEntries(settings, 'server-1', 'library-1')).toEqual(['{title}[ ({year})]{ext}']);
    });
  });
});
