import { WebContentsView } from 'electron';
import { EventEmitter } from 'node:events';
import { NEW_TAB_URL, VIEW_ROLE, PARTITION, PRIVATE_PARTITION } from './constants.js';
import { PAGE_PRELOAD } from './resources.js';
import { settings } from './settings.js';
import { handOffToSystem, isNavigable } from './security.js';
import { showWebContextMenu } from './contextMenu.js';

let sequence = 0;

function webPreferences(privateMode) {
  const steps = Number(settings.value('content.defaultZoom')) || 0;
  return {
    preload: PAGE_PRELOAD,
    partition: privateMode ? PRIVATE_PARTITION : PARTITION,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    webviewTag: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    enableBlinkFeatures: '',
    safeDialogs: true,
    safeDialogsMessage: '',
    navigateOnDragDrop: false,
    spellcheck: settings.value('content.spellcheck'),
    enableWebSQL: false,
    autoplayPolicy: 'user-gesture-required',
    backgroundThrottling: true,
    v8CacheOptions: 'code',
    zoomFactor: steps === 0 ? 1 : Math.pow(1.1, steps),
    additionalArguments: [`--hinterland=1`, `--hinterland-view=${VIEW_ROLE.CONTENT}`],
  };
}

export class Tab {
  constructor(options = {}) {
    this.id = options.id ?? `t${Date.now().toString(36)}${(sequence += 1).toString(36)}`;
    this.privateMode = Boolean(options.privateMode);
    this.pinned = Boolean(options.pinned);
    this.title = options.title ?? '';
    this.url = options.url ?? NEW_TAB_URL;
    this.favicon = '';
    this.loading = false;
    this.audible = false;
    this.muted = false;
    this.zoom = 1;
    this.canGoBack = false;
    this.canGoForward = false;
    this.openerId = options.openerId ?? null;
    this.groupId = options.groupId ?? null;
    this.createdAt = Date.now();
    this.error = null;
    this.unresponsive = false;
    this.attached = false;
    this.readerActive = false;
    this.sleeping = false;
    this.sleepingUrl = null;
    this.sleepingTitle = null;
    this.events = new EventEmitter();
    this.events.setMaxListeners(20);

    this.view = new WebContentsView({ webPreferences: webPreferences(this.privateMode) });
    this.contents = this.view.webContents;
    this.install();
  }

  install() {
    const contents = this.contents;
    const refresh = () => this.events.emit('update');

    contents.setBackgroundThrottling(false);

    contents.on('did-start-loading', () => {
      this.loading = true;
      this.error = null;
      refresh();
    });

    contents.on('did-stop-loading', () => {
      this.loading = false;
      refresh();
    });

    contents.on('did-start-navigation', (_event, url, _inPlace, isMainFrame) => {
      if (!isMainFrame) return;
      if (this.sleeping) return;
      this.loading = true;
      this.readerActive = false;
      this.url = url;
      refresh();
    });

    contents.on('did-navigate', (_event, url) => {
      if (this.sleeping) return;
      this.url = url;
      this.canGoBack = contents.navigationHistory.canGoBack();
      this.canGoForward = contents.navigationHistory.canGoForward();
      this.restoreHostZoom(url);
      refresh();
    });

    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (!isMainFrame) return;
      if (this.sleeping) return;
      this.url = url;
      this.canGoBack = contents.navigationHistory.canGoBack();
      this.canGoForward = contents.navigationHistory.canGoForward();
      refresh();
    });

    contents.on('page-title-updated', (_event, title) => {
      if (this.sleeping) return;
      this.title = title;
      refresh();
    });

    contents.on('page-favicon-updated', (_event, favicons) => {
      if (this.sleeping) return;
      this.favicon = favicons?.[0] ?? '';
      refresh();
    });

    contents.on('media-started-playing', () => {
      this.audible = true;
      refresh();
    });

    contents.on('media-paused', () => {
      this.audible = false;
      refresh();
    });

    contents.on('found-in-page', (_event, result) => this.events.emit('found', result));

    contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (code === -3) return;
      this.loading = false;
      if (code === -2) {
        this.error = null;
      } else {
        this.error = { code, description: description || `error${code}`, url, mainFrame: Boolean(isMainFrame) };
      }
      refresh();
    });

    contents.on('unresponsive', () => {
      this.unresponsive = true;
      refresh();
    });

    contents.on('responsive', () => {
      this.unresponsive = false;
      refresh();
    });

    contents.on('render-process-gone', (_event, details) => {
      this.unresponsive = true;
      this.error = { code: -100, description: details?.reason ?? 'gone', url: this.url, mainFrame: true };
      refresh();
    });

    contents.on('will-navigate', (event, url) => {
      if (handOffToSystem(url)) {
        event.preventDefault();
        return;
      }
      if (!isNavigable(url)) event.preventDefault();
    });

    contents.on('will-redirect', (event, url) => {
      if (handOffToSystem(url)) event.preventDefault();
    });

    contents.setWindowOpenHandler(({ url, disposition }) => {
      this.events.emit('popup', { url, disposition });
      return { action: 'deny' };
    });

    contents.on('before-input-event', (_event, input) => {
      if (input.type !== 'keyDown') return;
      this.events.emit('key', input);
    });

    contents.on('context-menu', (_event, params) => {
      showWebContextMenu(this, params);
    });
  }

  on(event, handler) {
    this.events.on(event, handler);
    return this;
  }

  snapshot() {
    return {
      id: this.id,
      url: this.url,
      title: this.title,
      favicon: this.favicon,
      loading: this.loading,
      audible: this.audible,
      muted: this.muted,
      pinned: this.pinned,
      privateMode: this.privateMode,
      groupId: this.groupId,
      zoom: this.zoom,
      canGoBack: this.canGoBack,
      canGoForward: this.canGoForward,
      readerActive: this.readerActive,
      sleeping: this.sleeping,
      error: this.error,
      unresponsive: this.unresponsive,
    };
  }

  persist() {
    return {
      url: this.sleepingUrl || this.url,
      title: this.sleepingTitle || this.title,
      pinned: this.pinned,
      privateMode: this.privateMode,
      groupId: this.groupId,
    };
  }

  sleep() {
    if (this.sleeping || this.url === 'about:blank' || this.url.startsWith('hinterland://')) return false;
    this.sleeping = true;
    this.sleepingUrl = this.url;
    this.sleepingTitle = this.title;
    this.contents.stop();
    this.contents.loadURL('about:blank').catch(() => {});
    this.events.emit('update');
    return true;
  }

  wake() {
    if (!this.sleeping) return false;
    this.sleeping = false;
    const target = this.sleepingUrl || this.url;
    this.sleepingUrl = null;
    this.sleepingTitle = null;
    this.loadUrl(target);
    return true;
  }

  loadUrl(url) {
    const value = typeof url === 'string' && url ? url : NEW_TAB_URL;
    this.url = value;
    this.readerActive = false;
    return this.contents.loadURL(value).catch((error) => {
      console.warn('[Hinterland] Page could not be opened.', value, error?.message ?? error);
      return null;
    });
  }

  async togglePiP() {
    if (!this.contents || this.contents.isDestroyed() || this.sleeping) return { success: false, reason: 'unavailable' };
    try {
      const res = await this.contents.executeJavaScript((() => {
        try {
          if (document.pictureInPictureElement) {
            document.exitPictureInPicture();
            return { active: false, success: true };
          }
          const video = document.querySelector('video');
          if (video) {
            video.requestPictureInPicture();
            return { active: true, success: true };
          }
          return { active: false, success: false, reason: 'no_video' };
        } catch (e) {
          return { active: false, success: false, error: e.message };
        }
      })());
      return res || { success: false };
    } catch {
      return { success: false };
    }
  }

  async toggleMediaPlay() {
    if (!this.contents || this.contents.isDestroyed() || this.sleeping) return { success: false, reason: 'unavailable' };
    try {
      const res = await this.contents.executeJavaScript((() => {
        try {
          const media = Array.from(document.querySelectorAll('video, audio')).find((m) => !m.paused) || document.querySelector('video, audio');
          if (!media) return { playing: false, success: false, reason: 'no_media' };
          if (media.paused) {
            media.play();
            return { playing: true, success: true };
          } else {
            media.pause();
            return { playing: false, success: true };
          }
        } catch (e) {
          return { playing: false, success: false, error: e.message };
        }
      })());
      return res || { success: false };
    } catch {
      return { success: false };
    }
  }

  restoreHostZoom(url) {
    if (!url || !url.startsWith('http') || !this.contents || this.contents.isDestroyed()) return;
    try {
      const host = new URL(url).hostname;
      if (!host) return;
      const levels = settings.value('site.zoomLevels') || {};
      if (levels[host] && typeof levels[host] === 'number') {
        const factor = levels[host];
        if (Math.abs(this.zoom - factor) > 0.01) {
          this.zoom = factor;
          this.contents.setZoomFactor(factor);
        }
      }
    } catch {
      /* ignore */
    }
  }

  async close() {
    this.events.removeAllListeners();
    if (!this.contents.isDestroyed()) this.contents.close();
  }
}