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
Object.defineProperty(globalThis, 'URL', {
  value: class URL {
    href: string;
    constructor(url: string) {
      this.href = url;
    }
    toString() { return this.href; }
    static createObjectURL() { return 'mocked-url'; }
    static revokeObjectURL() {}
  },
  writable: true,
});

Object.defineProperty(globalThis, 'URLSearchParams', {
  value: class URLSearchParams {
    private params: Record<string, string> = {};
    constructor(init?: string | URLSearchParams | Record<string, string>) {
      if (typeof init === 'string') {
        // Simple implementation for testing
      }
    }
    toString() { return ''; }
    get(name: string) { return this.params[name] || null; }
    set(name: string, value: string) { this.params[name] = value; }
    has(name: string) { return name in this.params; }
    append(name: string, value: string) { this.params[name] = value; }
    delete(name: string) { delete this.params[name]; }
    forEach(callback: (value: string, key: string) => void) {
      Object.entries(this.params).forEach(([key, value]) => callback(value, key));
    }
    *entries() {
      yield* Object.entries(this.params);
    }
    *keys() {
      yield* Object.keys(this.params);
    }
    *values() {
      yield* Object.values(this.params);
    }
    get size() { return Object.keys(this.params).length; }
    sort() { /* no-op for testing */ }
  },
  writable: true,
});

// Mock other web globals that might be needed
Object.defineProperty(globalThis, 'Blob', {
  value: class Blob {
    constructor(_parts?: any[], _options?: { type?: string }) {}
    size = 0;
    type = '';
    arrayBuffer() { return Promise.resolve(new ArrayBuffer(0)); }
    slice() { return new Blob(); }
    stream() { return new ReadableStream(); }
    text() { return Promise.resolve(''); }
  },
  writable: true,
});

Object.defineProperty(globalThis, 'File', {
  value: class File extends Blob {
    name: string;
    lastModified: number;
    constructor(_parts: any[], filename: string, _options?: { type?: string; lastModified?: number }) {
      super(_parts, _options);
      this.name = filename;
      this.lastModified = _options?.lastModified || Date.now();
    }
  },
  writable: true,
});

// Mock DOM globals that might be needed
Object.defineProperty(globalThis, 'Document', {
  value: class Document {
    createElement() { return {}; }
    createTextNode() { return {}; }
    getElementById() { return null; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
  },
  writable: true,
});

Object.defineProperty(globalThis, 'Element', {
  value: class Element {
    tagName = '';
    children = [];
    getAttribute() { return null; }
    setAttribute() {}
    appendChild() { return this; }
    removeChild() { return this; }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
  },
  writable: true,
});

Object.defineProperty(globalThis, 'Node', {
  value: class Node {
    nodeType = 1;
    nodeName = '';
    textContent = '';
    parentNode = null;
    appendChild() { return this; }
    removeChild() { return this; }
    cloneNode() { return new Node(); }
  },
  writable: true,
});

// Mock window globals
Object.defineProperty(globalThis, 'window', {
  value: globalThis,
  writable: true,
});

Object.defineProperty(globalThis, 'self', {
  value: globalThis,
  writable: true,
});

Object.defineProperty(globalThis, 'scrollTo', {
  value: vi.fn(),
  writable: true,
});

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
