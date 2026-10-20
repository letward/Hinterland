import { BrowserWindow, WebContentsView, screen } from 'electron';
import { app } from 'electron';
import { SCHEME, NEW_TAB_URL } from './constants.js';
import { CHROME_PRELOAD, appIconPath } from './resources.js';
import { settings } from './settings.js';
import { tabs } from './tabs.js';
import { resolveLanguage } from './i18n.js';

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 840;

function chromePreferences() {
  return {
    preload: CHROME_PRELOAD,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    webviewTag: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    safeDialogs: true,
    spellcheck: false,
    devTools: app.isPackaged === false,
    additionalArguments: [
      '--hinterland-view=chrome',
      `--hinterland-lang=${resolveLanguage(settings.value('general.language'))}`,
    ],
  };
}

export class BrowserSurface {
  constructor() {
    this.window = null;
    this.chromeView = null;
    this.contentView = null;
    this.chromeHeight = 96;
    this.popupBottom = 0;
    this.fullChrome = false;
    this.shown = false;
    this.destroyed = false;
  }

  create() {
    const area = screen.getPrimaryDisplay().workArea;
    const width = Math.min(DEFAULT_WIDTH, Math.max(640, area.width - 80));
    const height = Math.min(DEFAULT_HEIGHT, Math.max(480, area.height - 80));

    this.window = new BrowserWindow({
      width,
      height,
      minWidth: 460,
      minHeight: 340,
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
      show: false,
      frame: false,
      backgroundColor: '#00000000',
      title: app.getName(),
      icon: appIconPath() || undefined,
      autoHideMenuBar: true,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        backgroundThrottling: false,
      },
    });

    this.window.webContents.on('will-navigate', (event) => event.preventDefault());
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.window.webContents.loadURL('about:blank').catch(() => {});

    this.chromeView = new WebContentsView({ webPreferences: chromePreferences() });
    this.window.contentView.addChildView(this.chromeView);
    this.chromeView.setBounds({ x: 0, y: 0, width, height: this.chromeHeight });

    this.attachWindowEvents();
    this.chromeView.webContents.on('did-finish-load', () => this.ready());
    this.chromeView.webContents.loadURL(`${SCHEME}://app/`).catch(() => {});
    setTimeout(() => this.ready(), 2500);
    return this.window;
  }

  ready() {
    if (this.shown || !this.window || this.window.isDestroyed()) return;
    this.shown = true;
    this.layout();
    this.syncTabs();
    this.window.show();
    this.window.focus();
    this.send('window:state', this.state());
  }

  attachWindowEvents() {
    const win = this.window;

    win.once('ready-to-show', () => this.ready());

    win.on('resize', () => this.layout());
    win.on('move', () => this.send('window:state', this.state()));
    win.on('maximize', () => this.send('window:state', this.state()));
    win.on('unmaximize', () => this.send('window:state', this.state()));
    win.on('minimize', () => this.send('window:state', this.state()));
    win.on('restore', () => this.send('window:state', this.state()));
    win.on('focus', () => this.send('window:state', this.state()));
    win.on('blur', () => this.send('window:state', this.state()));

    win.on('enter-full-screen', () => {
      this.chromeView.setVisible(false);
      this.layout(true);
      this.send('window:state', this.state());
    });
    win.on('leave-full-screen', () => {
      this.chromeView.setVisible(true);
      this.layout();
      this.send('window:state', this.state());
    });

    win.on('enter-html-full-screen', () => {
      this.chromeView.setVisible(false);
      const { width, height } = win.getContentBounds();
      this.contentView?.setBounds({ x: 0, y: 0, width, height });
    });
    win.on('leave-html-full-screen', () => {
      this.chromeView.setVisible(true);
      this.layout();
    });

    win.on('close', () => tabs.saveNow());
    win.on('closed', () => {
      this.destroyed = true;
      this.window = null;
      this.chromeView = null;
      this.contentView = null;
    });
  }

  state() {
    const win = this.window;
    if (!win || win.isDestroyed()) {
      return { maximized: false, fullScreen: false, minimized: false, focused: false };
    }
    return {
      maximized: win.isMaximized(),
      fullScreen: win.isFullScreen(),
      minimized: win.isMinimized(),
      focused: win.isFocused(),
    };
  }

  setChromeHeight(height) {
    this.chromeHeight = Math.max(0, Math.round(Number(height) || 0));
    this.layout();
  }

  setPopupBottom(bottom) {
    this.popupBottom = Math.max(0, Math.round(Number(bottom) || 0));
    this.layout();
  }

  layout(fullWindow = false) {
    const win = this.window;
    if (!win || win.isDestroyed()) return;
    const { width, height } = win.getContentBounds();
    const edge = fullWindow || this.fullChrome || win.isFullScreen()
      ? height
      : Math.min(Math.max(this.chromeHeight, this.popupBottom), height);

    this.chromeView.setBounds({ x: 0, y: 0, width, height: edge });
    this.contentView?.setBounds({ x: 0, y: edge, width, height: Math.max(0, height - edge) });
  }

  setFullChrome(enabled) {
    this.fullChrome = Boolean(enabled);
    this.layout();
  }

  /** Keeps the chrome view on top and the active tab view directly underneath it. */
  stackViews() {
    const win = this.window;
    if (!win || win.isDestroyed()) return;
    const root = win.contentView;

    for (const tab of tabs.list) {
      if (tab.attached) {
        try {
          root.removeChildView(tab.view);
        } catch {
          /* the view is already detached */
        }
        tab.attached = false;
      }
    }

    const active = tabs.active;
    if (active) {
      root.addChildView(active.view);
      active.attached = true;
      this.contentView = active.view;
    } else {
      this.contentView = null;
    }

    root.addChildView(this.chromeView);
    this.layout();
  }

  syncTabs() {
    this.stackViews();
    this.send('tabs:sync', tabs.snapshot());
  }

  send(channel, payload) {
    if (this.destroyed || !this.chromeView) return;
    const contents = this.chromeView.webContents;
    if (!contents || contents.isDestroyed()) return;
    contents.send(channel, payload);
  }

  minimize() {
    this.window?.minimize();
  }

  toggleMaximize() {
    const win = this.window;
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }

  toggleFullScreen() {
    const win = this.window;
    if (!win) return;
    win.setFullScreen(!win.isFullScreen());
  }

  close() {
    this.window?.close();
  }

  focusContent() {
    this.contentView?.webContents.focus();
  }
}

export const surface = new BrowserSurface();

export function currentUrl() {
  return tabs.active?.url ?? NEW_TAB_URL;
}