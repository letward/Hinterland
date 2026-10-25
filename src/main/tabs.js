import { EventEmitter } from 'node:events';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { app } from 'electron';
import { Tab } from './tab.js';
import { NEW_TAB_URL } from './constants.js';
import { settings } from './settings.js';

const SESSION_FILE = 'session.json';

export class TabManager extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    this.tabs = [];
    this.activeId = null;
    this.closedStack = [];
    this.filePath = join(app.getPath('userData'), SESSION_FILE);
    this.saveTimer = null;
    this.memorySaverTimer = setInterval(() => this.checkMemorySaver(), 60000);
  }

  get list() {
    return this.tabs;
  }

  get active() {
    return this.tabs.find((tab) => tab.id === this.activeId) ?? null;
  }

  byId(id) {
    return this.tabs.find((tab) => tab.id === id) ?? null;
  }

  indexOf(id) {
    return this.tabs.findIndex((tab) => tab.id === id);
  }

  create({ url = NEW_TAB_URL, background = false, privateMode = false, pinned = false, groupId = null, openerId = null, title = '' } = {}) {
    const tab = new Tab({ url, privateMode, pinned, groupId, openerId, title });
    this.tabs.push(tab);

    tab.on('update', () => {
      this.emit('update', tab.snapshot());
      this.scheduleSave();
    });

    tab.on('popup', ({ url: target, disposition }) => {
      const openInBackground = settings.value('tabs.openInBackground') || disposition === 'background-tab';
      this.create({ url: target, background: openInBackground, privateMode: tab.privateMode, openerId: tab.id });
    });

    tab.on('key', (input) => this.emit('key', { tabId: tab.id, input }));

    tab.on('found', (result) => this.emit('found', { tabId: tab.id, result }));

    tab.on('readerAction', (payload) => this.handleReaderAction(tab, payload));

    if (!background || !this.activeId) this.activate(tab.id);
    this.emit('list', this.snapshot());
    this.scheduleSave();
    tab.loadUrl(url);
    return tab;
  }

  async close(id, { force = false } = {}) {
    const index = this.indexOf(id);
    if (index === -1) return false;
    const tab = this.tabs[index];

    const confirmed = force
      ? true
      : await this.emitConfirm(tab);
    if (!confirmed) return false;

    const wasActive = this.activeId === id;
    if (settings.value('tabs.restoreClosed') && !tab.privateMode) {
      this.closedStack.unshift({
        url: tab.url,
        title: tab.title || tab.url,
        favicon: tab.favicon || '',
        closedAt: Date.now(),
      });
      const limit = Number(settings.value('tabs.maxUndo')) || 25;
      this.closedStack.length = Math.min(this.closedStack.length, limit);
    }

    this.tabs.splice(index, 1);
    tab.attached = false;
    await tab.close();

    if (wasActive) {
      const pinnedIndex = this.tabs.findIndex((entry) => entry.pinned);
      const fallbackIndex = pinnedIndex === -1 ? Math.min(index, this.tabs.length - 1) : pinnedIndex;
      this.activeId = this.tabs[Math.max(0, fallbackIndex)]?.id ?? null;
      this.emit('active', { activeId: this.activeId, tab: this.active?.snapshot() ?? null });
    }

    this.emit('list', this.snapshot());
    this.emit('detach', { id });
    if (this.tabs.length === 0) {
      this.create({ url: NEW_TAB_URL });
    }
    this.scheduleSave();
    return true;
  }

  emitConfirm(tab) {
    return new Promise((resolve) => {
      if (!settings.value('tabs.confirmBeforeClose') || this.tabs.length < 2) return resolve(true);
      this.emit('confirmClose', { tab: tab.snapshot(), resolve });
    });
  }

  activate(id) {
    const tab = this.byId(id);
    if (!tab) return false;
    tab.touch();
    if (tab.sleeping) {
      tab.wake();
    }
    if (this.activeId === id) {
      this.emit('active', { activeId: id, tab: tab.snapshot() });
      return true;
    }
    this.activeId = id;
    tab.contents.focus();
    this.emit('active', { activeId: id, tab: tab.snapshot() });
    this.emit('visibility', { tabId: id });
    this.scheduleSave();
    return true;
  }

  checkMemorySaver() {
    if (!settings.value('advanced.memorySaver')) return 0;
    const delayMinutes = Number(settings.value('advanced.memorySaverDelay')) || 20;
    return this.sleepInactive(delayMinutes);
  }

  sleepInactive(delayMinutes = 20) {
    const thresholdMs = Math.max(1, Number(delayMinutes) || 20) * 60 * 1000;
    const now = Date.now();
    let count = 0;

    for (const tab of this.tabs) {
      if (tab.id === this.activeId) continue;
      if (tab.pinned || tab.audible || tab.privateMode || tab.sleeping) continue;
      if (!tab.url || tab.url === 'about:blank' || tab.url.startsWith('hinterland://')) continue;
      const lastActive = tab.lastActiveAt || tab.createdAt;
      if (now - lastActive >= thresholdMs) {
        if (tab.sleep()) count++;
      }
    }

    if (count > 0) {
      this.emit('list', this.snapshot());
    }
    return count;
  }

  getMemorySaverStats() {
    const total = this.tabs.length;
    const sleeping = this.tabs.filter((t) => t.sleeping).length;
    const enabled = Boolean(settings.value('advanced.memorySaver'));
    const delayMinutes = Number(settings.value('advanced.memorySaverDelay')) || 20;
    const estimatedSavedMB = sleeping * 70;
    return {
      enabled,
      delayMinutes,
      sleepingCount: sleeping,
      totalTabs: total,
      estimatedSavedMB,
    };
  }

  handleReaderAction(tab, payload) {
    if (payload.action === 'savePrefs' && payload.prefs) {
      if (payload.prefs.theme) settings.set('reader.theme', payload.prefs.theme);
      if (payload.prefs.font) settings.set('reader.fontFamily', payload.prefs.font);
      if (payload.prefs.size) settings.set('reader.fontSize', payload.prefs.size);
      if (payload.prefs.width) settings.set('reader.contentWidth', payload.prefs.width);
    } else if (payload.action === 'addToReadingList') {
      const list = [...(settings.value('data.readingList') || [])];
      const url = payload.url || tab.url;
      const title = payload.title || tab.title;
      const existing = list.findIndex((e) => e.url === url);
      if (existing !== -1) {
        list[existing].read = false;
        list[existing].addedAt = Date.now();
      } else {
        list.unshift({
          id: `rl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          url,
          title,
          favicon: tab.favicon || '',
          addedAt: Date.now(),
          read: false,
        });
      }
      settings.set('data.readingList', list);
      this.emit('toast', { message: 'toast.addedToReadingList', kind: 'success' });
    } else if (payload.action === 'exit') {
      tab.readerActive = false;
      this.emit('update', tab.snapshot());
    }
  }

  sleep(id) {
    const tab = this.byId(id);
    if (!tab || tab.id === this.activeId) return false;
    const ok = tab.sleep();
    if (ok) {
      this.emit('update', tab.snapshot());
      this.emit('list', this.snapshot());
    }
    return ok;
  }

  wake(id) {
    const tab = this.byId(id);
    if (!tab) return false;
    const ok = tab.wake();
    if (ok) {
      this.emit('update', tab.snapshot());
      this.emit('list', this.snapshot());
    }
    return ok;
  }

  sleepOthers(id) {
    const keep = id ? this.byId(id) : this.active;
    let count = 0;
    for (const tab of this.tabs) {
      if (tab.id === keep?.id || tab.pinned || tab.audible) continue;
      if (tab.sleep()) count++;
    }
    if (count > 0) {
      this.emit('list', this.snapshot());
    }
    return count;
  }

  cycle(delta) {
    if (this.tabs.length < 2) return;
    const index = this.indexOf(this.activeId);
    const next = ((index + delta) % this.tabs.length + this.tabs.length) % this.tabs.length;
    this.activate(this.tabs[next].id);
  }

  move(id, targetIndex) {
    const index = this.indexOf(id);
    if (index === -1) return false;
    const clamped = Math.max(0, Math.min(targetIndex, this.tabs.length - 1));
    if (clamped === index) return false;
    const [tab] = this.tabs.splice(index, 1);
    this.tabs.splice(clamped, 0, tab);
    this.emit('list', this.snapshot());
    this.scheduleSave();
    return true;
  }

  setPinned(id, pinned) {
    const tab = this.byId(id);
    if (!tab) return false;
    tab.pinned = Boolean(pinned);
    const index = this.indexOf(id);
    const target = tab.pinned ? 0 : this.tabs.findIndex((entry) => !entry.pinned);
    this.move(id, target === -1 ? index : target);
    this.emit('list', this.snapshot());
    return true;
  }

  duplicate(id) {
    const tab = this.byId(id);
    if (!tab) return null;
    const copy = this.create({ url: tab.url, background: false, privateMode: tab.privateMode, openerId: null });
    this.move(copy.id, this.indexOf(id) + 1);
    return copy;
  }

  reopenClosed(index = 0) {
    if (!this.closedStack.length) return false;
    const target = typeof index === 'number' && index >= 0 && index < this.closedStack.length ? index : 0;
    const [entry] = this.closedStack.splice(target, 1);
    if (!entry) return false;
    const tab = this.create({ url: entry.url });
    this.emit('list', this.snapshot());
    return Boolean(tab);
  }

  recentlyClosed() {
    return [...this.closedStack];
  }

  clearRecentlyClosed() {
    this.closedStack = [];
    return true;
  }

  async restoreAllClosed() {
    const list = [...this.closedStack];
    this.closedStack = [];
    for (const entry of list) {
      this.create({ url: entry.url, background: true });
    }
    this.emit('list', this.snapshot());
    return true;
  }

  async closeAll() {
    const ids = this.tabs.map((tab) => tab.id);
    for (const id of ids) {
      await this.close(id, { force: true });
    }
  }

  async closeRight(id) {
    const index = this.indexOf(id);
    if (index === -1) return false;
    const toClose = this.tabs.slice(index + 1).filter((tab) => !tab.pinned);
    for (const tab of toClose) {
      await this.close(tab.id, { force: true });
    }
    return true;
  }

  async closeLeft(id) {
    const index = this.indexOf(id);
    if (index <= 0) return false;
    const toClose = this.tabs.slice(0, index).filter((tab) => !tab.pinned);
    for (const tab of toClose) {
      await this.close(tab.id, { force: true });
    }
    return true;
  }

  async closeDuplicates() {
    const seenUrls = new Set();
    const toClose = [];
    for (const tab of this.tabs) {
      if (tab.pinned) continue;
      const rawUrl = (tab.url || '').split('#')[0].replace(/\/+$/, '').toLowerCase();
      if (!rawUrl || rawUrl === 'about:blank' || rawUrl === 'hinterland://newtab') continue;
      if (seenUrls.has(rawUrl)) {
        toClose.push(tab.id);
      } else {
        seenUrls.add(rawUrl);
      }
    }
    for (const id of toClose) {
      await this.close(id, { force: true });
    }
    return toClose.length;
  }

  muteAll(muted = true) {
    let count = 0;
    for (const tab of this.tabs) {
      if (tab.muted !== muted) {
        tab.muted = muted;
        tab.contents.setAudioMuted(muted);
        this.emit('update', tab.snapshot());
        count += 1;
      }
    }
    return count;
  }

  snapshot() {
    return {
      tabs: this.tabs.map((tab) => tab.snapshot()),
      activeId: this.activeId,
    };
  }

  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 400);
  }

  saveNow() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      const payload = {
        version: 1,
        activeId: this.activeId,
        tabs: this.tabs.filter((tab) => !tab.privateMode).map((tab) => tab.persist()),
        closed: this.closedStack.slice(0, 30),
      };
      mkdirSync(dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.tmp`;
      writeFileSync(temporary, JSON.stringify(payload), 'utf8');
      renameSync(temporary, this.filePath);
    } catch (error) {
      console.warn('[Hinterland] Session could not be saved.', error.message);
    }
  }

  readSaved() {
    if (!existsSync(this.filePath)) return null;
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  restore(saved) {
    if (Array.isArray(saved?.closed)) {
      this.closedStack = saved.closed.slice(0, 30);
    }
    const entries = Array.isArray(saved?.tabs) ? saved.tabs : [];
    if (!entries.length) return false;
    for (const entry of entries.slice(0, 60)) {
      if (!entry?.url) continue;
      this.create({ url: entry.url, background: true, pinned: entry.pinned, groupId: entry.groupId ?? null, title: entry.title });
    }
    if (saved?.activeId && this.byId(saved.activeId)) this.activate(saved.activeId);
    return this.tabs.length > 0;
  }
}

export const tabs = new TabManager();