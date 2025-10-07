import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import PathMappingModal from '../PathMappingModal'

// Mock the invoke function
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// Mock the dialog plugin
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}))

describe('PathMappingModal', () => {
  const mockOnClose = vi.fn()
  const mockOnSaved = vi.fn()

  const defaultProps = {
    serverId: 'test-server-id',
    libraries: [
      {
        key: 'movies',
        title: 'Movies',
        type: 'movie',
        roots: ['/media/Movies']
      },
      {
        key: 'tv',
        title: 'TV Shows',
        type: 'show',
        roots: ['/media/TV Shows']
      }
    ],
    onClose: mockOnClose,
    onSaved: mockOnSaved
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders modal with library titles and folders', async () => {
    vi.mocked(invoke).mockResolvedValue({ pathMappings: [] })

    render(<PathMappingModal {...defaultProps} />)

    expect(screen.getByText('Map Plex Paths')).toBeInTheDocument()
    expect(screen.getByText('Movies (movie)')).toBeInTheDocument()
    expect(screen.getByText('TV Shows (show)')).toBeInTheDocument()
    expect(screen.getByText('/media/Movies')).toBeInTheDocument()
    expect(screen.getByText('/media/TV Shows')).toBeInTheDocument()
  })

  it('displays Pick buttons for each plex folder', async () => {
    vi.mocked(invoke).mockResolvedValue({ pathMappings: [] })

    render(<PathMappingModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getAllByText('Pick…')).toHaveLength(2) // One for each folder
    })
  })

  it('loads existing path mappings on mount', async () => {
    const existingMappings = [
      {
        server_id: 'test-server-id',
        plex_root: '/media/Movies',
        local_root: '/mnt/movies',
        platform: 'windows'
      }
    ]

    vi.mocked(invoke).mockResolvedValue({ pathMappings: existingMappings })

    render(<PathMappingModal {...defaultProps} />)

    await waitFor(() => {
      const input = screen.getByDisplayValue('/mnt/movies')
      expect(input).toBeInTheDocument()
    })
  })

  it('handles local path input changes', async () => {
    const user = userEvent.setup()
    vi.mocked(invoke).mockResolvedValue({ pathMappings: [] })

    render(<PathMappingModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('/media/Movies')).toBeInTheDocument()
    })

    const input = screen.getAllByPlaceholderText('e.g., Z:\\\\Series or /mnt/nas/Series')[0]
    await user.clear(input)
    await user.type(input, '/mnt/movies')

    expect(input).toHaveValue('/mnt/movies')
  })

  it('opens file dialog when Pick button is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(invoke).mockResolvedValue({ pathMappings: [] })
    vi.mocked(open).mockResolvedValue('/selected/path')

    render(<PathMappingModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getAllByText('Pick…')).toHaveLength(2)
    })

    // Click the first Pick button (for /media/Movies)
    await user.click(screen.getAllByText('Pick…')[0])

    expect(open).toHaveBeenCalledWith({ multiple: false, directory: true })
  })

  it('updates input when file dialog returns a path', async () => {
    const user = userEvent.setup()
    vi.mocked(invoke).mockResolvedValue({ pathMappings: [] })
    vi.mocked(open).mockResolvedValue('/selected/path')

    render(<PathMappingModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getAllByText('Pick…')).toHaveLength(2)
    })

    // Click the first Pick button (for /media/Movies)
    await user.click(screen.getAllByText('Pick…')[0])

    await waitFor(() => {
      // Find the input for the Movies row
      const movieRow = screen.getByText('/media/Movies').closest('tr')
      const input = movieRow?.querySelector('input')
      expect(input).toHaveValue('/selected/path')
    })
  })

  it('tests path mapping when Test button is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === 'get_settings') {
        return Promise.resolve({ pathMappings: [] })
      }
      if (command === 'test_mapping') {
        return Promise.resolve({
          ok: true,
          exists: true,
          writable: true,
          details: 'Path is accessible'
        })
      }
      return Promise.resolve([])
    })

    render(<PathMappingModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getAllByText('Test')).toHaveLength(4) // 2 library headers + 2 test buttons
    })

    // First enter a path
    const input = screen.getAllByPlaceholderText('e.g., Z:\\\\Series or /mnt/nas/Series')[0]
    await user.type(input, '/test/path')

    // Then test it - need to be more specific since there are multiple "Test" texts
    const testButtons = screen.getAllByRole('button', { name: 'Test' })
    await user.click(testButtons[0]) // Click the first Test button

    await waitFor(() => {
      expect(screen.getByText('OK')).toBeInTheDocument()
    })
  })

  it('displays error status for inaccessible paths', async () => {
    const user = userEvent.setup()
    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === 'get_settings') {
        return Promise.resolve({ pathMappings: [] })
      }
      if (command === 'test_mapping') {
        return Promise.resolve({
          ok: false,
          exists: false,
          writable: false,
          details: 'Path does not exist'
        })
      }
      return Promise.resolve([])
    })

    render(<PathMappingModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getAllByText('Test')).toHaveLength(4) // 2 library headers + 2 test buttons
    })

    // Enter a path and test it
    const input = screen.getAllByPlaceholderText('e.g., Z:\\\\Series or /mnt/nas/Series')[0]
    await user.type(input, '/nonexistent/path')

    const testButtons = screen.getAllByRole('button', { name: 'Test' })
    await user.click(testButtons[0]) // Click the first Test button

    await waitFor(() => {
      expect(screen.getByText('Missing')).toBeInTheDocument()
    })
  })

  it('saves path mappings when Save button is clicked', async () => {
    const user = userEvent.setup()

    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === 'get_settings') {
        return Promise.resolve({ pathMappings: [] })
      }
      if (command === 'save_settings') {
        return Promise.resolve()
      }
      return Promise.resolve([])
    })

    render(<PathMappingModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument()
    })

    // Enter a path
    const input = screen.getAllByPlaceholderText('e.g., Z:\\\\Series or /mnt/nas/Series')[0]
    await user.type(input, '/mnt/movies')

    // Save the mapping
    await user.click(screen.getByText('Save'))

    expect(invoke).toHaveBeenCalledWith('save_settings', {
      settings: {
        pathMappings: [
          {
            server_id: 'test-server-id',
            plex_root: '/media/Movies',
            local_root: '/mnt/movies',
            platform: undefined
          }
        ]
      }
    })

    expect(mockOnSaved).toHaveBeenCalled()
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('filters out empty paths when saving', async () => {
    const user = userEvent.setup()

    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === 'get_settings') {
        return Promise.resolve({ pathMappings: [] })
      }
      if (command === 'save_settings') {
        return Promise.resolve()
      }
      return Promise.resolve([])
    })

    render(<PathMappingModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument()
    })

    // Leave one path empty, enter path for the other
    const inputs = screen.getAllByPlaceholderText('e.g., Z:\\\\Series or /mnt/nas/Series')
    await user.type(inputs[0], '/mnt/movies')
    // Leave inputs[1] empty

    await user.click(screen.getByText('Save'))

    expect(invoke).toHaveBeenCalledWith('save_settings', {
      settings: {
        pathMappings: [
          {
            server_id: 'test-server-id',
            plex_root: '/media/Movies',
            local_root: '/mnt/movies',
            platform: undefined
          }
        ]
      }
    })
  })

  it('handles save errors gracefully', async () => {
    const user = userEvent.setup()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === 'get_settings') {
        return Promise.resolve({ pathMappings: [] })
      }
      if (command === 'save_settings') {
        return Promise.reject(new Error('Save failed'))
      }
      return Promise.resolve([])
    })

    render(<PathMappingModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument()
    })

    const input = screen.getAllByPlaceholderText('e.g., Z:\\\\Series or /mnt/nas/Series')[0]
    await user.type(input, '/mnt/movies')

    await user.click(screen.getByText('Save'))

    expect(consoleSpy).toHaveBeenCalledWith('save error', expect.any(Error))

    consoleSpy.mockRestore()
  })

  it('closes modal when Close button is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(invoke).mockResolvedValue({ pathMappings: [] })

    render(<PathMappingModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Close')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Close'))
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('shows no libraries message when libraries is empty', async () => {
    vi.mocked(invoke).mockResolvedValue({ pathMappings: [] })

    render(<PathMappingModal {...defaultProps} libraries={[]} />)

    expect(screen.getByText('No libraries found. Try reloading libraries or ensure the Plex token is valid.')).toBeInTheDocument()
  })

  it('handles manual path entry via prompt fallback', async () => {
    const user = userEvent.setup()
    vi.mocked(invoke).mockResolvedValue({ pathMappings: [] })
    vi.mocked(open).mockRejectedValue(new Error('Dialog not available'))

    // Mock window.prompt
    const mockPrompt = vi.fn().mockReturnValue('/manual/path')
    Object.defineProperty(window, 'prompt', { value: mockPrompt })

    render(<PathMappingModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getAllByText('Pick…')).toHaveLength(2)
    })

    // Click the first Pick button (for /media/Movies)
    await user.click(screen.getAllByText('Pick…')[0])

    expect(mockPrompt).toHaveBeenCalledWith(
      'Enter local folder path for:\n/media/Movies',
      ''
    )

    await waitFor(() => {
      // Find the input for the Movies row
      const movieRow = screen.getByText('/media/Movies').closest('tr')
      const input = movieRow?.querySelector('input')
      expect(input).toHaveValue('/manual/path')
    })
  })

  it('handles prompt cancellation', async () => {
    const user = userEvent.setup()
    vi.mocked(invoke).mockResolvedValue({ pathMappings: [] })
    vi.mocked(open).mockRejectedValue(new Error('Dialog not available'))

    // Mock window.prompt to return null (cancelled)
    const mockPrompt = vi.fn().mockReturnValue(null)
    Object.defineProperty(window, 'prompt', { value: mockPrompt })

    render(<PathMappingModal {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getAllByText('Pick…')).toHaveLength(2)
    })

    // Click the first Pick button (for /media/Movies)
    await user.click(screen.getAllByText('Pick…')[0])

    expect(mockPrompt).toHaveBeenCalled()

    // Input should remain empty
    const movieRow = screen.getByText('/media/Movies').closest('tr')
    const input = movieRow?.querySelector('input')
    expect(input).toHaveValue('')
  })
})
