import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, '..');
const androidRes = path.join(frontend, 'android', 'app', 'src', 'main', 'res');
const source = path.join(frontend, 'public', 'noble-media-icon.svg');
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

await fs.access(source);
const svg = await fs.readFile(source);
for (const [density, size] of Object.entries(sizes)) {
  const dir = path.join(androidRes, `mipmap-${density}`);
  await fs.mkdir(dir, { recursive: true });
  for (const name of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground']) {
    await sharp(svg).resize(size, size, { fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 0 } })
      .png().toFile(path.join(dir, `${name}.png`));
  }
}
const adaptiveDir = path.join(androidRes, 'mipmap-anydpi-v26');
await fs.mkdir(adaptiveDir, { recursive: true });
const adaptive = name => `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/noble_media_icon_background" />\n    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n</adaptive-icon>\n`;
await fs.writeFile(path.join(adaptiveDir, 'ic_launcher.xml'), adaptive('ic_launcher'));
await fs.writeFile(path.join(adaptiveDir, 'ic_launcher_round.xml'), adaptive('ic_launcher_round'));
const valuesDir = path.join(androidRes, 'values');
await fs.mkdir(valuesDir, { recursive: true });
await fs.writeFile(path.join(valuesDir, 'noble_media_icon.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="noble_media_icon_background">#0F172A</color></resources>\n`);
console.log('Launcher icon Noble Media berhasil dibuat di frontend/android/app/src/main/res.');
