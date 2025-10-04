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

// Mock web globals that jsdom needs for webidl-conversions and whatwg-url
Object.defineProperty(global, 'URL', {
  value: class URL {
    constructor(url: string) {
      return { href: url, toString: () => url }
    }
    static createObjectURL() { return 'mocked-url' }
    static revokeObjectURL() {}
  },
  writable: true,
})

Object.defineProperty(global, 'URLSearchParams', {
  value: class URLSearchParams {
    constructor() { return { toString: () => '' } }
  },
  writable: true,
})

// Mock other web globals that might be needed
Object.defineProperty(global, 'Blob', {
  value: class Blob {
    constructor() {}
  },
  writable: true,
})

Object.defineProperty(global, 'File', {
  value: class File {
    constructor() {}
  },
  writable: true,
})

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
