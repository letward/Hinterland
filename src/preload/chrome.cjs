const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = [
  'tabs:sync',
  'tabs:groups',
  'tab:update',
  'tab:active',
  'tab:found',
  'tab:confirmClose',
  'window:state',
  'settings:changed',
  'extensions:changed',
  'download:new',
  'download:progress',
  'download:done',
  'permission:request',
  'toast',
  'shortcut',
  'update:available',
  'update:progress',
  'update:downloaded',
];

function listen(channel, handler) {
  if (!EVENTS.includes(channel)) throw new Error(`unknownChannel:${channel}`);
  const wrapped = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api = {
  events: { listen },

  app: {
    bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
    info: () => ipcRenderer.invoke('app:info'),
    checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
    openFolder: (target) => ipcRenderer.invoke('app:openFolder', target),
    revealFile: (path) => ipcRenderer.invoke('app:revealFile', path),
    getClipboardText: () => ipcRenderer.invoke('app:getClipboardText'),
    metrics: () => ipcRenderer.invoke('app:metrics'),
    killProcess: (pid) => ipcRenderer.invoke('app:killProcess', pid),
  },

  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    merge: (patch) => ipcRenderer.invoke('settings:merge', patch),
    reset: (key) => ipcRenderer.invoke('settings:reset', key),
    resetAll: () => ipcRenderer.invoke('settings:resetAll'),
    export: () => ipcRenderer.invoke('settings:export'),
    import: (text) => ipcRenderer.invoke('settings:import', text),
    saveFile: (name, content) => ipcRenderer.invoke('settings:saveFile', name, content),
    loadFile: () => ipcRenderer.invoke('settings:loadFile'),
    pickDirectory: (key) => ipcRenderer.invoke('settings:pickDirectory', key),
    pickFile: () => ipcRenderer.invoke('settings:pickFile'),
  },

  layout: {
    setChromeHeight: (height) => ipcRenderer.invoke('chrome:height', height),
    setPopupBottom: (bottom) => ipcRenderer.invoke('chrome:popup', bottom),
    setFullscreen: (enabled) => ipcRenderer.invoke('chrome:fullscreen', enabled),
  },

  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    fullscreen: () => ipcRenderer.invoke('window:fullscreen'),
    close: () => ipcRenderer.invoke('window:close'),
    state: () => ipcRenderer.invoke('window:state'),
  },

  tabs: {
    create: (options) => ipcRenderer.invoke('tabs:create', options),
    activate: (id) => ipcRenderer.invoke('tabs:activate', id),
    close: (id) => ipcRenderer.invoke('tabs:close', id),
    move: (id, index) => ipcRenderer.invoke('tabs:move', id, index),
    pin: (id, pinned) => ipcRenderer.invoke('tabs:pin', id, pinned),
    duplicate: (id) => ipcRenderer.invoke('tabs:duplicate', id),
    cycle: (delta) => ipcRenderer.invoke('tabs:cycle', delta),
    reopen: (index) => ipcRenderer.invoke('tabs:reopen', index),
    recentlyClosed: () => ipcRenderer.invoke('tabs:recentlyClosed'),
    restoreClosed: (index) => ipcRenderer.invoke('tabs:restoreClosed', index),
    clearRecentlyClosed: () => ipcRenderer.invoke('tabs:clearRecentlyClosed'),
    restoreAllClosed: () => ipcRenderer.invoke('tabs:restoreAllClosed'),
    closeOthers: (id) => ipcRenderer.invoke('tabs:closeOthers', id),
    closeLeft: (id) => ipcRenderer.invoke('tabs:closeLeft', id),
    closeRight: (id) => ipcRenderer.invoke('tabs:closeRight', id),
    closeAll: () => ipcRenderer.invoke('tabs:closeAll'),
    muteOthers: (id) => ipcRenderer.invoke('tabs:muteOthers', id),
    sleepOthers: (id) => ipcRenderer.invoke('tabs:sleepOthers', id),
    reloadAll: () => ipcRenderer.invoke('tabs:reloadAll'),
    closeDuplicates: () => ipcRenderer.invoke('tabs:closeDuplicates'),
    muteAll: (muted) => ipcRenderer.invoke('tabs:muteAll', muted),
    confirmClose: (id, answer) => ipcRenderer.invoke('tab:confirmClose', id, answer),
    groups: () => ipcRenderer.invoke('tabs:groups'),
    groupCreate: (group) => ipcRenderer.invoke('tabs:groupCreate', group),
    groupUpdate: (id, patch) => ipcRenderer.invoke('tabs:groupUpdate', id, patch),
    groupRename: (id, name) => ipcRenderer.invoke('tabs:groupRename', id, name),
    groupRecolor: (id, color) => ipcRenderer.invoke('tabs:groupRecolor', id, color),
    groupReorder: (id, index) => ipcRenderer.invoke('tabs:groupReorder', id, index),
    groupDelete: (id) => ipcRenderer.invoke('tabs:groupDelete', id),
    setGroup: (tabId, groupId) => ipcRenderer.invoke('tabs:setGroup', tabId, groupId),
    groupMoveTab: (tabId, groupId, index) => ipcRenderer.invoke('tabs:groupMoveTab', tabId, groupId, index),
  },

  tab: {
    navigate: (id, input) => ipcRenderer.invoke('tab:navigate', id, input),
    back: (id) => ipcRenderer.invoke('tab:back', id),
    forward: (id) => ipcRenderer.invoke('tab:forward', id),
    reload: (id, hard) => ipcRenderer.invoke('tab:reload', id, hard),
    stop: (id) => ipcRenderer.invoke('tab:stop', id),
    zoom: (id, factor) => ipcRenderer.invoke('tab:zoom', id, factor),
    mute: (id, muted) => ipcRenderer.invoke('tab:mute', id, muted),
    sleep: (id) => ipcRenderer.invoke('tab:sleep', id),
    wake: (id) => ipcRenderer.invoke('tab:wake', id),
    focus: (id) => ipcRenderer.invoke('tab:focus', id),
    copyUrl: (id) => ipcRenderer.invoke('tab:copyUrl', id),
    copyMarkdown: (id) => ipcRenderer.invoke('tab:copyMarkdown', id),
    copyLinkMarkdown: (text, url) => ipcRenderer.invoke('tab:copyLinkMarkdown', { text, url }),
    copyText: (text) => ipcRenderer.invoke('tab:copyText', text),
    openExternal: (id) => ipcRenderer.invoke('tab:openExternal', id),
    inspect: (id) => ipcRenderer.invoke('tab:inspect', id),
    print: (id) => ipcRenderer.invoke('tab:print', id),
    savePdf: (id) => ipcRenderer.invoke('tab:savePdf', id),
    capture: (id, options) => ipcRenderer.invoke('tab:capture', id, options),
    readerMode: (id) => ipcRenderer.invoke('tab:readerMode', id),
    translate: (id) => ipcRenderer.invoke('tab:translate', id),
    find: (id, query, options) => ipcRenderer.invoke('tab:find', id, query, options),
    findNext: (id) => ipcRenderer.invoke('tab:findNext', id),
    findStop: (id, keep) => ipcRenderer.invoke('tab:findStop', id, keep),
  },

  search: {
    suggest: (query) => ipcRenderer.invoke('search:suggest', query),
    resolve: (input) => ipcRenderer.invoke('search:resolve', input),
    engines: () => ipcRenderer.invoke('search:engines'),
  },

  extensions: {
    list: () => ipcRenderer.invoke('extensions:list'),
    install: () => ipcRenderer.invoke('extensions:install'),
    installPath: (path) => ipcRenderer.invoke('extensions:installPath', path),
    uninstall: (id) => ipcRenderer.invoke('extensions:uninstall', id),
    toggle: (id, enabled) => ipcRenderer.invoke('extensions:toggle', id, enabled),
    reload: (id) => ipcRenderer.invoke('extensions:reload', id),
    reveal: (id) => ipcRenderer.invoke('extensions:reveal', id),
    info: (id) => ipcRenderer.invoke('extensions:info', id),
    action: (id) => ipcRenderer.invoke('extensions:action', id),
  },

  store: {
    catalog: () => ipcRenderer.invoke('store:catalog'),
    installExtension: (id, config) => ipcRenderer.invoke('store:installExtension', { id, config }),
    uninstallExtension: (id) => ipcRenderer.invoke('store:uninstallExtension', id),
    saveConfig: (id, config) => ipcRenderer.invoke('store:saveExtensionConfig', { id, config }),
    getConfig: (id) => ipcRenderer.invoke('store:getExtensionConfig', id),
    applyTheme: (theme) => ipcRenderer.invoke('store:applyTheme', theme),
    installTheme: (theme, apply) => ipcRenderer.invoke('store:installTheme', { theme, apply }),
    uninstallTheme: (id) => ipcRenderer.invoke('store:uninstallTheme', id),
    exportTheme: (theme) => ipcRenderer.invoke('store:exportTheme', theme),
    importThemeFile: () => ipcRenderer.invoke('store:importThemeFile'),
  },

  history: {
    search: (query) => ipcRenderer.invoke('history:search', query),
    clear: () => ipcRenderer.invoke('history:clear'),
    remove: (url) => ipcRenderer.invoke('history:remove', url),
  },

  data: {
    clear: (options) => ipcRenderer.invoke('data:clear', options),
  },

  bookmarks: {
    exportHtml: (items) => ipcRenderer.invoke('bookmarks:exportHtml', items),
    importHtml: () => ipcRenderer.invoke('bookmarks:importHtml'),
  },

  readingList: {
    get: () => ipcRenderer.invoke('readingList:get'),
    add: (item) => ipcRenderer.invoke('readingList:add', item),
    remove: (idOrUrl) => ipcRenderer.invoke('readingList:remove', idOrUrl),
    toggleRead: (id) => ipcRenderer.invoke('readingList:toggleRead', id),
    clearRead: () => ipcRenderer.invoke('readingList:clearRead'),
  },

  site: {
    clearData: (url) => ipcRenderer.invoke('site:clearData', url),
  },

  shell: {
    open: (url) => ipcRenderer.invoke('shell:open', url),
  },

  permission: {
    resolve: (id, answer) => ipcRenderer.invoke('permission:resolve', id, answer),
  },

  dialog: {
    confirm: (options) => ipcRenderer.invoke('dialog:confirm', options),
  },
};

contextBridge.exposeInMainWorld('hinterland', api);