const { contextBridge, ipcRenderer } = require('electron');

/**
 * Sandboxed bridge for Hinterland extension popups and extension views.
 *
 * CRITICAL SECURITY GUARANTEE:
 * Extension pages MUST NEVER receive the privileged `window.hinterland` API.
 * This isolated bridge exposes only safe, scoped capabilities (e.g. closing the popup)
 * and prevents untrusted extensions from accessing browser internal settings, history,
 * bookmarks, or system controls.
 */
contextBridge.exposeInMainWorld('hinterlandExtension', {
  isExtensionPopup: true,
  closePopup: () => ipcRenderer.invoke('extension:closePopup'),
  getManifest: () => ipcRenderer.invoke('extension:getSelfManifest'),
});
