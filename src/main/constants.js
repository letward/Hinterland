export const APP_NAME = 'Hinterland';
export const APP_ID = 'app.hinterland.browser';
export const SCHEME = 'hinterland';
export const SCHEME_ORIGIN = `${SCHEME}://app`;
export const SCHEME_VERSION = 1;
export const NEW_TAB_URL = `${SCHEME}://newtab/`;
export const HISTORY_URL = `${SCHEME}://history/`;
export const STORE_URL = `${SCHEME}://store/`;
export const INTERNAL_HOSTS = new Set(['newtab', 'history', 'bookmarks', 'extensions', 'settings', 'assets', 'app', 'strings', 'store']);
export const INTERNAL_PAGES = new Set(['newtab', 'history', 'bookmarks', 'extensions', 'settings', 'store']);

export const PARTITION = '';
export const PRIVATE_PARTITION = 'hinterland:private';

export const VIEW_ROLE = { CHROME: 'chrome', CONTENT: 'content' };

export const CHANNELS = {
  CHROME: 'chrome',
  PAGE: 'page',
  MAIN: 'main',
  DOWNLOAD: 'download',
  NOTIFICATION: 'notification',
  PERMISSION: 'permission',
};

export const DEFAULT_SHORTCUTS = {
  newTab: 'Ctrl+T',
  closeTab: 'Ctrl+W',
  reopenTab: 'Ctrl+Shift+T',
  nextTab: 'Ctrl+Tab',
  previousTab: 'Ctrl+Shift+Tab',
  goBack: 'Alt+Left',
  goForward: 'Alt+Right',
  reload: 'Ctrl+R',
  hardReload: 'Ctrl+Shift+R',
  stop: 'Esc',
  focusAddress: 'Ctrl+L',
  focusSearch: 'Ctrl+K',
  settings: 'Ctrl+,',
  bookmarks: 'Ctrl+Shift+B',
  history: 'Ctrl+H',
  find: 'Ctrl+F',
  zoomIn: 'Ctrl+=',
  zoomOut: 'Ctrl+-',
  zoomReset: 'Ctrl+0',
  fullscreen: 'F11',
  sidebar: 'Alt+M',
  privateTab: 'Ctrl+Shift+N',
  commandPalette: 'Ctrl+Shift+P',
  downloads: 'Ctrl+J',
  duplicateTab: 'Ctrl+Shift+D',
  muteTab: 'Ctrl+M',
  readerMode: 'Ctrl+Alt+R',
  pinTab: 'Alt+P',
  sleepTab: 'Alt+S',
  saveAsPdf: 'Ctrl+Shift+E',
  copyMarkdown: 'Ctrl+Shift+C',
  taskManager: 'Shift+Escape',
  capturePage: 'Ctrl+Shift+S',
  readingList: 'Ctrl+Shift+L',
  clearData: 'Ctrl+Shift+Delete',
  notes: 'Ctrl+Shift+Y',
  togglePiP: 'Ctrl+Shift+X',
  mediaControls: 'Ctrl+Alt+M',
};

/** Hosts that never warrant a secure connection upgrade. */
export const NEVER_UPGRADE = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

/** Scheme prefixes that can be opened directly from the address bar. */
export const NAVIGABLE_SCHEMES = new Set([
  'http:',
  'https:',
  'about:',
  'file:',
  'data:',
  'blob:',
  `${SCHEME}:`,
]);