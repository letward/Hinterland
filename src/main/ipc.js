import { ipcMain, dialog, shell, app, clipboard, BrowserWindow } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { NEW_TAB_URL, DEFAULT_SHORTCUTS } from './constants.js';
import { settings } from './settings.js';
import { exportSchema } from './schema.js';
import { translations, availableLanguages, resolveLanguage } from './i18n.js';
import { tabs } from './tabs.js';
import { surface } from './windows.js';
import { extensions } from './extensions.js';
import { history } from './history.js';
import { resolveTarget, suggestionList, activeEngines } from './navigation.js';
import { isInternalUrl } from './protocol.js';
import { openExternal, blockedSummary, handOffToSystem } from './security.js';
import { applySettings, clearBrowsingData, downloadDirectory } from './sessions.js';
import { applyContentSettings } from './content.js';

const registered = new Set();

function handle(channel, handler) {
  if (registered.has(channel)) return;
  registered.add(channel);
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.warn(`[Hinterland] ${channel} failed.`, error?.message ?? error);
      return { ok: false, error: error?.message ?? 'unknown' };
    }
  });
}

function activeTab(id) {
  return id ? tabs.byId(id) : tabs.active;
}

function language() {
  return resolveLanguage(settings.value('general.language'));
}

export function installIpc() {
  /* ------------------------------------------------------------ bootstrap */
  handle('app:bootstrap', () => ({
    app: { name: app.getName(), version: app.getVersion(), platform: process.platform, locale: language() },
    languages: availableLanguages(),
    strings: translations(language()),
    settings: settings.all(),
    schema: exportSchema(),
    defaults: DEFAULT_SHORTCUTS,
    tabs: tabs.snapshot(),
    window: surface.state(),
    extensions: extensions.list(),
    startUrl: startupUrl(),
  }));

  handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    locale: language(),
    userData: app.getPath('userData'),
    downloads: downloadDirectory(),
    blocked: blockedSummary(),
    electron: process.versions.electron,
    node: process.versions.node,
    v8: process.versions.v8,
  }));

  handle('app:openFolder', (target) => {
    const folder = target === 'userData' ? app.getPath('userData') : downloadDirectory();
    shell.openPath(folder).catch(() => {});
    return true;
  });

  handle('app:revealFile', (path) => {
    shell.showItemInFolder(path);
    return true;
  });

  /* ------------------------------------------------------------- settings */
  handle('settings:get', (key) => (key ? settings.value(key) : settings.all()));
  handle('settings:set', (key, value) => {
    const changed = settings.set(key, value);
    return { changed, values: settings.all() };
  });
  handle('settings:merge', (patch) => {
    settings.merge(patch);
    return settings.all();
  });
  handle('settings:reset', (key) => {
    settings.reset(key);
    return settings.all();
  });
  handle('settings:resetAll', () => {
    settings.resetAll();
    return settings.all();
  });
  handle('settings:export', () => settings.export());

  handle('settings:import', (text) => {
    try {
      const count = settings.import(text, { replace: true });
      applySettings();
      applyContentSettings(tabs.list);
      return { ok: true, count, values: settings.all() };
    } catch {
      return { ok: false, error: 'invalidJson' };
    }
  });

  handle('settings:saveFile', async (_event, name, content) => {
    const result = await dialog.showSaveDialog(chromeWindow(), {
      title: 'Hinterland',
      defaultPath: name || 'hinterland.settings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };
    await writeFile(result.filePath, content, 'utf8');
    return { ok: true, path: result.filePath };
  });

  handle('settings:loadFile', async () => {
    const result = await dialog.showOpenDialog(chromeWindow(), {
      title: 'Hinterland',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled) return { ok: false };
    const text = await readFile(result.filePaths[0], 'utf8');
    try {
      const count = settings.import(text, { replace: true });
      applySettings();
      applyContentSettings(tabs.list);
      return { ok: true, count, values: settings.all() };
    } catch {
      return { ok: false, error: 'invalidJson' };
    }
  });

  handle('settings:pickDirectory', async (key) => {
    const result = await dialog.showOpenDialog(chromeWindow(), { properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled) return settings.value(key);
    settings.set(key, result.filePaths[0]);
    applySettings();
    return result.filePaths[0];
  });

  handle('settings:pickFile', async () => {
    const result = await dialog.showOpenDialog(chromeWindow(), { properties: ['openFile'] });
    return result.canceled ? '' : result.filePaths[0];
  });

  /* ------------------------------------------------------------- chrome ui */
  handle('chrome:height', (height) => {
    surface.setChromeHeight(height);
    return true;
  });

  handle('chrome:popup', (bottom) => {
    surface.setPopupBottom(bottom);
    return true;
  });

  handle('chrome:fullscreen', (enabled) => {
    surface.setFullChrome(enabled);
    return true;
  });

  handle('window:minimize', () => surface.minimize());
  handle('window:maximize', () => {
    surface.toggleMaximize();
    return surface.state();
  });
  handle('window:fullscreen', () => {
    surface.toggleFullScreen();
    return surface.state();
  });
  handle('window:close', () => {
    surface.close();
    return true;
  });
  handle('window:state', () => surface.state());

  /* ----------------------------------------------------------------- tabs */
  handle('tabs:create', ({ url, background, privateMode, openerId } = {}) => {
    const target = resolveTarget(url || NEW_TAB_URL);
    const tab = tabs.create({
      url: target.url ?? NEW_TAB_URL,
      background: Boolean(background),
      privateMode: Boolean(privateMode),
      openerId: openerId ?? null,
    });
    return tab.snapshot();
  });

  handle('tabs:activate', (id) => tabs.activate(id));
  handle('tabs:close', (id) => tabs.close(id));
  handle('tabs:move', (id, index) => tabs.move(id, index));
  handle('tabs:pin', (id, pinned) => tabs.setPinned(id, pinned));
  handle('tabs:duplicate', (id) => {
    const copy = tabs.duplicate(id);
    return copy?.snapshot() ?? null;
  });
  handle('tabs:cycle', (delta) => tabs.cycle(delta));
  handle('tabs:reopen', () => tabs.reopenClosed());
  handle('tabs:closeOthers', async (id) => {
    const keep = activeTab(id);
    for (const tab of [...tabs.list]) {
      if (tab.id === keep?.id || tab.pinned) continue;
      await tabs.close(tab.id, { force: true });
    }
    return tabs.snapshot();
  });
  handle('tabs:closeAll', () => tabs.closeAll());
  handle('tabs:snapshot', () => tabs.snapshot());

  /* ----------------------------------------------------------- tab actions */
  handle('tab:navigate', (id, input) => {
    const tab = activeTab(id);
    if (!tab) return false;
    const target = resolveTarget(input);
    if (!target.url) {
      surface.send('toast', { message: 'toast.noSearchEngine', kind: 'warning' });
      return false;
    }
    tab.loadUrl(target.url);
    return true;
  });

  handle('tab:back', (id) => {
    const tab = activeTab(id);
    if (!tab?.canGoBack) return false;
    tab.contents.navigationHistory.goBack();
    return true;
  });

  handle('tab:forward', (id) => {
    const tab = activeTab(id);
    if (!tab?.canGoForward) return false;
    tab.contents.navigationHistory.goForward();
    return true;
  });

  handle('tab:reload', (id, hard = false) => {
    const tab = activeTab(id);
    if (!tab) return false;
    if (hard) tab.contents.reloadIgnoringCache();
    else tab.contents.reload();
    return true;
  });

  handle('tab:stop', (id) => {
    const tab = activeTab(id);
    if (!tab) return false;
    tab.contents.stop();
    return true;
  });

  handle('tab:zoom', (id, factor) => {
    const tab = activeTab(id);
    if (!tab) return false;
    const steps = Math.max(-3, Math.min(5, Math.round(factor * 10) / 10));
    tab.zoom = Math.pow(1.1, steps);
    tab.contents.setZoomFactor(tab.zoom);
    surface.send('tab:update', { ...tab.snapshot(), id: tab.id });
    return tab.zoom;
  });

  handle('tab:mute', (id, muted) => {
    const tab = activeTab(id);
    if (!tab) return false;
    tab.muted = Boolean(muted);
    tab.contents.setAudioMuted(tab.muted);
    surface.send('tab:update', { ...tab.snapshot(), id: tab.id });
    return tab.muted;
  });

  handle('tab:focus', (id) => {
    const tab = activeTab(id);
    if (!tab) return false;
    tabs.activate(tab.id);
    tab.contents.focus();
    return true;
  });

  handle('tab:copyUrl', (id) => {
    const tab = activeTab(id);
    if (!tab) return false;
    clipboard.writeText(tab.url);
    return true;
  });

  handle('tab:copyText', (text) => {
    clipboard.writeText(String(text ?? ''));
    return true;
  });

  handle('tab:openExternal', (id) => {
    const tab = activeTab(id);
    if (!tab) return false;
    return openExternal(tab.url);
  });

  handle('tab:inspect', (id) => {
    const tab = activeTab(id);
    if (!tab) return false;
    tab.contents.openDevTools({ mode: 'detach' });
    return true;
  });

  handle('tab:print', (id) => {
    const tab = activeTab(id);
    if (!tab) return false;
    tab.contents.print({ silent: false, printBackground: true });
    return true;
  });

  handle('tab:translate', (id) => {
    const tab = activeTab(id);
    if (!tab || isInternalUrl(tab.url)) return false;
    surface.send('toast', { message: 'toast.noTranslator', kind: 'info' });
    return false;
  });

  handle('tab:find', (id, query, { forward = true, caseSensitive = false, wholeWord = false, regex = false } = {}) => {
    const tab = activeTab(id);
    if (!tab) return null;
    if (!query) {
      tab.contents.stopFindInPage('clearSelection');
      return { activeMatchOrdinal: 0, matches: 0 };
    }
    tab.contents.findInPage(query, { forward, findNext: false, caseSensitive, wholeWord, regex });
    return { pending: true };
  });

  handle('tab:findNext', (id) => {
    const tab = activeTab(id);
    if (!tab) return null;
    tab.contents.findNext(true);
    return true;
  });

  handle('tab:findStop', (id, keepSelection = false) => {
    const tab = activeTab(id);
    if (!tab) return null;
    tab.contents.stopFindInPage(keepSelection ? 'keepSelection' : 'clearSelection');
    return true;
  });

handle('tab:confirmClose', (id, answer) => {
  resolvePending(id, answer);
  return true;
});

  /* ------------------------------------------------------------ suggestions */
  handle('search:suggest', (query) => {
    if (!settings.value('search.suggestions')) return [];
    return suggestionList(query, 8);
  });

  handle('search:resolve', (input) => resolveTarget(input));
  handle('search:engines', () => activeEngines());

  /* ------------------------------------------------------------ extensions */
  handle('extensions:list', () => extensions.list());
  handle('extensions:install', async () => {
    if (!settings.value('extensions.allowUnpacked')) return { ok: false, error: 'blocked' };
    const result = await dialog.showOpenDialog(chromeWindow(), {
      title: 'Hinterland',
      properties: ['openDirectory'],
    });
    if (result.canceled) return { ok: false };
    try {
      const id = await extensions.install(result.filePaths[0]);
      return { ok: true, id, list: extensions.list() };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  handle('extensions:installPath', async (path) => {
    if (!settings.value('extensions.allowUnpacked')) return { ok: false, error: 'blocked' };
    try {
      const id = await extensions.install(path);
      return { ok: true, id, list: extensions.list() };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  handle('extensions:uninstall', async (id) => {
    const ok = await extensions.uninstall(id);
    return { ok, list: extensions.list() };
  });
  handle('extensions:toggle', async (id, enabled) => {
    const list = await extensions.setEnabled(id, enabled);
    return { list };
  });
  handle('extensions:reload', async (id) => {
    const ok = await extensions.reload(id);
    return { ok, list: extensions.list() };
  });
  handle('extensions:reveal', (id) => extensions.reveal(id));

  handle('extensions:info', (id) => extensions.info(id));
  handle('extensions:action', (id) => extensions.executeAction(id));

  /* --------------------------------------------------------------- history */
  handle('history:search', (query) => history.search(query, 60));
  handle('history:clear', () => {
    history.clear();
    return true;
  });
  handle('history:remove', (url) => {
    history.remove(url);
    return true;
  });

  /* ----------------------------------------------------------------- data */
  handle('data:clear', async (options) => {
    await clearBrowsingData(options);
    surface.send('toast', { message: 'toast.dataCleared', kind: 'success' });
    return true;
  });

  handle('shell:open', (url) => {
    if (handOffToSystem(url)) return true;
    return openExternal(url);
  });

handle('permission:resolve', (requestId, answer) => {
    resolvePending(requestId, answer);
    return true;
  });

  const PAGE_KEYS = [
    'start.layout',
    'start.background',
    'start.backgroundOverlay',
    'start.showClock',
    'start.showSearch',
    'start.showGreeting',
    'start.searchTarget',
    'start.links',
    'appearance.accent',
    'appearance.accentContrast',
    'appearance.darkBackground',
    'appearance.darkSurface',
    'appearance.darkText',
    'appearance.lightBackground',
    'appearance.lightSurface',
    'appearance.lightText',
    'appearance.radius',
    'appearance.fontSize',
    'appearance.customFont',
    'appearance.blur',
    'appearance.theme',
  ];

  handle('page:settings', (patch) => {
    if (patch && typeof patch === 'object') {
      const allowed = {};
      for (const key of PAGE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) allowed[key] = patch[key];
      }
      if (Object.keys(allowed).length) settings.merge(allowed);
    }
    const values = settings.all();
    const result = {};
    for (const key of PAGE_KEYS) result[key] = values[key] ?? values[key.split('.').slice(1).join('.')];
    return result;
  });

handle('dialog:confirm', async ({ title, message, detail, confirmLabel, cancelLabel }) => {
  const result = await dialog.showMessageBox(chromeWindow(), {
    type: 'question',
    buttons: [confirmLabel || 'OK', cancelLabel || 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: title || 'Hinterland',
    message: message || '',
    detail: detail || '',
  });
  return result.response === 0;
  });
}

const pendingRequests = new Map();

function resolvePending(id, answer) {
  const resolver = pendingRequests.get(id);
  pendingRequests.delete(id);
  resolver?.(Boolean(answer));
}

export function askPermission({ permission, origin, mediaTypes }) {
  const id = `p${Date.now().toString(36)}${(askPermission.counter = (askPermission.counter ?? 0) + 1).toString(36)}`;
  surface.send('permission:request', { id, permission, origin, mediaTypes });
  return new Promise((resolve) => pendingRequests.set(id, resolve));
}

export function askCloseTab(snapshot) {
  surface.send('tab:confirmClose', { id: snapshot.id, title: snapshot.title, url: snapshot.url });
  return new Promise((resolve) => pendingRequests.set(snapshot.id, resolve));
}

function chromeWindow() {
  return surface.window ?? BrowserWindow.getFocusedWindow() ?? undefined;
}

export function startupUrl() {
  const homepage = settings.value('general.homepage');
  if (homepage && homepage.trim()) return resolveTarget(homepage).url ?? NEW_TAB_URL;
  return NEW_TAB_URL;
}