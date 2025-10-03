import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Tauri API calls for testing
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
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
