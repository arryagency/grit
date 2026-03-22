const sharp = require('sharp');
const path = require('path');

const inputPath = path.join(__dirname, '../assets/images/musculature.png');
const outputPath = path.join(__dirname, '../assets/images/musculature-transparent.png');

sharp(inputPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })
  .then(({ data, info }) => {
    const { width, height, channels } = info;
    for (let i = 0; i < width * height; i++) {
      const r = data[i * channels];
      const g = data[i * channels + 1];
      const b = data[i * channels + 2];
      if (r < 40 && g < 40 && b < 40) {
        data[i * channels + 3] = 0;
      }
    }
    return sharp(Buffer.from(data), { raw: { width, height, channels } })
      .png()
      .toFile(outputPath);
  })
  .then(() => console.log('Done — musculature-transparent.png saved'))
  .catch(console.error);
