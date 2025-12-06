# Technical Architecture

This document provides detailed technical information about the system architecture and design of Name-o-Tron 9000.

## System Architecture

### Application Structure
```
Name-o-Tron 9000/
├── Frontend (React/TypeScript)
│   ├── Pages (Container/Presentational Pattern):
│   │   ├── Home/ (HomeContainer.tsx + HomeTemplate.tsx)
│   │   ├── LibrarySelection/ (LibrarySelectionContainer.tsx + LibrarySelectionTemplate.tsx)
│   │   ├── ShowSelection/ (ShowSelectionContainer.tsx + ShowSelectionTemplate.tsx)
│   │   ├── Preview/ (PreviewContainer.tsx + PreviewTemplate.tsx)
│   │   └── Settings/ (SettingsContainer.tsx + SettingsTemplate.tsx)
│   ├── Components: Reusable UI elements, modals, and interactive widgets
│   └── State Management: Settings persistence and UI state
├── Backend (Rust/Tauri)
│   ├── Core Modules:
│   │   ├── plex_api.rs - Plex server communication and metadata fetching
│   │   ├── video_rename.rs - Filesystem operations and rename logic
│   │   ├── path_map.rs - Cross-platform path resolution
│   │   ├── settings.rs - Configuration management
│   │   ├── secure.rs - Credential storage and encryption
│   │   └── subtitle.rs - Subtitle detection and processing
│   └── IPC Commands: Tauri command bindings for frontend communication
└── Storage & Logs
    └── OS-specific application data directories
```

### Technology Stack
- **Frontend Framework**: React 18+ with TypeScript for type safety
- **UI Library**: Custom components with Tailwind CSS for styling
- **Backend Runtime**: Rust with Tauri framework for cross-platform desktop apps
- **Build System**: Vite for frontend bundling, Cargo for Rust compilation
- **IPC Layer**: Tauri's command system for secure frontend-backend communication
- **Component Architecture**: Container/Presentational pattern for separation of concerns

### Component Architecture: Container/Presentational Pattern

The frontend uses a **Container/Presentational** component pattern to achieve better separation of concerns:

#### Container Components (`*Container.tsx`)
- **Purpose**: Handle all business logic, state management, and side effects
- **Responsibilities**:
  - State management (useState, useEffect, useMemo)
  - API calls and data fetching
  - Event handlers and user interactions
  - Business logic and data transformations
  - Pass processed data as props to Template components

#### Presentational Components (`*Template.tsx`)
- **Purpose**: Pure UI rendering with no business logic
- **Responsibilities**:
  - Receive data and event handlers as props only
  - Render JSX based on props
  - No hooks, state, or side effects
  - Pure functions for better testability and reusability

#### Benefits of This Pattern
- **Separation of Concerns**: Logic vs presentation clearly separated
- **Testability**: Templates are pure functions, easy to unit test
- **Reusability**: Templates can be reused with different data sources
- **Maintainability**: Changes to logic don't affect presentation and vice versa
- **Performance**: Better optimization opportunities with React.memo

## Project Structure Deep Dive

### Frontend (`src/`)
```
src/
├── components/          # Reusable UI components
│   ├── icons.tsx       # SVG icon definitions
│   ├── Select.tsx      # Custom dropdown component
│   ├── Radio.tsx       # Custom radio button groups
│   └── PlexPopoverCard.tsx # Metadata hover cards
├── pages/              # Main application screens (Container/Presentational Pattern)
│   ├── Home/           # Server discovery and authentication
│   │   ├── HomeContainer.tsx    # State management, hooks, business logic
│   │   └── HomeTemplate.tsx     # Pure presentational component (JSX only)
│   ├── LibrarySelection/        # Library browsing
│   │   ├── LibrarySelectionContainer.tsx    # State management, hooks, business logic
│   │   └── LibrarySelectionTemplate.tsx     # Pure presentational component (JSX only)
│   ├── ShowSelection/  # TV show selection
│   │   ├── ShowSelectionContainer.tsx       # State management, hooks, business logic
│   │   └── ShowSelectionTemplate.tsx        # Pure presentational component (JSX only)
│   ├── Preview/        # Rename preview and execution
│   │   ├── PreviewContainer.tsx             # State management, hooks, business logic
│   │   ├── PreviewTemplate.tsx              # Pure presentational component (JSX only)
│   │   ├── types.ts    # TypeScript type definitions
│   │   ├── constants.ts # Preview-related constants
│   │   ├── utils.ts     # Preview utility functions
│   │   ├── movieProposal.ts     # Movie rename proposal logic
│   │   ├── episodeProposal.ts   # TV episode rename proposal logic
│   │   └── musicProposal.ts     # Music track rename proposal logic
│   └── Settings/       # Configuration management
│       ├── SettingsContainer.tsx           # State management, hooks, business logic
│       ├── SettingsTemplate.tsx            # Pure presentational component (JSX only)
│       ├── types.ts    # Settings-related type definitions
│       ├── General.tsx  # General settings tab component
│       ├── Movies.tsx   # Movie settings tab component
│       ├── TV.tsx       # TV settings tab component
│       ├── Music.tsx    # Music settings tab component
│       └── Misc.tsx     # Miscellaneous settings tab component
├── state/              # Application state management
│   ├── settings.tsx    # Settings persistence and defaults
│   └── theme.tsx       # Theme management
├── types/              # TypeScript type definitions
│   └── plex.ts         # Plex API data structures
└── utils/              # Utility functions
    └── template.ts     # Template rendering engine
```

### Backend (`src-tauri/src/`)
```
src-tauri/src/
├── lib.rs              # Tauri application setup and command registration
├── main.rs             # Application entry point
├── plex_api.rs         # Plex server communication (1200+ lines)
│   ├── Server discovery via SSDP multicast
│   ├── PIN authentication flow
│   ├── Metadata fetching with XML/JSON parsing
│   └── Search functionality with fallback handling
├── video_rename.rs     # Filesystem operations and rename engine
│   ├── Preview generation with safety checks
│   ├── Atomic rename operations
│   ├── Rollback logging system
│   └── Subtitle processing integration
├── path_map.rs         # Cross-platform path resolution
│   ├── Longest-prefix matching algorithm
│   ├── Case-insensitive path handling
│   └── Validation and testing utilities
├── settings.rs         # Configuration persistence
│   ├── Deep merge functionality
│   ├── OS-specific storage paths
│   └── Import/export capabilities
├── secure.rs           # Credential management
│   ├── OS keyring integration
│   ├── Token encryption/decryption
│   └── Secure storage abstraction
└── subtitle.rs         # Subtitle file handling
    ├── Detection and classification
    ├── Encoding conversion (UTF-8)
    └── Rollback support
```

## Data Storage & Persistence

### OS-Specific Paths

#### Settings Storage
- **Windows**: `%APPDATA%\name-o-tron-9000\settings.json`
- **macOS**: `~/Library/Application Support/name-o-tron-9000/settings.json`
- **Linux**: `~/.config/name-o-tron-9000/settings.json`

#### Log Storage
- **Windows**: `%LOCALAPPDATA%\name-o-tron-9000\logs\`
- **macOS**: `~/Library/Logs/name-o-tron-9000/`
- **Linux**: `~/.cache/name-o-tron-9000/logs/`

#### Cache Storage
- **Windows**: `%LOCALAPPDATA%\name-o-tron-9000\cache\`
- **macOS**: `~/Library/Caches/name-o-tron-9000/`
- **Linux**: `~/.cache/name-o-tron-9000/`

**Cache Subdirectories:**
- `thumbnails/`: Cached poster images for TV shows and movies
- `show-mappings/`: TV show mapping status and metadata cache (per server/library)

### Data Formats

#### Settings File (`settings.json`)
```json
{
  "general": {
    "preview": true,
    "logging": true,
    "encoding": {
      "mode": "unicode",
      "highlightNonLatin": true
    }
  },
  "movies": {
    "collections": {
      "enabled": true,
      "mode": "always"
    }
  },
  "templates": {
    "movie": "{title}[ ({year})]{ext}",
    "tv": "{showTitle} - S{season:02}E{episode:02} - {title}{ext}"
  }
}
```

#### Rollback Log (`rollback_*.json`)
```json
[
  {
    "operation_type": "rename",
    "original_path": "/path/to/Inception.1080p.mkv",
    "new_path": "/path/to/Inception (2010).mkv",
    "backup_path": null,
    "status": "success",
    "timestamp": "2025-01-01T12:00:00Z"
  },
  {
    "operation_type": "subtitle_rename",
    "original_path": "/path/to/Inception.eng.srt",
    "new_path": "/path/to/Inception (2010).eng.srt",
    "encoding": "utf-8",
    "status": "success"
  }
]
```

## Network & Security

### Network Communication

#### Plex Server Communication
- **Discovery**: SSDP multicast on UDP 32410, 32412-32414 (local network only)
- **API Calls**: HTTP/HTTPS on port 32400 (Plex Web UI port)
- **Protocol Fallback**: Attempts both HTTP and HTTPS variants
- **Certificate Handling**: Accepts self-signed certificates for local servers

#### Security Measures
- **Token Storage**: Encrypted in OS credential store via `keyring` crate
- **No Data Transmission**: File operations only affect local filesystem
- **Secure Defaults**: All security-sensitive settings use safe defaults

### Error Handling

#### Error Types
- **Network Errors**: Connection failures, timeouts, DNS resolution
- **Authentication Errors**: Invalid tokens, expired sessions
- **Permission Errors**: Insufficient filesystem permissions
- **Validation Errors**: Invalid paths, malformed data
- **Operation Errors**: Filesystem operation failures

#### Error Recovery
- **Automatic Retry**: Transient network errors retried up to 3 times
- **Graceful Degradation**: Missing metadata handled with fallbacks
- **User Feedback**: Detailed error messages with suggested solutions

## Performance Characteristics

### Memory Usage
- **Base Application**: ~50MB RAM
- **Large Libraries**: Additional 100-500MB for preview data
- **Image Caching**: Thumbnail cache grows with usage (managed automatically)
- **TV Show Caching**: Show mapping cache reduces repeated API calls for mapping status

### Network Performance
- **Plex API**: Optimized with connection reuse and HTTP/2
- **Image Fetching**: Cached locally to reduce repeated requests
- **Search**: Debounced requests (500ms) to avoid API spam
- **Show Metadata Caching**: Reduces API calls when browsing TV show libraries

### Filesystem Performance
- **Batch Operations**: Processed in configurable batch sizes
- **Atomic Operations**: Prefer rename over copy+delete when possible
- **Progress Reporting**: Real-time feedback for long operations

## Advanced Configuration

### Environment Variables

#### Development
```bash
# Enable debug logging
DEBUG=1 npm run dev

# Use specific Plex server for testing
PLEX_SERVER=http://localhost:32400 npm run dev

# Disable SSL verification for testing
PLEX_INSECURE=1 npm run dev
```

#### Production
```bash
# Custom config directory
NAMEOTRON_CONFIG_DIR=/custom/path npm start

# Custom log directory
NAMEOTRON_LOG_DIR=/custom/logs npm start
```

### Debug Mode

#### Enabling Debug Features
1. **Development**: Set `DEBUG=true` in environment
2. **Production**: Enable via Settings > Advanced > Debug Mode

#### Debug Information Available
- **Network Requests**: Full request/response logging
- **Path Resolution**: Detailed mapping resolution steps
- **Template Processing**: Step-by-step template rendering
- **File Operations**: Detailed filesystem operation logs

## Troubleshooting Advanced Issues

### Performance Issues

#### Memory Leaks
**Symptoms**: App becomes slow or unresponsive over time
**Diagnosis**: Monitor memory usage in OS task manager
**Solutions**:
1. Restart the application
2. Check for large log files in cache directory
3. Verify system has sufficient RAM for library size

#### Network Timeouts
**Symptoms**: Operations fail with timeout errors
**Diagnosis**: Check network connectivity and Plex server status
**Solutions**:
1. Verify Plex server is responsive in web browser
2. Check firewall settings for required ports
3. Test with different network connection

#### Filesystem Issues
**Symptoms**: Permission errors or failed operations
**Diagnosis**: Check file permissions and disk space
**Solutions**:
1. Ensure app has read/write access to media directories
2. Check available disk space on all relevant drives
3. Verify no antivirus software is interfering

### Integration Issues

#### Plex Server Compatibility
- **Supported Versions**: Plex Media Server 1.25.0+
- **API Compatibility**: Uses standard Plex API endpoints
- **Authentication**: Supports both Plex account and local auth

#### NAS/SAN Compatibility
- **Supported Protocols**: SMB, NFS, local filesystems
- **Mount Requirements**: Consistent mounting across reboots
- **Permission Model**: App runs with user's file permissions

For developer-focused information, see the [AGENTS.md](../AGENTS.md) file in the repository root. For user-focused guidance, refer to the main [user guide](index.md).
