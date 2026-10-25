import { ipcMain, dialog, shell, app, clipboard, BrowserWindow, nativeImage } from 'electron';
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

  handle('app:copyImage', (dataUrl) => {
    if (!dataUrl || typeof dataUrl !== 'string') return false;
    try {
      const img = nativeImage.createFromDataURL(dataUrl);
      if (!img.isEmpty()) {
        clipboard.writeImage(img);
        return true;
      }
    } catch (e) {
      console.warn('[Hinterland] Error copying image to clipboard:', e?.message ?? e);
    }
    return false;
  });

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
  handle('tabs:memorySaverStats', () => tabs.getMemorySaverStats());
  handle('tabs:sleepInactive', (delay) => tabs.sleepInactive(delay));
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
    if (tab.url && tab.url.startsWith('http')) {
      try {
        const host = new URL(tab.url).hostname;
        if (host) {
          const levels = { ...(settings.value('site.zoomLevels') || {}) };
          if (Math.abs(tab.zoom - 1) < 0.02) delete levels[host];
          else levels[host] = tab.zoom;
          settings.set('site.zoomLevels', levels);
        }
      } catch {
        /* ignore invalid url */
      }
    }
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
      const prefs = {
        theme: settings.value('reader.theme') || 'sepia',
        font: settings.value('reader.fontFamily') || 'serif',
        size: Number(settings.value('reader.fontSize')) || 18,
        width: settings.value('reader.contentWidth') || 'standard',
      };
      const ok = await tab.contents.executeJavaScript(`(${inPageReaderScript.toString()})(${JSON.stringify(prefs)})`);
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

  handle('site:getPermissions', (rawUrl) => {
    try {
      const url = new URL(rawUrl);
      const origin = `${url.protocol}//${url.host}`;
      const sites = settings.value('privacy.sitePermissions') ?? {};
      return sites[origin] ?? {};
    } catch {
      return {};
    }
  });

  handle('site:setPermission', (rawUrl, permission, value) => {
    try {
      const url = new URL(rawUrl);
      const origin = `${url.protocol}//${url.host}`;
      const sites = { ...(settings.value('privacy.sitePermissions') ?? {}) };
      if (!sites[origin]) sites[origin] = {};
      if (value === 'default' || !value) {
        delete sites[origin][permission];
        if (Object.keys(sites[origin]).length === 0) delete sites[origin];
      } else {
        sites[origin][permission] = value;
      }
      settings.set('privacy.sitePermissions', sites);
      return { ok: true, permissions: sites[origin] ?? {} };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  handle('site:allPermissions', () => {
    return settings.value('privacy.sitePermissions') ?? {};
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

  /* ------------------------------------------------------------- tab stashes */
  handle('stashes:get', () => {
    return settings.value('data.tabStashes') || [];
  });

  handle('stashes:stashCurrent', async ({ title, keepActive = false } = {}) => {
    const currentTabs = tabs.list;
    const active = tabs.active;
    const tabsToStash = currentTabs.filter((t) => {
      if (!t.url || t.url === NEW_TAB_URL || t.url === 'about:blank') return false;
      if (keepActive && active && t.id === active.id) return false;
      return true;
    });

    if (!tabsToStash.length) {
      return { ok: false, error: 'no_tabs' };
    }

    const dateStr = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());

    const newStash = {
      id: `stash_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      title: (title || '').trim() || `${translate(language(), 'stash.defaultTitle')} (${dateStr})`,
      createdAt: Date.now(),
      tabs: tabsToStash.map((t) => ({
        url: t.url,
        title: t.title || t.url,
        favicon: t.favicon || '',
      })),
    };

    const stashes = [...(settings.value('data.tabStashes') || [])];
    stashes.unshift(newStash);
    settings.set('data.tabStashes', stashes);

    for (const t of tabsToStash) {
      tabs.close(t.id);
    }

    if (!tabs.list.length) {
      tabs.create({ url: NEW_TAB_URL });
    }

    surface.send('toast', {
      message: translate(language(), 'toast.tabsStashed', { count: tabsToStash.length }),
      kind: 'success',
    });

    return { ok: true, stash: newStash, count: tabsToStash.length };
  });

  handle('stashes:restore', async (stashId, { closeCurrent = false, removeStash = false } = {}) => {
    const stashes = [...(settings.value('data.tabStashes') || [])];
    const stash = stashes.find((s) => s.id === stashId);
    if (!stash || !stash.tabs?.length) return { ok: false, error: 'not_found' };

    if (closeCurrent) {
      tabs.closeAll();
    }

    for (let i = 0; i < stash.tabs.length; i++) {
      const entry = stash.tabs[i];
      tabs.create({ url: entry.url, background: i > 0, title: entry.title });
    }

    if (removeStash) {
      const updated = stashes.filter((s) => s.id !== stashId);
      settings.set('data.tabStashes', updated);
    }

    surface.send('toast', {
      message: translate(language(), 'toast.stashRestored', { count: stash.tabs.length }),
      kind: 'success',
    });

    return { ok: true, count: stash.tabs.length };
  });

  handle('stashes:delete', (stashId) => {
    const stashes = [...(settings.value('data.tabStashes') || [])];
    const updated = stashes.filter((s) => s.id !== stashId);
    settings.set('data.tabStashes', updated);
    return { ok: true };
  });

  handle('stashes:rename', (stashId, newTitle) => {
    const stashes = [...(settings.value('data.tabStashes') || [])];
    const stash = stashes.find((s) => s.id === stashId);
    if (stash) {
      stash.title = newTitle.trim() || stash.title;
      settings.set('data.tabStashes', stashes);
      return { ok: true, stash };
    }
    return { ok: false };
  });

  handle('stashes:removeTab', (stashId, tabIndex) => {
    const stashes = [...(settings.value('data.tabStashes') || [])];
    const stash = stashes.find((s) => s.id === stashId);
    if (stash && stash.tabs) {
      stash.tabs.splice(tabIndex, 1);
      if (stash.tabs.length === 0) {
        const idx = stashes.indexOf(stash);
        stashes.splice(idx, 1);
      }
      settings.set('data.tabStashes', stashes);
      return { ok: true, stash };
    }
    return { ok: false };
  });

  handle('stashes:exportJson', async (stashId = null) => {
    const stashes = settings.value('data.tabStashes') || [];
    const exportData = stashId ? stashes.filter((s) => s.id === stashId) : stashes;
    const json = JSON.stringify(exportData, null, 2);
    const result = await dialog.showSaveDialog(chromeWindow(), {
      title: 'Hinterland',
      defaultPath: `hinterland-stashes-${Date.now()}.json`,
      filters: [{ name: 'JSON Document', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };
    await writeFile(result.filePath, json, 'utf8');
    surface.send('toast', { message: 'toast.stashExported', kind: 'success' });
    return { ok: true, filePath: result.filePath };
  });

  handle('stashes:importJson', async () => {
    const result = await dialog.showOpenDialog(chromeWindow(), {
      title: 'Hinterland',
      properties: ['openFile'],
      filters: [{ name: 'JSON Document', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths.length) return { ok: false };
    try {
      const raw = await readFile(result.filePaths[0], 'utf8');
      const imported = JSON.parse(raw);
      const list = Array.isArray(imported) ? imported : [imported];
      const valid = list.filter((s) => s && Array.isArray(s.tabs) && s.tabs.length > 0).map((s) => ({
        id: s.id || `stash_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        title: s.title || 'Imported Stash',
        createdAt: s.createdAt || Date.now(),
        tabs: s.tabs.map((t) => ({ url: t.url, title: t.title || t.url, favicon: t.favicon || '' })),
      }));
      if (!valid.length) return { ok: false, error: 'invalid_format' };
      const existing = [...(settings.value('data.tabStashes') || [])];
      existing.unshift(...valid);
      settings.set('data.tabStashes', existing);
      surface.send('toast', {
        message: translate(language(), 'toast.stashImported', { count: valid.length }),
        kind: 'success',
      });
      return { ok: true, count: valid.length };
    } catch (err) {
      return { ok: false, error: err.message };
    }
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

function inPageReaderScript(initialPrefs) {
  const existing = document.getElementById('hinterland-reader-view');
  if (existing) {
    existing.remove();
    document.documentElement.style.overflow = '';
    return false;
  }

  const prefs = Object.assign({
    theme: 'sepia',
    font: 'serif',
    size: 18,
    width: 'standard',
  }, initialPrefs || {});

  const THEMES = {
    light: { bg: '#ffffff', text: '#1f2937', border: '#e5e7eb', meta: '#6b7280', barBg: 'rgba(255, 255, 255, 0.96)', cardBg: '#f3f4f6', link: '#2563eb' },
    sepia: { bg: '#fbf0d9', text: '#433422', border: '#e8dac2', meta: '#8c7b66', barBg: 'rgba(251, 240, 217, 0.96)', cardBg: '#f3e5c8', link: '#b45309' },
    dark: { bg: '#1a1d24', text: '#e2e8f0', border: '#2e3440', meta: '#94a3b8', barBg: 'rgba(26, 29, 36, 0.96)', cardBg: '#252934', link: '#60a5fa' },
    pitch: { bg: '#000000', text: '#f1f5f9', border: '#1f2937', meta: '#9ca3af', barBg: 'rgba(0, 0, 0, 0.96)', cardBg: '#141414', link: '#38bdf8' },
  };

  const FONTS = {
    serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  };

  const WIDTHS = {
    compact: '580px',
    standard: '740px',
    wide: '960px',
  };

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
  const wordCount = fullText.split(/\s+/).filter(Boolean).length;
  const readMins = Math.max(1, Math.round(wordCount / 200));

  const overlay = document.createElement('div');
  overlay.id = 'hinterland-reader-view';
  overlay.setAttribute('data-hinterland-reader', 'true');

  const container = document.createElement('div');
  const bar = document.createElement('div');
  const toastBox = document.createElement('div');

  function showToast(msg) {
    toastBox.textContent = msg;
    toastBox.style.opacity = '1';
    toastBox.style.transform = 'translateY(0)';
    setTimeout(() => {
      toastBox.style.opacity = '0';
      toastBox.style.transform = 'translateY(8px)';
    }, 2200);
  }

  function applyStyles() {
    const t = THEMES[prefs.theme] || THEMES.sepia;
    const f = FONTS[prefs.font] || FONTS.serif;
    const w = WIDTHS[prefs.width] || WIDTHS.standard;

    overlay.style.cssText = `position:fixed;inset:0;z-index:2147483647;background:${t.bg};color:${t.text};overflow-y:auto;font-family:${f};font-size:${prefs.size}px;line-height:1.75;padding:0;margin:0;box-sizing:border-box;-webkit-font-smoothing:antialiased;transition:background 0.2s, color 0.2s;`;
    bar.style.cssText = `position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding:10px 24px;background:${t.barBg};backdrop-filter:blur(12px);border-bottom:1px solid ${t.border};z-index:100;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;`;
    container.style.cssText = `max-width:${w};margin:0 auto;padding:48px 24px 96px;transition:max-width 0.2s;`;

    container.querySelectorAll('a').forEach((a) => { a.style.color = t.link; });
    const divider = container.querySelector('hr');
    if (divider) divider.style.background = t.border;
  }

  // Save prefs to Hinterland
  function notifyPrefs() {
    console.log('__HINTERLAND_READER_ACTION__:' + JSON.stringify({ action: 'savePrefs', prefs }));
  }

  // Extract clean Markdown
  function extractMarkdown() {
    let md = `# ${title}\n\n`;
    if (author) md += `*${author}* • *${readMins} min read*\n\n---\n\n`;
    const paragraphs = clone.querySelectorAll('p, h2, h3, h4, blockquote, pre, li');
    if (paragraphs.length) {
      paragraphs.forEach((p) => {
        const tag = p.tagName.toLowerCase();
        const text = p.innerText.trim();
        if (!text) return;
        if (tag === 'h2') md += `## ${text}\n\n`;
        else if (tag === 'h3') md += `### ${text}\n\n`;
        else if (tag === 'h4') md += `#### ${text}\n\n`;
        else if (tag === 'blockquote') md += `> ${text}\n\n`;
        else if (tag === 'pre') md += `\`\`\`\n${text}\n\`\`\`\n\n`;
        else if (tag === 'li') md += `- ${text}\n`;
        else md += `${text}\n\n`;
      });
    } else {
      md += fullText;
    }
    return md.trim();
  }

  // Top Bar elements
  const infoBadge = document.createElement('span');
  infoBadge.style.cssText = 'color:inherit;opacity:0.8;display:flex;align-items:center;gap:6px;font-size:13px;';
  infoBadge.textContent = `📖 ${readMins} min read • ${wordCount} words`;

  // Controls container
  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;';

  // 1. Theme controls
  const themeGroup = document.createElement('div');
  themeGroup.style.cssText = 'display:flex;align-items:center;gap:4px;background:rgba(125,125,125,0.12);padding:2px 4px;border-radius:20px;';
  [
    { id: 'light', label: '☀️', title: 'Light' },
    { id: 'sepia', label: '📜', title: 'Sepia' },
    { id: 'dark', label: '🌙', title: 'Dark' },
    { id: 'pitch', label: '⬛', title: 'Pitch' },
  ].forEach((thm) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = thm.label;
    btn.title = thm.title;
    btn.style.cssText = 'border:0;background:transparent;cursor:pointer;font-size:13px;padding:3px 6px;border-radius:12px;';
    btn.onclick = () => {
      prefs.theme = thm.id;
      applyStyles();
      notifyPrefs();
    };
    themeGroup.appendChild(btn);
  });

  // 2. Font family controls
  const fontGroup = document.createElement('div');
  fontGroup.style.cssText = 'display:flex;align-items:center;gap:2px;background:rgba(125,125,125,0.12);padding:2px 4px;border-radius:6px;';
  [
    { id: 'serif', label: 'Serif' },
    { id: 'sans', label: 'Sans' },
    { id: 'mono', label: 'Mono' },
  ].forEach((fnt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = fnt.label;
    btn.style.cssText = 'border:0;background:transparent;color:inherit;cursor:pointer;font-size:12px;padding:3px 8px;border-radius:4px;';
    btn.onclick = () => {
      prefs.font = fnt.id;
      applyStyles();
      notifyPrefs();
    };
    fontGroup.appendChild(btn);
  });

  // 3. Size controls
  const sizeGroup = document.createElement('div');
  sizeGroup.style.cssText = 'display:flex;align-items:center;gap:4px;';
  const sizeDown = document.createElement('button');
  sizeDown.type = 'button';
  sizeDown.textContent = 'A-';
  sizeDown.style.cssText = 'border:1px solid rgba(125,125,125,0.3);background:transparent;color:inherit;cursor:pointer;font-size:11px;padding:2px 6px;border-radius:4px;';
  const sizeVal = document.createElement('span');
  sizeVal.style.cssText = 'font-size:12px;opacity:0.8;min-width:32px;text-align:center;';
  sizeVal.textContent = `${prefs.size}px`;
  const sizeUp = document.createElement('button');
  sizeUp.type = 'button';
  sizeUp.textContent = 'A+';
  sizeUp.style.cssText = 'border:1px solid rgba(125,125,125,0.3);background:transparent;color:inherit;cursor:pointer;font-size:13px;padding:2px 6px;border-radius:4px;';

  sizeDown.onclick = () => {
    prefs.size = Math.max(14, prefs.size - 1);
    sizeVal.textContent = `${prefs.size}px`;
    applyStyles();
    notifyPrefs();
  };
  sizeUp.onclick = () => {
    prefs.size = Math.min(26, prefs.size + 1);
    sizeVal.textContent = `${prefs.size}px`;
    applyStyles();
    notifyPrefs();
  };
  sizeGroup.append(sizeDown, sizeVal, sizeUp);

  // 4. Width controls
  const widthGroup = document.createElement('div');
  widthGroup.style.cssText = 'display:flex;align-items:center;gap:2px;background:rgba(125,125,125,0.12);padding:2px 4px;border-radius:6px;';
  [
    { id: 'compact', label: 'Narrow' },
    { id: 'standard', label: 'Standard' },
    { id: 'wide', label: 'Wide' },
  ].forEach((w) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = w.label;
    btn.style.cssText = 'border:0;background:transparent;color:inherit;cursor:pointer;font-size:12px;padding:3px 6px;border-radius:4px;';
    btn.onclick = () => {
      prefs.width = w.id;
      applyStyles();
      notifyPrefs();
    };
    widthGroup.appendChild(btn);
  });

  // Action buttons
  const actionsGroup = document.createElement('div');
  actionsGroup.style.cssText = 'display:flex;align-items:center;gap:6px;';

  const readListBtn = document.createElement('button');
  readListBtn.type = 'button';
  readListBtn.textContent = '🔖 Reading List';
  readListBtn.style.cssText = 'border:1px solid rgba(125,125,125,0.3);background:transparent;color:inherit;cursor:pointer;font-size:12px;padding:3px 10px;border-radius:6px;';
  readListBtn.onclick = () => {
    console.log('__HINTERLAND_READER_ACTION__:' + JSON.stringify({
      action: 'addToReadingList',
      url: location.href,
      title,
    }));
    showToast('✓ Added to Reading List');
  };

  const copyMdBtn = document.createElement('button');
  copyMdBtn.type = 'button';
  copyMdBtn.textContent = '📋 Markdown';
  copyMdBtn.style.cssText = 'border:1px solid rgba(125,125,125,0.3);background:transparent;color:inherit;cursor:pointer;font-size:12px;padding:3px 10px;border-radius:6px;';
  copyMdBtn.onclick = () => {
    const md = extractMarkdown();
    navigator.clipboard.writeText(md).then(() => {
      showToast('✓ Markdown copied to clipboard');
    }).catch(() => {
      showToast('✓ Markdown generated');
    });
  };

  const printBtn = document.createElement('button');
  printBtn.type = 'button';
  printBtn.textContent = '🖨️';
  printBtn.title = 'Print article';
  printBtn.style.cssText = 'border:1px solid rgba(125,125,125,0.3);background:transparent;color:inherit;cursor:pointer;font-size:12px;padding:3px 8px;border-radius:6px;';
  printBtn.onclick = () => window.print();

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Exit reader mode (Esc)';
  closeBtn.style.cssText = 'border:1px solid rgba(125,125,125,0.3);background:transparent;color:inherit;cursor:pointer;font-size:13px;padding:3px 10px;border-radius:6px;';

  const exit = () => {
    overlay.remove();
    document.documentElement.style.overflow = '';
    window.removeEventListener('keydown', keyHandler);
    console.log('__HINTERLAND_READER_ACTION__:' + JSON.stringify({ action: 'exit' }));
  };
  closeBtn.onclick = exit;
  window.__hinterland_reader_exit = exit;

  const keyHandler = (e) => {
    if (e.key === 'Escape') exit();
  };
  window.addEventListener('keydown', keyHandler);

  controls.append(themeGroup, fontGroup, sizeGroup, widthGroup);
  actionsGroup.append(readListBtn, copyMdBtn, printBtn, closeBtn);

  bar.append(infoBadge, controls, actionsGroup);

  // Content
  const h1 = document.createElement('h1');
  h1.textContent = title;
  h1.style.cssText = 'font-size:2em;line-height:1.25;margin:0 0 16px 0;font-weight:700;letter-spacing:-0.02em;';
  container.appendChild(h1);

  if (author) {
    const meta = document.createElement('div');
    meta.textContent = author;
    meta.style.cssText = 'font-size:0.9em;opacity:0.8;margin-bottom:20px;';
    container.appendChild(meta);
  }

  const divider = document.createElement('hr');
  divider.style.cssText = 'border:0;height:1px;margin:20px 0 28px 0;';
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
  container.appendChild(contentHolder);

  // Toast
  toastBox.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(8px);background:#101828;color:#ffffff;padding:8px 18px;border-radius:24px;font-size:13px;font-family:-apple-system,sans-serif;opacity:0;transition:opacity 0.25s, transform 0.25s;pointer-events:none;z-index:200;box-shadow:0 4px 16px rgba(0,0,0,0.25);';

  overlay.appendChild(bar);
  overlay.appendChild(container);
  overlay.appendChild(toastBox);

  applyStyles();
  document.documentElement.style.overflow = 'hidden';
  document.body.appendChild(overlay);
  return true;
}
