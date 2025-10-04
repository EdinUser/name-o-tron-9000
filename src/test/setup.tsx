import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { render } from '@testing-library/react'
import { SettingsProvider } from '../state/settings'
import { ThemeProvider } from '../state/theme'
import type { ReactNode } from 'react'

// Mock Tauri API calls for testing
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    setTitle: vi.fn(),
  })),
}))

// Mock Tauri plugin dialog
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}))

// Test wrapper with providers
export function renderWithProviders(component: ReactNode) {
  return render(
    <SettingsProvider>
      <ThemeProvider>
        {component}
      </ThemeProvider>
    </SettingsProvider>
  )
}
