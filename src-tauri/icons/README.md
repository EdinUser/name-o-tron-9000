# Icons

This directory contains the application icons for Name-o-Tron 9000.

## Source SVG

The source SVG file is `name-o-tron-9000.svg` - a custom robot icon featuring:
- Robot head with a single glowing green eye
- Antenna ears
- A smiling face
- "9000" identification plate at the bottom
- Optional CRT glow effect filter for BIOS-style green text
- Extended viewBox (256x280) for better proportions

## Generated Icons

PNG icons are automatically generated from the SVG using the `scripts/generate-icons.js` script:

- `32x32.png` - Small icon for Windows taskbar, etc.
- `128x128.png` - Standard icon size
- `128x128@2x.png` - High-DPI version (256x256)
- `icon.png` - Base high-resolution icon (512x512)

## Platform-Specific Icons

- `icon.ico` - Windows icon format (currently uses existing file)
- `icon.icns` - macOS icon format (currently uses existing file)

## Usage

### Development
The SVG icon is available in the frontend at `/name-o-tron-9000.svg` for web use.

### Building
To regenerate PNG icons from the SVG source:
```bash
npm run tauri:icons
```

### Platform Icons (ICO/ICNS)
For Windows ICO and macOS ICNS files:
1. Use online converters like [favicon.io](https://favicon.io) or [realfavicongenerator.net](https://realfavicongenerator.net)
2. Or use ImageMagick: `convert icon.png icon.ico`
3. Or use macOS iconutil for ICNS format

### Icon Customization
- Edit `src-tauri/icons/name-o-tron-9000.svg` to change the design
- For BIOS-style green glow effect, uncomment the second `<text>` element and comment out the first one
- Run `npm run tauri:icons` to generate updated PNG files

## Tauri Configuration

The `tauri.conf.json` references these icon files for bundling across platforms.
