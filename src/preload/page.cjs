const { contextBridge, ipcRenderer } = require('electron');

const internal = String(location.protocol) === 'hinterland:';

/**
 * Web pages receive no bridge at all. Only the browser's own pages get a small
 * settings channel, so nothing privileged can be reached from the open web.
 */
if (internal) {
  contextBridge.exposeInMainWorld('hinterlandPage', {
    name: 'Hinterland',
    page: location.hostname,
    settings: {
      get: () => ipcRenderer.invoke('page:settings'),
      set: (patch) => ipcRenderer.invoke('page:settings', patch),
    },
    search: {
      engines: () => ipcRenderer.invoke('search:engines'),
      resolve: (input) => ipcRenderer.invoke('search:resolve', input),
    },
    history: {
      recent: () => ipcRenderer.invoke('history:search', ''),
    },
    open: (url) => ipcRenderer.invoke('shell:open', url),
  });
}