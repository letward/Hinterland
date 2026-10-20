import { NAVIGABLE_SCHEMES, SCHEME, NEVER_UPGRADE } from './constants.js';
import { settings } from './settings.js';
import { history } from './history.js';
import { isInternalUrl } from './protocol.js';

const KNOWN_SCHEMES = new Set([...NAVIGABLE_SCHEMES, 'view-source:', 'mailto:', 'tel:', 'magnet:', 'sms:']);

function hostLooksReal(input) {
  if (!input || /\s/.test(input)) return false;
  const candidate = input.includes('://') ? input.split('://')[1]?.split('/')[0] : input.split('/')[0];
  if (!candidate) return false;
  if (NEVER_UPGRADE.has(candidate)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(candidate)) return true;
  if (candidate.startsWith('[')) return true;
  if (!candidate.includes('.')) return false;
  const parts = candidate.split('.');
  const last = parts[parts.length - 1];
  if (last.length < 2) return false;
  if (!/^[a-z0-9¡-￿-]+$/i.test(last)) return false;
  return parts.length >= 2;
}

function normalise(input) {
  const value = input.trim();
  if (!value) return null;
  if (isInternalUrl(value)) return value.startsWith(`${SCHEME}://newtab`) ? `${SCHEME}://newtab/` : value;
  const colon = value.indexOf(':');
  if (colon > 0) {
    const scheme = value.slice(0, colon + 1).toLowerCase();
    if (KNOWN_SCHEMES.has(scheme)) return scheme === 'hinterland:' ? value : value;
  }
  if (value.startsWith('about:') || value.startsWith('view-source:')) return value;
  if (hostLooksReal(value)) {
    const target = value.includes('://') ? value : `https://${value}`;
    try {
      const url = new URL(target);
      if (settings.value('privacy.httpsOnly') && !NEVER_UPGRADE.has(url.hostname)) url.protocol = 'https:';
      return url.toString();
    } catch {
      return null;
    }
  }
  return null;
}

export function activeEngines() {
  const list = settings.value('search.engines') ?? [];
  const defaultId = settings.value('search.defaultEngine');
  const usable = list.filter((engine) => engine && engine.url && engine.enabled !== false);
  if (!usable.length) {
    return [{ id: 'mojeek', name: 'Mojeek', url: 'https://www.mojeek.com/search?q={q}', enabled: true }];
  }
  const chosen = usable.find((engine) => engine.id === defaultId || engine.name === defaultId);
  return [chosen ?? usable[0], ...usable.filter((engine) => engine !== (chosen ?? usable[0]))];
}

export function buildSearchUrl(template, query) {
  const encoded = encodeURIComponent(query);
  return String(template).includes('{q}') ? String(template).replaceAll('{q}', encoded) : `${template}${encoded}`;
}

/**
 * Turns what the user typed into something the browser can open.
 * A query without a usable search engine resolves to kind 'search' without a url.
 */
export function resolveTarget(input) {
  const raw = typeof input === 'string' ? input : '';
  const value = raw.trim();
  if (!value) return { kind: 'empty', url: `${SCHEME}://newtab/`, query: '' };

  const direct = normalise(value);
  if (direct) return { kind: 'url', url: direct, query: '' };

  const engines = activeEngines();
  if (!engines.length) return { kind: 'search', url: null, query: value };

  return { kind: 'search', url: buildSearchUrl(engines[0].url, value), query: value, engine: engines[0].name };
}

export function suggestionList(input, limit = 8) {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value) return [];
  if (!settings.value('search.historySuggestions')) return [];

  const words = value.toLowerCase().split(/\s+/).filter(Boolean);
  const entries = history.recent(400);
  const scored = [];

  for (const entry of entries) {
    const title = (entry.title || '').toLowerCase();
    const url = entry.url.toLowerCase();
    let score = 0;
    for (const word of words) {
      if (title.startsWith(word)) score += 6;
      else if (title.includes(word)) score += 4;
      else if (url.includes(word)) score += 2;
      else score = -1;
      if (score === -1) break;
    }
    if (score > 0) scored.push({ entry, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || b.entry.time - a.entry.time)
    .slice(0, limit)
    .map(({ entry }) => ({
      id: `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      kind: 'history',
      title: entry.title || entry.url,
      url: entry.url,
      detail: entry.url,
    }));
}