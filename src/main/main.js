import { app, dialog } from 'electron';
import updater from 'electron-updater';
const { autoUpdater } = updater;
import { NEW_TAB_URL } from './constants.js';
import { settings } from './settings.js';
import { history } from './history.js';
import { tabs } from './tabs.js';
import { surface } from './windows.js';
import { extensions } from './extensions.js';
import { registerScheme, registerHandler } from './protocol.js';
import { defaultSession, incognitoSession, applySettings, flush } from './sessions.js';
import { installPermissionPolicy, installRequestFilters } from './security.js';
import { attachDownloads } from './downloads.js';
import { applyContentSettings } from './content.js';
import { installShortcuts } from './shortcuts.js';
import { installIpc, askPermission, askCloseTab, startupUrl } from './ipc.js';
import { translate, resolveLanguage } from './i18n.js';
import { syncService } from './sync.js';

const isDevelopment = !app.isPackaged || process.argv.includes('--dev');
let started = false;

registerScheme();

if (!settings.value('advanced.hardwareAcceleration')) {
  app.disableHardwareAcceleration();
}

if (!settings.value('content.javascript')) {
  app.commandLine.appendSwitch('blink-settings', 'scriptEnabled=false');
}

if (isDevelopment) {
  app.commandLine.appendSwitch('enable-logging');
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const target = argv.find((argument) => /^https?:\/\//i.test(argument));
    if (surface.window) {
      if (surface.window.isMinimized()) surface.window.restore();
      surface.window.focus();
    }
    if (target) tabs.create({ url: target });
    else tabs.create({ url: NEW_TAB_URL });
  });
  bootstrap();
}

function bootstrap() {
  app.on('ready', start);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (!surface.window) {
      start();
      return;
    }
    surface.window.show();
    surface.window.focus();
  });

  app.on('before-quit', () => {
    settings.saveNow();
    tabs.saveNow();
    history.saveNow();
    flush();
  });
}

async function start() {
  if (started) return;
  started = true;

  settings.load();
  history.load();

  registerHandler();
  installShortcuts();

  for (const ses of [defaultSession(), incognitoSession()]) {
    applySettings();
    installPermissionPolicy(ses, { requestPermission: askPermission });
    installRequestFilters(ses);
    attachDownloads(ses);
  }

  await extensions.start();
  await extensions.loadAll();

  installIpc();
  syncService.start();
  wireSettings();
  wireTabs();

  surface.create();
  createStartupTabs();
  setupAutoUpdater();
}

function wireSettings() {
  syncService.on('status', (payload) => surface.send('account:status', payload));
  syncService.on('toast', (data) => surface.send('toast', data));
  settings.on('change', ({ key }) => {
    surface.send('settings:changed', { key, values: settings.all() });
    applyContentSettings(tabs.list);
    if (key === 'general.language') {
      const code = resolveLanguage(settings.value('general.language'));
      dialog
        .showMessageBox(surface.window ?? undefined, {
          type: 'info',
          title: app.getName(),
          message: translate(code, 'language.changedTitle'),
          detail: translate(code, 'language.changedBody'),
          buttons: [translate(code, 'action.ok')],
        })
        .catch(() => {});
    }
  });
}

function wireTabs() {
  const recorded = new Map();

  tabs.on('list', () => surface.syncTabs());
  tabs.on('update', (snapshot) => {
    surface.send('tab:update', snapshot);
    if (!snapshot.url || recorded.get(snapshot.id) === snapshot.url) return;
    recorded.set(snapshot.id, snapshot.url);
    history.record(snapshot.url, snapshot.title);
  });
  tabs.on('active', ({ activeId, tab }) => {
    surface.stackViews();
    surface.send('tab:active', { activeId, tab });
  });
  tabs.on('detach', () => surface.stackViews());
  tabs.on('found', (payload) => surface.send('tab:found', payload));
  tabs.on('toast', (data) => surface.send('toast', data));
  tabs.on('confirmClose', ({ tab, resolve }) => {
    askCloseTab(tab).then(resolve);
  });
}

function createStartupTabs() {
  const mode = settings.value('general.startMode');

  if (mode === 'custom') {
    const pages = settings.value('general.startPages') ?? [];
    const urls = pages.map((entry) => entry?.url).filter(Boolean);
    if (urls.length) {
      for (const url of urls.slice(0, 10)) tabs.create({ url, background: true });
      return;
    }
  }

  if (mode === 'restore' && settings.value('general.restoreOnStart')) {
    const saved = tabs.readSaved();
    if (saved && tabs.restore(saved)) return;
  }

  if (mode === 'blank') {
    tabs.create({ url: 'about:blank' });
    return;
  }

  tabs.create({ url: startupUrl() });

  const requested = process.argv.find((argument) => /^https?:\/\//i.test(argument));
  if (requested) tabs.create({ url: requested, background: true });
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      surface.send('update:available', { version: info.version });
      surface.send('toast', { message: `Update ${info.version} available, downloading...`, kind: 'info' });
    });

    autoUpdater.on('download-progress', (progress) => {
      surface.send('update:progress', { percent: Math.round(progress.percent || 0) });
    });

    autoUpdater.on('update-downloaded', (info) => {
      surface.send('update:downloaded', { version: info.version });
      surface.send('toast', { message: `Update ${info.version} ready. Restart to apply.`, kind: 'success' });
      dialog
        .showMessageBox(surface.window ?? undefined, {
          type: 'question',
          title: app.getName(),
          message: `Version ${info.version} has been downloaded.`,
          detail: 'Restart now to install the update, or it will be installed when you close Hinterland.',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
          cancelId: 1,
        })
        .then((result) => {
          if (result.response === 0) autoUpdater.quitAndInstall();
        })
        .catch(() => {});
    });

    autoUpdater.on('error', (error) => {
      console.warn('[Hinterland] Auto-update error.', error?.message ?? error);
    });

    autoUpdater.checkForUpdates().catch((error) => {
      console.warn('[Hinterland] Update check failed.', error?.message ?? error);
    });
  } catch (error) {
    console.warn('[Hinterland] Auto-updater could not be initialised.', error?.message ?? error);
  }
}

process.on('uncaughtException', (error) => {
  console.error('[Hinterland] Unexpected error.', error);
});