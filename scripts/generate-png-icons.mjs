import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  const toCrc = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createPng(width, height, renderPixel) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Scanlines with filter byte 0
  const rowLen = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowLen);

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowLen;
    rawData[rowStart] = 0; // filter None
    for (let x = 0; x < width; x++) {
      const idx = rowStart + 1 + x * 4;
      const [r, g, b, a] = renderPixel(x, y, width, height);
      rawData[idx] = r;
      rawData[idx + 1] = g;
      rawData[idx + 2] = b;
      rawData[idx + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Draw ArenaMate icon:
// Background: #0f172a (dark slate)
// Rounded corner background or full-bleed for maskable
// Center: emerald racket head + yellow padel ball
function renderIcon(x, y, w, h, isMaskable) {
  const nx = x / w; // 0 to 1
  const ny = y / h; // 0 to 1

  // Base background
  let r = 15, g = 23, b = 42, a = 255; // #0f172a

  if (!isMaskable) {
    // Rounded rect mask
    const cornerRadius = 0.22;
    let dx = 0, dy = 0;
    if (nx < cornerRadius) dx = cornerRadius - nx;
    else if (nx > 1 - cornerRadius) dx = nx - (1 - cornerRadius);
    if (ny < cornerRadius) dy = cornerRadius - ny;
    else if (ny > 1 - cornerRadius) dy = ny - (1 - cornerRadius);

    if (dx > 0 && dy > 0) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > cornerRadius) {
        return [0, 0, 0, 0]; // transparent
      }
    }
  }

  // Subtle emerald gradient at top
  const grad = Math.max(0, 1 - Math.hypot(nx - 0.5, ny - 0.35) * 1.6);
  r = Math.min(255, Math.round(r + 6 * grad));
  g = Math.min(255, Math.round(g + 78 * grad));
  b = Math.min(255, Math.round(b + 59 * grad));

  // Padel Racket Head (Ellipse at cx=0.5, cy=0.42, rx=0.22, ry=0.25)
  const cx = 0.5;
  const cy = 0.42;
  const rx = isMaskable ? 0.18 : 0.21;
  const ry = isMaskable ? 0.21 : 0.24;

  const ex = (nx - cx) / rx;
  const ey = (ny - cy) / ry;
  const distEllipse = ex * ex + ey * ey;

  // Racket outer border (emerald glow)
  if (distEllipse <= 1.0 && distEllipse >= 0.72) {
    // Emerald racket rim (#34d399 / #059669)
    const rimGrad = (nx + ny) * 0.5;
    return [Math.round(5 + 47 * rimGrad), Math.round(150 + 61 * rimGrad), Math.round(105 + 48 * rimGrad), 255];
  }

  // Racket face inside
  if (distEllipse < 0.72) {
    // Dark carbon fiber face
    r = 24; g = 36; b = 58;
    // Perforated hole pattern
    const holeRadius = 0.013;
    const cols = [-0.10, -0.05, 0.0, 0.05, 0.10];
    const rows = [-0.12, -0.06, 0.0, 0.06, 0.12];

    for (const hc of cols) {
      for (const hr of rows) {
        const hx = cx + hc;
        const hy = cy + hr;
        const hd = Math.hypot(nx - hx, ny - hy);
        if (hd < holeRadius) {
          // Emerald perforated dot
          return [52, 211, 153, 255];
        }
      }
    }
    return [r, g, b, 255];
  }

  // Racket Bridge / Throat
  if (nx >= 0.44 && nx <= 0.56 && ny >= 0.62 && ny <= 0.71) {
    return [5, 150, 105, 255]; // #059669
  }

  // Racket Handle
  if (nx >= 0.465 && nx <= 0.535 && ny >= 0.70 && ny <= 0.88) {
    // Handle grip with diagonal tape pattern
    const stripe = (Math.round((nx * w + ny * h) / 12) % 2 === 0);
    if (stripe) {
      return [30, 41, 59, 255]; // slate-800
    } else {
      return [51, 65, 85, 255]; // slate-700
    }
  }

  // Padel Ball (Yellow neon with curved seam)
  const bx = isMaskable ? 0.68 : 0.70;
  const by = isMaskable ? 0.25 : 0.22;
  const br = isMaskable ? 0.075 : 0.085;
  const bDist = Math.hypot(nx - bx, ny - by);

  if (bDist <= br) {
    // Neon padel ball (#facc15 / #eab308)
    // White seam
    const seamDist = Math.abs(Math.hypot(nx - (bx - 0.03), ny - by) - br * 0.7);
    if (seamDist < 0.007 && bDist <= br - 0.005) {
      return [255, 255, 255, 240];
    }
    return [234, 179, 8, 255];
  }

  return [r, g, b, a];
}

const outDir = path.resolve('public');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Generate files:
// 1. 192x192
fs.writeFileSync(
  path.join(outDir, 'pwa-192x192.png'),
  createPng(192, 192, (x, y, w, h) => renderIcon(x, y, w, h, false))
);
console.log('Created pwa-192x192.png');

// 2. 512x512
fs.writeFileSync(
  path.join(outDir, 'pwa-512x512.png'),
  createPng(512, 512, (x, y, w, h) => renderIcon(x, y, w, h, false))
);
console.log('Created pwa-512x512.png');

// 3. 512x512 maskable (safe-zone padded, full bleed background)
fs.writeFileSync(
  path.join(outDir, 'pwa-maskable-512x512.png'),
  createPng(512, 512, (x, y, w, h) => renderIcon(x, y, w, h, true))
);
console.log('Created pwa-maskable-512x512.png');

// 4. apple-touch-icon (180x180)
fs.writeFileSync(
  path.join(outDir, 'apple-touch-icon.png'),
  createPng(180, 180, (x, y, w, h) => renderIcon(x, y, w, h, false))
);
console.log('Created apple-touch-icon.png');
