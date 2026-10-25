import { el, clear } from './util.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { toast } from './toast.js';
import { openModal } from './modal.js';

const api = () => window.hinterland;

/* ------------------------------------------------------------- QR Matrix Engine */

const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d; // 285
  }
})();

function gfMul(x, y) {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
}

function rsCompute(data, ecCount) {
  let gen = [1];
  for (let i = 0; i < ecCount; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gfMul(gen[j], EXP_TABLE[i]);
      next[j + 1] ^= gen[j];
    }
    gen = next;
  }

  const res = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    res.copyWithin(0, 1);
    res[ecCount - 1] = 0;
    for (let j = 0; j < ecCount; j++) {
      res[j] ^= gfMul(gen[gen.length - 2 - j], factor);
    }
  }
  return res;
}

// [version, totalCodewords, ecCodewords, ecBlocksGroup1, dataCodewordsGroup1, ecBlocksGroup2, dataCodewordsGroup2]
const QR_SPECS_M = [
  [1, 26, 10, 1, 16, 0, 0],
  [2, 44, 16, 1, 28, 0, 0],
  [3, 70, 26, 1, 44, 0, 0],
  [4, 100, 36, 2, 32, 0, 0],
  [5, 134, 48, 2, 43, 0, 0],
  [6, 172, 64, 4, 27, 0, 0],
  [7, 196, 72, 2, 31, 4, 32],
  [8, 242, 88, 4, 38, 2, 39],
  [9, 292, 110, 3, 36, 2, 37],
  [10, 346, 130, 4, 43, 1, 44],
  [11, 404, 150, 1, 50, 4, 51],
  [12, 466, 176, 6, 36, 2, 37],
  [13, 532, 198, 8, 37, 4, 38],
  [14, 580, 216, 4, 40, 5, 41],
];

const ALIGNMENT_COORDS = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
];

const VERSION_INFOS = {
  7: 0x07c94,
  8: 0x085bc,
  9: 0x09a99,
  10: 0x0a4d3,
  11: 0x0bbf6,
  12: 0x0c762,
  13: 0x0d847,
  14: 0x0e60d,
};

function selectVersion(byteLength) {
  for (const spec of QR_SPECS_M) {
    const version = spec[0];
    const totalDataBytes = (spec[3] * spec[4]) + (spec[5] * spec[6]);
    const overheadBits = 4 + (version < 10 ? 8 : 16);
    const maxDataBytes = Math.floor((totalDataBytes * 8 - overheadBits) / 8);
    if (byteLength <= maxDataBytes) return { version, spec, totalDataBytes };
  }
  // If text is larger than V14, return V14 clamped
  const spec = QR_SPECS_M[QR_SPECS_M.length - 1];
  const totalDataBytes = (spec[3] * spec[4]) + (spec[5] * spec[6]);
  return { version: spec[0], spec, totalDataBytes };
}

class BitBuffer {
  constructor() {
    this.buffer = [];
    this.length = 0;
  }
  put(num, length) {
    for (let i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    }
  }
  putBit(bit) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) this.buffer.push(0);
    if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
    this.length++;
  }
}

function encodeData(text) {
  let utf8Bytes = new TextEncoder().encode(text);
  const { version, spec, totalDataBytes } = selectVersion(utf8Bytes.length);

  const overheadBits = 4 + (version < 10 ? 8 : 16);
  const maxBytes = Math.floor((totalDataBytes * 8 - overheadBits) / 8);
  if (utf8Bytes.length > maxBytes) {
    utf8Bytes = utf8Bytes.slice(0, maxBytes);
  }

  const bb = new BitBuffer();
  bb.put(4, 4); // Byte mode
  bb.put(utf8Bytes.length, version < 10 ? 8 : 16);
  for (const b of utf8Bytes) bb.put(b, 8);

  const totalDataBits = totalDataBytes * 8;
  const termBits = Math.min(4, totalDataBits - bb.length);
  if (termBits > 0) bb.put(0, termBits);

  while (bb.length % 8 !== 0) bb.putBit(false);

  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bb.buffer.length < totalDataBytes) {
    bb.buffer.push(padBytes[padIdx]);
    padIdx = (padIdx + 1) % 2;
  }

  const [, , totalEcCodewords, g1Blocks, g1Data, g2Blocks, g2Data] = spec;
  const numBlocks = g1Blocks + g2Blocks;
  const ecPerBlock = Math.floor(totalEcCodewords / numBlocks);

  const blocks = [];
  let offset = 0;
  for (let i = 0; i < g1Blocks; i++) {
    const dataSlice = bb.buffer.slice(offset, offset + g1Data);
    offset += g1Data;
    blocks.push({ data: dataSlice, ec: rsCompute(dataSlice, ecPerBlock) });
  }
  for (let i = 0; i < g2Blocks; i++) {
    const dataSlice = bb.buffer.slice(offset, offset + g2Data);
    offset += g2Data;
    blocks.push({ data: dataSlice, ec: rsCompute(dataSlice, ecPerBlock) });
  }

  const interleaved = [];
  const maxDataLen = Math.max(g1Data, g2Data);
  for (let j = 0; j < maxDataLen; j++) {
    for (let i = 0; i < numBlocks; i++) {
      if (j < blocks[i].data.length) interleaved.push(blocks[i].data[j]);
    }
  }
  for (let j = 0; j < ecPerBlock; j++) {
    for (let i = 0; i < numBlocks; i++) {
      interleaved.push(blocks[i].ec[j]);
    }
  }

  return { version, interleaved, size: 21 + (version - 1) * 4 };
}

function createMatrix(size) {
  const matrix = Array.from({ length: size }, () => new Array(size).fill(null));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  function setModule(r, c, val, isReserved = true) {
    matrix[r][c] = val;
    if (isReserved) reserved[r][c] = true;
  }

  function placeFinder(top, left) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = top + r;
        const col = left + c;
        if (row < 0 || row >= size || col < 0 || col >= size) continue;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          const isBlack = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          setModule(row, col, isBlack);
        } else {
          setModule(row, col, false);
        }
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  const version = Math.floor((size - 17) / 4);
  const coords = ALIGNMENT_COORDS[version] || [];
  for (const r of coords) {
    for (const c of coords) {
      if (reserved[r][c]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const isBlack = (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0));
          setModule(r + dr, c + dc, isBlack);
        }
      }
    }
  }

  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) setModule(6, i, i % 2 === 0);
    if (!reserved[i][6]) setModule(i, 6, i % 2 === 0);
  }

  setModule(size - 8, 8, true);

  for (let i = 0; i < 9; i++) {
    if (!reserved[8][i]) reserved[8][i] = true;
    if (!reserved[i][8]) reserved[i][8] = true;
  }
  for (let i = size - 8; i < size; i++) {
    if (!reserved[8][i]) reserved[8][i] = true;
    if (!reserved[i][8]) reserved[i][8] = true;
  }

  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        reserved[i][size - 11 + j] = true;
        reserved[size - 11 + j][i] = true;
      }
    }
  }

  return { matrix, reserved };
}

function placeData(matrix, reserved, dataBytes) {
  const size = matrix.length;
  let bitIndex = 0;
  const totalBits = dataBytes.length * 8;

  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--;
    const cols = [right, right - 1];

    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const c of cols) {
        if (!reserved[r][c]) {
          let bit = false;
          if (bitIndex < totalBits) {
            const byte = dataBytes[Math.floor(bitIndex / 8)];
            bit = ((byte >>> (7 - (bitIndex % 8))) & 1) === 1;
            bitIndex++;
          }
          matrix[r][c] = bit;
        }
      }
    }
    upward = !upward;
  }
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

const FORMAT_INFOS_M = [
  0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0,
];

function applyMaskAndFormat(matrix, reserved, maskIndex, version) {
  const size = matrix.length;
  const result = Array.from({ length: size }, (_, r) => [...matrix[r]]);
  const maskFn = MASKS[maskIndex];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!reserved[r][c]) {
        if (maskFn(r, c)) result[r][c] = !result[r][c];
      }
    }
  }

  const formatBits = FORMAT_INFOS_M[maskIndex];
  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >>> (14 - i)) & 1) === 1;
    if (i <= 5) result[8][i] = bit;
    else if (i === 6) result[8][7] = bit;
    else if (i === 7) result[8][8] = bit;
    else if (i === 8) result[7][8] = bit;
    else result[14 - i][8] = bit;

    if (i < 8) result[size - 1 - i][8] = bit;
    else result[8][size - 15 + i] = bit;
  }

  if (version >= 7 && VERSION_INFOS[version]) {
    const vBits = VERSION_INFOS[version];
    for (let i = 0; i < 18; i++) {
      const bit = ((vBits >>> i) & 1) === 1;
      const r = Math.floor(i / 3);
      const c = (i % 3) + size - 11;
      result[r][c] = bit;
      result[c][r] = bit;
    }
  }

  return result;
}

function evaluatePenalty(matrix) {
  const size = matrix.length;
  let penalty = 0;

  for (let r = 0; r < size; r++) {
    let runColor = matrix[r][0];
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (matrix[r][c] === runColor) runLen++;
      else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = matrix[r][c];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }

  for (let c = 0; c < size; c++) {
    let runColor = matrix[0][c];
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (matrix[r][c] === runColor) runLen++;
      else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = matrix[r][c];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }

  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const color = matrix[r][c];
      if (color === matrix[r + 1][c] && color === matrix[r][c + 1] && color === matrix[r + 1][c + 1]) {
        penalty += 3;
      }
    }
  }

  return penalty;
}

export function generateQrMatrix(text) {
  const target = String(text || '').trim() || 'https://hinterland.de';
  const { version, interleaved, size } = encodeData(target);
  const { matrix, reserved } = createMatrix(size);
  placeData(matrix, reserved, interleaved);

  let bestMatrix = null;
  let minPenalty = Infinity;

  for (let mask = 0; mask < 8; mask++) {
    const masked = applyMaskAndFormat(matrix, reserved, mask, version);
    const score = evaluatePenalty(masked);
    if (score < minPenalty) {
      minPenalty = score;
      bestMatrix = masked;
    }
  }

  return { matrix: bestMatrix, size, version };
}

export function generateQrSvg(text, { size = 240, margin = 4, darkColor = '#000000', lightColor = '#ffffff' } = {}) {
  const { matrix, size: moduleCount } = generateQrMatrix(text);
  const totalCells = moduleCount + margin * 2;
  const cellSize = size / totalCells;

  let pathData = '';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r][c]) {
        const x = (c + margin) * cellSize;
        const y = (r + margin) * cellSize;
        pathData += `M${x.toFixed(2)},${y.toFixed(2)}h${cellSize.toFixed(2)}v${cellSize.toFixed(2)}h-${cellSize.toFixed(2)}z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<rect width="${size}" height="${size}" fill="${lightColor}" />` +
    `<path d="${pathData.trim()}" fill="${darkColor}" />` +
    `</svg>`;
}

export function drawQrToCanvas(canvas, text, { size = 220, margin = 4, darkColor = '#000000', lightColor = '#ffffff' } = {}) {
  if (!canvas) return;
  const { matrix, size: moduleCount } = generateQrMatrix(text);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = lightColor;
  ctx.fillRect(0, 0, size, size);

  const totalCells = moduleCount + margin * 2;
  const cellSize = size / totalCells;

  ctx.fillStyle = darkColor;
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r][c]) {
        const x = Math.round((c + margin) * cellSize);
        const y = Math.round((r + margin) * cellSize);
        const w = Math.round((c + margin + 1) * cellSize) - x;
        const h = Math.round((r + margin + 1) * cellSize) - y;
        ctx.fillRect(x, y, w, h);
      }
    }
  }
}

/* ------------------------------------------------------------- QR Modal Dialog */

export function openQrCode(url, title = '') {
  const targetUrl = url || 'https://hinterland.de';
  openModal({
    title: t('qr.title'),
    iconName: 'qr',
    nav: [
      {
        id: 'qrPage',
        icon: 'qr',
        labelKey: 'menu.qrCode',
        render: () => {
          const container = el('div', { class: 'qrCard' });

          const headEl = el('div', { class: 'sectionHead', style: { marginBottom: '16px' } }, [
            el('h2', { text: title ? `${t('qr.title')}: ${title}` : t('qr.title') }),
            el('p', { text: t('qr.description') }),
          ]);

          const box = el('div', { class: 'qrBox' });
          const canvas = el('canvas', { class: 'qrCanvas', width: 220, height: 220 });
          box.append(canvas);

          drawQrToCanvas(canvas, targetUrl);

          const inputRow = el('div', { style: { display: 'flex', width: '100%', maxWidth: '440px', margin: '14px auto 18px', gap: '8px' } });
          const urlInput = el('input', {
            class: 'input',
            type: 'text',
            value: targetUrl,
            style: { flex: '1', fontFamily: 'monospace', fontSize: '13px' },
            spellcheck: 'false',
          });
          urlInput.addEventListener('input', () => {
            const val = urlInput.value.trim() || 'https://hinterland.de';
            drawQrToCanvas(canvas, val);
          });
          inputRow.append(urlInput);

          const actions = el('div', { class: 'actionRow', style: { justifyContent: 'center', gap: '10px' } });

          const copyImgBtn = el('button', { class: 'button primary', type: 'button' }, [
            el('span', { html: icon('camera') }),
            ` ${t('qr.copyImage')}`,
          ]);
          copyImgBtn.onclick = async () => {
            const dataUrl = canvas.toDataURL('image/png');
            const ok = await api().app.copyImage(dataUrl);
            if (ok) toast(t('toast.qrCopied'), 'success');
            else toast(t('toast.failed'), 'warning');
          };

          const downloadBtn = el('button', { class: 'button', type: 'button' }, [
            el('span', { html: icon('download') }),
            ` ${t('qr.downloadPng')}`,
          ]);
          downloadBtn.onclick = () => {
            let host = 'page';
            try { host = new URL(urlInput.value).hostname || 'page'; } catch {}
            const a = el('a', {
              href: canvas.toDataURL('image/png'),
              download: `qrcode-${host}.png`,
            });
            a.click();
            toast(t('toast.qrDownloaded'), 'success');
          };

          const copyLinkBtn = el('button', { class: 'button', type: 'button' }, [
            el('span', { html: icon('link') }),
            ` ${t('qr.copyLink')}`,
          ]);
          copyLinkBtn.onclick = () => {
            navigator.clipboard.writeText(urlInput.value);
            toast(t('toast.copiedUrl'), 'info');
          };

          actions.append(copyImgBtn, downloadBtn, copyLinkBtn);
          container.append(headEl, box, inputRow, actions);
          return container;
        },
      },
    ],
  });
}
