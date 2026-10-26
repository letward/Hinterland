import { $, el, clear, prettyUrl } from './util.js';
import { icon } from './icons.js';
import { setStrings, t, applyTranslations } from './i18n.js';
import { setSettings, get } from './store.js';
import { applyTheme, watchSystemTheme } from './theme.js';
import { bindShell, openPopup, closePopup, isOpen } from './popup.js';
import { closeModal, isModalOpen } from './modal.js';
import { bindTabs, renderTabs, updateTab, setActive, activeTab, allTabs } from './tabs.js';
import { bindOmnibox, syncOmni, focusOmnibox } from './omnibox.js';
import { openMainMenu, openTabMenu, openOmniMenu, openTabstripMenu, openExtensionsButton, closeMenus, openMediaControls } from './menu.js';
import { setSchema, openSettings, setShortcutDefaults } from './settingspanel.js';
import { openStore, openExtensions, openHistory, openBookmarks, openDownloads, openAbout, openShortcuts, openTaskManager, openReadingList, openClearData, openNotes, openTabStash, openPasswords, openAccount } from './panels.js';
import { openExtensionPopup, closeExtensionPopup } from './extensionPopup.js';
import { openCommandPalette } from './commandPalette.js';
import { toast } from './toast.js';
import { bindFind, openFind, closeFind, isFindOpen, applyFindResult } from './find.js';
import { bindShelf, onDownloadNew, onDownloadProgress, onDownloadDone } from './downloads.js';
import { bindBookmarksBar, syncBookmarksBar } from './bookmarksBar.js';
import { openSiteInfo } from './siteInfo.js';
import { currentTab } from './state.js';

const api = () => window.hinterland;

const PANELS = {
  store: openStore,
  extensions: openExtensions,
  history: openHistory,
  bookmarks: openBookmarks,
  downloads: openDownloads,
  shortcuts: openShortcuts,
  about: openAbout,
  taskManager: openTaskManager,
  readingList: openReadingList,
  clearData: openClearData,
  notes: openNotes,
  stash: openTabStash,
  passwords: openPasswords,
  account: openAccount,
};

let activeTabSnapshot = null;
let lastTabsSnapshot = null;
let stateGroups = [];

async function boot() {
  const data = await api().app.bootstrap();

  setStrings(data.strings, data.app.locale);
  setSettings(data.settings);
  setSchema(data.schema);
  setShortcutDefaults(data.defaults);
  applyTheme();
  watchSystemTheme(() => syncToolbar());

  applyTranslations(document);
  bind();
  await renderExtensions();

  renderTabs(data.tabs);
  activeTabSnapshot = data.tabs.tabs.find((entry) => entry.id === data.tabs.activeId) ?? data.tabs.tabs[0] ?? null;
  setActive(data.tabs.activeId);
  syncToolbar();

  wireEvents();
  wireShortcuts();

  if (get('start.showSearch') === false) $('#omniInput').placeholder = t('omni.placeholder');
}

function bind() {
  bindShell($('#shell'));
  bindTabs($('#tabs'));
  bindBookmarksBar($('#bookmarksBar'));
  bindOmnibox({
    form: $('#omni'),
    input: $('#omniInput'),
    icon: $('#omniIcon'),
    reader: $('#omniReader'),
    zoom: $('#omniZoom'),
    qr: $('#omniQr'),
    clear: $('#omniClear'),
    star: $('#omniStar'),
    progress: $('#omniProgress'),
  });
  bindFind({
    bar: $('#findBar'),
    input: $('#findInput'),
    count: $('#findCount'),
    next: $('#findNext'),
    prev: $('#findPrev'),
    close: $('#findClose'),
  });
  bindShelf($('#downloadShelf'));

  $('#newTab').innerHTML = icon('plus');
  $('#back').innerHTML = icon('back');
  $('#forward').innerHTML = icon('forward');
  $('#reload').innerHTML = icon('reload');
  $('#home').innerHTML = icon('home');
  $('#omniReader').innerHTML = icon('reader');
  $('#omniClear').innerHTML = icon('close');
  $('#omniStar').innerHTML = icon('star');
  $('#findButton').innerHTML = icon('find');
  $('#findIcon').innerHTML = icon('search');
  $('#findPrev').innerHTML = icon('back');
  $('#findNext').innerHTML = icon('forward');
  $('#findClose').innerHTML = icon('close');
  $('#downloadsButton').innerHTML = icon('download');
  $('#extensionsButton').innerHTML = icon('puzzle');
  const mediaBtn = $('#mediaButton');
  if (mediaBtn) {
    mediaBtn.innerHTML = icon('volume');
    mediaBtn.title = t('media.title');
    mediaBtn.setAttribute('aria-label', t('media.title'));
    mediaBtn.addEventListener('click', () => openMediaControls());
  }
    const storeBtn = $('#storeButton');
  if (storeBtn) {
    storeBtn.innerHTML = icon('store');
    storeBtn.addEventListener('click', () => openStore());
  }
  $('#menuButton').innerHTML = icon('menu');

  for (const button of document.querySelectorAll('.windowButton')) {
    button.addEventListener('click', () => {
      const action = button.dataset.window;
      if (action === 'minimize') api().window.minimize();
      else if (action === 'maximize') api().window.maximize();
      else if (action === 'close') api().window.close();
    });
  }

  $('#tabstrip').addEventListener('dblclick', (event) => {
    if (event.target.closest('button, .tab')) return;
    api().window.maximize();
  });

  $('#tabstrip').addEventListener('contextmenu', (event) => {
    if (event.target.closest('.tab, .groupHeader, .windowButtons, .tabAction')) return;
    event.preventDefault();
    openTabstripMenu();
  });

  $('#newTab').addEventListener('click', () => api().tabs.create({ url: 'hinterland://newtab/' }));
  $('#back').addEventListener('click', () => api().tab.back(activeTab()?.id));
  $('#forward').addEventListener('click', () => api().tab.forward(activeTab()?.id));
  $('#reload').addEventListener('click', () => {
    const tab = activeTab();
    if (!tab) return;
    if (tab.loading) api().tab.stop(tab.id);
    else api().tab.reload(tab.id);
  });
  $('#home').addEventListener('click', () => api().tabs.create({ url: get('general.homepage') || 'hinterland://newtab/' }));
  $('#findButton').addEventListener('click', () => (isFindOpen() ? closeFind() : openFind()));
  $('#downloadsButton').addEventListener('click', () => openDownloads());
  $('#extensionsButton').addEventListener('click', () => openExtensionsButton());
  $('#menuButton').addEventListener('click', () => openMainMenu());

  $('#omni').addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openOmniMenu();
  });
  $('#omniInput').addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openOmniMenu();
  });
  $('#omni').addEventListener('click', (event) => {
    if (event.target.closest('.omniInput')) return;
    focusOmnibox(false);
  });

  window.addEventListener('hinterland:tabmenu', (event) => openTabMenu(event.detail.tab, event.detail.x, event.detail.y));
  window.addEventListener('hinterland:openpanel', (event) => PANELS[event.detail.panel]?.());
  window.addEventListener('hinterland:openstore', (event) => openStore(event.detail?.tab));
  window.addEventListener('hinterland:opensettings', (event) => openSettings(event.detail?.section ?? 'general'));
  window.addEventListener('hinterland:find', () => openFind());
  window.addEventListener('hinterland:bookmark', () => toggleBookmark());
  window.addEventListener('hinterland:commandpalette', () => openCommandPalette());
  window.addEventListener('hinterland:togglebookmarksbar', () => toggleBookmarksBar());
  window.addEventListener('hinterland:siteinfo', () => openSiteInfo());
  window.addEventListener('hinterland:openstash', () => openTabStash());
  window.addEventListener('hinterland:openaccount', () => openAccount());

  $('#extensionToolbar').addEventListener('click', async (event) => {
    const button = event.target.closest('.extensionButton');
    if (!button) return;
    const id = button.dataset.extension;
    if (!id) return;
    const handled = await api().extensions.action(id);
    if (!handled) {
      openExtensionPopup(id);
    } else {
      closeExtensionPopup();
      button.classList.add('actionTriggered');
      setTimeout(() => button.classList.remove('actionTriggered'), 350);
    }
  });

  $('#extensionToolbar').addEventListener('contextmenu', (event) => {
    const button = event.target.closest('.extensionButton');
    if (!button) return;
    event.preventDefault();
    const id = button.dataset.extension;
    if (id) openExtensionPopup(id);
  });
}

async function renderExtensions() {
  const host = $('#extensionToolbar');
  clear(host);
  try {
    const entries = await api().extensions.list();
    const enabled = entries.filter((entry) => entry.enabled);
    for (const entry of enabled) {
      const info = await api().extensions.info(entry.id);
      const button = el('button', {
        class: 'extensionButton',
        type: 'button',
        'data-extension': entry.id,
        title: info?.name ?? entry.name,
        'aria-label': info?.name ?? entry.name,
      });
      let iconHtml = icon('puzzle');
      if (entry.iconUrl || info?.iconUrl) {
        const src = entry.iconUrl || info?.iconUrl;
        iconHtml = `<img src="${src}" alt="" style="width:16px;height:16px;border-radius:3px;display:block" />`;
      } else if (info?.icons) {
        const sizes = Object.keys(info.icons).map((k) => Number(k)).sort((a, b) => a - b);
        const best = sizes[sizes.length - 1];
        iconHtml = `<img src="${info.icons[String(best)]}" alt="" style="width:16px;height:16px;border-radius:3px;display:block" />`;
      } else if (info?.action?.defaultIcon) {
        const icons = info.action.defaultIcon;
        const src = typeof icons === 'string' ? icons : icons[Object.keys(icons).pop()];
        iconHtml = `<img src="${src}" alt="" style="width:16px;height:16px;border-radius:3px;display:block" />`;
      }
      button.innerHTML = iconHtml;
      host.append(button);
    }
  } catch {
    /* extensions not ready yet */
  }
}

function wireEvents() {
  const listen = api().events.listen;

  listen('tabs:sync', async (payload) => {
    lastTabsSnapshot = payload;
    renderTabs(payload);
    const active = payload.tabs.find((entry) => entry.id === payload.activeId) ?? payload.tabs[0] ?? null;
    activeTabSnapshot = active;
    setActive(payload.activeId);
    syncToolbar();
    try {
      const groups = await api().tabs.groups();
      stateGroups = groups ?? [];
      lastTabsSnapshot = { ...payload, groups: stateGroups };
      renderTabs(lastTabsSnapshot);
    } catch {
      /* groups not ready yet */
    }
  });

  listen('tab:update', (snapshot) => {
    updateTab(snapshot);
    if (snapshot.id === activeTabSnapshot?.id) {
      activeTabSnapshot = snapshot;
      syncToolbar();
    }
  });

  listen('tab:active', ({ activeId, tab }) => {
    activeTabSnapshot = tab;
    setActive(activeId);
    syncToolbar();
  });

  listen('tab:found', (payload) => applyFindResult(payload));

  listen('extensions:changed', () => renderExtensions());

  listen('tabs:groups', (groups) => {
    stateGroups = groups ?? [];
    if (lastTabsSnapshot) renderTabs({ ...lastTabsSnapshot, groups: stateGroups });
  });

  listen('window:state', (state) => {
    if (!state) return;
    const button = $('[data-window="maximize"]');
    const isMaximized = Boolean(state.maximized);
    button.innerHTML = isMaximized
      ? '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="3.5" width="6" height="6" rx="1" /></svg>'
      : '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" rx="1.2" /></svg>';
    button.title = isMaximized ? t('window.restore') : t('window.maximize');
  });

  listen('settings:changed', ({ values }) => {
    setSettings(values);
    applyTheme();
    applyTranslations(document);
    syncToolbar();
  });

  listen('download:new', onDownloadNew);
  listen('download:progress', onDownloadProgress);
  listen('download:done', onDownloadDone);

  listen('toast', ({ message, kind }) => toast(typeof message === 'string' && message.startsWith('toast.') ? t(message) : message, kind));

  listen('permission:request', (request) => showPermission(request));

  listen('tab:confirmClose', ({ id, title }) => showCloseConfirm(id, title));

  listen('passwords:promptSave', (creds) => showSavePasswordPrompt(creds));

  listen('shortcut', ({ action }) => handleShortcut(action));
}

function handleShortcut(action) {
  if (action === 'focusAddress') return focusOmnibox(true);
  if (action === 'focusSearch') return focusOmnibox(false);
  if (action === 'settings') return openSettings();
  if (action === 'bookmarks') return toggleBookmarksBar();
  if (action === 'readerMode') return toggleReaderMode();
  if (action === 'history') return openHistory();
  if (action === 'shortcuts') return openShortcuts();
  if (action === 'find') return openFind();
  if (action === 'sidebar') return openMainMenu();
  if (action === 'commandPalette') return openCommandPalette();
  if (action === 'downloads') return openDownloads();
  if (action === 'duplicateTab') {
    if (activeTab()) api().tabs.duplicate(activeTab().id);
    return undefined;
  }
  if (action === 'muteTab') {
    const cur = activeTab();
    if (cur) api().tab.mute(cur.id, !cur.muted);
    return undefined;
  }
  if (action === 'pinTab') {
    const cur = activeTab();
    if (cur) api().tabs.pin(cur.id, !cur.pinned);
    return undefined;
  }
  if (action === 'sleepTab') {
    const cur = activeTab();
    if (cur) (cur.sleeping ? api().tab.wake(cur.id) : api().tab.sleep(cur.id));
    return undefined;
  }
  if (action === 'saveAsPdf') {
    const cur = activeTab();
    if (cur) api().tab.savePdf(cur.id);
    return undefined;
  }
  if (action === 'capturePage') {
    const cur = activeTab();
    if (cur) api().tab.capture(cur.id, { saveAs: false });
    return undefined;
  }
  if (action === 'taskManager') return openTaskManager();
  if (action === 'readingList') return openReadingList();
  if (action === 'clearData') return openClearData();
  if (action === 'notes') return openNotes();
  if (action === 'tabStash') return openTabStash();
  if (action === 'passwords') return openPasswords();
  if (action === 'togglePiP') return toggleActivePiP();
  if (action === 'mediaControls') return openMediaControls();
  if (action === 'copyMarkdown') {
    const cur = activeTab();
    if (cur) api().tab.copyMarkdown(cur.id);
    return undefined;
  }
  if (action === 'stop') {
    api().tab.stop(activeTab()?.id);
    return syncToolbar();
  }
  return undefined;
}

function wireShortcuts() {
  window.addEventListener('keydown', (event) => {
    const inField = event.target.matches('input, textarea, select');

    if (event.key === 'Escape') {
      if (isModalOpen()) return closeModal();
      if (isOpen()) return closeMenus();
      if (isFindOpen()) return closeFind();
      if (inField) event.target.blur();
      return undefined;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Delete') {
      event.preventDefault();
      openClearData();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'y' && !inField) {
      event.preventDefault();
      openNotes();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'u' && !inField) {
      event.preventDefault();
      openTabStash();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'x' && !inField) {
      event.preventDefault();
      toggleActivePiP();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'm' && !inField) {
      event.preventDefault();
      openMediaControls();
      return;
    }
    if (event.shiftKey && event.key === 'Escape' && !inField) {
      event.preventDefault();
      openTaskManager();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 's' && !inField) {
      event.preventDefault();
      const cur = activeTab();
      if (cur) api().tab.capture(cur.id, { saveAs: false });
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'l' && !inField) {
      event.preventDefault();
      openReadingList();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      openCommandPalette();
      return;
    }

    if (event.key === 'F1' && !inField) {
      event.preventDefault();
      openCommandPalette();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 't') {
      event.preventDefault();
      api().tabs.reopen();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      api().tabs.create({ url: 'hinterland://newtab/', privateMode: true });
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't') {
      event.preventDefault();
      api().tabs.create({ url: 'hinterland://newtab/' });
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'b' && !inField) {
      event.preventDefault();
      toggleBookmarksBar();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'r' && !inField) {
      event.preventDefault();
      toggleReaderMode();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'd' && !inField) {
      event.preventDefault();
      if (activeTab()) api().tabs.duplicate(activeTab().id);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'j' && !inField) {
      event.preventDefault();
      openDownloads();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'm' && !inField) {
      event.preventDefault();
      const cur = activeTab();
      if (cur) api().tab.mute(cur.id, !cur.muted);
      return;
    }

    if (event.altKey && event.key.toLowerCase() === 'p' && !inField) {
      event.preventDefault();
      const cur = activeTab();
      if (cur) api().tabs.pin(cur.id, !cur.pinned);
      return;
    }

    if (event.altKey && event.key.toLowerCase() === 's' && !inField) {
      event.preventDefault();
      const cur = activeTab();
      if (cur) (cur.sleeping ? api().tab.wake(cur.id) : api().tab.sleep(cur.id));
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'e' && !inField) {
      event.preventDefault();
      const cur = activeTab();
      if (cur) api().tab.savePdf(cur.id);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'c' && !inField) {
      event.preventDefault();
      const cur = activeTab();
      if (cur) api().tab.copyMarkdown(cur.id);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      focusOmnibox(true);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'w') {
      event.preventDefault();
      api().tabs.close(activeTab()?.id);
      return;
    }

    if (event.key === 'Escape' && !inField) {
      api().tab.stop(activeTab()?.id);
      syncToolbar();
    }
    return undefined;
  });
}

function syncToolbar() {
  const tab = currentTab();
  activeTabSnapshot = tab;

  $('#back').disabled = !tab?.canGoBack;
  $('#forward').disabled = !tab?.canGoForward;
  $('#reload').innerHTML = icon(tab?.loading ? 'stop' : 'reload');
  $('#reload').title = t(tab?.loading ? 'action.stop' : 'action.reload');
  $('#home').hidden = !get('general.showHomeButton');
  syncOmni(tab);
  syncBookmarksBar();

  const anyAudible = allTabs().some((t) => t.audible || t.muted);
  const mediaBtn = $('#mediaButton');
  if (mediaBtn) {
    mediaBtn.hidden = !anyAudible;
    if (anyAudible) mediaBtn.classList.add('hasAudible');
    else mediaBtn.classList.remove('hasAudible');
  }
}

async function toggleActivePiP() {
  const cur = activeTab();
  if (!cur) return;
  const res = await api().tab.togglePiP(cur.id);
  if (res?.success) {
    toast(res.active ? t('toast.pipEntered') : t('toast.pipExited'), 'info');
  } else {
    toast(t('toast.noVideoFound'), 'warning');
  }
}

async function toggleBookmarksBar() {
  const current = Boolean(get('general.showBookmarksBar'));
  await api().settings.set('general.showBookmarksBar', !current);
  syncBookmarksBar();
  if (!current) toast(t('toast.bookmarksBarShown'), 'info');
  else toast(t('toast.bookmarksBarHidden'), 'info');
}

async function toggleReaderMode() {
  const tab = currentTab();
  if (!tab || !tab.url || tab.url.startsWith('hinterland://')) return;
  await api().tab.readerMode(tab.id);
}

async function toggleBookmark() {
  const tab = currentTab();
  if (!tab?.url || tab.url.startsWith('hinterland://')) {
    toast(t('bookmarks.noPage'), 'warning');
    return;
  }
  const items = [...(get('data.bookmarks', []) ?? [])];
  const index = items.findIndex((entry) => entry.url === tab.url);
  if (index >= 0) items.splice(index, 1);
  else items.push({ title: tab.title || prettyUrl(tab.url), url: tab.url });

  await api().settings.set('data.bookmarks', items);
  syncOmni(tab);
  syncBookmarksBar();
  toast(t(index >= 0 ? 'bookmarks.removed' : 'bookmarks.added'), 'success');
}

function showPermission(request) {
  const names = {
    media: t('permission.media'),
    notifications: t('permission.notifications'),
    geolocation: t('permission.geolocation'),
    camera: t('permission.camera'),
    microphone: t('permission.microphone'),
    clipboardRead: t('permission.clipboard'),
  };

  openPopup({
    key: `permission:${request.id}`,
    align: 'right',
    render: (card) => {
      card.append(
        el('div', { class: 'popupSection', text: t('permission.title') }),
        el('div', { class: 'row', style: { cursor: 'default' } }, [
          el('span', { class: 'rowIcon', html: icon('shield') }),
          el('span', { class: 'rowBody' }, [
            el('span', { class: 'rowTitle', text: names[request.permission] ?? request.permission }),
            el('span', { class: 'rowSub', text: request.origin }),
          ]),
        ]),
        el('div', { class: 'actionRow', style: { padding: '4px 8px 8px' } }, [
          el('button', { class: 'button primary', type: 'button', onclick: () => {
            api().permission.resolve(request.id, true);
            closePopup();
          } }, [t('permission.allow')]),
          el('button', { class: 'button', type: 'button', onclick: () => {
            api().permission.resolve(request.id, false);
            closePopup();
          } }, [t('permission.deny')]),
        ]),
      );
    },
  });
}

function showSavePasswordPrompt(creds) {
  const { domain, url, username, password } = creds;
  openPopup({
    key: `savePassword:${domain}`,
    align: 'center',
    render: (card) => {
      const userInput = el('input', {
        class: 'textInput',
        type: 'text',
        value: username || '',
        placeholder: t('passwords.username'),
        style: { width: '100%', marginBottom: '8px', fontSize: '13px' },
      });

      const passInput = el('input', {
        class: 'textInput',
        type: 'password',
        value: password || '',
        style: { width: '100%', fontSize: '13px' },
      });

      const eyeBtn = el('button', {
        class: 'passwordsEyeBtn',
        type: 'button',
        html: icon('eye'),
        onclick: () => {
          passInput.type = passInput.type === 'password' ? 'text' : 'password';
        },
      });

      const passWrap = el('div', { class: 'passwordsInputWrap', style: { marginBottom: '12px' } }, [
        passInput,
        eyeBtn,
      ]);

      const actions = el('div', { class: 'actionRow', style: { justifyContent: 'flex-end', gap: '6px' } }, [
        el('button', {
          class: 'button',
          type: 'button',
          onclick: async () => {
            await api().passwords.neverSaveDomain(domain);
            closePopup();
          },
        }, [t('passwords.neverForSite')]),
        el('button', {
          class: 'button',
          type: 'button',
          onclick: () => closePopup(),
        }, [t('passwords.notNow')]),
        el('button', {
          class: 'button primary',
          type: 'button',
          onclick: async () => {
            const status = await api().passwords.getStatus();
            if (!status.isUnlocked) {
              closePopup();
              openPasswords('passwords-current');
              return;
            }
            const res = await api().passwords.saveLogin({
              domain,
              url,
              title: domain,
              username: userInput.value.trim(),
              password: passInput.value,
            });
            if (res?.ok) {
              toast(t('toast.passwordSaved'), 'success');
            }
            closePopup();
          },
        }, [t('passwords.save')]),
      ]);

      card.append(
        el('div', { class: 'passwordsPromptBox' }, [
          el('div', { class: 'passwordsPromptHeader' }, [
            el('span', { class: 'rowIcon', html: icon('key') }),
            el('span', { class: 'passwordsPromptTitle', text: t('passwords.promptSaveTitle', { domain }) }),
          ]),
          userInput,
          passWrap,
          actions,
        ])
      );
    },
  });
}

async function showCloseConfirm(id, title) {
  const keep = await api().dialog.confirm({
    title: t('confirm.closeTitle'),
    message: t('confirm.closeMessage', { title: title || t('confirm.untitled') }),
    confirmLabel: t('confirm.close'),
    cancelLabel: t('action.cancel'),
  });
  api().tabs.confirmClose(id, keep);
}

boot().catch((error) => {
  console.error(error);
  document.body.append(el('div', { class: 'toast error', text: String(error?.message ?? error) }));
});