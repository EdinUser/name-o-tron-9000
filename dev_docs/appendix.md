# Technical Appendix

This appendix provides an overview of the technical details for Name-o-Tron 9000. For detailed technical information, see the specialized appendix documents:

- **[Technical Architecture](appendix_architecture.md)** - System architecture, project structure, and performance characteristics
- **[Building from Source](appendix_build.md)** - Development environment, build instructions, and deployment
- **[API Reference & Configuration](appendix_api.md)** - Tauri IPC commands, settings schema, and configuration details

## Developer Documentation Map

**See Architecture for design** - Learn about the system architecture, project structure, and performance characteristics in [Technical Architecture](appendix_architecture.md).

**See Build for compiling** - Find development environment setup, build instructions, and deployment details in [Building from Source](appendix_build.md).

**See API for automation** - Discover Tauri IPC commands, settings schema, and configuration details in [API Reference & Configuration](appendix_api.md).

## Overview for Developers

Name-o-Tron 9000 is a cross-platform desktop application built with:

- **Frontend**: React 18+ with TypeScript, using Vite for bundling
- **Backend**: Rust with Tauri framework for cross-platform desktop deployment
- **Storage**: OS-specific application data directories for settings and logs
- **Communication**: Tauri's secure IPC system for frontend-backend communication

## Development Philosophy

- **Safety-first** - All changes must maintain rollback capabilities
- **User-focused** - Balance power-user features with safe defaults
- **Cross-platform** - Support Windows, macOS, and Linux equally
- **Comprehensive** - Update documentation when adding features

## Getting Started (Developers)

1. **Prerequisites**: Node.js 18+, Rust 1.70+, platform-specific build tools
2. **Clone**: `git clone <repository-url>`
3. **Setup**: `npm install`
4. **Develop**: `npm run mock:plex` (Terminal 1) + `npm run tauri dev` (Terminal 2)
5. **Build**: `npm run tauri build`

## Architecture Overview

The application follows a modern desktop app architecture:

- **Frontend**: React-based UI with custom components and state management
- **Backend**: Rust modules handling filesystem operations, Plex API communication, and security
- **IPC Layer**: Secure command-based communication between frontend and backend
- **Storage Layer**: OS-appropriate persistence for settings, logs, and cache

For detailed technical information, see the [Technical Architecture](appendix_architecture.md) document.
