import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import electron from 'electron';

const app = typeof electron === 'object' && electron !== null ? electron.app : null;
const getUserDataPath = () => (typeof app?.getPath === 'function' ? app.getPath('userData') : join(tmpdir(), 'hinterland-data'));

const FILE_NAME = 'history.json';
const LIMIT = 5000;

export class HistoryStore {
  constructor(customPath) {
    this.filePath = customPath || join(getUserDataPath(), FILE_NAME);
    this.entries = [];
    this.timer = null;
  }

  load() {
    if (!existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8'));
      if (Array.isArray(parsed)) this.entries = parsed.slice(0, LIMIT);
    } catch {
      this.entries = [];
    }
  }

  record(url, title) {
    if (typeof url !== 'string' || url.length < 4) return;
    if (url.startsWith('about:') || url.startsWith('hinterland://')) return;
    const now = Date.now();
    const existing = this.entries.find((entry) => entry.url === url);
    const visits = existing ? (Number(existing.visits) || 0) + 1 : 1;
    this.entries = this.entries.filter((entry) => entry.url !== url);
    this.entries.unshift({ url, title: title || existing?.title || '', time: now, visits });
    if (this.entries.length > LIMIT) this.entries.length = LIMIT;
    this.schedule();
  }

  search(query, limit = 8) {
    const needle = String(query ?? '').trim().toLowerCase();
    if (!needle) {
      return this.entries
        .filter((entry) => entry.url.startsWith('http'))
        .slice(0, limit)
        .map((entry) => ({ ...entry, kind: 'history' }));
    }
    const scored = [];
    for (const entry of this.entries) {
      const url = entry.url.toLowerCase();
      const title = (entry.title || '').toLowerCase();
      let score = -1;
      if (url.startsWith(needle)) score = 100;
      else if (title.startsWith(needle)) score = 90;
      else if (url.includes(needle)) score = 70;
      else if (title.includes(needle)) score = 60;
      if (score >= 0) scored.push({ entry, score });
      if (scored.length > 400) break;
    }
    return scored
      .sort((a, b) => b.score - a.score || b.entry.time - a.entry.time)
      .slice(0, limit)
      .map(({ entry }) => ({ ...entry, kind: 'history' }));
  }

  recent(limit = 50) {
    return this.entries.slice(0, limit);
  }

  remove(url) {
    this.entries = this.entries.filter((entry) => entry.url !== url);
    this.schedule();
  }

  clear() {
    this.entries = [];
    this.saveNow();
  }

  clearSince(timestamp) {
    if (!timestamp || typeof timestamp !== 'number' || timestamp <= 0) {
      this.clear();
      return;
    }
    this.entries = this.entries.filter((entry) => (entry.time || 0) < timestamp);
    this.saveNow();
  }

  schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.saveNow(), 900);
  }

  saveNow() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.tmp`;
      writeFileSync(temporary, JSON.stringify(this.entries), 'utf8');
      renameSync(temporary, this.filePath);
    } catch (error) {
      console.warn('[Hinterland] History could not be written.', error.message);
    }
  }
}

export const history = new HistoryStore();