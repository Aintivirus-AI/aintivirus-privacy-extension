/**
 * Icon Generator Script
 * 
 * Converts binary_john.jpg to properly sized PNG icons.
 * 
 * Usage:
 *   npm install sharp --save-dev
 *   node scripts/create-icons.js
 */

const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'public', 'icons');
const sourceImage = path.join(dir, 'binary_john.jpg');

async function createIcons() {
  // Check if sharp is available
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.log('Sharp not installed. Run: npm install sharp --save-dev');
    console.log('Then run this script again.');
    console.log('\nAlternatively, manually convert binary_john.jpg to:');
    console.log('  - icon16.png (16x16 pixels)');
    console.log('  - icon48.png (48x48 pixels)');
    console.log('  - icon128.png (128x128 pixels)');
    return;
  }

  if (!fs.existsSync(sourceImage)) {
    console.error('Source image not found:', sourceImage);
    return;
  }

  const sizes = [16, 48, 128];

  for (const size of sizes) {
    const outputPath = path.join(dir, `icon${size}.png`);
    await sharp(sourceImage)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toFile(outputPath);
    console.log(`Created icon${size}.png (${size}x${size})`);
  }

  console.log('\nIcons created successfully!');
  console.log('Rebuild the extension and reload it in Chrome.');
}

createIcons().catch(console.error);


