import { shell } from 'electron';
import { NAVIGABLE_SCHEMES, NEVER_UPGRADE } from './constants.js';
import { settings } from './settings.js';

const GENERIC_TRACKERS = [
  /\/analytics(\.js|\.min\.js|\?|$)/i,
  /\/telemetry(\.js|\.min\.js|\?|$)/i,
  /\/tracking\//i,
  /\/collect\?/i,
  /\/g\/collect/i,
  /\/beacon(\.js|\.gif|\?|$)/i,
  /\/pixel(\.gif|\.png|1x1)?(\?|$)/i,
  /\/track\?/i,
  /\/trackingserver/i,
  /\/events?\/collect/i,
  /\/matomo\.js$/i,
  /\/gtm\.js$/i,
  /\/gtag\/js$/i,
];

const MEDIA_TYPES = /\.(mp4|webm|ogg|ogv|m3u8|mpd)(\?|$)/i;

let compiledRules = [];
let compiledFrom = '';

function compileRules() {
  const raw = settings.value('privacy.blockRules') || '';
  if (raw === compiledFrom) return compiledRules;
  compiledFrom = raw;
  compiledRules = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      try {
        return new RegExp(line, 'i');
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return compiledRules;
}

function allowedSites() {
  return Object.keys(settings.value('privacy.allowedSites') ?? {});
}

function hostOf(raw) {
  try {
    return new URL(raw).hostname;
  } catch {
    return '';
  }
}

function isAllowed(raw) {
  const host = hostOf(raw);
  if (!host) return false;
  return allowedSites().some((entry) => host === entry || host.endsWith(`.${entry}`));
}

export function shouldBlockRequest(raw) {
  if (!settings.value('privacy.blockTrackers')) return false;
  if (isAllowed(raw)) return false;
  const rules = [...GENERIC_TRACKERS, ...compileRules()];
  return rules.some((rule) => rule.test(raw));
}

export function shouldBlockThirdPartyMedia(raw) {
  return settings.value('privacy.blockThirdPartyMedia') && MEDIA_TYPES.test(raw);
}

export function upgradeToSecure(raw) {
  if (!settings.value('privacy.httpsOnly') && !settings.value('privacy.httpsFirst')) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:') return raw;
    const host = url.hostname;
    if (NEVER_UPGRADE.has(host)) return raw;
    const httpsFirst = settings.value('privacy.httpsFirst');
    if (!settings.value('privacy.httpsOnly') && !httpsFirst) return raw;
    if (settings.value('privacy.httpsOnly')) {
      url.protocol = 'https:';
      return url.toString();
    }
    return raw;
  } catch {
    return raw;
  }
}

export function stripTracking(raw) {
  try {
    const url = new URL(raw);
    const junk = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'igshid', 'msclkid', 'ref_src'];
    let changed = false;
    for (const key of junk) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? url.toString() : raw;
  } catch {
    return raw;
  }
}

export function isNavigable(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return false;
  const trimmed = raw.trim();
  if (trimmed.startsWith('#')) return true;
  const colon = trimmed.indexOf(':');
  if (colon === -1) return true;
  const scheme = trimmed.slice(0, colon + 1).toLowerCase();
  if (NAVIGABLE_SCHEMES.has(scheme)) return true;
  return /^[a-z][a-z0-9+.-]*$/.test(scheme) && !settings.value('advanced.disableProtocolHandlers');
}

/** Handles links the browser is not allowed to open and defers the rest to the system. */
export function handOffToSystem(raw) {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const colon = trimmed.indexOf(':');
  if (colon === -1) return false;
  const scheme = trimmed.slice(0, colon).toLowerCase();
  if (NAVIGABLE_SCHEMES.has(`${scheme}:`)) return false;
  if (settings.value('advanced.disableProtocolHandlers')) return false;
  if (!/^[a-z][a-z0-9+.-]*$/.test(scheme)) return false;
  shell.openExternal(trimmed).catch(() => {});
  return true;
}

const PERMISSION_CHOICES = {
  media: 'privacy.media',
  notifications: 'privacy.notifications',
  geolocation: 'privacy.geolocation',
  clipboardRead: 'privacy.clipboard',
  clipboardSanitizedWrite: 'privacy.clipboard',
  camera: 'privacy.camera',
  microphone: 'privacy.microphone',
  midi: 'privacy.midi',
  midiSysex: 'privacy.midi',
  fullscreen: null,
  pointerLock: null,
  openExternal: null,
};

function decisionFor(permission) {
  const settingKey = PERMISSION_CHOICES[permission];
  if (!settingKey) return 'allow';
  return settings.value(settingKey);
}

export function installPermissionPolicy(sessionObject, hooks) {
  sessionObject.setPermissionRequestHandler((contents, permission, callback, details) => {
    const choice = decisionFor(permission);
    if (choice === 'allow') return callback(true);
    if (choice === 'deny') return callback(false);
    const origin = details?.requestingUrl ?? details?.securityOrigin?.origin ?? '';
    hooks.requestPermission({ permission, origin, mediaTypes: details?.mediaTypes ?? [] });
    callback(false);
  });

  sessionObject.setPermissionCheckHandler((contents, permission, requestingOrigin) => {
    if (requestingOrigin?.startsWith('hinterland://')) return true;
    const choice = decisionFor(permission);
    if (choice === 'ask') return false;
    return choice === 'allow';
  });

  sessionObject.setDevicePermissionHandler((details) => {
    const choice = decisionFor(details.deviceType);
    if (choice === 'allow') return true;
    if (choice === 'deny') return false;
    hooks.requestPermission({ permission: details.deviceType, origin: details.requestingUrl });
    return false;
  });
}

export function installRequestFilters(sessionObject) {
  sessionObject.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (!settings.value('content.images') && (details.resourceType === 'image' || details.resourceType === 'media')) {
      return callback({ cancel: true });
    }
    if (!settings.value('content.stylesheets') && details.resourceType === 'stylesheet') {
      return callback({ cancel: true });
    }
    if (shouldBlockRequest(details.url) || shouldBlockThirdPartyMedia(details.url)) {
      recordBlock(details);
      return callback({ cancel: true });
    }
    callback({});
  });

  sessionObject.webRequest.onBeforeSendHeaders((details, callback) => {
    try {
      const headers = { ...(details.requestHeaders ?? {}) };
      if (settings.value('privacy.stripReferrer')) {
        delete headers.Referer;
        delete headers.referer;
      }
      if (settings.value('privacy.doNotTrack')) {
        headers['DNT'] = '1';
      }
      callback({ requestHeaders: headers });
    } catch {
      callback({ requestHeaders: details.requestHeaders ?? {} });
    }
  });
}

const blockedCounts = new Map();

function recordBlock(details) {
  const key = hostOf(details.url) || details.url;
  blockedCounts.set(key, (blockedCounts.get(key) ?? 0) + 1);
  if (blockedCounts.size > 500) blockedCounts.clear();
}

export function blockedSummary(limit = 25) {
  return [...blockedCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([host, count]) => ({ host, count }));
}

export function openExternal(raw) {
  let value = stripTracking(upgradeToSecure(raw));
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (url.protocol === 'http:' && settings.value('privacy.httpsOnly') && !NEVER_UPGRADE.has(url.hostname)) {
      url.protocol = 'https:';
    }
    value = url.toString();
  } catch {
    return false;
  }
  shell.openExternal(value).catch(() => {});
  return true;
}