import { protocol, net } from 'electron';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SCHEME, INTERNAL_HOSTS } from './constants.js';
import { UI_ROOT, ASSETS_ROOT, I18N_ROOT, safeJoin, mimeFor } from './resources.js';

const PAGE_ROOTS = {
  app: UI_ROOT,
  assets: ASSETS_ROOT,
  strings: I18N_ROOT,
  newtab: UI_ROOT,
  history: UI_ROOT,
  bookmarks: UI_ROOT,
  extensions: UI_ROOT,
  settings: UI_ROOT,
  store: UI_ROOT,
};

const UI_SECURITY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' data: blob:",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

const HTML_SECURITY = UI_SECURITY;

export function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        allowServiceWorkers: false,
        bypassCSP: false,
      },
    },
  ]);
}

function resolveRequest(url) {
  const host = url.hostname;
  if (!INTERNAL_HOSTS.has(host)) return null;
  const root = PAGE_ROOTS[host];
  if (!root) return null;

  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname === '') {
    pathname = host === 'app' ? '/index.html' : `/${host}.html`;
  }
  if (pathname.endsWith('/')) pathname += `${host}.html`;

  const target = safeJoin(root, pathname);
  if (!target) return null;

  if (!existsSync(target) || !statSync(target).isFile()) {
    if (pathname.endsWith('.html')) {
      const index = safeJoin(root, `/${host}.html`);
      if (index && existsSync(index)) return index;
    }
    return null;
  }
  return target;
}

export function registerHandler() {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    const file = resolveRequest(url);
    if (!file) {
      return new Response('Not found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf8' },
      });
    }
    return serve(file, url);
  });
}

async function serve(file, url) {
  const response = await net.fetch(pathToFileURL(file).toString());
  const headers = new Headers(response.headers);
  const type = mimeFor(file);
  headers.set('content-type', type);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('cross-origin-resource-policy', 'same-origin');
  headers.set('cache-control', file.includes(`${join('assets')}`) ? 'public, max-age=3600' : 'no-cache');
  if (type.startsWith('text/html')) headers.set('content-security-policy', HTML_SECURITY);
  return new Response(response.body, { status: 200, headers });
}

export function isInternalUrl(raw) {
  if (typeof raw !== 'string') return false;
  try {
    const url = new URL(raw);
    return url.protocol === `${SCHEME}:` && INTERNAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}