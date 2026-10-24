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
      this.closedStack.unshift({ url: tab.url, title: tab.title });
      const limit = Number(settings.value('tabs.maxUndo')) || 0;
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

  reopenClosed() {
    const entry = this.closedStack.shift();
    if (!entry) return false;
    const tab = this.create({ url: entry.url });
    this.emit('list', this.snapshot());
    return Boolean(tab);
  }

  async closeAll() {
    const ids = this.tabs.map((tab) => tab.id);
    for (const id of ids) {
      this.closedStack = [];
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