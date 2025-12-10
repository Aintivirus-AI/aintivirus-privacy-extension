const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'public', 'icons');
const sourceImage = path.join(dir, 'ainti_l1.png');

async function createIcons() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    return;
  }

  if (!fs.existsSync(sourceImage)) {
    return;
  }

  const sizes = [16, 48, 128];

  for (const size of sizes) {
    const outputPath = path.join(dir, `icon${size}.png`);
    await sharp(sourceImage)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toFile(outputPath);
  }
}

createIcons().catch(console.error);