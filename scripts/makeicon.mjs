import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 256;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * (SIZE * 4 + 1)] = 0;
    pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function mix(a, b, amount) {
  return Math.round(a + (b - a) * amount);
}

function shade(x, y) {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const radius = SIZE * 0.47;
  const distance = Math.hypot(x - cx, y - cy);
  if (distance > radius) return [0, 0, 0, 0];

  const edge = Math.min(1, (radius - distance) / 3);
  const inner = distance / radius;

  let r = mix(38, 22, inner);
  let g = mix(48, 28, inner);
  let b = mix(84, 44, inner);

const ridges = [
    { peak: 0.62, height: 0.3, width: 0.42, tone: [61, 74, 116] },
    { peak: 0.44, height: 0.22, width: 0.3, tone: [43, 53, 87] },
    { peak: 0.74, height: 0.17, width: 0.26, tone: [27, 33, 56] },
  ];

  let surface = SIZE;
  let active = null;
  for (const ridge of ridges) {
    const centre = SIZE * ridge.peak;
    const spread = SIZE * ridge.width;
    const value = 1 - Math.abs(x - centre) / spread;
    if (value <= 0) continue;
    const line = SIZE * (0.44 - ridge.height * Math.pow(value, 0.75));
    if (line >= surface) continue;
    surface = line;
    active = ridge;
  }

  if (active && y < surface) {
    const depth = Math.min(1, (surface - y) / (SIZE * 0.28));
    const lit = Math.round(mix(30, 12, depth));
    r = active.tone[0] * (lit / 100) + r * 0.1;
    g = active.tone[1] * (lit / 100) + g * 0.1;
    b = active.tone[2] * (lit / 100) + b * 0.1;

    const cap = 1 - (surface - y) / (SIZE * 0.022);
    if (cap > 0.45) {
      const amount = (cap - 0.45) * 0.6;
      r = mix(r, 228, amount);
      g = mix(g, 234, amount);
      b = mix(b, 250, amount);
    }
  }

  const glow = Math.max(0, 1 - Math.hypot(x - SIZE * 0.5, y - SIZE * 0.24) / (SIZE * 0.5));
  r = Math.min(255, r + glow * 26);
  g = Math.min(255, g + glow * 34);
  b = Math.min(255, b + glow * 46);

  return [Math.round(r), Math.round(g), Math.round(b), Math.round(edge * 255)];
}

const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const [r, g, b, a] = shade(x + 0.5, y + 0.5);
    const offset = (y * SIZE + x) * 4;
    pixels[offset] = r;
    pixels[offset + 1] = g;
    pixels[offset + 2] = b;
    pixels[offset + 3] = a;
  }
}

const target = join(ROOT, 'build', 'icons');
mkdirSync(target, { recursive: true });
const file = join(target, 'icon.png');
writeFileSync(file, encodePng(pixels));

console.log(`wrote ${file.replace(ROOT, '.')}`);