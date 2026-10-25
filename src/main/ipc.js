import { ipcMain, dialog, shell, app, clipboard, BrowserWindow } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NEW_TAB_URL, DEFAULT_SHORTCUTS } from './constants.js';
import { settings } from './settings.js';
import { exportSchema } from './schema.js';
import { translations, availableLanguages, resolveLanguage } from './i18n.js';
import { tabs } from './tabs.js';
import { surface } from './windows.js';
import { extensions } from './extensions.js';
import { hinterStore } from './store.js';
import { history } from './history.js';
import { resolveTarget, suggestionList, activeEngines } from './navigation.js';
import { isInternalUrl } from './protocol.js';
import { openExternal, blockedSummary, handOffToSystem } from './security.js';
import updater from 'electron-updater';
const { autoUpdater } = updater;
import { applySettings, clearBrowsingData, downloadDirectory, clearSiteData } from './sessions.js';
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

  handle('app:getClipboardText', () => clipboard.readText());

  /* -------------------------------------------------------- task manager & metrics */
  handle('app:metrics', () => {
    const metrics = app.getAppMetrics();
    const tabList = tabs.list;
    const tabByPid = new Map();

    for (const tab of tabList) {
      if (!tab.contents || tab.contents.isDestroyed()) continue;
      try {
        const pid = (typeof tab.contents.getOSProcessId === 'function' ? tab.contents.getOSProcessId() : null) || tab.contents.getProcessId();
        if (!tabByPid.has(pid)) tabByPid.set(pid, []);
        tabByPid.get(pid).push(tab.snapshot());
      } catch {
        // ignore
      }
    }

    let totalMemoryKB = 0;
    const processes = metrics.map((item) => {
      const memoryKB = item.memory ? (item.memory.workingSetSize || item.memory.privateBytes || 0) : 0;
      totalMemoryKB += memoryKB;
      const cpuPercent = item.cpu ? Math.round(item.cpu.percentCPUUsage * 10) / 10 : 0;
      const associatedTabs = tabByPid.get(item.pid) || [];

      return {
        pid: item.pid,
        type: item.type,
        cpu: cpuPercent,
        memoryKB,
        tabs: associatedTabs,
      };
    });

    return {
      processes,
      totalMemoryKB,
      tabCount: tabList.length,
      processCount: processes.length,
    };
  });

  handle('app:killProcess', (pid) => {
    if (pid === process.pid) return false;
    try {
      process.kill(pid);
      return true;
    } catch {
      return false;
    }
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

  handle('settings:saveFile', async (name, content) => {
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
  handle('tabs:reopen', (index) => tabs.reopenClosed(index));
  handle('tabs:recentlyClosed', () => tabs.recentlyClosed());
  handle('tabs:restoreClosed', (index) => tabs.reopenClosed(index));
  handle('tabs:clearRecentlyClosed', () => tabs.clearRecentlyClosed());
  handle('tabs:restoreAllClosed', () => tabs.restoreAllClosed());
  handle('tabs:closeOthers', async (id) => {
    const keep = activeTab(id);
    for (const tab of [...tabs.list]) {
      if (tab.id === keep?.id || tab.pinned) continue;
      await tabs.close(tab.id, { force: true });
    }
    return tabs.snapshot();
  });
  handle('tabs:closeRight', (id) => tabs.closeRight(id));
  handle('tabs:closeLeft', (id) => tabs.closeLeft(id));
  handle('tabs:closeAll', () => tabs.closeAll());
  handle('tabs:muteOthers', (id) => {
    const keep = activeTab(id);
    for (const tab of tabs.list) {
      if (tab.id === keep?.id) continue;
      tab.muted = true;
      tab.contents.setAudioMuted(true);
      surface.send('tab:update', { ...tab.snapshot(), id: tab.id });
    }
    return true;
  });
  handle('tabs:sleepOthers', (id) => tabs.sleepOthers(id));
  handle('tabs:reloadAll', () => {
    for (const tab of tabs.list) {
      tab.contents.reload();
    }
    return true;
  });

  handle('tabs:closeDuplicates', async () => {
    const count = await tabs.closeDuplicates();
    surface.send('toast', {
      message: count > 0 ? 'toast.duplicateTabsClosed' : 'toast.noDuplicateTabs',
      kind: count > 0 ? 'success' : 'info',
    });
    return count;
  });

  handle('tabs:muteAll', (muted = true) => {
    const count = tabs.muteAll(muted);
    surface.send('toast', {
      message: muted ? 'toast.allTabsMuted' : 'toast.allTabsUnmuted',
      kind: 'info',
    });
    return count;
  });

  /* ------------------------------------------------------------- tab groups */
  function sortedGroups() {
    const groups = [...(settings.value('tabs.groups', []))];
    return groups
      .map((group, index) => ({ ...group, order: typeof group.order === 'number' ? group.order : index }))
      .sort((a, b) => a.order - b.order);
  }

  function persistGroups(groups) {
    const normalized = groups.map((group, index) => ({
      id: group.id,
      name: String(group.name || 'New group').trim().slice(0, 40) || 'New group',
      color: /^#[0-9a-f]{6}$/i.test(group.color || '') ? group.color : '#4f7cff',
      collapsed: Boolean(group.collapsed),
      order: index,
    }));
    settings.set('tabs.groups', normalized);
    surface.send('tabs:groups', normalized);
    return normalized;
  }

  handle('tabs:groups', () => sortedGroups());

  handle('tabs:groupCreate', (group) => {
    const groups = sortedGroups();
    const id = group?.id ?? `g${Date.now().toString(36)}`;
    groups.push({
      id,
      name: group?.name || 'New group',
      color: group?.color || '#4f7cff',
      collapsed: false,
    });
    return persistGroups(groups);
  });

  handle('tabs:groupUpdate', (id, patch) => {
    const groups = sortedGroups();
    const idx = groups.findIndex((g) => g.id === id);
    if (idx === -1) return false;
    if (patch && typeof patch === 'object') {
      if (typeof patch.name === 'string') groups[idx].name = patch.name;
      if (typeof patch.color === 'string') groups[idx].color = patch.color;
      if (typeof patch.collapsed === 'boolean') groups[idx].collapsed = patch.collapsed;
    }
    persistGroups(groups);
    return true;
  });

  handle('tabs:groupRename', (id, name) => {
    const groups = sortedGroups();
    const idx = groups.findIndex((g) => g.id === id);
    if (idx === -1) return false;
    const trimmed = String(name ?? '').trim().slice(0, 40);
    if (!trimmed) return { ok: false, error: 'emptyName' };
    groups[idx].name = trimmed;
    persistGroups(groups);
    return { ok: true, name: trimmed };
  });

  handle('tabs:groupRecolor', (id, color) => {
    const groups = sortedGroups();
    const idx = groups.findIndex((g) => g.id === id);
    if (idx === -1) return false;
    if (!/^#[0-9a-f]{6}$/i.test(String(color || ''))) return { ok: false, error: 'invalidColor' };
    groups[idx].color = color;
    persistGroups(groups);
    return { ok: true, color };
  });

  handle('tabs:groupReorder', (id, targetIndex) => {
    const groups = sortedGroups();
    const idx = groups.findIndex((g) => g.id === id);
    if (idx === -1) return false;
    const [moved] = groups.splice(idx, 1);
    const clamped = Math.max(0, Math.min(Number(targetIndex) || 0, groups.length));
    groups.splice(clamped, 0, moved);
    persistGroups(groups);
    return true;
  });

  handle('tabs:groupDelete', (id) => {
    const groups = sortedGroups().filter((g) => g.id !== id);
    persistGroups(groups);
    for (const tab of tabs.list) {
      if (tab.groupId === id) {
        tab.groupId = null;
        surface.send('tab:update', tab.snapshot());
      }
    }
    tabs.scheduleSave();
    return true;
  });

  handle('tabs:setGroup', (tabId, groupId, index = null) => {
    const tab = tabs.byId(tabId);
    if (!tab) return false;
    const groups = sortedGroups();
    const match = groups.find((g) => g.id === groupId || g.name === groupId);
    tab.groupId = match ? match.id : (groupId ?? null);
    tabs.scheduleSave();
    surface.send('tab:update', tab.snapshot());
    return true;
  });

  handle('tabs:groupMoveTab', (tabId, groupId, index = null) => {
    const tab = tabs.byId(tabId);
    if (!tab) return false;
    const groups = sortedGroups();
    const match = groupId ? groups.find((g) => g.id === groupId || g.name === groupId) : null;
    tab.groupId = match ? match.id : (groupId ?? null);
    tabs.scheduleSave();
    surface.send('tab:update', tab.snapshot());
    surface.send('tabs:sync', tabs.snapshot());
    return true;
  });

  handle('app:checkForUpdates', () => {
    try {
      if (!app.isPackaged) return { ok: false, error: 'notPackaged' };
      autoUpdater.checkForUpdates().catch((error) => {
        console.warn('[Hinterland] Update check failed.', error?.message ?? error);
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message ?? 'unknown' };
    }
  });
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
    const steps = Math.max(-3, Math.min(5, Math.round(Math.log(Number(factor) || 1) / Math.log(1.1))));
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

  handle('tab:readerMode', async (id) => {
    const tab = activeTab(id);
    if (!tab) return false;
    if (tab.readerActive) {
      tab.readerActive = false;
      try {
        await tab.contents.executeJavaScript('if (window.__hinterland_reader_exit) { window.__hinterland_reader_exit(); } else { location.reload(); }');
      } catch {
        tab.contents.reload();
      }
      surface.send('tab:update', { ...tab.snapshot(), id: tab.id });
      return false;
    }

    try {
      const ok = await tab.contents.executeJavaScript(`(${inPageReaderScript.toString()})()`);
      if (ok) {
        tab.readerActive = true;
        surface.send('tab:update', { ...tab.snapshot(), id: tab.id });
        return true;
      }
    } catch (error) {
      console.warn('[Hinterland] Reader mode error:', error?.message ?? error);
    }
    return false;
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

  handle('tab:copyMarkdown', (id) => {
    const tab = activeTab(id);
    if (!tab) return false;
    const title = (tab.title || tab.url || '').trim();
    clipboard.writeText(`[${title}](${tab.url})`);
    surface.send('toast', { message: 'toast.copiedMarkdown', kind: 'info' });
    return true;
  });

  handle('tab:copyLinkMarkdown', ({ text, url }) => {
    const label = (text || url || '').trim();
    clipboard.writeText(`[${label}](${url})`);
    surface.send('toast', { message: 'toast.copiedMarkdown', kind: 'info' });
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

  handle('tab:savePdf', async (id) => {
    const tab = activeTab(id);
    if (!tab) return { ok: false, error: 'noTab' };
    const rawTitle = (tab.title || 'page').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) || 'page';
    const defaultPath = join(downloadDirectory(), `${rawTitle}.pdf`);
    const result = await dialog.showSaveDialog(chromeWindow(), {
      title: 'Hinterland',
      defaultPath,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    try {
      const data = await tab.contents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
      });
      await writeFile(result.filePath, data);
      surface.send('toast', { message: 'toast.pdfSaved', kind: 'success' });
      return { ok: true, path: result.filePath };
    } catch (error) {
      console.warn('[Hinterland] PDF generation failed:', error?.message ?? error);
      surface.send('toast', { message: 'toast.pdfFailed', kind: 'error' });
      return { ok: false, error: error?.message };
    }
  });

  handle('tab:capture', async (id, { saveAs = false } = {}) => {
    const tab = activeTab(id);
    if (!tab || !tab.contents || tab.contents.isDestroyed()) return { ok: false, error: 'noTab' };
    try {
      const image = await tab.contents.capturePage();
      if (image.isEmpty()) return { ok: false, error: 'emptyImage' };

      if (saveAs) {
        const rawTitle = (tab.title || 'screenshot').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 50) || 'screenshot';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const defaultPath = join(downloadDirectory(), `${rawTitle}_${timestamp}.png`);
        const result = await dialog.showSaveDialog(chromeWindow(), {
          title: 'Hinterland',
          defaultPath,
          filters: [{ name: 'PNG Image', extensions: ['png'] }],
        });
        if (result.canceled || !result.filePath) return { ok: false, canceled: true };
        await writeFile(result.filePath, image.toPNG());
        surface.send('toast', { message: 'toast.screenshotSaved', kind: 'success' });
        return { ok: true, path: result.filePath, saved: true };
      }

      clipboard.writeImage(image);
      surface.send('toast', { message: 'toast.screenshotCopied', kind: 'success' });
      return { ok: true, copied: true };
    } catch (error) {
      console.warn('[Hinterland] Screen capture failed:', error?.message ?? error);
      surface.send('toast', { message: 'toast.screenshotFailed', kind: 'error' });
      return { ok: false, error: error?.message };
    }
  });

  handle('tab:sleep', (id) => tabs.sleep(id));
  handle('tab:wake', (id) => tabs.wake(id));

  handle('tab:translate', (id) => {
    const tab = activeTab(id);
    if (!tab || isInternalUrl(tab.url)) return false;
    const lang = resolveLanguage(settings.value('general.language')) || 'en';
    const targetUrl = `https://translate.google.com/translate?sl=auto&tl=${lang}&u=${encodeURIComponent(tab.url)}`;
    tabs.create({ url: targetUrl, background: false });
    return true;
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

  handle('tab:togglePiP', async (id) => {
    const tab = activeTab(id);
    if (!tab) return { success: false, reason: 'no_tab' };
    return await tab.togglePiP();
  });

  handle('tab:toggleMediaPlay', async (id) => {
    const tab = activeTab(id);
    if (!tab) return { success: false, reason: 'no_tab' };
    return await tab.toggleMediaPlay();
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

  ipcMain.handle('extension:closePopup', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.close();
      return true;
    }
    return false;
  });

  ipcMain.handle('extension:getSelfManifest', (event) => {
    const url = event.sender.getURL();
    return extensions.manifestForUrl(url);
  });

  /* ------------------------------------------------------------- hinter store */
  handle('store:catalog', () => hinterStore.catalog());
  handle('store:installExtension', ({ id, config } = {}) => hinterStore.installExtension(id, config));
  handle('store:uninstallExtension', (id) => hinterStore.uninstallExtension(id));
  handle('store:saveExtensionConfig', ({ id, config } = {}) => hinterStore.saveExtensionConfig(id, config));
  handle('store:getExtensionConfig', (id) => hinterStore.getExtensionConfig(id));
  handle('store:applyTheme', (theme) => hinterStore.applyTheme(theme));
  handle('store:installTheme', ({ theme, apply } = {}) => hinterStore.installCommunityTheme(theme, apply));
  handle('store:uninstallTheme', (id) => hinterStore.uninstallCommunityTheme(id));
  handle('store:exportTheme', (theme) => hinterStore.exportThemeFile(theme));
  handle('store:importThemeFile', () => hinterStore.importThemeFile());

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
  handle('data:clear', async (options = {}) => {
    if (options.closedTabs) {
      try {
        tabs.clearRecentlyClosed();
      } catch {}
    }
    await clearBrowsingData(options);
    surface.send('toast', { message: 'toast.dataCleared', kind: 'success' });
    return true;
  });
  handle('site:clearData', async (url) => {
    return clearSiteData(url);
  });

  handle('bookmarks:exportHtml', async (items) => {
    const list = Array.isArray(items) ? items : (settings.value('data.bookmarks') ?? []);
    const result = await dialog.showSaveDialog(chromeWindow(), {
      title: 'Hinterland',
      defaultPath: 'hinterland-bookmarks.html',
      filters: [{ name: 'HTML Bookmarks', extensions: ['html', 'htm'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };
    const date = Math.floor(Date.now() / 1000);
    const lines = [
      '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
      '<!-- This is an automatically generated file.',
      '     It will be read and overwritten.',
      '     DO NOT EDIT! -->',
      '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
      '<TITLE>Bookmarks</TITLE>',
      '<H1>Bookmarks</H1>',
      '<DL><p>',
    ];
    for (const item of list) {
      if (!item?.url) continue;
      const title = String(item.title || item.url).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      const url = String(item.url).replaceAll('"', '&quot;');
      lines.push(`    <DT><A HREF="${url}" ADD_DATE="${date}">${title}</A>`);
    }
    lines.push('</DL><p>');
    await writeFile(result.filePath, lines.join('\n'), 'utf8');
    surface.send('toast', { message: 'toast.bookmarksExported', kind: 'success' });
    return { ok: true, path: result.filePath };
  });

  handle('bookmarks:importHtml', async () => {
    const result = await dialog.showOpenDialog(chromeWindow(), {
      title: 'Hinterland',
      properties: ['openFile'],
      filters: [{ name: 'Bookmarks (HTML, JSON)', extensions: ['html', 'htm', 'json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false };
    const content = await readFile(result.filePaths[0], 'utf8');
    const existing = [...(settings.value('data.bookmarks') ?? [])];
    const existingUrls = new Set(existing.map((b) => b.url));
    const imported = [];

    if (result.filePaths[0].endsWith('.json')) {
      try {
        const parsed = JSON.parse(content);
        const list = Array.isArray(parsed) ? parsed : (parsed.bookmarks || []);
        for (const item of list) {
          if (item?.url && !existingUrls.has(item.url)) {
            existingUrls.add(item.url);
            imported.push({ title: item.title || item.url, url: item.url });
          }
        }
      } catch {
        return { ok: false, error: 'invalidJson' };
      }
    } else {
      const regex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const url = match[1].trim();
        const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();
        const title = rawTitle.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"');
        if (url && (url.startsWith('http://') || url.startsWith('https://')) && !existingUrls.has(url)) {
          existingUrls.add(url);
          imported.push({ title: title || url, url });
        }
      }
    }

    if (imported.length > 0) {
      const merged = [...existing, ...imported];
      settings.set('data.bookmarks', merged);
      surface.send('toast', { message: 'toast.bookmarksImported', kind: 'success' });
      return { ok: true, count: imported.length, bookmarks: merged };
    }
    return { ok: true, count: 0, bookmarks: existing };
  });

  /* ------------------------------------------------------------- reading list */
  handle('readingList:get', () => {
    return settings.value('data.readingList') || [];
  });

  handle('readingList:add', (item) => {
    const list = [...(settings.value('data.readingList') || [])];
    if (!item || !item.url) return { ok: false, error: 'noUrl' };
    const existingIdx = list.findIndex((e) => e.url === item.url);
    if (existingIdx !== -1) {
      list[existingIdx].read = false;
      list[existingIdx].addedAt = Date.now();
      if (item.title) list[existingIdx].title = item.title;
      if (item.favicon) list[existingIdx].favicon = item.favicon;
    } else {
      list.unshift({
        id: `rl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        url: item.url,
        title: item.title || item.url,
        favicon: item.favicon || '',
        addedAt: Date.now(),
        read: false,
      });
    }
    settings.set('data.readingList', list);
    surface.send('toast', { message: 'toast.addedToReadingList', kind: 'success' });
    return { ok: true, list };
  });

  handle('readingList:remove', (idOrUrl) => {
    const list = (settings.value('data.readingList') || []).filter((e) => e.id !== idOrUrl && e.url !== idOrUrl);
    settings.set('data.readingList', list);
    surface.send('toast', { message: 'toast.removedFromReadingList', kind: 'info' });
    return { ok: true, list };
  });

  handle('readingList:toggleRead', (id) => {
    const list = [...(settings.value('data.readingList') || [])];
    const item = list.find((e) => e.id === id);
    if (item) {
      item.read = !item.read;
      settings.set('data.readingList', list);
      return { ok: true, item, list };
    }
    return { ok: false };
  });

  handle('readingList:clearRead', () => {
    const list = (settings.value('data.readingList') || []).filter((e) => !e.read);
    settings.set('data.readingList', list);
    return { ok: true, list };
  });

  /* ---------------------------------------------------------------- notes */
  handle('notes:get', () => {
    return settings.value('data.notes') || [];
  });

  handle('notes:save', (note) => {
    if (!note || typeof note !== 'object') return null;
    const notes = [...(settings.value('data.notes') || [])];
    const index = notes.findIndex((n) => n.id === note.id);
    const updated = {
      id: note.id || `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      title: (note.title || '').trim(),
      content: note.content || '',
      pinned: Boolean(note.pinned),
      updatedAt: Date.now(),
    };
    if (index >= 0) {
      notes[index] = updated;
    } else {
      notes.unshift(updated);
    }
    settings.set('data.notes', notes);
    return updated;
  });

  handle('notes:delete', (id) => {
    const notes = (settings.value('data.notes') || []).filter((n) => n.id !== id);
    settings.set('data.notes', notes);
    return true;
  });

  handle('notes:export', async (note) => {
    if (!note) return { ok: false };
    const safeTitle = (note.title || 'note').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 50) || 'note';
    const result = await dialog.showSaveDialog(chromeWindow(), {
      title: 'Hinterland',
      defaultPath: `${safeTitle}.md`,
      filters: [{ name: 'Markdown', extensions: ['md', 'txt'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };
    await writeFile(result.filePath, note.content || '', 'utf8');
    surface.send('toast', { message: 'toast.noteExported', kind: 'success' });
    return { ok: true, path: result.filePath };
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

function inPageReaderScript() {
  const existing = document.getElementById('hinterland-reader-view');
  if (existing) {
    existing.remove();
    document.documentElement.style.overflow = '';
    return false;
  }

  const selectors = [
    'article',
    '[role="main"]',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.article-body',
    '.story-body',
    '#content',
    'main',
  ];

  let mainEl = null;
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText && el.innerText.length > 200) {
      mainEl = el;
      break;
    }
  }

  if (!mainEl) {
    const candidates = Array.from(document.querySelectorAll('div, section'));
    let maxLen = 0;
    for (const cand of candidates) {
      const ps = cand.querySelectorAll('p');
      if (ps.length >= 2) {
        let textLen = 0;
        ps.forEach((p) => { textLen += p.innerText.length; });
        if (textLen > maxLen) {
          maxLen = textLen;
          mainEl = cand;
        }
      }
    }
  }

  if (!mainEl) mainEl = document.body;

  const titleEl = document.querySelector('article h1, h1, [class*="title"], [class*="headline"]');
  const title = (titleEl?.innerText || document.title || 'Reader').trim();

  const authorEl = document.querySelector('article [rel="author"], .byline, [class*="author"], time');
  const author = (authorEl?.innerText || '').trim();

  const clone = mainEl.cloneNode(true);
  const junk = clone.querySelectorAll(
    'script, style, noscript, iframe, nav, footer, header, form, aside, button, input, textarea, select, ' +
    '[role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"], ' +
    '.nav, .navigation, .footer, .header, .sidebar, .comments, .social-share, .ad, .advertisement, [class*="banner"]'
  );
  junk.forEach((n) => n.remove());

  const fullText = clone.innerText || '';
  const wordCount = fullText.split(/\\s+/).filter(Boolean).length;
  const readMins = Math.max(1, Math.round(wordCount / 200));

  const overlay = document.createElement('div');
  overlay.id = 'hinterland-reader-view';
  overlay.setAttribute('data-hinterland-reader', 'true');

  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:' + (isDark ? '#14161d' : '#f7f8fa') + ';color:' + (isDark ? '#e4e7ee' : '#1a1c22') + ';overflow-y:auto;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Georgia,serif;font-size:18px;line-height:1.75;padding:0;margin:0;box-sizing:border-box;-webkit-font-smoothing:antialiased;';

  const bar = document.createElement('div');
  bar.style.cssText = 'position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;padding:12px 24px;background:' + (isDark ? 'rgba(20,22,29,0.92)' : 'rgba(247,248,250,0.92)') + ';backdrop-filter:blur(12px);border-bottom:1px solid ' + (isDark ? '#262a36' : '#e2e5eb') + ';z-index:10;';

  const infoBadge = document.createElement('span');
  infoBadge.style.cssText = 'font-size:13px;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;color:' + (isDark ? '#98a2b3' : '#667085') + ';display:flex;align-items:center;gap:8px;';
  infoBadge.textContent = readMins + ' min read • ' + wordCount + ' words';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '✕ Close';
  closeBtn.style.cssText = 'background:transparent;border:1px solid ' + (isDark ? '#344054' : '#d0d5dd') + ';border-radius:6px;color:inherit;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;font-size:13px;padding:4px 12px;cursor:pointer;';

  const exit = () => {
    overlay.remove();
    document.documentElement.style.overflow = '';
  };
  closeBtn.onclick = exit;
  window.__hinterland_reader_exit = exit;

  bar.appendChild(infoBadge);
  bar.appendChild(closeBtn);

  const container = document.createElement('div');
  container.style.cssText = 'max-width:720px;margin:0 auto;padding:48px 24px 96px;';

  const h1 = document.createElement('h1');
  h1.textContent = title;
  h1.style.cssText = 'font-size:32px;line-height:1.3;margin:0 0 16px 0;font-weight:700;letter-spacing:-0.02em;';
  container.appendChild(h1);

  if (author) {
    const meta = document.createElement('div');
    meta.textContent = author;
    meta.style.cssText = 'font-size:14px;color:' + (isDark ? '#98a2b3' : '#667085') + ';margin-bottom:24px;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;';
    container.appendChild(meta);
  }

  const divider = document.createElement('hr');
  divider.style.cssText = 'border:0;height:1px;background:' + (isDark ? '#262a36' : '#e2e5eb') + ';margin:24px 0 32px 0;';
  container.appendChild(divider);

  const contentHolder = document.createElement('div');
  contentHolder.innerHTML = clone.innerHTML;
  contentHolder.querySelectorAll('img').forEach((img) => {
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.borderRadius = '8px';
    img.style.margin = '20px 0';
  });
  contentHolder.querySelectorAll('p').forEach((p) => {
    p.style.marginBottom = '1.4em';
  });
  contentHolder.querySelectorAll('h2, h3, h4').forEach((h) => {
    h.style.margin = '1.8em 0 0.8em 0';
    h.style.fontWeight = '600';
  });
  contentHolder.querySelectorAll('a').forEach((a) => {
    a.style.color = '#4f7cff';
  });

  container.appendChild(contentHolder);
  overlay.appendChild(bar);
  overlay.appendChild(container);

  document.documentElement.style.overflow = 'hidden';
  document.body.appendChild(overlay);
  return true;
}