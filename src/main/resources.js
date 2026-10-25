import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';
import { existsSync } from 'node:fs';
import electron from 'electron';

const app = typeof electron === 'object' && electron !== null ? electron.app : null;

const here = dirname(fileURLToPath(import.meta.url));

export const ROOT = resolve(here, '..', '..');
export const UI_ROOT = join(ROOT, 'src', 'ui');
export const I18N_ROOT = join(UI_ROOT, 'locales');
export function getExtensionsRoot() {
  const direct = join(ROOT, 'src', 'extensions');
  if (direct.includes('app.asar')) {
    const unpacked = direct.replace('app.asar', 'app.asar.unpacked');
    if (existsSync(unpacked)) return unpacked;
  }
  return direct;
}

export const EXTENSIONS_ROOT = getExtensionsRoot();
export const ASSETS_ROOT = join(UI_ROOT, 'assets');
export const PRELOAD_ROOT = join(ROOT, 'src', 'preload');

export const CHROME_PRELOAD = join(PRELOAD_ROOT, 'chrome.cjs');
export const PAGE_PRELOAD = join(PRELOAD_ROOT, 'page.cjs');
export const EXTENSION_PRELOAD = join(PRELOAD_ROOT, 'extension.cjs');

export function appIconPath() {
  const candidates = [
    join(ROOT, 'build', 'icons', 'icon.png'),
    join(ROOT, 'build', 'icons', 'icon.ico'),
    join(ROOT, 'src', 'ui', 'assets', 'icon.png'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? '';
}

/**
 * Resolves a request inside a root folder and refuses anything that escapes it.
 */
export function safeJoin(root, relative) {
  const cleaned = String(relative ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\0/g, '');
  const target = resolve(join(root, cleaned));
  const boundary = root.endsWith(sep) ? root : root + sep;
  if (target !== root && !target.startsWith(boundary)) return null;
  return target;
}

export const MIME_TYPES = {
  '.html': 'text/html; charset=utf8',
  '.js': 'text/javascript; charset=utf8',
  '.mjs': 'text/javascript; charset=utf8',
  '.cjs': 'text/javascript; charset=utf8',
  '.css': 'text/css; charset=utf8',
  '.json': 'application/json; charset=utf8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf8',
  '.map': 'application/json; charset=utf8',
};

export function mimeFor(filePath) {
  const dot = filePath.lastIndexOf('.');
  if (dot === -1) return 'application/octet-stream';
  return MIME_TYPES[filePath.slice(dot).toLowerCase()] ?? 'application/octet-stream';
}

export function isDevelopment() {
  return app.isPackaged === false || process.argv.includes('--dev');
}