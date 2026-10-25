import { el, clear, formatBytes, formatTime } from './util.js';
import { icon } from './icons.js';
import { t, currentLanguage } from './i18n.js';
import { openModal, closeModal } from './modal.js';
import { toast } from './toast.js';
import { get } from './store.js';
import { currentTab } from './state.js';
import { renderHinterStore } from './hinterStore.js';

const api = () => window.hinterland;

function head(title, description) {
  return el('div', {}, [
    el('h1', { class: 'pageHead', text: title }),
    el('p', { class: 'pageDesc', text: description }),
  ]);
}

function searchBox(onInput) {
  const input = el('input', { class: 'textInput', type: 'search', placeholder: t('panel.search') });
  const field = el('div', { class: 'searchField' }, [
    el('span', { html: icon('search') }),
    input,
  ]);
  input.addEventListener('input', () => onInput(input.value.trim()));
  return { field, input };
}

/* ------------------------------------------------------------- hinter store */

export function openStore(initialTab = 'all') {
  const activeId = initialTab.startsWith('store-') ? initialTab : `store-${initialTab}`;
  openModal({
    title: t('store.title'),
    iconName: 'store',
    activeId,
    nav: [
      { id: 'store-all', labelKey: 'store.all', icon: 'sparkles', render: () => renderHinterStore('all') },
      { id: 'store-themes', labelKey: 'store.themes', icon: 'palette', render: () => renderHinterStore('themes') },
      { id: 'store-extensions', labelKey: 'store.extensions', icon: 'puzzle', render: () => renderHinterStore('extensions') },
      { id: 'store-installed', labelKey: 'store.installed', icon: 'check', render: () => renderHinterStore('installed') },
      { id: 'store-studio', labelKey: 'store.studio', icon: 'brush', render: () => renderHinterStore('studio') },
    ],
  });
}

/* -------------------------------------------------------------- extensions */

export function openExtensions() {
  openModal({ title: t('extensions.title'), iconName: 'puzzle', nav: [extensionsPage()] });
}

function extensionsPage() {
  return {
    id: 'extensions',
    icon: 'puzzle',
    labelKey: 'menu.extensions',
    render: () => {
      const container = el('div');
      container.append(head(t('extensions.title'), t('extensions.description')));

      const list = el('div', { class: 'card' });

      const load = async () => {
        const entries = await api().extensions.list();
        clear(list);
        if (!entries.length) {
          list.append(el('div', { class: 'empty', text: t('extensions.none') }));
          return;
        }
        for (const entry of entries) {
          list.append(extensionRow(entry, load));
        }
      };

      const actions = el('div', { class: 'actionRow', style: { marginBottom: '16px' } }, [
        el('button', {
          class: 'button primary',
          type: 'button',
          onclick: () => openStore('extensions'),
        }, [el('span', { html: icon('store') }), ' Hinter Store']),
        el('button', {
          class: 'button',
          type: 'button',
          onclick: async () => {
            const result = await api().extensions.install();
            if (result?.ok) {
              toast(t('extensions.installed', { name: entryName(result.list, result.id) }), 'success');
              load();
              return;
            }
            if (result?.error === 'blocked') toast(t('extensions.allowFirst'), 'warning');
            else if (result?.error) toast(t('extensions.installFailed'), 'error');
          },
        }, [el('span', { html: icon('upload') }), ` ${t('extensions.install')}`]),
        el('button', {
          class: 'button',
          type: 'button',
          onclick: async () => {
            await api().settings.set('extensions.allowUnpacked', !get('extensions.allowUnpacked'));
            openExtensions();
          },
        }, [el('span', { html: icon('shield') }), ` ${t('extensions.allowUnpacked')}`]),
        el('button', {
          class: 'button',
          type: 'button',
          onclick: async () => {
            const entries = await api().extensions.list();
            for (const entry of entries) await api().extensions.reload(entry.id);
            load();
          },
        }, [el('span', { html: icon('refresh') }), ` ${t('action.reload')}`]),
      ]);

      load();

      container.append(actions, list);
      container.append(el('p', { class: 'optionHint', style: { marginTop: '14px' }, text: t('extensions.hint') }));
      return container;
    },
  };
}

function entryName(list, id) {
  return list?.find((entry) => entry.id === id)?.name ?? id;
}

function extensionRow(entry, reload) {
  const toggle = el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(entry.enabled) });
  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    await api().extensions.toggle(entry.id, !entry.enabled);
    reload();
  });

  const iconEl = entry.iconUrl
    ? el('img', { src: entry.iconUrl, alt: '', class: 'extensionCardIcon' })
    : el('div', { class: 'extensionCardIcon fallback', html: icon('puzzle') });

  return el('div', { class: 'option extensionOptionRow' }, [
    iconEl,
    el('div', { class: 'optionText' }, [
      el('div', { class: 'optionLabel' }, [
        entry.name,
        ' ',
        el('span', { class: `statusTag ${entry.enabled ? 'on' : 'off'}`, text: entry.enabled ? t('extensions.on') : t('extensions.off') }),
        entry.bundled ? el('span', { class: 'statusTag', text: t('extensions.bundled') }) : null,
      ]),
      el('div', { class: 'optionHint', text: `${t('extensions.version')} ${entry.version}${entry.error ? ` — ${entry.error}` : ''}` }),
      entry.description ? el('div', { class: 'optionHint', text: entry.description }) : null,
      el('div', { class: 'optionHint', style: { fontFamily: 'var(--fontMono)', fontSize: '0.78em' }, text: entry.path }),
    ]),
    el('div', { class: 'optionControl' }, [
      toggle,
      el('button', { class: 'iconButton small', type: 'button', html: icon('refresh'), title: t('action.reload'), onclick: async () => {
        await api().extensions.reload(entry.id);
        reload();
      } }),
      el('button', { class: 'iconButton small', type: 'button', html: icon('external'), title: t('action.showFolder'), onclick: () => api().extensions.reveal(entry.id) }),
      entry.bundled
        ? null
        : el('button', { class: 'iconButton small', type: 'button', html: icon('trash'), title: t('action.remove'), onclick: async () => {
          await api().extensions.uninstall(entry.id);
          reload();
        } }),
    ]),
  ]);
}

/* ---------------------------------------------------------------- history */

export function openHistory() {
  openModal({ title: t('history.title'), iconName: 'clock', nav: [historyPage(), recentlyClosedPage()] });
}

function historyPage() {
  return {
    id: 'history',
    icon: 'clock',
    labelKey: 'menu.history',
    render: () => {
      const container = el('div');
      container.append(head(t('history.title'), t('history.description')));

      const list = el('div', { class: 'card' });
      const language = currentLanguage();

      const paint = (entries) => {
        clear(list);
        if (!entries.length) {
          list.append(el('div', { class: 'empty', text: t('history.empty') }));
          return;
        }
        for (const entry of entries) {
          list.append(
            el('div', { class: 'option' }, [
              el('div', { class: 'optionText' }, [
                el('div', { class: 'optionLabel', text: entry.title || entry.url }),
                el('div', { class: 'optionHint', text: entry.url }),
              ]),
              el('div', { class: 'optionControl' }, [
                el('span', { class: 'rowAside', text: formatTime(entry.time, language) }),
                el('button', { class: 'iconButton small', type: 'button', html: icon('external'), title: t('action.open'), onclick: () => api().tabs.create({ url: entry.url }) }),
                el('button', { class: 'iconButton small', type: 'button', html: icon('trash'), title: t('action.remove'), onclick: async () => {
                  await api().history.remove(entry.url);
                  paint(await api().history.search(''));
                } }),
              ]),
            ]),
          );
        }
      };

      const { field, input } = searchBox(async (value) => paint(await api().history.search(value)));

      container.append(
        el('div', { class: 'actionRow', style: { marginBottom: '14px', gap: '8px' } }, [
          el('button', { class: 'button', type: 'button', onclick: async () => {
            await api().history.clear();
            paint([]);
          } }, [t('history.clear')]),
          el('button', { class: 'button', type: 'button', onclick: () => openClearData() }, [
            el('span', { html: icon('trash') }),
            ` ${t('clearData.title')}`,
          ]),
        ]),
        field,
        list,
      );

      api().history.search('').then(paint);
      return container;
    },
  };
}

function recentlyClosedPage() {
  return {
    id: 'recentlyClosed',
    icon: 'clock',
    labelKey: 'history.recentlyClosed',
    render: () => {
      const container = el('div');
      container.append(head(t('history.recentlyClosedTitle'), t('history.recentlyClosedDesc')));

      const list = el('div', { class: 'card' });
      const language = currentLanguage();

      const paint = async () => {
        clear(list);
        const entries = (await api().tabs.recentlyClosed()) || [];
        if (!entries.length) {
          list.append(el('div', { class: 'empty', text: t('history.recentlyClosedEmpty') }));
          return;
        }
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          list.append(
            el('div', { class: 'option' }, [
              el('div', { class: 'optionText' }, [
                el('div', { class: 'optionLabel', text: entry.title || entry.url }),
                el('div', { class: 'optionHint', text: entry.url }),
              ]),
              el('div', { class: 'optionControl' }, [
                entry.closedAt ? el('span', { class: 'rowAside', text: formatTime(entry.closedAt, language) }) : null,
                el('button', {
                  class: 'iconButton small',
                  type: 'button',
                  html: icon('external'),
                  title: t('action.restore'),
                  onclick: async () => {
                    await api().tabs.restoreClosed(i);
                    closeModal();
                  },
                }),
              ]),
            ]),
          );
        }
      };

      container.append(
        el('div', { class: 'actionRow', style: { marginBottom: '14px' } }, [
          el('button', {
            class: 'button primary',
            type: 'button',
            onclick: async () => {
              await api().tabs.restoreAllClosed();
              closeModal();
            },
          }, [t('history.restoreAll')]),
          el('button', {
            class: 'button',
            type: 'button',
            onclick: async () => {
              await api().tabs.clearRecentlyClosed();
              paint();
            },
          }, [t('history.clearRecentlyClosed')]),
        ]),
        list,
      );

      paint();
      return container;
    },
  };
}

/* -------------------------------------------------------------- bookmarks */

export function openBookmarks() {
  openModal({ title: t('bookmarks.title'), iconName: 'bookmark', nav: [bookmarksPage()] });
}

function bookmarksPage() {
  return {
    id: 'bookmarks',
    icon: 'bookmark',
    labelKey: 'menu.bookmarks',
    render: () => {
      const container = el('div');
      container.append(head(t('bookmarks.title'), t('bookmarks.description')));

      const list = el('div', { class: 'card' });
      let currentFilter = '';

      const save = async (items) => {
        await api().settings.set('data.bookmarks', items);
        paint(currentFilter);
      };

      const paint = (filter = '') => {
        currentFilter = (filter || '').toLowerCase().trim();
        const items = get('data.bookmarks', []) ?? [];
        clear(list);
        if (!items.length) {
          list.append(el('div', { class: 'empty', text: t('bookmarks.empty') }));
          return;
        }

        const filtered = items.filter((item) => {
          if (!currentFilter) return true;
          const title = (item.title || '').toLowerCase();
          const url = (item.url || '').toLowerCase();
          return title.includes(currentFilter) || url.includes(currentFilter);
        });

        if (!filtered.length) {
          list.append(el('div', { class: 'empty', text: t('bookmarks.noMatch') }));
          return;
        }

        filtered.forEach((item) => {
          const originalIndex = items.indexOf(item);
          const title = el('input', { class: 'textInput', type: 'text', value: item.title ?? '' });
          const url = el('input', { class: 'textInput', type: 'text', value: item.url ?? '' });
          title.addEventListener('change', () => {
            if (originalIndex >= 0) {
              items[originalIndex].title = title.value;
              save(items);
            }
          });
          url.addEventListener('change', () => {
            if (originalIndex >= 0) {
              items[originalIndex].url = url.value;
              save(items);
            }
          });
          list.append(
            el('div', { class: 'option' }, [
              el('div', { class: 'optionText' }, [el('div', { class: 'listItemFields' }, [title, url])]),
              el('div', { class: 'optionControl' }, [
                el('button', { class: 'iconButton small', type: 'button', html: icon('external'), title: t('action.open'), onclick: () => api().tabs.create({ url: item.url }) }),
                el('button', { class: 'iconButton small', type: 'button', html: icon('trash'), title: t('action.remove'), onclick: () => {
                  if (originalIndex >= 0) {
                    items.splice(originalIndex, 1);
                    save(items);
                  }
                } }),
              ]),
            ]),
          );
        });
      };

      const { field } = searchBox((value) => paint(value));

      const actions = el('div', { class: 'actionRow', style: { marginBottom: '14px', flexWrap: 'wrap', gap: '8px' } }, [
        el('button', { class: 'button primary', type: 'button', onclick: async () => {
          const tab = currentTab();
          const url = tab?.url ?? '';
          if (!url || url.startsWith('hinterland://')) {
            toast(t('bookmarks.noPage'), 'warning');
            return;
          }
          const items = [...(get('data.bookmarks', []) ?? [])];
          items.push({ title: tab.title || url, url });
          await save(items);
        } }, [el('span', { html: icon('plus') }), ` ${t('bookmarks.addCurrent')}`]),
        el('button', { class: 'button', type: 'button', onclick: async () => {
          const items = get('data.bookmarks', []) ?? [];
          await api().bookmarks.exportHtml(items);
        } }, [el('span', { html: icon('download') }), ` ${t('bookmarks.exportHtml')}`]),
        el('button', { class: 'button', type: 'button', onclick: async () => {
          const result = await api().bookmarks.importHtml();
          if (result?.ok && typeof result.count === 'number') {
            paint(currentFilter);
          }
        } }, [el('span', { html: icon('upload') }), ` ${t('bookmarks.importHtml')}`]),
        el('button', { class: 'button', type: 'button', onclick: async () => {
          const items = [...(get('data.bookmarks', []) ?? [])];
          items.sort((a, b) => (a.title || a.url || '').localeCompare(b.title || b.url || ''));
          await save(items);
        } }, [el('span', { html: icon('list') }), ` ${t('bookmarks.sort')}`]),
      ]);

      container.append(actions, field, list);
      paint();
      return container;
    },
  };
}

/* -------------------------------------------------------------- downloads */

const downloads = new Map();

export function trackDownload(payload) {
  downloads.set(payload.id, payload);
  return payload;
}

export function openDownloads() {
  openModal({ title: t('downloads.title'), iconName: 'download', nav: [downloadsPage()] });
}

function downloadsPage() {
  return {
    id: 'downloads',
    icon: 'download',
    labelKey: 'menu.downloads',
    render: () => {
      const container = el('div');
      container.append(head(t('downloads.title'), t('downloads.description')));

      const list = el('div', { class: 'card' });

      const paint = () => {
        const entries = [...downloads.values()].reverse();
        clear(list);
        if (!entries.length) {
          list.append(el('div', { class: 'empty', text: t('downloads.empty') }));
          return;
        }
        for (const entry of entries) {
          const total = Number(entry.totalBytes) || 0;
          const received = Number(entry.receivedBytes) || 0;
          const percent = total ? Math.min(100, Math.round((received / total) * 100)) : entry.state === 'completed' ? 100 : 0;
          list.append(
            el('div', { class: 'option' }, [
              el('div', { class: 'optionText' }, [
                el('div', { class: 'optionLabel', text: entry.filename }),
                el('div', { class: 'optionHint', text: `${entry.state}${total ? ` — ${formatBytes(received)} / ${formatBytes(total)}` : ''}` }),
                el('div', { class: 'downloadBar' }, [el('div', { class: 'downloadBarFill', style: { width: `${percent}%` } })]),
              ]),
              el('div', { class: 'optionControl' }, [
                el('button', { class: 'iconButton small', type: 'button', html: icon('external'), title: t('action.showFolder'), onclick: () => api().app.revealFile(entry.savePath) }),
                el('button', { class: 'iconButton small', type: 'button', html: icon('trash'), title: t('action.dismiss'), onclick: () => {
                  downloads.delete(entry.id);
                  paint();
                } }),
              ]),
            ]),
          );
        }
      };

      container.append(list);
      paint();
      return container;
    },
  };
}

/* --------------------------------------------------------------- shortcuts */

export function openShortcuts() {
  openModal({ title: t('shortcuts.title'), iconName: 'keyboard', nav: [shortcutsPage()] });
}

function shortcutsPage() {
  return {
    id: 'shortcuts',
    icon: 'keyboard',
    labelKey: 'menu.shortcuts',
    render: () => {
      const container = el('div');
      container.append(head(t('shortcuts.title'), t('shortcuts.description')));

      const listContainer = el('div', { class: 'shortcutsList' });

      const shortcutGroups = [
        {
          titleKey: 'shortcuts.groupTabs',
          items: [
            { labelKey: 'menu.newTab', combo: 'Ctrl+T' },
            { labelKey: 'menu.privateTab', combo: 'Ctrl+Shift+N' },
            { labelKey: 'menu.close', combo: 'Ctrl+W' },
            { labelKey: 'menu.duplicate', combo: 'Ctrl+Shift+D' },
            { labelKey: 'shortcuts.action.muteTab', combo: 'Ctrl+M' },
            { labelKey: 'shortcuts.action.pinTab', combo: 'Alt+P' },
            { labelKey: 'shortcuts.action.sleepTab', combo: 'Alt+S' },
            { labelKey: 'menu.reopenClosed', combo: 'Ctrl+Shift+T' },
            { labelKey: 'shortcuts.action.nextTab', combo: 'Ctrl+Tab' },
            { labelKey: 'shortcuts.action.previousTab', combo: 'Ctrl+Shift+Tab' },
          ],
        },
        {
          titleKey: 'shortcuts.groupNav',
          items: [
            { labelKey: 'shortcuts.action.goBack', combo: 'Alt+Left' },
            { labelKey: 'shortcuts.action.goForward', combo: 'Alt+Right' },
            { labelKey: 'action.reload', combo: 'Ctrl+R' },
            { labelKey: 'shortcuts.action.hardReload', combo: 'Ctrl+Shift+R' },
            { labelKey: 'action.stop', combo: 'Esc' },
            { labelKey: 'shortcuts.action.focusAddress', combo: 'Ctrl+L' },
            { labelKey: 'shortcuts.action.focusSearch', combo: 'Ctrl+K' },
          ],
        },
        {
          titleKey: 'shortcuts.groupView',
          items: [
            { labelKey: 'shortcuts.action.readerMode', combo: 'Ctrl+Alt+R' },
            { labelKey: 'shortcuts.action.saveAsPdf', combo: 'Ctrl+Shift+E' },
            { labelKey: 'shortcuts.action.copyMarkdown', combo: 'Ctrl+Shift+C' },
            { labelKey: 'menu.capturePage', combo: 'Ctrl+Shift+S' },
            { labelKey: 'shortcuts.action.togglePiP', combo: 'Ctrl+Shift+X' },
            { labelKey: 'shortcuts.action.mediaControls', combo: 'Ctrl+Alt+M' },
            { labelKey: 'shortcuts.action.notes', combo: 'Ctrl+Shift+Y' },
            { labelKey: 'menu.find', combo: 'Ctrl+F' },
            { labelKey: 'menu.zoomIn', combo: 'Ctrl+=' },
            { labelKey: 'menu.zoomOut', combo: 'Ctrl+-' },
            { labelKey: 'menu.resetZoom', combo: 'Ctrl+0' },
            { labelKey: 'shortcuts.action.fullscreen', combo: 'F11' },
          ],
        },
        {
          titleKey: 'shortcuts.groupBrowser',
          items: [
            { labelKey: 'menu.commandPalette', combo: 'Ctrl+Shift+P' },
            { labelKey: 'menu.showBookmarksBar', combo: 'Ctrl+Shift+B' },
            { labelKey: 'menu.readingList', combo: 'Ctrl+Shift+L' },
            { labelKey: 'menu.history', combo: 'Ctrl+H' },
            { labelKey: 'menu.downloads', combo: 'Ctrl+J' },
            { labelKey: 'menu.taskManager', combo: 'Shift+Esc' },
            { labelKey: 'shortcuts.action.clearData', combo: 'Ctrl+Shift+Delete' },
            { labelKey: 'menu.settings', combo: 'Ctrl+,' },
          ],
        },
      ];

      function renderKbd(combo) {
        const parts = combo.split('+');
        const frag = el('span', { class: 'shortcutCombos' });
        parts.forEach((part, idx) => {
          if (idx > 0) frag.append(' + ');
          frag.append(el('kbd', { class: 'kbd', text: part }));
        });
        return frag;
      }

      const paint = (filter = '') => {
        clear(listContainer);
        const query = filter.toLowerCase().trim();
        let total = 0;

        for (const group of shortcutGroups) {
          const matched = group.items.filter((item) => {
            if (!query) return true;
            const name = t(item.labelKey).toLowerCase();
            const combo = item.combo.toLowerCase();
            return name.includes(query) || combo.includes(query);
          });
          if (!matched.length) continue;

          total += matched.length;
          const card = el('div', { class: 'card', style: { marginBottom: '16px' } });
          for (const item of matched) {
            card.append(
              el('div', { class: 'option' }, [
                el('div', { class: 'optionText' }, [el('div', { class: 'optionLabel', text: t(item.labelKey) })]),
                el('div', { class: 'optionControl' }, [renderKbd(item.combo)]),
              ]),
            );
          }
          listContainer.append(el('h2', { class: 'groupTitle', text: t(group.titleKey) }), card);
        }

        if (total === 0) {
          listContainer.append(el('div', { class: 'empty', text: t('shortcuts.noMatch') }));
        }
      };

      const { field } = searchBox((value) => paint(value));

      container.append(
        el('div', { class: 'actionRow', style: { marginBottom: '14px' } }, [
          el('button', {
            class: 'button',
            type: 'button',
            onclick: () => {
              closeModal();
              window.dispatchEvent(new CustomEvent('hinterland:opensettings', { detail: { section: 'shortcuts' } }));
            },
          }, [el('span', { html: icon('gear') }), ` ${t('shortcuts.edit')}`]),
        ]),
        field,
        listContainer,
      );

      paint();
      return container;
    },
  };
}

/* ------------------------------------------------------------------- about */

export function openAbout() {
  openModal({ title: t('about.title'), iconName: 'shield', nav: [aboutPage()] });
}

function aboutPage() {
  return {
    id: 'about',
    icon: 'info',
    labelKey: 'menu.about',
    render: () => {
      const container = el('div');
      const card = el('div', { class: 'card' });
      container.append(card);
      container.append(
        el('div', { class: 'actionRow', style: { marginTop: '22px' } }, [
          el('button', { class: 'button', type: 'button', onclick: () => api().tabs.create({ url: 'https://hinterland-browser.vercel.app' }) }, [t('about.website')]),
          el('button', { class: 'button', type: 'button', onclick: () => api().app.openFolder('userData') }, [t('about.openFolder')]),
          el('button', { class: 'button', type: 'button', onclick: () => api().app.openFolder('downloads') }, [t('about.openDownloads')]),
        ]),
      );

      api().app.info().then((info) => {
        const logo = el('img', {
          class: 'aboutLogo',
          src: 'hinterland://assets/icon.png',
          alt: info.name,
        });
        container.replaceChildren(
          logo,
          head(`${info.name} ${info.version}`, t('about.tagline')),
          card,
        );

        const rows = [
          [t('about.version'), info.version],
          [t('about.language'), info.locale],
          [t('about.dataFolder'), info.userData],
          [t('about.downloads'), info.downloads],
        ];
        for (const [label, value] of rows) {
          card.append(
            el('div', { class: 'option' }, [
              el('div', { class: 'optionText' }, [el('div', { class: 'optionLabel', text: label })]),
              el('div', { class: 'optionControl' }, [el('span', { class: 'optionHint', text: value })]),
            ]),
          );
        }

        const blocked = info.blocked ?? [];
        if (!blocked.length) return;
        const list = el('div', { class: 'card' });
        for (const entry of blocked.slice(0, 12)) {
          list.append(
            el('div', { class: 'option' }, [
              el('div', { class: 'optionText' }, [el('div', { class: 'optionLabel', text: entry.host })]),
              el('div', { class: 'optionControl' }, [el('span', { class: 'rowAside', text: String(entry.count) })]),
            ]),
          );
        }
        container.append(el('h2', { class: 'groupTitle', style: { marginTop: '24px' }, text: t('about.blocked') }), list);
      });

      return container;
    },
  };
}

/* ----------------------------------------------------------- task manager */

export function openTaskManager() {
  openModal({ title: t('taskManager.title'), iconName: 'cpu', nav: [taskManagerPage()] });
}

function taskManagerPage() {
  return {
    id: 'taskManager',
    icon: 'cpu',
    labelKey: 'menu.taskManager',
    render: () => {
      const container = el('div');
      container.append(head(t('taskManager.title'), t('taskManager.description')));

      const summaryCard = el('div', { class: 'taskManagerSummary' });
      const list = el('div', { class: 'card' });
      let currentFilter = '';
      let timer = null;

      const refresh = async () => {
        const data = await api().app.metrics();
        if (!data) return;

        clear(summaryCard);
        const memStat = el('div', { class: 'taskStat' }, [
          el('span', { text: `${t('taskManager.totalMemory')}: ` }),
          el('strong', { text: formatBytes(data.totalMemoryKB * 1024) }),
        ]);
        const procStat = el('div', { class: 'taskStat' }, [
          el('span', { text: `${t('taskManager.processes')}: ` }),
          el('strong', { text: String(data.processCount) }),
        ]);
        const tabStat = el('div', { class: 'taskStat' }, [
          el('span', { text: `${t('taskManager.tabs')}: ` }),
          el('strong', { text: String(data.tabCount) }),
        ]);

        const saverStats = await api().tabs.memorySaverStats?.();
        const saverStat = el('div', { class: 'taskStat', title: t('taskManager.memorySaverTooltip') }, [
          el('span', { text: `${t('taskManager.memorySaver')}: ` }),
          el('strong', {
            text: saverStats?.sleepingCount > 0
              ? `${saverStats.sleepingCount} ${t('taskManager.sleepingTabs')} (~${saverStats.estimatedSavedMB} MB)`
              : (saverStats?.enabled ? t('taskManager.active') : t('taskManager.inactive')),
          }),
        ]);

        const refreshBtn = el('button', {
          class: 'button',
          type: 'button',
          style: { marginLeft: 'auto' },
          onclick: () => refresh(),
        }, [el('span', { html: icon('refresh') }), ` ${t('taskManager.refresh')}`]);

        const sleepOthersBtn = el('button', {
          class: 'button',
          type: 'button',
          onclick: async () => {
            const count = await api().tabs.sleepOthers();
            if (count > 0) toast(t('toast.sleptOthers', { count }), 'info');
            refresh();
          },
        }, [el('span', { html: icon('moon') }), ` ${t('taskManager.sleepAll')}`]);

        summaryCard.append(memStat, procStat, tabStat, saverStat, sleepOthersBtn, refreshBtn);

        clear(list);
        let items = data.processes || [];
        if (currentFilter) {
          items = items.filter((p) => {
            const typeStr = (p.type || '').toLowerCase();
            const pidStr = String(p.pid);
            const tabMatches = (p.tabs || []).some((tab) =>
              (tab.title || '').toLowerCase().includes(currentFilter) ||
              (tab.url || '').toLowerCase().includes(currentFilter)
            );
            return typeStr.includes(currentFilter) || pidStr.includes(currentFilter) || tabMatches;
          });
        }

        if (!items.length) {
          list.append(el('div', { class: 'empty', text: t('taskManager.empty') }));
          return;
        }

        for (const proc of items) {
          const isTab = proc.tabs && proc.tabs.length > 0;
          const firstTab = isTab ? proc.tabs[0] : null;

          let iconName = 'sliders';
          let typeClass = 'utility';
          let displayName = t('taskManager.processUtility');

          if (proc.type === 'Browser') {
            iconName = 'globe';
            typeClass = 'browser';
            displayName = t('taskManager.processBrowser');
          } else if (proc.type === 'GPU') {
            iconName = 'monitor';
            typeClass = 'gpu';
            displayName = t('taskManager.processGPU');
          } else if (isTab) {
            typeClass = 'tab';
            displayName = firstTab.title || firstTab.url || t('taskManager.processTab');
          }

          const typeBadge = el('span', { class: `taskBadge ${typeClass}`, text: proc.type });
          const pidBadge = el('span', { class: 'taskBadge', text: `PID ${proc.pid}` });
          const memBadge = el('span', { class: 'taskBadge', text: formatBytes(proc.memoryKB * 1024) });
          const cpuBadge = el('span', { class: 'taskBadge', text: `${proc.cpu}% CPU` });

          const titleRow = el('div', { class: 'optionLabel', style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, [
            el('span', { text: displayName }),
            typeBadge,
            pidBadge,
            memBadge,
            cpuBadge,
          ]);

          const hintRow = el('div', { class: 'optionHint', text: isTab ? firstTab.url : `Process PID ${proc.pid} (${proc.type})` });

          const controls = el('div', { class: 'optionControl' });

          if (isTab) {
            if (firstTab.sleeping) {
              controls.append(
                el('span', { class: 'taskBadge sleeping', text: t('taskManager.sleeping') }),
                el('button', {
                  class: 'button',
                  type: 'button',
                  onclick: async () => {
                    await api().tab.wake(firstTab.id);
                    refresh();
                  },
                }, [el('span', { html: icon('sun') }), ` ${t('taskManager.wake')}`])
              );
            } else {
              controls.append(
                el('button', {
                  class: 'button',
                  type: 'button',
                  onclick: async () => {
                    await api().tab.sleep(firstTab.id);
                    refresh();
                  },
                }, [el('span', { html: icon('moon') }), ` ${t('taskManager.sleep')}`])
              );
            }
            controls.append(
              el('button', {
                class: 'button danger',
                type: 'button',
                onclick: async () => {
                  await api().tabs.close(firstTab.id);
                  refresh();
                },
              }, [t('taskManager.endProcess')])
            );
          } else if (proc.type !== 'Browser') {
            controls.append(
              el('button', {
                class: 'button danger',
                type: 'button',
                onclick: async () => {
                  await api().app.killProcess(proc.pid);
                  refresh();
                },
              }, [t('taskManager.endProcess')])
            );
          }

          list.append(
            el('div', { class: 'option' }, [
              el('div', { class: 'rowIcon', html: icon(iconName) }),
              el('div', { class: 'optionText', style: { flex: 1, minWidth: 0 } }, [titleRow, hintRow]),
              controls,
            ])
          );
        }
      };

      const { field } = searchBox((val) => {
        currentFilter = val.toLowerCase().trim();
        refresh();
      });

      container.append(summaryCard, field, list);

      refresh();
      timer = setInterval(refresh, 2500);

      const observer = new MutationObserver(() => {
        if (!document.body.contains(container)) {
          clearInterval(timer);
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      return container;
    },
  };
}

/* ----------------------------------------------------------- reading list */

export function openReadingList() {
  openModal({
    title: t('readingList.title'),
    iconName: 'bookmark',
    nav: [readingListPage('unread'), readingListPage('read'), readingListPage('all')],
  });
}

function readingListPage(mode = 'unread') {
  const iconMap = { unread: 'clock', read: 'check', all: 'list' };
  const labelMap = { unread: 'readingList.tab_unread', read: 'readingList.tab_read', all: 'readingList.tab_all' };

  return {
    id: `readingList_${mode}`,
    icon: iconMap[mode] || 'bookmark',
    labelKey: labelMap[mode] || 'readingList.title',
    render: () => {
      const container = el('div');
      container.append(head(t('readingList.title'), t('readingList.description')));

      const list = el('div', { class: 'card' });
      let currentFilter = '';
      const language = currentLanguage();

      const refresh = async () => {
        const all = (await api().readingList.get()) || [];
        let items = all;
        if (mode === 'unread') items = all.filter((i) => !i.read);
        else if (mode === 'read') items = all.filter((i) => i.read);

        if (currentFilter) {
          items = items.filter((i) =>
            (i.title || '').toLowerCase().includes(currentFilter) ||
            (i.url || '').toLowerCase().includes(currentFilter)
          );
        }

        clear(list);
        if (!items.length) {
          list.append(el('div', { class: 'empty', text: currentFilter ? t('readingList.noMatch') : t('readingList.empty') }));
          return;
        }

        for (const item of items) {
          const itemRow = el('div', { class: `option ${item.read ? 'readingItemRead' : ''}` });

          const titleEl = el('div', { class: 'optionLabel', text: item.title || item.url });
          titleEl.style.cursor = 'pointer';
          titleEl.onclick = () => api().tabs.create({ url: item.url });

          const hintEl = el('div', { class: 'optionHint', text: item.url });

          const timeAside = el('span', {
            class: 'rowAside',
            style: { marginRight: '8px', fontSize: '0.8em', color: 'var(--textDim)' },
            text: formatTime(item.addedAt, language),
          });

          const toggleBtn = el('button', {
            class: `iconButton small ${item.read ? 'active' : ''}`,
            type: 'button',
            html: icon('check'),
            title: item.read ? t('readingList.markUnread') : t('readingList.markRead'),
            onclick: async () => {
              await api().readingList.toggleRead(item.id);
              refresh();
            },
          });

          const openBtn = el('button', {
            class: 'iconButton small',
            type: 'button',
            html: icon('external'),
            title: t('action.open'),
            onclick: () => api().tabs.create({ url: item.url }),
          });

          const removeBtn = el('button', {
            class: 'iconButton small',
            type: 'button',
            html: icon('trash'),
            title: t('action.remove'),
            onclick: async () => {
              await api().readingList.remove(item.id);
              refresh();
            },
          });

          const controls = el('div', { class: 'optionControl' }, [timeAside, toggleBtn, openBtn, removeBtn]);

          itemRow.append(
            el('div', { class: 'rowIcon', html: icon(item.read ? 'check' : 'bookmark') }),
            el('div', { class: 'optionText', style: { flex: 1, minWidth: 0 } }, [titleEl, hintEl]),
            controls
          );

          list.append(itemRow);
        }
      };

      const { field } = searchBox((val) => {
        currentFilter = val.toLowerCase().trim();
        refresh();
      });

      const actionRow = el('div', { class: 'actionRow', style: { marginBottom: '14px' } }, [
        el('button', {
          class: 'button primary',
          type: 'button',
          onclick: async () => {
            const cur = currentTab();
            if (cur && cur.url && !cur.url.startsWith('hinterland://')) {
              await api().readingList.add({ url: cur.url, title: cur.title, favicon: cur.favicon });
              refresh();
            } else {
              toast(t('toast.cannotAddSpecialPage'), 'warning');
            }
          },
        }, [el('span', { html: icon('plus') }), ` ${t('readingList.addCurrentTab')}`]),
      ]);

      if (mode === 'unread') {
        actionRow.append(
          el('button', {
            class: 'button',
            type: 'button',
            onclick: async () => {
              const res = await api().readingList.openAllUnread();
              if (res?.count > 0) {
                toast(t('toast.allUnreadOpened', { count: res.count }), 'info');
                refresh();
              }
            },
          }, [el('span', { html: icon('external') }), ` ${t('readingList.openAllUnread')}`])
        );
      }

      if (mode !== 'unread') {
        actionRow.append(
          el('button', {
            class: 'button',
            type: 'button',
            onclick: async () => {
              await api().readingList.clearRead();
              refresh();
            },
          }, [el('span', { html: icon('trash') }), ` ${t('readingList.clearRead')}`])
        );
      }

      container.append(actionRow, field, list);
      refresh();
      return container;
    },
  };
}

/* ------------------------------------------------------- clear browsing data */

export function openClearData() {
  openModal({
    title: t('clearData.title'),
    iconName: 'trash',
    nav: [clearDataPage()],
  });
}

function clearDataPage() {
  return {
    id: 'clearData',
    icon: 'trash',
    labelKey: 'clearData.title',
    render: () => {
      const container = el('div', { class: 'clearDataContainer' });
      container.append(head(t('clearData.title'), t('clearData.description')));

      const rangeRow = el('div', { class: 'actionRow', style: { marginBottom: '16px', alignItems: 'center' } }, [
        el('label', { style: { fontWeight: '600', marginRight: '10px' }, text: t('clearData.timeRange') }),
      ]);

      const select = el('select', { class: 'select' }, [
        el('option', { value: 'hour', text: t('clearData.rangeHour') }),
        el('option', { value: 'day', text: t('clearData.rangeDay') }),
        el('option', { value: 'week', text: t('clearData.rangeWeek') }),
        el('option', { value: 'month', text: t('clearData.rangeMonth') }),
        el('option', { value: 'all', selected: 'true', text: t('clearData.rangeAll') }),
      ]);
      rangeRow.append(select);

      const card = el('div', { class: 'card' });

      function createCheckboxOption(id, titleKey, descKey, defaultChecked = true) {
        const checkbox = el('input', { type: 'checkbox', id, checked: defaultChecked ? 'true' : undefined });
        const label = el('label', { for: id, style: { cursor: 'pointer', flex: '1' } }, [
          el('div', { class: 'optionLabel', text: t(titleKey) }),
          el('div', { class: 'optionHint', text: t(descKey) }),
        ]);
        const rowEl = el('div', { class: 'option', style: { display: 'flex', alignItems: 'center', gap: '12px' } }, [
          checkbox,
          label,
        ]);
        return { checkbox, rowEl };
      }

      const optHistory = createCheckboxOption('cd_history', 'clearData.history', 'clearData.historyDesc', true);
      const optCookies = createCheckboxOption('cd_cookies', 'clearData.cookies', 'clearData.cookiesDesc', true);
      const optCache = createCheckboxOption('cd_cache', 'clearData.cache', 'clearData.cacheDesc', true);
      const optStorage = createCheckboxOption('cd_storage', 'clearData.storage', 'clearData.storageDesc', false);
      const optDownloads = createCheckboxOption('cd_downloads', 'clearData.downloads', 'clearData.downloadsDesc', true);
      const optClosed = createCheckboxOption('cd_closed', 'clearData.closedTabs', 'clearData.closedTabsDesc', true);

      card.append(
        optHistory.rowEl,
        optCookies.rowEl,
        optCache.rowEl,
        optStorage.rowEl,
        optDownloads.rowEl,
        optClosed.rowEl
      );

      const buttonsRow = el('div', { class: 'actionRow', style: { marginTop: '20px', gap: '10px' } }, [
        el('button', {
          class: 'button danger',
          type: 'button',
          onclick: async () => {
            const range = select.value;
            const now = Date.now();
            let since = 0;
            if (range === 'hour') since = now - 3600 * 1000;
            else if (range === 'day') since = now - 86400 * 1000;
            else if (range === 'week') since = now - 7 * 86400 * 1000;
            else if (range === 'month') since = now - 30 * 86400 * 1000;

            await api().data.clear({
              history: optHistory.checkbox.checked,
              cookies: optCookies.checkbox.checked,
              cache: optCache.checkbox.checked,
              storage: optStorage.checkbox.checked,
              downloads: optDownloads.checkbox.checked,
              closedTabs: optClosed.checkbox.checked,
              since,
            });
            closeModal();
            toast(t('toast.browsingDataCleared'), 'success');
          },
        }, [el('span', { html: icon('trash') }), ` ${t('clearData.action')}`]),
        el('button', {
          class: 'button',
          type: 'button',
          onclick: () => closeModal(),
        }, [t('action.cancel')]),
      ]);

      container.append(rangeRow, card, buttonsRow);
      return container;
    },
  };
}

/* ------------------------------------------------------------- quick notes */

function escapeNoteHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatNoteInline(text) {
  let res = escapeNoteHtml(text);
  res = res.replace(/`([^`]+)`/g, '<code>$1</code>');
  res = res.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  res = res.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  res = res.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" class="noteLink" data-url="$2">$1</a>');
  return res;
}

function renderNoteMarkdown(raw) {
  if (!raw || !raw.trim()) return `<p><em>${t('notes.emptyPreview')}</em></p>`;
  const lines = raw.split(/\r?\n/);
  const htmlLines = [];
  let inCodeBlock = false;
  let codeBuffer = [];

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        htmlLines.push(`<pre><code>${escapeNoteHtml(codeBuffer.join('\n'))}</code></pre>`);
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    if (line.startsWith('# ')) {
      htmlLines.push(`<h1>${formatNoteInline(line.slice(2))}</h1>`);
    } else if (line.startsWith('## ')) {
      htmlLines.push(`<h2>${formatNoteInline(line.slice(3))}</h2>`);
    } else if (line.startsWith('### ')) {
      htmlLines.push(`<h3>${formatNoteInline(line.slice(4))}</h3>`);
    } else if (line.startsWith('- [ ] ') || line.startsWith('* [ ] ')) {
      htmlLines.push(`<div class="noteTodo"><input type="checkbox" disabled /> ${formatNoteInline(line.slice(6))}</div>`);
    } else if (line.startsWith('- [x] ') || line.startsWith('* [x] ') || line.startsWith('- [X] ')) {
      htmlLines.push(`<div class="noteTodo done"><input type="checkbox" checked disabled /> <s>${formatNoteInline(line.slice(6))}</s></div>`);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      htmlLines.push(`<li>${formatNoteInline(line.slice(2))}</li>`);
    } else if (line.trim() === '') {
      htmlLines.push('<br />');
    } else {
      htmlLines.push(`<p>${formatNoteInline(line)}</p>`);
    }
  }

  if (inCodeBlock && codeBuffer.length) {
    htmlLines.push(`<pre><code>${escapeNoteHtml(codeBuffer.join('\n'))}</code></pre>`);
  }

  return htmlLines.join('');
}

export function openNotes() {
  openModal({
    title: t('notes.title'),
    iconName: 'notes',
    nav: [notesPage()],
  });
}

function notesPage() {
  return {
    id: 'notes',
    icon: 'notes',
    labelKey: 'notes.title',
    render: () => {
      const container = el('div', { class: 'notesContainer' });
      container.append(head(t('notes.title'), t('notes.description')));

      const layout = el('div', { class: 'notesLayout' });
      const sidebar = el('div', { class: 'notesSidebar' });
      const editorArea = el('div', { class: 'notesEditor card' });

      let notes = [];
      let activeNote = null;
      let filterText = '';
      let isPreview = false;
      let saveTimer = null;
      const language = currentLanguage();

      const newBtn = el('button', {
        class: 'button primary',
        type: 'button',
        onclick: async () => {
          const fresh = {
            title: t('notes.newNote'),
            content: '',
            pinned: false,
            updatedAt: Date.now(),
          };
          const saved = await api().notes.save(fresh);
          await loadNotes(saved?.id);
        },
      }, [el('span', { html: icon('plus') }), ` ${t('notes.newNote')}`]);

      const searchInput = el('input', {
        class: 'textInput',
        type: 'search',
        placeholder: t('notes.searchPlaceholder'),
      });
      searchInput.addEventListener('input', () => {
        filterText = searchInput.value.trim().toLowerCase();
        paintList();
      });

      const listCard = el('div', { class: 'notesList card' });
      sidebar.append(newBtn, searchInput, listCard);

      const scheduleSave = () => {
        if (!activeNote) return;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
          activeNote.updatedAt = Date.now();
          await api().notes.save(activeNote);
          paintList();
        }, 300);
      };

      const paintEditor = () => {
        clear(editorArea);
        if (!activeNote) {
          editorArea.append(el('div', { class: 'empty', text: t('notes.noNotes') }));
          return;
        }

        const header = el('div', { class: 'notesEditorHeader' });
        const titleInput = el('input', {
          class: 'notesTitleInput',
          type: 'text',
          placeholder: t('notes.titlePlaceholder'),
          value: activeNote.title || '',
        });
        titleInput.addEventListener('input', () => {
          activeNote.title = titleInput.value;
          scheduleSave();
        });

        const timeLabel = el('span', {
          class: 'rowAside',
          style: { fontSize: '0.8em', color: 'var(--textDim)', whiteSpace: 'nowrap' },
          text: formatTime(activeNote.updatedAt, language),
        });
        header.append(titleInput, timeLabel);

        const toolbar = el('div', { class: 'notesToolbar' });

        const clipBtn = el('button', {
          class: 'button small',
          type: 'button',
          title: t('notes.insertTabLink'),
          onclick: () => {
            const cur = currentTab();
            if (cur && cur.url && !cur.url.startsWith('hinterland://')) {
              const link = `\n[${cur.title || cur.url}](${cur.url})\n`;
              activeNote.content = (activeNote.content ? activeNote.content + '\n' : '') + link;
              scheduleSave();
              paintEditor();
            } else {
              toast(t('toast.noTabsToBookmark'), 'warning');
            }
          },
        }, [el('span', { html: icon('link') }), ` ${t('notes.insertTabLink')}`]);

        const sep1 = el('div', { class: 'notesToolbarSep' });

        const editModeBtn = el('button', {
          class: `iconButton small ${!isPreview ? 'active' : ''}`,
          type: 'button',
          html: icon('edit'),
          title: t('notes.editMode'),
          onclick: () => {
            isPreview = false;
            paintEditor();
          },
        });

        const previewModeBtn = el('button', {
          class: `iconButton small ${isPreview ? 'active' : ''}`,
          type: 'button',
          html: icon('eye'),
          title: t('notes.previewMode'),
          onclick: () => {
            isPreview = true;
            paintEditor();
          },
        });

        const sep2 = el('div', { class: 'notesToolbarSep' });

        const pinBtn = el('button', {
          class: `iconButton small ${activeNote.pinned ? 'active' : ''}`,
          type: 'button',
          html: icon('pin'),
          title: activeNote.pinned ? t('notes.unpinNote') : t('notes.pinNote'),
          onclick: async () => {
            activeNote.pinned = !activeNote.pinned;
            activeNote.updatedAt = Date.now();
            await api().notes.save(activeNote);
            paintEditor();
            paintList();
          },
        });

        const copyBtn = el('button', {
          class: 'iconButton small',
          type: 'button',
          html: icon('copy'),
          title: t('notes.copyNote'),
          onclick: async () => {
            if (activeNote.content) {
              await api().tab.copyText(activeNote.content);
              toast(t('toast.noteCopied'), 'success');
            }
          },
        });

        const exportBtn = el('button', {
          class: 'iconButton small',
          type: 'button',
          html: icon('download'),
          title: t('notes.exportNote'),
          onclick: async () => {
            await api().notes.export(activeNote);
          },
        });

        const deleteBtn = el('button', {
          class: 'iconButton small danger',
          type: 'button',
          html: icon('trash'),
          title: t('notes.deleteNote'),
          onclick: async () => {
            const confirmed = await api().dialog.confirm({
              title: t('notes.deleteNote'),
              message: `${t('notes.deleteNote')} "${activeNote.title || ''}"?`,
            });
            if (confirmed) {
              await api().notes.delete(activeNote.id);
              await loadNotes();
            }
          },
        });

        toolbar.append(clipBtn, sep1, editModeBtn, previewModeBtn, sep2, pinBtn, copyBtn, exportBtn, deleteBtn);

        let bodyEl;
        if (isPreview) {
          bodyEl = el('div', { class: 'notesPreview', html: renderNoteMarkdown(activeNote.content) });
          bodyEl.addEventListener('click', (event) => {
            const link = event.target.closest('a.noteLink');
            if (link && link.dataset.url) {
              event.preventDefault();
              api().tabs.create({ url: link.dataset.url });
            }
          });
        } else {
          bodyEl = el('textarea', {
            class: 'notesContent',
            placeholder: t('notes.description'),
            value: activeNote.content || '',
          });
          bodyEl.addEventListener('input', () => {
            activeNote.content = bodyEl.value;
            scheduleSave();
          });
        }

        editorArea.append(header, toolbar, bodyEl);
      };

      const paintList = () => {
        clear(listCard);
        let items = [...notes];
        if (filterText) {
          items = items.filter((n) =>
            (n.title || '').toLowerCase().includes(filterText) ||
            (n.content || '').toLowerCase().includes(filterText)
          );
        }

        items.sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });

        if (!items.length) {
          listCard.append(el('div', { class: 'empty', text: filterText ? t('notes.noMatch') : t('notes.noNotes') }));
          return;
        }

        for (const item of items) {
          const itemNode = el('div', { class: `noteItem ${activeNote?.id === item.id ? 'active' : ''}` });
          const titleRow = el('div', { class: 'noteItemHeader' }, [
            el('span', { class: 'noteItemTitle', text: item.title || t('notes.newNote') }),
          ]);
          if (item.pinned) {
            titleRow.append(el('span', { html: icon('pin'), style: { width: '12px', height: '12px', color: 'var(--accent)' } }));
          }

          const timeRow = el('div', { class: 'noteItemTime', text: formatTime(item.updatedAt, language) });

          const snippetText = (item.content || '').replace(/[#*`_~>-]/g, '').slice(0, 50).trim();
          const snippetRow = el('div', { class: 'noteItemSnippet', text: snippetText || '...' });

          itemNode.append(titleRow, timeRow, snippetRow);
          itemNode.onclick = () => {
            activeNote = item;
            paintList();
            paintEditor();
          };
          listCard.append(itemNode);
        }
      };

      const loadNotes = async (selectId = null) => {
        notes = (await api().notes.get()) || [];
        if (!notes.length) {
          const welcome = {
            id: 'n_welcome',
            title: t('notes.welcomeTitle'),
            content: t('notes.welcomeContent'),
            pinned: true,
            updatedAt: Date.now(),
          };
          await api().notes.save(welcome);
          notes = [welcome];
        }

        if (selectId) {
          activeNote = notes.find((n) => n.id === selectId) || notes[0];
        } else if (!activeNote || !notes.find((n) => n.id === activeNote.id)) {
          activeNote = notes[0] || null;
        }

        paintList();
        paintEditor();
      };

      loadNotes();
      layout.append(sidebar, editorArea);
      container.append(layout);
      return container;
    },
  };
}

/* ------------------------------------------------------------- tab stashes */

export function openTabStash() {
  openModal({
    title: t('stash.title'),
    iconName: 'archive',
    nav: [tabStashPage()],
  });
}

function tabStashPage() {
  return {
    id: 'tabStash',
    icon: 'archive',
    labelKey: 'stash.title',
    render: () => {
      const language = currentLanguage();
      const container = el('div', { class: 'stashPage' });
      container.append(head(t('stash.title'), t('stash.description')));

      let stashes = [];
      let filterText = '';

      const search = searchBox((value) => {
        filterText = value.toLowerCase();
        paint();
      });

      const topActions = el('div', { class: 'actionRow stashActions' }, [
        el('button', {
          class: 'button primary',
          type: 'button',
          onclick: async () => {
            const res = await api().stashes.stashCurrent({ keepActive: false });
            if (res?.ok) {
              await loadStashes();
              toast(t('toast.tabsStashed', { count: res.count }), 'success');
            } else if (res?.error === 'no_tabs') {
              toast(t('toast.noTabsToStash'), 'warning');
            }
          },
        }, [el('span', { html: icon('archive') }), ` ${t('stash.stashAll')}`]),
        el('button', {
          class: 'button',
          type: 'button',
          onclick: async () => {
            const res = await api().stashes.stashCurrent({ keepActive: true });
            if (res?.ok) {
              await loadStashes();
              toast(t('toast.tabsStashed', { count: res.count }), 'success');
            } else if (res?.error === 'no_tabs') {
              toast(t('toast.noTabsToStash'), 'warning');
            }
          },
        }, [el('span', { html: icon('archive') }), ` ${t('stash.stashInactive')}`]),
        el('button', {
          class: 'button',
          type: 'button',
          onclick: async () => {
            await api().stashes.importJson();
            await loadStashes();
          },
        }, [el('span', { html: icon('upload') }), ` ${t('stash.import')}`]),
        el('button', {
          class: 'button',
          type: 'button',
          onclick: async () => {
            await api().stashes.exportJson();
          },
        }, [el('span', { html: icon('download') }), ` ${t('stash.exportAll')}`]),
      ]);

      const listContainer = el('div', { class: 'stashList' });

      const paint = () => {
        clear(listContainer);
        let items = [...stashes];
        if (filterText) {
          items = items.filter((s) => {
            const matchTitle = (s.title || '').toLowerCase().includes(filterText);
            const matchTab = (s.tabs || []).some((tab) =>
              (tab.title || '').toLowerCase().includes(filterText) ||
              (tab.url || '').toLowerCase().includes(filterText)
            );
            return matchTitle || matchTab;
          });
        }

        if (!items.length) {
          listContainer.append(el('div', { class: 'empty', text: filterText ? t('stash.noMatch') : t('stash.empty') }));
          return;
        }

        for (const stash of items) {
          const card = el('div', { class: 'card stashCard' });

          const header = el('div', { class: 'stashHeader' });
          const titleGroup = el('div', { class: 'stashTitleGroup' });

          const titleEl = el('span', {
            class: 'stashTitle',
            text: stash.title || t('stash.defaultTitle'),
            title: t('stash.renameHint'),
          });

          titleEl.addEventListener('click', () => {
            const input = el('input', {
              class: 'textInput stashTitleEdit',
              type: 'text',
              value: stash.title || '',
            });
            input.addEventListener('blur', async () => {
              if (input.value.trim() && input.value !== stash.title) {
                stash.title = input.value.trim();
                await api().stashes.rename(stash.id, stash.title);
              }
              paint();
            });
            input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') input.blur();
              if (e.key === 'Escape') paint();
            });
            titleEl.replaceWith(input);
            input.focus();
            input.select();
          });

          const tabCount = (stash.tabs || []).length;
          const countBadge = el('span', {
            class: 'statusTag active',
            text: `${tabCount} ${t(tabCount === 1 ? 'stash.tab' : 'stash.tabs')}`,
          });

          const timeEl = el('span', {
            class: 'stashTime',
            text: formatTime(stash.createdAt, language),
          });

          titleGroup.append(titleEl, countBadge, timeEl);

          const actions = el('div', { class: 'stashCardActions' }, [
            el('button', {
              class: 'button primary small',
              type: 'button',
              onclick: async () => {
                await api().stashes.restore(stash.id, { closeCurrent: false, removeStash: false });
                closeModal();
              },
            }, [el('span', { html: icon('external') }), ` ${t('stash.restore')}`]),
            el('button', {
              class: 'button small',
              type: 'button',
              title: t('stash.export'),
              onclick: async () => {
                await api().stashes.exportJson(stash.id);
              },
            }, [el('span', { html: icon('download') })]),
            el('button', {
              class: 'button small danger',
              type: 'button',
              title: t('stash.delete'),
              onclick: async () => {
                const confirmed = await api().dialog.confirm({
                  title: t('stash.delete'),
                  message: `${t('stash.deleteConfirm')} "${stash.title}"?`,
                });
                if (confirmed) {
                  await api().stashes.delete(stash.id);
                  await loadStashes();
                  toast(t('toast.stashDeleted'), 'info');
                }
              },
            }, [el('span', { html: icon('trash') })]),
          ]);

          header.append(titleGroup, actions);

          const tabsList = el('div', { class: 'stashTabsList' });
          (stash.tabs || []).forEach((tab, index) => {
            const tabRow = el('div', { class: 'stashTabRow' });

            const iconHtml = tab.favicon
              ? `<img src="${tab.favicon}" alt="" style="width:14px;height:14px;border-radius:2px" onerror="this.outerHTML='${icon('globe')}'" />`
              : icon('globe');

            const tabIcon = el('span', { class: 'stashTabIcon', html: iconHtml });
            const tabInfo = el('div', { class: 'stashTabInfo' }, [
              el('span', { class: 'stashTabTitle', text: tab.title || tab.url }),
              el('span', { class: 'stashTabUrl', text: prettyUrl(tab.url) }),
            ]);

            const tabActions = el('div', { class: 'stashTabActions' }, [
              el('button', {
                class: 'iconButton small',
                type: 'button',
                title: t('action.open'),
                onclick: () => {
                  api().tabs.create({ url: tab.url });
                  toast(t('toast.tabOpened'), 'info');
                },
              }, [el('span', { html: icon('external') })]),
              el('button', {
                class: 'iconButton small danger',
                type: 'button',
                title: t('action.remove'),
                onclick: async () => {
                  await api().stashes.removeTab(stash.id, index);
                  await loadStashes();
                },
              }, [el('span', { html: icon('close') })]),
            ]);

            tabRow.append(tabIcon, tabInfo, tabActions);
            tabsList.append(tabRow);
          });

          card.append(header, tabsList);
          listContainer.append(card);
        }
      };

      const loadStashes = async () => {
        stashes = (await api().stashes.get()) || [];
        paint();
      };

      loadStashes();
      container.append(topActions, search.field, listContainer);
      return container;
    },
  };
}

export { openQrCode } from './qrcode.js';
