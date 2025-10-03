#!/usr/bin/env node

import sharp from 'sharp';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCE_SVG = join(__dirname, '../src-tauri/icons/name-o-tron-9000.svg');
const OUTPUT_DIR = join(__dirname, '../src-tauri/icons');

// Icon sizes needed for Tauri
const ICON_SIZES = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: 'icon.png', size: 512 } // Base icon for better quality
];

async function generateIcons() {
  try {
    console.log('🎨 Generating icons from SVG...');

    // Read the SVG file
    const svgBuffer = await readFile(SOURCE_SVG);

    // Generate PNG icons for each size
    for (const { name, size } of ICON_SIZES) {
      const outputPath = join(OUTPUT_DIR, name);

      await sharp(svgBuffer)
        .resize(size, size)
        .png({
          quality: 100,
          palette: false  // Force RGBA instead of paletted PNG
        })
        .toFile(outputPath);

      console.log(`✅ Generated ${name} (${size}x${size})`);
    }

    // For ICO and ICNS generation, you can use:
    // - Online converters: favicon.io, realfavicongenerator.net
    // - ImageMagick: convert icon.png icon.ico
    // - macOS: iconutil -c icns icon.iconset/

    console.log('\n💡 Tip: For ICO/ICNS generation from the PNG files:');
    console.log('- Online: Use favicon.io or realfavicongenerator.net');
    console.log('- ImageMagick: convert src-tauri/icons/icon.png src-tauri/icons/icon.ico');
    console.log('- macOS: Create icon.iconset folder with multiple sizes, then: iconutil -c icns icon.iconset');
    console.log('\n🚀 You can now run: npm run tauri build');

  } catch (error) {
    console.error('❌ Error generating icons:', error.message);
    process.exit(1);
  }
}

generateIcons();
