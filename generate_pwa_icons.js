import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 1);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crcBuf]);
}

function generatePng(width, height, isMaskable = false) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = createChunk('IHDR', ihdr);

  const rawData = Buffer.alloc(height * (1 + width * 4));
  let pos = 0;

  const cx = width / 2;
  const cy = height / 2;
  const scale = width / 512;
  const safeRadius = isMaskable ? 160 * scale : 200 * scale;

  for (let y = 0; y < height; y++) {
    rawData[pos++] = 0;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let r = 7;
      let g = 13;
      let b = 29;
      let a = 255;

      const starSize = safeRadius;
      const inSquare1 = Math.abs(dx) <= starSize && Math.abs(dy) <= starSize;
      const rotX = (dx + dy) * 0.7071;
      const rotY = (dy - dx) * 0.7071;
      const inSquare2 = Math.abs(rotX) <= starSize && Math.abs(rotY) <= starSize;

      if (inSquare1 || inSquare2) {
        const rim = (starSize - Math.max(Math.abs(dx), Math.abs(dy))) < 12 * scale ||
                    (starSize - Math.max(Math.abs(rotX), Math.abs(rotY))) < 12 * scale;
        if (rim) {
          r = 140;
          g = 162;
          b = 255;
        } else {
          r = 20;
          g = 36;
          b = 75;
        }
      }

      if (dist <= 65 * scale) {
        r = 111;
        g = 211;
        b = 154;
      } else if (dist <= 75 * scale) {
        r = 140;
        g = 162;
        b = 255;
      }

      rawData[pos++] = r;
      rawData[pos++] = g;
      rawData[pos++] = b;
      rawData[pos++] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', deflated);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function generateScreenshot(width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = createChunk('IHDR', ihdr);
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let pos = 0;

  for (let y = 0; y < height; y++) {
    rawData[pos++] = 0;
    for (let x = 0; x < width; x++) {
      // Background: Deep dark navy #070D1D
      let r = 7;
      let g = 13;
      let b = 29;
      let a = 255;

      // Header Bar (top 60px)
      if (y < 60) {
        r = 14;
        g = 24;
        b = 52; // #0E1834
        if (y === 59) {
          r = 39;
          g = 50;
          b = 90;
        }
      }

      // App Card container in the center
      const cardMarginX = width > 800 ? 120 : 24;
      const cardMarginY = 90;
      if (x >= cardMarginX && x <= width - cardMarginX && y >= cardMarginY && y <= height - 80) {
        // Card Background: #121A33
        r = 18;
        g = 26;
        b = 51;

        // Card Border: #27325A
        if (x === cardMarginX || x === width - cardMarginX || y === cardMarginY || y === height - 80) {
          r = 39;
          g = 50;
          b = 90;
        }

        // Quran / Call Video split windows inside card
        const innerTop = cardMarginY + 50;
        const innerBottom = height - 120;
        const innerLeft = cardMarginX + 30;
        const innerRight = width - cardMarginX - 30;

        if (x >= innerLeft && x <= innerRight && y >= innerTop && y <= innerBottom) {
          // Left video box / Right video box
          const split = (innerLeft + innerRight) / 2;
          if (Math.abs(x - split) > 8) {
            r = 10;
            g = 16;
            b = 36; // #0A1024 video box

            // Accent indicator inside box (simulating mic or camera status)
            if (y > innerBottom - 25 && y < innerBottom - 8) {
              r = 27;
              g = 122;
              b = 62; // green status dot
            }
          }
        }
      }

      rawData[pos++] = r;
      rawData[pos++] = g;
      rawData[pos++] = b;
      rawData[pos++] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', deflated);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate PNGs
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), generatePng(192, 192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), generatePng(512, 512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), generatePng(512, 512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), generatePng(180, 180, false));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), generatePng(64, 64, false));

// Generate Screenshots for PWABuilder (100% audit pass)
fs.writeFileSync(path.join(publicDir, 'screenshot-desktop.png'), generateScreenshot(1280, 720));
fs.writeFileSync(path.join(publicDir, 'screenshot-mobile.png'), generateScreenshot(720, 1280));

console.log('PWA icons and screenshots successfully generated in /public!');
