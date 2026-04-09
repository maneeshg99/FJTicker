const fs = require('fs');

// Generate a 256x256 ICO with "FJ" text
const size = 256;
const pixels = Buffer.alloc(size * size * 4);

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const fy = size - 1 - y; // bottom-up for ICO BMP
    const idx = (fy * size + x) * 4;

    // Rounded rect check
    const m = 8;
    const r = 24;
    const inRect = x >= m && x < size - m && y >= m && y < size - m;
    const inCornerZone = (
      (x < m + r && y < m + r) ||
      (x < m + r && y >= size - m - r) ||
      (x >= size - m - r && y < m + r) ||
      (x >= size - m - r && y >= size - m - r)
    );

    let inRounded = inRect;
    if (inCornerZone) {
      // Check circular corners
      let cx, cy;
      if (x < m + r && y < m + r) { cx = m + r; cy = m + r; }
      else if (x < m + r && y >= size - m - r) { cx = m + r; cy = size - m - r; }
      else if (x >= size - m - r && y < m + r) { cx = size - m - r; cy = m + r; }
      else { cx = size - m - r; cy = size - m - r; }
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      inRounded = dist <= r;
    }

    if (inRounded) {
      // Dark navy background
      pixels[idx] = 26;      // B
      pixels[idx + 1] = 14;  // G
      pixels[idx + 2] = 10;  // R
      pixels[idx + 3] = 255;

      // Scale letter positions to 256
      const s = size / 32;

      // F: cols 6-13, rows 7-24 (scaled)
      const inF = (
        (x >= 6*s && x <= 13*s && y >= 7*s && y <= 9.5*s) ||
        (x >= 6*s && x <= 8.5*s && y >= 7*s && y <= 24*s) ||
        (x >= 6*s && x <= 12*s && y >= 14*s && y <= 16.5*s)
      );

      // J: cols 16-25, rows 7-24 (scaled)
      const inJ = (
        (x >= 16*s && x <= 25*s && y >= 7*s && y <= 9.5*s) ||
        (x >= 20*s && x <= 22.5*s && y >= 7*s && y <= 22*s) ||
        (x >= 16*s && x <= 22.5*s && y >= 22*s && y <= 24*s) ||
        (x >= 16*s && x <= 18.5*s && y >= 19*s && y <= 24*s)
      );

      if (inF || inJ) {
        pixels[idx] = 0;       // B
        pixels[idx + 1] = 165; // G
        pixels[idx + 2] = 255; // R -> orange
        pixels[idx + 3] = 255;
      }
    } else {
      pixels[idx] = 0; pixels[idx + 1] = 0; pixels[idx + 2] = 0; pixels[idx + 3] = 0;
    }
  }
}

// Use PNG format inside ICO for 256x256 (required by Windows)
// Build a minimal PNG
function buildPNG(width, height, rgbaBuffer) {
  const { deflateSync } = require('zlib');

  // Convert BGRA bottom-up to RGBA top-down for PNG
  const rawRows = [];
  for (let y = height - 1; y >= 0; y--) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const di = 1 + x * 4;
      row[di] = rgbaBuffer[si + 2];     // R
      row[di + 1] = rgbaBuffer[si + 1]; // G
      row[di + 2] = rgbaBuffer[si];     // B
      row[di + 3] = rgbaBuffer[si + 3]; // A
    }
    rawRows.push(row);
  }

  const rawData = Buffer.concat(rawRows);
  const compressed = deflateSync(rawData);

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    const table = [];
    for (let n = 0; n < 256; n++) {
      let v = n;
      for (let k = 0; k < 8; k++) v = v & 1 ? 0xEDB88320 ^ (v >>> 1) : v >>> 1;
      table[n] = v;
    }
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([len, typeAndData, crc]);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const pngData = buildPNG(size, size, pixels);

// ICO with PNG entry
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);

const dir = Buffer.alloc(16);
dir[0] = 0; // 256 encoded as 0
dir[1] = 0;
dir[2] = 0;
dir[3] = 0;
dir.writeUInt16LE(1, 4);
dir.writeUInt16LE(32, 6);
dir.writeUInt32LE(pngData.length, 8);
dir.writeUInt32LE(22, 12); // offset = 6 + 16

const ico = Buffer.concat([header, dir, pngData]);
fs.writeFileSync('build/icon.ico', ico);
console.log('Icon created: build/icon.ico (' + ico.length + ' bytes, 256x256 PNG)');

// Also save the PNG directly for macOS (electron-builder converts to .icns)
fs.writeFileSync('build/icon.png', pngData);
console.log('Icon created: build/icon.png (' + pngData.length + ' bytes, 256x256 PNG)');

// ── macOS tray template icons ──
// Template images must be named *Template.png and use only black + alpha
// macOS will auto-invert for dark mode
function buildTrayTemplate(traySize) {
  const trayPixels = Buffer.alloc(traySize * traySize * 4);
  const s = traySize / 32;

  for (let y = 0; y < traySize; y++) {
    for (let x = 0; x < traySize; x++) {
      const fy = traySize - 1 - y; // bottom-up for buildPNG conversion
      const idx = (fy * traySize + x) * 4;

      // F: cols 2-13, rows 4-28
      const inF = (
        (x >= 2*s && x <= 13*s && y >= 4*s && y <= 7*s) ||
        (x >= 2*s && x <= 5*s && y >= 4*s && y <= 28*s) ||
        (x >= 2*s && x <= 11*s && y >= 14*s && y <= 17*s)
      );

      // J: cols 16-29, rows 4-28
      const inJ = (
        (x >= 16*s && x <= 29*s && y >= 4*s && y <= 7*s) ||
        (x >= 22*s && x <= 25*s && y >= 4*s && y <= 25*s) ||
        (x >= 16*s && x <= 25*s && y >= 25*s && y <= 28*s) ||
        (x >= 16*s && x <= 19*s && y >= 21*s && y <= 28*s)
      );

      if (inF || inJ) {
        // Black with full alpha (template image)
        trayPixels[idx] = 0;       // B
        trayPixels[idx + 1] = 0;   // G
        trayPixels[idx + 2] = 0;   // R
        trayPixels[idx + 3] = 255; // A
      } else {
        trayPixels[idx] = 0;
        trayPixels[idx + 1] = 0;
        trayPixels[idx + 2] = 0;
        trayPixels[idx + 3] = 0;
      }
    }
  }

  return buildPNG(traySize, traySize, trayPixels);
}

const tray16 = buildTrayTemplate(16);
fs.writeFileSync('build/trayTemplate.png', tray16);
console.log('Tray icon created: build/trayTemplate.png (16x16)');

const tray32 = buildTrayTemplate(32);
fs.writeFileSync('build/trayTemplate@2x.png', tray32);
console.log('Tray icon created: build/trayTemplate@2x.png (32x32)');
