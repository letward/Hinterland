import { session } from 'electron';
import { join } from 'node:path';
import { app } from 'electron';
import { PARTITION, PRIVATE_PARTITION } from './constants.js';
import { settings } from './settings.js';
import { availableLanguages, systemLanguage } from './i18n.js';
import { history } from './history.js';

let privateSession = null;

export function defaultSession() {
  return session.fromPartition(PARTITION);
}

export function incognitoSession() {
  if (!privateSession) privateSession = session.fromPartition(PRIVATE_PARTITION);
  return privateSession;
}

export function sessionFor(tab) {
  return tab?.privateMode ? incognitoSession() : defaultSession();
}

export function downloadDirectory() {
  const custom = settings.value('network.downloadDirectory');
  return custom && custom.trim() ? custom.trim() : join(app.getPath('downloads'));
}

function userAgentFor(ses) {
  const custom = settings.value('network.userAgent');
  if (custom && custom.trim()) return custom.trim();
  const version = app.getVersion();
  return `Mozilla/5.0 (${process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64'}) AppleWebKit/537.36 (KHTML, like Gecko) Hinterland/${version} Safari/537.36`;
}

export function applySettings() {
  const targets = [defaultSession(), incognitoSession()];

  for (const ses of targets) {
    const proxyMode = settings.value('network.proxyMode');
    try {
      if (proxyMode === 'off') ses.setProxy({ mode: 'direct' });
      else if (proxyMode === 'manual') ses.setProxy({ mode: 'fixed_servers', proxyRules: settings.value('network.proxyRules') });
      else ses.setProxy({ mode: 'system' });
    } catch (error) {
      console.warn('[Hinterland] Proxy settings could not be applied.', error.message);
    }

    ses.setUserAgent(userAgentFor(ses));

    if (typeof ses.setAcceptLanguages === 'function') {
      const custom = settings.value('network.acceptLanguages');
      ses.setAcceptLanguages(custom?.trim() ? custom.trim() : availableLanguages());
    }

    ses.setSpellCheckerEnabled(settings.value('content.spellcheck'));
    if (settings.value('content.spellcheck')) {
      const code = settings.value('general.language');
      ses.setSpellCheckerLanguages([code === 'system' ? systemLanguage() : code]);
    }

    if (!ses.isPersistent) continue;
    ses.setDownloadPath(downloadDirectory());
  }
}

const ALL_STORAGES = [
  'cookies',
  'filesystem',
  'indexdb',
  'localstorage',
  'shadercache',
  'websql',
  'serviceworkers',
  'cachestorage',
];

export async function clearBrowsingData({ cache = false, cookies = false, storage = false, history: clearHistoryFlag = false, since = 0 } = {}) {
  const ses = defaultSession();
  const tasks = [];
  if (cache) tasks.push(ses.clearCache());
  if (cookies) tasks.push(ses.clearStorageData({ storages: ['cookies', 'filesystem'] }));
  if (storage) tasks.push(ses.clearStorageData({ storages: ALL_STORAGES }));
  if (clearHistoryFlag) {
    tasks.push(ses.clearHistory());
    try {
      if (since > 0) history.clearSince(since);
      else history.clear();
    } catch {}
  }
  await Promise.all(tasks);
}

export async function clearSiteData(targetUrl) {
  try {
    const origin = new URL(targetUrl).origin;
    const ses = defaultSession();
    await ses.clearStorageData({ origin, storages: ALL_STORAGES });
    return true;
  } catch {
    return false;
  }
}

export async function getSiteCookies(targetUrl) {
  try {
    const ses = defaultSession();
    if (!ses || !ses.cookies) return [];
    const urlObj = new URL(targetUrl);
    const domain = urlObj.hostname.replace(/^www\./, '').toLowerCase();

    const urlCookies = await ses.cookies.get({ url: targetUrl }).catch(() => []);
    const domainCookies = await ses.cookies.get({ domain }).catch(() => []);

    const map = new Map();
    for (const c of [...urlCookies, ...domainCookies]) {
      const key = `${c.domain}:${c.path}:${c.name}`;
      if (!map.has(key)) {
        map.set(key, {
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          secure: Boolean(c.secure),
          httpOnly: Boolean(c.httpOnly),
          sameSite: c.sameSite || 'unspecified',
          session: Boolean(c.session),
          expirationDate: c.expirationDate ? new Date(c.expirationDate * 1000).toLocaleString() : 'Session',
          expiresTimestamp: c.expirationDate || 0,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function deleteSiteCookie({ url, name, domain, path = '/' }) {
  try {
    const ses = defaultSession();
    if (!ses || !ses.cookies || !name) return false;
    let targetUrl = url;
    if (!targetUrl && domain) {
      targetUrl = `https://${domain.replace(/^\./, '')}${path || '/'}`;
    }
    if (targetUrl) {
      await ses.cookies.remove(targetUrl, name);
    }
    if (domain && domain.startsWith('.')) {
      await ses.cookies.remove(`http://${domain.slice(1)}${path || '/'}`, name).catch(() => {});
      await ses.cookies.remove(`https://${domain.slice(1)}${path || '/'}`, name).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

export async function clearSiteCookies(targetUrl) {
  try {
    const cookies = await getSiteCookies(targetUrl);
    for (const cookie of cookies) {
      await deleteSiteCookie({ url: targetUrl, name: cookie.name, domain: cookie.domain, path: cookie.path });
    }
    return true;
  } catch {
    return false;
  }
}

export async function getSiteStorageStats(targetUrl) {
  try {
    const cookies = await getSiteCookies(targetUrl);
    const origin = new URL(targetUrl).origin;
    return {
      origin,
      cookieCount: cookies.length,
    };
  } catch {
    return { origin: targetUrl, cookieCount: 0 };
  }
}

export function flush() {
  try {
    defaultSession().flushStorageData();
  } catch {
    /* storage is not always available */
  }
}