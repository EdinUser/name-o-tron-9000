# Building from Source

This document provides detailed instructions for building Name-o-Tron 9000 from source code.

## Development Environment

### Prerequisites
- **Node.js**: Version 18.0.0 or higher
- **Rust**: Version 1.70.0 or higher
- **System Dependencies**:
  - **Windows**: Microsoft Visual C++ Build Tools, WebView2 runtime
  - **macOS**: Xcode Command Line Tools (install via `xcode-select --install`)
  - **Linux**: `build-essential`, `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`

### Development Setup

#### 1. Clone and Initialize
```bash
git clone <repository-url>
cd name-o-tron-9000
npm install
```

#### 2. Development Servers

[mock_server.png]

```bash
# Terminal 1: Mock Plex server for testing
npm run mock:reset
npm run mock:start
npm run mock:verify

# Terminal 2: Main application
npm run tauri dev
```

#### 3. Available Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run tauri build` - Build cross-platform packages
- `npm run bundle:linux` - Build Linux AppImage, `.deb`, and `.rpm` installers locally
- `npm run mock:plex` - Start the mock Plex server in the foreground for manual work
- `npm run mock:start` - Start the mock Plex server in the background and wait for HTTP readiness
- `npm run mock:stop` - Stop a harness-started mock Plex server or clear external/stale state
- `npm run mock:reset` - Rebuild the tracked local `./test_media` tree and sample path mappings
- `npm run mock:verify` - Verify the tracked mock server endpoints and generated media tree
- `npm test` - Run the frontend Vitest suite once
- `npm run test:watch` - Run Vitest in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:types` - Run TypeScript compiler checks
- `npm run test:rust` - Run Rust tests from the root via `src-tauri/Cargo.toml`
- `npm run test:mock:http` - Reset mock media, start the tracked HTTP mock server, verify endpoints/files, then stop the server
- `npm run test:all` - Run TypeScript, Vitest, Rust, and mock HTTP verification tests from the repo root
- `cargo test --manifest-path src-tauri/Cargo.toml --test mock_plex_harness_tests` - Run mock-backed rename integration tests

### Building from Source

#### Prerequisites
- **Node.js**: Version 18.0.0 or higher
- **Rust**: Version 1.70.0 or higher
- **System Dependencies**:
  - **Windows**: Microsoft Visual C++ Build Tools, WebView2 runtime
  - **macOS**: Xcode Command Line Tools (install via `xcode-select --install`)
  - **Linux**: `build-essential`, `pkg-config`, `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libjavascriptcoregtk-4.1-dev`, `libsoup-3.0-dev`, `libglib2.0-dev`, `libpango1.0-dev`, `libatk1.0-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`

#### Build Steps
1. **Clone and setup**:
   ```bash
   git clone <repository-url>
   cd name-o-tron-9000
   npm install
   ```

2. **Development with mock server**:
   ```bash
   npm run mock:reset  # Rebuild local media/reset mock state
   npm run mock:start  # Terminal A - starts mock Plex server in the background
   npm run mock:verify # Confirms endpoints and generated media are aligned
   npm run tauri dev   # Terminal B - starts the app
   ```

For manual debugging, `npm run mock:plex` still starts the mock server in the foreground. The harness commands tolerate an already-running manual server and stale PID state; use `npm run mock:status` when checking which mode is active.

3. **Production build**:

[build_process.png]

   ```bash
   npm run tauri build
   ```

4. **Local Linux installer build**:
   ```bash
   npm run bundle:linux
   ```
   This produces local `.AppImage`, `.deb`, and `.rpm` outputs under `src-tauri/target/release/bundle/` so release packaging can be smoke-tested before a GitHub Actions run.

#### Cross-Platform Builds
```bash
# Build for specific targets
npm run tauri build -- --target x86_64-pc-windows-msvc
npm run tauri build -- --target x86_64-apple-darwin
npm run tauri build -- --target x86_64-unknown-linux-gnu
```

#### Package Formats
- **Windows**: `.exe` installer, portable `.exe`
- **macOS**: `.dmg` disk image with app bundle
- **Linux**: AppImage (universal), `.deb` (Debian/Ubuntu), `.rpm` (Red Hat/Fedora)

## Build System & Deployment

### Build Configuration

#### Frontend Build (`vite.config.ts`)
```typescript
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'esnext'
  }
});
```

#### Backend Build (`src-tauri/Cargo.toml`)
```toml
[package]
name = "name-o-tron-9000"
version = "1.0.0"
edition = "2021"

[dependencies]
tauri = { version = "1.5", features = ["fs", "path", "window"] }
serde = { version = "1.0", features = ["derive"] }
reqwest = { version = "0.11", features = ["json", "rustls-tls"] }
# ... other dependencies
```

### Cross-Platform Builds

#### Development Build
```bash
npm run tauri dev
# Builds and runs the application in development mode

# With comprehensive testing
npm run mock:reset
npm run mock:start
npm run mock:verify
npm run tauri dev
```

#### Production Builds
```bash
# Build for current platform
npm run tauri build

# Build for specific targets
npm run tauri build -- --target x86_64-pc-windows-msvc
npm run tauri build -- --target x86_64-apple-darwin
npm run tauri build -- --target x86_64-unknown-linux-gnu
```

#### Package Formats
- **Windows**: `.exe` installer, portable `.exe`
- **macOS**: `.dmg` disk image with app bundle
- **Linux**: AppImage (universal), `.deb` (Debian/Ubuntu), `.rpm` (Red Hat/Fedora)

## Testing & Quality Assurance

### Test Infrastructure

#### Mock Plex Server
- **Location**: `tests/mock-plex/mock-plex-server.cjs`
- **Harness**: `tests/mock-plex/bin/mock-harness.mjs` provides background start/stop/status with HTTP readiness checks and stale-state handling
- **Data**: Tracked fixtures under `tests/mock-plex/fixtures/` plus generated local media under `./test_media`
- **Libraries**: Movies, TV Shows, Music with realistic metadata, multilingual Unicode titles, subtitle sidecars, and selectable TV pagination filler shows with episode leaves
- **Verify**: `npm run mock:verify` checks important Plex endpoints and confirms the generated media tree matches fixture expectations
- **Automated HTTP Test**: `npm run test:mock:http` wraps reset/start/verify/stop for use in `npm run test:all`

#### Automated Test Suites

##### Frontend Tests (Vitest)
Comprehensive React component and state management testing:
- **Location**: `src/**/__tests__/*.test.tsx`
- **Framework**: Vitest with React Testing Library
- **Coverage**: Settings management, manual fixes, hooks, error handling
- **Run**: `npm test`, `npm run test:watch`, or `npm run test:coverage`

##### Backend Tests (Rust)
Comprehensive Rust backend functionality testing:
- **Location**: `src-tauri/tests/*.rs`
- **Framework**: Built-in Rust testing with cargo
- **Coverage**: Settings persistence, deep merge, concurrency, integration
- **Run**: `npm run test:rust` or `cargo test --manifest-path src-tauri/Cargo.toml --test <test_name>`

##### Mock-Backed Rename Integration Tests
Plex-shaped fixture tests for rename behavior without driving the desktop UI:
- **Location**: `src-tauri/tests/mock_plex_harness_tests.rs`
- **Behavior**: Builds temporary media trees from mock Plex fixtures, then performs real filesystem rename/move/delete-backup operations and undo
- **Coverage**: Movie and TV rename proposals, settings/templates, path mappings, real filesystem apply, subtitle moves, cleanup-related artifacts, rollback logs, undo, collection/year folders, multilingual titles, and existing-target conflicts
- **Run**: `cargo test --manifest-path src-tauri/Cargo.toml --test mock_plex_harness_tests`

#### Test Categories
- **Unit Tests**: Individual function and component testing
- **Mock-Backed Integration Tests**: Rename workflows using Plex-shaped fixtures, generated media files, and real apply/undo operations
- **E2E Tests**: Complete user journey validation
- **Settings Tests**: Deep merge logic, persistence, error recovery

### Quality Gates

#### Code Quality
- **TypeScript**: Strict mode enabled, comprehensive type coverage
- **Rust**: Clippy lints, comprehensive error handling
- **Frontend**: ESLint with React and accessibility rules

#### Security
- **Dependency Scanning**: Automated vulnerability scanning
- **Code Review**: Required for all changes
- **Secrets Management**: No hardcoded credentials or secrets

## Deployment & Distribution

### Release Process

#### Version Management
- **Semantic Versioning**: MAJOR.MINOR.PATCH format
- **Integration Branch**: `develop` for ongoing work and feature integration
- **Protected Release Branch**: `main` for reviewed, releasable changes only
- **Tags**: `v*` tags cut from `main` for immutable release points

#### Distribution Channels
- **GitHub Releases**: Primary distribution channel with auto-update support
- **Package Managers**: Chocolatey (Windows), Homebrew (macOS), Snap/Flatpak (Linux)
- **Auto-Update**: Built-in updater for seamless upgrades

### Support & Maintenance

#### Log Collection
- **Error Reporting**: Automatic error log submission (opt-in)
- **Usage Analytics**: Anonymous usage statistics (opt-in)
- **Crash Reporting**: Detailed crash logs for debugging

#### Update Strategy
- **Patch Releases**: Bug fixes and security updates
- **Minor Releases**: New features and enhancements
- **Major Releases**: Breaking changes and major features

## Contributing to Development

### Development Workflow

#### Code Style Guidelines
- **Rust**: Follow official Rust style guide, use `rustfmt`
- **TypeScript**: ESLint configuration in `.eslintrc.js`
- **Commits**: Conventional commit format for automated releases

#### Branching Workflow
- **Feature Branches**: Branch from `develop` using `feat/*`, `fix/*`, or `chore/*`
- **Integration**: Merge feature branches into `develop` through pull requests
- **Release Promotion**: Merge `develop` into `main` only for release preparation
- **Protection**: Keep `main` locked behind reviews and CI checks in GitHub settings

#### Testing Requirements
- **New Features**: Must include unit tests
- **Bug Fixes**: Must include regression tests
- **UI Changes**: Must include accessibility testing

#### Documentation Requirements
- **Code Comments**: Document public APIs and complex logic
- **User Docs**: Update user-facing documentation for new features
- **Developer Docs**: Update `AGENTS.md` for significant changes

### Advanced Development Topics

#### Custom Build Configurations
- **Feature Flags**: Runtime feature toggles for testing
- **Build Variants**: Different builds for different use cases
- **Plugin Architecture**: Extension points for custom functionality

#### Performance Optimization
- **Bundle Splitting**: Code splitting for faster load times
- **Caching Strategy**: Intelligent caching for metadata and images
- **Lazy Loading**: On-demand loading of heavy components

For developer-focused information, see the [AGENTS.md](../AGENTS.md) file in the repository root. For user-focused guidance, refer to the main [user guide](index.md).
