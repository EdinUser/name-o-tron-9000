import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getManualFix,
  addOrUpdateManualFix,
  removeManualFix,
  cleanupOldManualFixes
} from '../settings';
import { createDefaultSettings } from './test-utils/settings-setup';

describe('Manual Fixes Management', () => {
  const baseSettings = createDefaultSettings();

  describe('getManualFix', () => {
    it('should return undefined when no fix exists for rating key', () => {
      const fix = getManualFix(baseSettings, 'nonexistent-key');
      expect(fix).toBeUndefined();
    });

    it('should return the correct fix when it exists', () => {
      const manualFix = {
        ratingKey: 'test-key',
        mediaType: 'movie' as const,
        overrides: { title: 'Custom Title' },
        createdAt: Date.now(),
      };

      const settingsWithFix = {
        ...baseSettings,
        manualFixes: [manualFix],
      };

      const fix = getManualFix(settingsWithFix, 'test-key');
      expect(fix).toEqual(manualFix);
    });
  });

  describe('addOrUpdateManualFix', () => {
    it('should add a new fix when none exists', () => {
      const newFix = {
        ratingKey: 'new-key',
        mediaType: 'movie' as const,
        overrides: { title: 'New Title' },
        createdAt: 1234567890,
      };

      const updatedSettings = addOrUpdateManualFix(baseSettings, newFix);

      expect(updatedSettings.manualFixes).toHaveLength(1);
      expect(updatedSettings.manualFixes[0]).toEqual({
        ...newFix,
        createdAt: expect.any(Number), // Should be updated to current time
      });
    });

    it('should update an existing fix', () => {
      const existingFix = {
        ratingKey: 'existing-key',
        mediaType: 'movie' as const,
        overrides: { title: 'Original Title' },
        createdAt: 1234567890,
      };

      const settingsWithFix = {
        ...baseSettings,
        manualFixes: [existingFix],
      };

      const updatedFix = {
        ratingKey: 'existing-key',
        mediaType: 'movie' as const,
        overrides: { title: 'Updated Title', year: 2023 },
        createdAt: 1234567890, // This should be updated
      };

      const updatedSettings = addOrUpdateManualFix(settingsWithFix, updatedFix);

      expect(updatedSettings.manualFixes).toHaveLength(1);
      expect(updatedSettings.manualFixes[0].overrides.title).toBe('Updated Title');
      expect(updatedSettings.manualFixes[0].overrides.year).toBe(2023);
      expect(updatedSettings.manualFixes[0].createdAt).not.toBe(1234567890);
    });
  });

  describe('removeManualFix', () => {
    it('should remove the specified fix', () => {
      const fix1 = {
        ratingKey: 'key1',
        mediaType: 'movie' as const,
        overrides: { title: 'Title 1' },
        createdAt: Date.now(),
      };

      const fix2 = {
        ratingKey: 'key2',
        mediaType: 'movie' as const,
        overrides: { title: 'Title 2' },
        createdAt: Date.now(),
      };

      const settingsWithFixes = {
        ...baseSettings,
        manualFixes: [fix1, fix2],
      };

      const updatedSettings = removeManualFix(settingsWithFixes, 'key1');

      expect(updatedSettings.manualFixes).toHaveLength(1);
      expect(updatedSettings.manualFixes[0].ratingKey).toBe('key2');
    });

    it('should not modify settings when fix does not exist', () => {
      const fix = {
        ratingKey: 'key1',
        mediaType: 'movie' as const,
        overrides: { title: 'Title 1' },
        createdAt: Date.now(),
      };

      const settingsWithFix = {
        ...baseSettings,
        manualFixes: [fix],
      };

      const updatedSettings = removeManualFix(settingsWithFix, 'nonexistent-key');

      expect(updatedSettings.manualFixes).toHaveLength(1);
      expect(updatedSettings.manualFixes[0].ratingKey).toBe('key1');
    });
  });

  describe('cleanupOldManualFixes', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should remove fixes older than 90 days', () => {
      const now = Date.now();
      const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);
      const ninetyOneDaysAgo = now - (91 * 24 * 60 * 60 * 1000);

      const oldFix = {
        ratingKey: 'old-key',
        mediaType: 'movie' as const,
        overrides: { title: 'Old Title' },
        createdAt: ninetyOneDaysAgo,
      };

      const recentFix = {
        ratingKey: 'recent-key',
        mediaType: 'movie' as const,
        overrides: { title: 'Recent Title' },
        createdAt: ninetyDaysAgo + 1000, // Just after the threshold
      };

      const settingsWithFixes = {
        ...baseSettings,
        manualFixes: [oldFix, recentFix],
      };

      const cleanedSettings = cleanupOldManualFixes(settingsWithFixes);

      expect(cleanedSettings.manualFixes).toHaveLength(1);
      expect(cleanedSettings.manualFixes[0].ratingKey).toBe('recent-key');
    });

    it('should preserve all fixes when none are old', () => {
      const now = Date.now();
      const recentTime = now - (30 * 24 * 60 * 60 * 1000); // 30 days ago

      const fix1 = {
        ratingKey: 'key1',
        mediaType: 'movie' as const,
        overrides: { title: 'Title 1' },
        createdAt: recentTime,
      };

      const fix2 = {
        ratingKey: 'key2',
        mediaType: 'movie' as const,
        overrides: { title: 'Title 2' },
        createdAt: recentTime + 1000,
      };

      const settingsWithFixes = {
        ...baseSettings,
        manualFixes: [fix1, fix2],
      };

      const cleanedSettings = cleanupOldManualFixes(settingsWithFixes);

      expect(cleanedSettings.manualFixes).toHaveLength(2);
    });
  });
});
