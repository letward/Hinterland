import { session } from 'electron';
import { join } from 'node:path';
import { app } from 'electron';
import { PARTITION, PRIVATE_PARTITION } from './constants.js';
import { settings } from './settings.js';
import { availableLanguages, systemLanguage } from './i18n.js';

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

export async function clearBrowsingData({ cache = false, cookies = false, storage = false, history = false } = {}) {
  const ses = defaultSession();
  const tasks = [];
  if (cache) tasks.push(ses.clearCache());
  if (cookies) tasks.push(ses.clearStorageData({ storages: ['cookies', 'filesystem'] }));
  if (storage) tasks.push(ses.clearStorageData({ storages: ALL_STORAGES }));
  if (history) tasks.push(ses.clearHistory());
  await Promise.all(tasks);
}

export function flush() {
  try {
    defaultSession().flushStorageData();
  } catch {
    /* storage is not always available */
  }
}