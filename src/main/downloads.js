import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { shell } from 'electron';
import { settings } from './settings.js';
import { downloadDirectory } from './sessions.js';
import { surface } from './windows.js';

let counter = 0;

function uniquePath(directory, filename) {
  const safe = String(filename || 'download').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 180) || 'download';
  let candidate = join(directory, safe);
  let index = 1;
  while (existsSync(candidate)) {
    const dot = safe.lastIndexOf('.');
    const stem = dot > 0 ? safe.slice(0, dot) : safe;
    const extension = dot > 0 ? safe.slice(dot) : '';
    candidate = join(directory, `${stem} (${index})${extension}`);
    index += 1;
    if (index > 999) break;
  }
  return candidate;
}

function applyThrottle(item) {
  const speed = Number(settings.value('network.downloadLimit'));
  if (!speed) return;
  const limit = speed * 1024 * 1024;
  let lastBytes = item.getReceivedBytes();
  let lastTime = Date.now();
  let pausedUntil = 0;

  const timer = setInterval(() => {
    const now = Date.now();
    const bytes = item.getReceivedBytes();
    const seconds = (now - lastTime) / 1000;
    const delta = bytes - lastBytes;
    lastBytes = bytes;
    lastTime = now;
    if (seconds <= 0) return;

    if (item.isPaused()) {
      if (now >= pausedUntil) item.resume();
      return;
    }
    const rate = delta / seconds;
    if (rate > limit) {
      pausedUntil = now + Math.min(2000, Math.round(((rate - limit) / rate) * 1000));
      item.pause();
    }
  }, 500);

  item.once('done', () => clearInterval(timer));
}

export function attachDownloads(sessionObject) {
  sessionObject.on('will-download', (_event, item) => register(item));
}

function register(item) {
  const id = `d${Date.now().toString(36)}${(counter += 1).toString(36)}`;
  if (!settings.value('general.askWhereToSave')) {
    item.setSavePath(uniquePath(downloadDirectory(), item.getFilename()));
  }

  const payload = () => ({
    id,
    filename: item.getFilename(),
    mimeType: item.getMimeType(),
    totalBytes: item.getTotalBytes(),
    receivedBytes: item.getReceivedBytes(),
    paused: item.isPaused(),
    state: item.getState(),
    savePath: item.getSavePath() || '',
    url: item.getURL(),
  });

  surface.send('download:new', payload());

  item.on('updated', (_event, state) => {
    if (state === 'interrupted') {
      surface.send('download:done', { ...payload(), ok: false });
      return;
    }
    surface.send('download:progress', payload());
  });

  item.once('done', (_event, state) => {
    clearInterval(throttles.get(item) ?? 0);
    throttles.delete(item);
    surface.send('download:done', { ...payload(), ok: state === 'completed' });
  });

  throttles.set(item, applyThrottle(item));
}

const throttles = new Map();

export function pauseDownload(item) {
  item.pause();
}

export function resumeDownload(item) {
  item.resume();
}

export function cancelDownload(item) {
  item.cancel();
}

export function showInFolder(item) {
  const path = item.getSavePath();
  if (!path || !existsSync(path)) return false;
  shell.showItemInFolder(path);
  return true;
}