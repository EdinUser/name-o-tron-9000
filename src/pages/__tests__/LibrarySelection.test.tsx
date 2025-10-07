import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { invoke } from '@tauri-apps/api/core'
import LibrarySelectionContainer from '../LibrarySelection/LibrarySelectionContainer'
import { renderWithProviders } from '../../test/setup'
import type { PlexServer, PlexLibrary } from '../../types/plex'

// Mock the invoke function
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// Mock the window object for goto functions
Object.defineProperty(window, '__goto_home', {
  value: vi.fn(),
  writable: true,
})

Object.defineProperty(window, '__goto_settings', {
  value: vi.fn(),
  writable: true,
})

const mockLibraries: PlexLibrary[] = [
  {
    key: '1',
    type: 'movie',
    title: 'Movies',
    roots: ['/media/Movies']
  },
  {
    key: '2',
    type: 'show',
    title: 'TV Shows',
    roots: ['/media/TV Shows', '/media/TV Shows 2']
  },
  {
    key: '3',
    type: 'artist',
    title: 'Music',
    roots: ['/media/Music']
  }
]

const mockServer: PlexServer = {
  name: 'Test Plex Server',
  address: 'http://localhost:32400',
  machineIdentifier: 'test-server-id',
  owned: true
}

describe('LibrarySelectionContainer', () => {
  const mockOnBack = vi.fn()
  const mockOnSelectLibrary = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state initially', async () => {
    // Mock a delayed response
    vi.mocked(invoke).mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve([]), 100))
    )

    renderWithProviders(
      <LibrarySelectionContainer
        server={mockServer}
        onBack={mockOnBack}
        onSelectLibrary={mockOnSelectLibrary}
      />
    )

    expect(screen.getByText('Loading libraries…')).toBeInTheDocument()
  })

  it('displays libraries after loading', async () => {
    const testLibraries = [
      {
        key: '1',
        type: 'movie',
        title: 'Movies',
        roots: ['/media/Movies']
      },
      {
        key: '2',
        type: 'show',
        title: 'TV Shows',
        roots: ['/media/TV Shows']
      }
    ]

    // Mock both list_libraries and get_settings
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === 'list_libraries') {
        return Promise.resolve(testLibraries)
      }
      if (command === 'get_settings') {
        return Promise.resolve({ pathMappings: [] })
      }
      return Promise.resolve([])
    })

    renderWithProviders(
      <LibrarySelectionContainer
        server={mockServer}
        onBack={mockOnBack}
        onSelectLibrary={mockOnSelectLibrary}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Movies')).toBeInTheDocument()
      expect(screen.getByText('TV Shows')).toBeInTheDocument()
    })

    expect(screen.getByText('movie — Section 1 — 1 root(s)')).toBeInTheDocument()
    expect(screen.getByText('show — Section 2 — 1 root(s)')).toBeInTheDocument()
  })

  it('displays server information in header', async () => {
    vi.mocked(invoke).mockResolvedValue([])

    renderWithProviders(
      <LibrarySelectionContainer
        server={mockServer}
        onBack={mockOnBack}
        onSelectLibrary={mockOnSelectLibrary}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Server: Test Plex Server (http://localhost:32400)')).toBeInTheDocument()
    })
  })

  it('handles library selection', async () => {
    const user = userEvent.setup()

    // Mock both list_libraries and get_settings to set up a mapping for Movies
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === 'list_libraries') {
        return Promise.resolve(mockLibraries)
      }
      if (command === 'get_settings') {
        return Promise.resolve({
          pathMappings: [
            {
              server_id: 'test-server-id',
              plex_root: '/media/Movies',
              local_root: '/mnt/movies'
            }
          ]
        })
      }
      return Promise.resolve([])
    })

    renderWithProviders(
      <LibrarySelectionContainer
        server={mockServer}
        onBack={mockOnBack}
        onSelectLibrary={mockOnSelectLibrary}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Movies')).toBeInTheDocument()
    })

    // Click the Open button for Movies library
    // Find the Movies library card and then find the Open button within it
    const moviesLibraryCard = screen.getByText('Movies').closest('li')
    const openButton = moviesLibraryCard?.querySelector('button')
    expect(openButton).toBeInTheDocument()
    expect(openButton?.textContent?.trim()).toBe('Open')
    if (openButton) {
      await user.click(openButton)
    }

    expect(mockOnSelectLibrary).toHaveBeenCalledWith(mockLibraries[0])
  })

  it('displays mapping status for libraries', async () => {
    // Mock both list_libraries and get_settings
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === 'list_libraries') {
        return Promise.resolve(mockLibraries)
      }
      if (command === 'get_settings') {
        return Promise.resolve({
          pathMappings: [
            {
              server_id: 'test-server-id',
              plex_root: '/media/Movies',
              local_root: '/mnt/movies'
            }
          ]
        })
      }
      return Promise.resolve([])
    })

    renderWithProviders(
      <LibrarySelectionContainer
        server={mockServer}
        onBack={mockOnBack}
        onSelectLibrary={mockOnSelectLibrary}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Mapped')).toBeInTheDocument()
      expect(screen.getAllByText('Needs Mapping')).toHaveLength(2) // TV Shows and Music
    })
  })

  it('shows error state when loading fails', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('Network error'))

    renderWithProviders(
      <LibrarySelectionContainer
        server={mockServer}
        onBack={mockOnBack}
        onSelectLibrary={mockOnSelectLibrary}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Error: Network error')).toBeInTheDocument()
    })
  })

  it('opens path mapping modal when Map Paths is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(invoke).mockResolvedValue([])

    renderWithProviders(
      <LibrarySelectionContainer
        server={mockServer}
        onBack={mockOnBack}
        onSelectLibrary={mockOnSelectLibrary}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Map Paths')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Map Paths'))

    // Modal should open (PathMappingModal component should be rendered)
    await waitFor(() => {
      expect(screen.getByText('Map Plex Paths')).toBeInTheDocument()
    })
  })

  it('disables Open button for unmapped libraries', async () => {
    vi.mocked(invoke).mockResolvedValue(mockLibraries)

    renderWithProviders(
      <LibrarySelectionContainer
        server={mockServer}
        onBack={mockOnBack}
        onSelectLibrary={mockOnSelectLibrary}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Movies')).toBeInTheDocument()
    })

    // All Open buttons should be disabled since no mappings are set up
    const openButtons = screen.getAllByRole('button', { name: /open/i })
    expect(openButtons[0]).toBeDisabled()
    expect(openButtons[1]).toBeDisabled()
    expect(openButtons[2]).toBeDisabled()
  })

  it('calls onBack when Back button is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(invoke).mockResolvedValue([])

    renderWithProviders(
      <LibrarySelectionContainer
        server={mockServer}
        onBack={mockOnBack}
        onSelectLibrary={mockOnSelectLibrary}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Back')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Back'))
    expect(mockOnBack).toHaveBeenCalled()
  })

  it('displays correct root count for libraries', async () => {
    vi.mocked(invoke).mockResolvedValue(mockLibraries)

    renderWithProviders(
      <LibrarySelectionContainer
        server={mockServer}
        onBack={mockOnBack}
        onSelectLibrary={mockOnSelectLibrary}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('movie — Section 1 — 1 root(s)')).toBeInTheDocument() // Movies
      expect(screen.getByText('show — Section 2 — 2 root(s)')).toBeInTheDocument() // TV Shows
    })
  })
})
