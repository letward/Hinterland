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
} else {
  /* ------------------------------------------- credential submission detection */
  function extractCredentials(target) {
    try {
      const doc = target?.ownerDocument || document;
      const form = target instanceof HTMLFormElement ? target : target?.form;
      const passInputs = form
        ? [...form.querySelectorAll('input[type="password"]')]
        : [...doc.querySelectorAll('input[type="password"]')];

      const passInput = passInputs.find((p) => p.value && p.value.length >= 3);
      if (!passInput) return null;

      let username = '';
      if (form) {
        const inputs = [...form.querySelectorAll('input')];
        const pIdx = inputs.indexOf(passInput);
        for (let i = pIdx - 1; i >= 0; i--) {
          const inp = inputs[i];
          if (inp.type === 'text' || inp.type === 'email' || inp.type === 'tel') {
            if (inp.value) { username = inp.value; break; }
          }
        }
      } else {
        const all = [...doc.querySelectorAll('input')];
        const pIdx = all.indexOf(passInput);
        for (let i = pIdx - 1; i >= Math.max(0, pIdx - 4); i--) {
          const inp = all[i];
          if (inp.type === 'text' || inp.type === 'email' || inp.type === 'tel') {
            if (inp.value) { username = inp.value; break; }
          }
        }
      }
      return {
        username: username.trim(),
        password: passInput.value,
        url: location.href,
      };
    } catch {
      return null;
    }
  }

  document.addEventListener('submit', (event) => {
    if (event.target instanceof HTMLFormElement) {
      const creds = extractCredentials(event.target);
      if (creds) ipcRenderer.send('tab:credentialsSubmitted', creds);
    }
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type === 'password') {
      const creds = extractCredentials(event.target);
      if (creds) ipcRenderer.send('tab:credentialsSubmitted', creds);
    }
  }, true);
}