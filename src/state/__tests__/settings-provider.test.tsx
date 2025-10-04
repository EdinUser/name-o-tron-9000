import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { SettingsProvider, useSettings } from '../settings';
import { setupLocalStorageMock, resetLocalStorageMock } from './test-utils/settings-setup';

setupLocalStorageMock();

describe('SettingsProvider and useSettings hook', () => {
  beforeEach(() => {
    resetLocalStorageMock();
  });

  it('should throw error when used outside provider', () => {
    expect(() => {
      renderHook(() => useSettings());
    }).toThrow('useSettings must be used within a SettingsProvider');
  });

  it('should provide settings and update function', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SettingsProvider>{children}</SettingsProvider>
    );

    const { result } = renderHook(() => useSettings(), { wrapper });

    expect(result.current.settings).toBeDefined();
    expect(result.current.updateSettings).toBeInstanceOf(Function);
    expect(result.current.settingsVersion).toBeGreaterThanOrEqual(0);
  });

  it('should update settings when updateSettings is called', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SettingsProvider>{children}</SettingsProvider>
    );

    const { result } = renderHook(() => useSettings(), { wrapper });

    const originalVersion = result.current.settingsVersion;

    act(() => {
      const newSettings = {
        ...result.current.settings,
        general: {
          ...result.current.settings.general,
          theme: 'light' as const,
        },
      };
      result.current.updateSettings(newSettings);
    });

    expect(result.current.settings.general.theme).toBe('light');
    expect(result.current.settingsVersion).toBeGreaterThan(originalVersion);
  });

  it('should handle Tauri backend integration', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as any).mockResolvedValue({
      ui: {
        general: {
          theme: 'light',
        },
      },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SettingsProvider>{children}</SettingsProvider>
    );

    const { result } = renderHook(() => useSettings(), { wrapper });

    // Wait for the useEffect to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Should merge Tauri settings with local settings
    expect(result.current.settings.general.theme).toBe('light');
  });

  it('should handle Tauri backend errors gracefully', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as any).mockRejectedValue(new Error('Tauri error'));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SettingsProvider>{children}</SettingsProvider>
    );

    const { result } = renderHook(() => useSettings(), { wrapper });

    // Should not throw and use localStorage settings
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.settings).toBeDefined();
    expect(result.current.settings.general.theme).toBe('dark'); // Default value
  });

  it('should handle settings persistence across updates', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SettingsProvider>{children}</SettingsProvider>
    );

    const { result } = renderHook(() => useSettings(), { wrapper });

    // Initial render
    expect(result.current.settings.general.theme).toBe('dark');

    // Update settings
    act(() => {
      result.current.updateSettings({
        ...result.current.settings,
        general: { ...result.current.settings.general, theme: 'light' as const }
      });
    });

    // Should have updated theme
    expect(result.current.settings.general.theme).toBe('light');

    // Version should have incremented
    expect(result.current.settingsVersion).toBe(1);
  });
});
