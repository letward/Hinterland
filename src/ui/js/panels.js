import { el, clear, formatBytes, formatTime } from './util.js';
import { icon } from './icons.js';
import { t, currentLanguage } from './i18n.js';
import { openModal, closeModal } from './modal.js';
import { toast } from './toast.js';
import { get } from './store.js';
import { currentTab } from './state.js';

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

  return el('div', { class: 'option' }, [
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
        el('div', { class: 'actionRow', style: { marginBottom: '14px' } }, [
          el('button', { class: 'button', type: 'button', onclick: async () => {
            await api().history.clear();
            paint([]);
          } }, [t('history.clear')]),
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
            { labelKey: 'menu.history', combo: 'Ctrl+H' },
            { labelKey: 'menu.downloads', combo: 'Ctrl+J' },
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