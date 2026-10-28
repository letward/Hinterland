import { el, clear, formatBytes, formatTime, copyToClipboard, prettyUrl } from './util.js';
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
        el('button', { class: 'button', type: 'button', onclick: async () => {
          const res = await api().account.syncNow();
          if (res?.ok) {
            toast(t('toast.syncSuccess'), 'success');
            paint(currentFilter);
          } else if (res?.error === 'notLoggedIn') {
            closeModal();
            openAccount();
          } else {
            toast(t('toast.syncFailed'), 'error');
          }
        } }, [el('span', { html: icon('cloud') }), ` ${t('account.syncNow')}`]),
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

      const toolbar = el('div', { class: 'downloadsToolbar', style: { display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '14px' } });

      const searchInput = el('input', {
        class: 'input downloadsSearch',
        type: 'text',
        placeholder: t('downloads.searchPlaceholder'),
        style: { flex: '1', minWidth: '180px' },
      });

      const filtersGroup = el('div', { class: 'downloadsFilters', style: { display: 'flex', gap: '4px' } });
      const filterDefs = [
        { id: 'all', labelKey: 'downloads.filterAll' },
        { id: 'completed', labelKey: 'downloads.filterCompleted' },
        { id: 'active', labelKey: 'downloads.filterActive' },
        { id: 'failed', labelKey: 'downloads.filterFailed' },
      ];

      let currentFilter = 'all';
      let searchQuery = '';
      const filterButtons = [];

      filterDefs.forEach((f) => {
        const btn = el('button', {
          class: `button small ${f.id === 'all' ? 'active' : ''}`,
          type: 'button',
          text: t(f.labelKey),
          onclick: () => {
            currentFilter = f.id;
            for (const b of filterButtons) b.classList.remove('active');
            btn.classList.add('active');
            paint();
          },
        });
        filterButtons.push(btn);
        filtersGroup.append(btn);
      });

      const actionsGroup = el('div', { class: 'downloadsActions', style: { display: 'flex', gap: '6px' } });
      const openFolderBtn = el('button', {
        class: 'button small',
        type: 'button',
        html: `${icon('external')} <span>${t('downloads.openFolder')}</span>`,
        onclick: () => api().app.openFolder('downloads'),
      });
      const clearHistoryBtn = el('button', {
        class: 'button small',
        type: 'button',
        html: `${icon('trash')} <span>${t('downloads.clearAll')}</span>`,
        onclick: async () => {
          await api().downloads.clearHistory();
          downloads.clear();
          toast(t('toast.downloadHistoryCleared'), 'success');
          paint();
        },
      });
      actionsGroup.append(openFolderBtn, clearHistoryBtn);

      toolbar.append(searchInput, filtersGroup, actionsGroup);
      container.append(toolbar);

      const list = el('div', { class: 'card' });
      container.append(list);

      const paint = async () => {
        let historyItems = [];
        try {
          historyItems = await api().downloads.history();
        } catch {
          historyItems = [];
        }

        const map = new Map();
        for (const item of historyItems) map.set(item.id, item);
        for (const [id, val] of downloads.entries()) map.set(id, { ...map.get(id), ...val });

        const entries = [...map.values()].reverse();
        clear(list);

        const filtered = entries.filter((entry) => {
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const fn = (entry.filename || '').toLowerCase();
            const u = (entry.url || '').toLowerCase();
            if (!fn.includes(q) && !u.includes(q)) return false;
          }
          if (currentFilter === 'completed') return entry.state === 'completed' || entry.ok === true;
          if (currentFilter === 'active') return entry.state === 'progressing' || entry.paused;
          if (currentFilter === 'failed') return entry.state === 'interrupted' || entry.state === 'cancelled' || entry.ok === false;
          return true;
        });

        if (!filtered.length) {
          list.append(el('div', { class: 'empty', text: t('downloads.empty') }));
          return;
        }

        for (const entry of filtered) {
          const total = Number(entry.totalBytes) || 0;
          const received = Number(entry.receivedBytes) || 0;
          const isDone = entry.state === 'completed' || (entry.ok && !entry.state);
          const isFailed = entry.state === 'interrupted' || entry.state === 'cancelled' || entry.ok === false;
          const percent = total ? Math.min(100, Math.round((received / total) * 100)) : isDone ? 100 : 0;

          const fileExt = (entry.filename || '').split('.').pop()?.toLowerCase();
          const fileIconName = ['pdf', 'doc', 'txt'].includes(fileExt) ? 'page' : ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExt) ? 'camera' : 'download';

          const hintParts = [];
          if (isDone) hintParts.push(t('downloads.done'));
          else if (isFailed) hintParts.push(t('downloads.filterFailed'));
          else hintParts.push(entry.state || 'Downloading');

          if (total) hintParts.push(`${formatBytes(received)} / ${formatBytes(total)}`);
          else if (received) hintParts.push(formatBytes(received));

          if (entry.timestamp) hintParts.push(formatTime(entry.timestamp));

          const controls = el('div', { class: 'optionControl', style: { display: 'flex', gap: '4px' } });

          if (isDone && entry.savePath) {
            controls.append(
              el('button', {
                class: 'iconButton small',
                type: 'button',
                html: icon('page'),
                title: t('downloads.openFile'),
                onclick: () => api().downloads.openFile(entry.savePath),
              }),
            );
          }

          if (entry.savePath) {
            controls.append(
              el('button', {
                class: 'iconButton small',
                type: 'button',
                html: icon('external'),
                title: t('downloads.showInFolder'),
                onclick: () => api().app.revealFile(entry.savePath),
              }),
            );
          }

          if (entry.url) {
            controls.append(
              el('button', {
                class: 'iconButton small',
                type: 'button',
                html: icon('copy'),
                title: t('downloads.copyLink'),
                onclick: () => {
                  copyToClipboard(entry.url);
                  toast(t('toast.linkCopied'), 'info');
                },
              }),
            );
          }

          controls.append(
            el('button', {
              class: 'iconButton small',
              type: 'button',
              html: icon('trash'),
              title: t('action.remove'),
              onclick: async () => {
                await api().downloads.removeItem(entry.id);
                downloads.delete(entry.id);
                toast(t('toast.downloadRemoved'), 'info');
                paint();
              },
            }),
          );

          list.append(
            el('div', { class: 'option' }, [
              el('div', { class: 'rowIcon', html: icon(fileIconName) }),
              el('div', { class: 'optionText', style: { flex: '1', minWidth: '0' } }, [
                el('div', { class: 'optionLabel', text: entry.filename || 'Download' }),
                el('div', { class: 'optionHint', text: hintParts.join(' — ') }),
                el('div', { class: 'downloadBar' }, [el('div', { class: 'downloadBarFill', style: { width: `${percent}%` } })]),
              ]),
              controls,
            ]),
          );
        }
      };

      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        paint();
      });

      paint();
      return container;
    },
  };
}

export function openCookieInspector(targetUrl) {
  openModal({
    title: t('siteInfo.cookiesModalTitle'),
    iconName: 'cookie',
    nav: [cookieInspectorPage(targetUrl)],
  });
}

function cookieInspectorPage(targetUrl) {
  return {
    id: 'cookies',
    icon: 'cookie',
    labelKey: 'siteInfo.cookiesHeader',
    render: () => {
      const container = el('div');
      const host = hostOf(targetUrl) || targetUrl;
      container.append(head(t('siteInfo.cookiesModalTitle'), t('siteInfo.cookiesModalDesc', { host })));

      const toolbar = el('div', { class: 'actionRow cookiesToolbar', style: { display: 'flex', gap: '8px', marginBottom: '14px', alignItems: 'center' } });
      const searchInput = el('input', {
        class: 'input cookiesSearchInput',
        type: 'text',
        placeholder: t('siteInfo.filterCookies'),
        style: { flex: '1' },
      });
      const clearBtn = el('button', {
        class: 'button',
        type: 'button',
        onclick: async () => {
          await api().site.clearCookies(targetUrl);
          toast(t('toast.allCookiesCleared'), 'success');
          paint();
        },
      }, [el('span', { html: icon('trash') }), ` ${t('siteInfo.clearSiteCookies')}`]);

      toolbar.append(searchInput, clearBtn);
      container.append(toolbar);

      const list = el('div', { class: 'card cookiesList' });
      container.append(list);

      let allCookies = [];
      let query = '';

      const paint = async () => {
        allCookies = await api().site.getCookies(targetUrl);
        renderList();
      };

      const renderList = () => {
        clear(list);
        const filtered = allCookies.filter((c) => {
          if (!query) return true;
          return (c.name || '').toLowerCase().includes(query) || (c.domain && c.domain.toLowerCase().includes(query));
        });

        if (!filtered.length) {
          list.append(el('div', { class: 'empty', text: t('siteInfo.noCookies') }));
          return;
        }

        for (const cookie of filtered) {
          let revealed = false;
          const valueText = el('span', { class: 'cookieValueMasked', text: '••••••••••••••••' });
          const toggleRevealBtn = el('button', {
            class: 'iconButton small',
            type: 'button',
            html: icon('eye'),
            title: t('siteInfo.copyValue'),
            onclick: () => {
              revealed = !revealed;
              valueText.textContent = revealed ? cookie.value : '••••••••••••••••';
              toggleRevealBtn.innerHTML = icon(revealed ? 'eyeOff' : 'eye');
            },
          });

          const copyBtn = el('button', {
            class: 'iconButton small',
            type: 'button',
            html: icon('copy'),
            title: t('siteInfo.copyValue'),
            onclick: () => {
              copyToClipboard(cookie.value);
              toast(t('toast.cookieValueCopied'), 'info');
            },
          });

          const deleteBtn = el('button', {
            class: 'iconButton small',
            type: 'button',
            html: icon('trash'),
            title: t('siteInfo.deleteCookie'),
            onclick: async () => {
              await api().site.deleteCookie({ url: targetUrl, name: cookie.name, domain: cookie.domain, path: cookie.path });
              allCookies = allCookies.filter((c) => !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path));
              toast(t('toast.cookieDeleted'), 'info');
              renderList();
            },
          });

          const badges = [
            el('span', { class: 'statusTag', text: cookie.domain }),
            el('span', { class: 'statusTag', text: cookie.path }),
          ];
          if (cookie.secure) badges.push(el('span', { class: 'statusTag active', text: t('siteInfo.cookieSecure') }));
          if (cookie.httpOnly) badges.push(el('span', { class: 'statusTag', text: t('siteInfo.cookieHttpOnly') }));
          if (cookie.expirationDate) badges.push(el('span', { class: 'statusTag', text: `${t('siteInfo.cookieExpires')}: ${cookie.expirationDate}` }));

          const row = el('div', { class: 'option cookieRow', style: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 14px' } }, [
            el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
              el('strong', { class: 'cookieName', text: cookie.name }),
              el('div', { class: 'actionRow' }, [toggleRevealBtn, copyBtn, deleteBtn]),
            ]),
            el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--textDim)', wordBreak: 'break-all' } }, [
              el('span', { text: `${t('siteInfo.cookieValue')}: ` }),
              valueText,
            ]),
            el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' } }, badges),
          ]);
          list.append(row);
        }
      };

      searchInput.addEventListener('input', (e) => {
        query = e.target.value.toLowerCase().trim();
        renderList();
      });

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
          el('button', { class: 'button', type: 'button', onclick: () => api().tabs.create({ url: 'https://hinterland-browser.vercel.app/docs/user-guide.html' }) }, [t('about.userGuide')]),
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

/* ------------------------------------------------------------- passwords */

export function openPasswords(initialTab = 'passwords-current') {
  const activeId = initialTab.startsWith('passwords-') ? initialTab : `passwords-${initialTab}`;
  openModal({
    title: t('passwords.title'),
    iconName: 'key',
    activeId,
    nav: [
      passwordsCurrentSitePage(),
      passwordsAllLoginsPage(),
      passwordsGeneratorPage(),
      passwordsSettingsPage(),
    ],
  });
}

function renderVaultLockHeader(container, onLock) {
  const bar = el('div', { class: 'actionRow', style: { marginBottom: '14px', justifyContent: 'space-between' } }, [
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
      el('span', { class: 'groupColorDot', style: { background: '#22c55e' } }),
      el('span', { style: { fontSize: '13px', fontWeight: '500', color: 'var(--textDim)' }, text: t('passwords.title') }),
    ]),
    el('button', {
      class: 'button small',
      type: 'button',
      title: t('passwords.lock'),
      onclick: async () => {
        await api().passwords.lock();
        toast(t('toast.vaultLocked'), 'info');
        if (onLock) onLock();
      },
    }, [el('span', { html: icon('lock') }), ` ${t('passwords.lock')}`]),
  ]);
  container.append(bar);
}

function renderUnlockOrSetup(container, onUnlocked) {
  clear(container);
  (async () => {
    const status = await api().passwords.getStatus();
    if (status.isUnlocked) {
      onUnlocked();
      return;
    }

    const hero = el('div', { class: 'passwordsHero' });

    if (!status.isInitialized) {
      // First-time setup
      hero.append(
        el('div', { class: 'passwordsHeroIcon', html: icon('shield') }),
        el('h2', { style: { margin: '0 0 6px 0', fontSize: '1.25em' }, text: t('passwords.setupTitle') }),
        el('p', { class: 'pageDesc', style: { marginBottom: '18px' }, text: t('passwords.setupDesc') }),
      );

      const passInput = el('input', { class: 'textInput', type: 'password', required: true, minlength: '8', placeholder: t('passwords.enterMaster') });
      const confirmInput = el('input', { class: 'textInput', type: 'password', required: true, minlength: '8', placeholder: t('passwords.confirmMaster') });
      const errorMsg = el('div', { class: 'form-error', style: { color: 'var(--danger, #ef4444)', fontSize: '12px', minHeight: '16px' } });

      const form = el('form', { class: 'passwordsForm' }, [
        el('div', { class: 'passwordsField' }, [
          el('label', { text: t('passwords.masterPassword') }),
          el('div', { class: 'passwordsInputWrap' }, [passInput]),
        ]),
        el('div', { class: 'passwordsField' }, [
          el('label', { text: t('passwords.confirmMaster') }),
          el('div', { class: 'passwordsInputWrap' }, [confirmInput]),
        ]),
        errorMsg,
        el('button', { class: 'button primary', type: 'submit' }, [t('passwords.createVault')]),
      ]);

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMsg.textContent = '';
        if (passInput.value.length < 8) {
          errorMsg.textContent = t('passwords.minChars');
          return;
        }
        if (passInput.value !== confirmInput.value) {
          errorMsg.textContent = t('passwords.noMatch');
          return;
        }
        try {
          const res = await api().passwords.setup(passInput.value);
          if (res?.ok) {
            toast(t('toast.vaultUnlocked'), 'success');
            onUnlocked();
          } else {
            errorMsg.textContent = res?.error || 'Setup failed';
          }
        } catch (err) {
          errorMsg.textContent = err.message;
        }
      });

      hero.append(form);
    } else {
      // Unlock existing vault
      hero.append(
        el('div', { class: 'passwordsHeroIcon', html: icon('lock') }),
        el('h2', { style: { margin: '0 0 6px 0', fontSize: '1.25em' }, text: t('passwords.locked') }),
        el('p', { class: 'pageDesc', style: { marginBottom: '18px' }, text: t('passwords.enterMaster') }),
      );

      const passInput = el('input', { class: 'textInput', type: 'password', required: true, autofocus: true, placeholder: t('passwords.masterPassword') });
      const eyeBtn = el('button', {
        class: 'passwordsEyeBtn',
        type: 'button',
        html: icon('eye'),
        onclick: () => {
          passInput.type = passInput.type === 'password' ? 'text' : 'password';
        },
      });

      const errorMsg = el('div', { style: { color: 'var(--danger, #ef4444)', fontSize: '12px', minHeight: '16px' } });

      const form = el('form', { class: 'passwordsForm' }, [
        el('div', { class: 'passwordsField' }, [
          el('div', { class: 'passwordsInputWrap' }, [passInput, eyeBtn]),
        ]),
        errorMsg,
        el('button', { class: 'button primary', type: 'submit' }, [t('passwords.unlock')]),
      ]);

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMsg.textContent = '';
        try {
          const res = await api().passwords.unlock(passInput.value);
          if (res?.ok) {
            toast(t('toast.vaultUnlocked'), 'success');
            onUnlocked();
          } else {
            errorMsg.textContent = t('passwords.incorrect');
          }
        } catch (err) {
          errorMsg.textContent = err.message;
        }
      });

      hero.append(form);
    }

    container.append(hero);
  })();
}

function renderLoginEditor(container, item, onSaved, onCancel) {
  clear(container);

  const isEdit = Boolean(item?.id);
  const titleInput = el('input', { class: 'textInput', type: 'text', required: true, value: item?.title || '', placeholder: 'z.B. GitHub' });
  const domainInput = el('input', { class: 'textInput', type: 'text', required: true, value: item?.domain || item?.url || '', placeholder: 'z.B. github.com' });
  const userInput = el('input', { class: 'textInput', type: 'text', value: item?.username || '', placeholder: 'z.B. user@example.com' });
  const passInput = el('input', { class: 'textInput', type: 'password', required: true, value: item?.password || '', placeholder: t('passwords.password') });

  const eyeBtn = el('button', {
    class: 'passwordsEyeBtn',
    type: 'button',
    html: icon('eye'),
    onclick: () => {
      passInput.type = passInput.type === 'password' ? 'text' : 'password';
    },
  });

  const notesInput = el('textarea', { class: 'textInput', rows: 2, placeholder: t('passwords.notes') });
  notesInput.value = item?.notes || '';

  const form = el('form', { class: 'passwordsForm', style: { maxWidth: '520px', margin: '0 auto' } }, [
    el('h2', { style: { margin: '0 0 12px 0', fontSize: '1.2em' }, text: isEdit ? t('passwords.editLogin') : t('passwords.addLogin') }),
    el('div', { class: 'passwordsField' }, [
      el('label', { text: t('passwords.titleField') }),
      titleInput,
    ]),
    el('div', { class: 'passwordsField' }, [
      el('label', { text: t('passwords.domain') }),
      domainInput,
    ]),
    el('div', { class: 'passwordsField' }, [
      el('label', { text: t('passwords.username') }),
      userInput,
    ]),
    el('div', { class: 'passwordsField' }, [
      el('label', { text: t('passwords.password') }),
      el('div', { class: 'passwordsInputWrap' }, [passInput, eyeBtn]),
    ]),
    el('div', { class: 'passwordsField' }, [
      el('label', { text: t('passwords.notes') }),
      notesInput,
    ]),
    el('div', { class: 'actionRow', style: { marginTop: '12px', justifyContent: 'flex-end' } }, [
      el('button', { class: 'button', type: 'button', onclick: onCancel }, [t('action.cancel')]),
      el('button', { class: 'button primary', type: 'submit' }, [t('passwords.save')]),
    ]),
  ]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      ...(item || {}),
      title: titleInput.value.trim(),
      domain: domainInput.value.trim(),
      url: domainInput.value.trim().startsWith('http') ? domainInput.value.trim() : `https://${domainInput.value.trim()}`,
      username: userInput.value.trim(),
      password: passInput.value,
      notes: notesInput.value.trim(),
    };
    const res = await api().passwords.saveLogin(payload);
    if (res?.ok) {
      toast(t(isEdit ? 'toast.passwordUpdated' : 'toast.passwordSaved'), 'success');
      onSaved();
    } else {
      toast(res?.error || 'Save failed', 'danger');
    }
  });

  container.append(form);
}

function passwordsCurrentSitePage() {
  return {
    id: 'passwords-current',
    icon: 'globe',
    labelKey: 'passwords.thisSite',
    render: () => {
      const container = el('div');

      const renderSiteLogins = async () => {
        clear(container);
        renderVaultLockHeader(container, () => renderUnlockOrSetup(container, renderSiteLogins));

        const tab = currentTab();
        const activeUrl = tab?.url || '';
        const status = await api().passwords.getStatus(activeUrl);

        const domain = status.activeTabDomain || (tab?.url ? prettyUrl(tab.url).split('/')[0] : '');

        container.append(
          head(
            domain ? `Logins: ${domain}` : t('passwords.thisSite'),
            t('passwords.desc')
          )
        );

        const topActions = el('div', { class: 'actionRow', style: { marginBottom: '14px' } }, [
          el('button', {
            class: 'button primary',
            type: 'button',
            onclick: () => {
              renderLoginEditor(
                container,
                { domain, title: domain, url: tab?.url || '' },
                () => renderSiteLogins(),
                () => renderSiteLogins()
              );
            },
          }, [el('span', { html: icon('plus') }), ` ${t('passwords.addLogin')}`]),
        ]);
        container.append(topActions);

        const res = await api().passwords.getLoginsForUrl(domain);
        const logins = res.logins || [];

        const list = el('div', { class: 'card' });

        if (!logins.length) {
          list.append(el('div', { class: 'empty', text: t('passwords.noLoginsSite') }));
        } else {
          for (const item of logins) {
            const row = el('div', { class: 'passwordsItemRow' });

            const meta = el('div', { class: 'passwordsItemMeta' }, [
              el('span', { class: 'passwordsItemTitle' }, [
                el('span', { html: icon('key') }),
                item.title || item.domain,
              ]),
              el('span', { class: 'passwordsItemUser', text: item.username || '—' }),
            ]);

            const actions = el('div', { class: 'passwordsItemActions' }, [
              el('button', {
                class: 'button small primary',
                type: 'button',
                title: t('passwords.fill'),
                onclick: async () => {
                  const filled = await api().passwords.autofillActiveTab({ username: item.username, password: item.password });
                  if (filled?.ok) toast(t('toast.autofillSuccess'), 'success');
                  else toast(t('passwords.fill'), 'info');
                },
              }, [el('span', { html: icon('sparkles') }), ` ${t('passwords.fill')}`]),
              el('button', {
                class: 'iconButton small',
                type: 'button',
                title: t('passwords.copyUser'),
                onclick: () => {
                  copyToClipboard(item.username);
                  toast(t('toast.usernameCopied'), 'info');
                },
              }, [el('span', { html: icon('copy') })]),
              el('button', {
                class: 'iconButton small',
                type: 'button',
                title: t('passwords.copyPass'),
                onclick: () => {
                  copyToClipboard(item.password, 30);
                  toast(t('toast.passwordCopied'), 'info');
                },
              }, [el('span', { html: icon('lock') })]),
              el('button', {
                class: 'iconButton small',
                type: 'button',
                title: t('action.edit'),
                onclick: () => {
                  renderLoginEditor(container, item, () => renderSiteLogins(), () => renderSiteLogins());
                },
              }, [el('span', { html: icon('edit') })]),
              el('button', {
                class: 'iconButton small danger',
                type: 'button',
                title: t('passwords.delete'),
                onclick: async () => {
                  const confirmed = await api().dialog.confirm({
                    title: t('passwords.delete'),
                    message: `${t('passwords.delete')} "${item.title || item.domain}"?`,
                  });
                  if (confirmed) {
                    await api().passwords.deleteLogin(item.id);
                    toast(t('toast.passwordDeleted'), 'info');
                    renderSiteLogins();
                  }
                },
              }, [el('span', { html: icon('trash') })]),
            ]);

            row.append(meta, actions);
            list.append(row);
          }
        }

        container.append(list);
      };

      renderUnlockOrSetup(container, renderSiteLogins);
      return container;
    },
  };
}

function passwordsAllLoginsPage() {
  return {
    id: 'passwords-all',
    icon: 'lock',
    labelKey: 'passwords.allLogins',
    render: () => {
      const container = el('div');

      const renderAll = async () => {
        clear(container);
        renderVaultLockHeader(container, () => renderUnlockOrSetup(container, renderAll));
        container.append(head(t('passwords.allLogins'), t('passwords.desc')));

        let currentSearch = '';

        const listContainer = el('div', { class: 'card' });

        const refreshList = async () => {
          clear(listContainer);
          const res = await api().passwords.getAllLogins(currentSearch);
          const logins = res?.logins || [];

          if (!logins.length) {
            listContainer.append(el('div', { class: 'empty', text: t('passwords.noLogins') }));
            return;
          }

          for (const item of logins) {
            const row = el('div', { class: 'passwordsItemRow' });

            const meta = el('div', { class: 'passwordsItemMeta' }, [
              el('span', { class: 'passwordsItemTitle' }, [
                el('span', { html: icon('key') }),
                item.title || item.domain,
              ]),
              el('span', { class: 'passwordsItemUser', text: `${item.username ? item.username + ' • ' : ''}${item.domain || ''}` }),
            ]);

            const actions = el('div', { class: 'passwordsItemActions' }, [
              el('button', {
                class: 'iconButton small',
                type: 'button',
                title: t('passwords.copyUser'),
                onclick: () => {
                  copyToClipboard(item.username);
                  toast(t('toast.usernameCopied'), 'info');
                },
              }, [el('span', { html: icon('copy') })]),
              el('button', {
                class: 'iconButton small',
                type: 'button',
                title: t('passwords.copyPass'),
                onclick: () => {
                  copyToClipboard(item.password, 30);
                  toast(t('toast.passwordCopied'), 'info');
                },
              }, [el('span', { html: icon('lock') })]),
              el('button', {
                class: 'iconButton small',
                type: 'button',
                title: t('action.edit'),
                onclick: () => {
                  renderLoginEditor(container, item, () => renderAll(), () => renderAll());
                },
              }, [el('span', { html: icon('edit') })]),
              el('button', {
                class: 'iconButton small danger',
                type: 'button',
                title: t('passwords.delete'),
                onclick: async () => {
                  const confirmed = await api().dialog.confirm({
                    title: t('passwords.delete'),
                    message: `${t('passwords.delete')} "${item.title || item.domain}"?`,
                  });
                  if (confirmed) {
                    await api().passwords.deleteLogin(item.id);
                    toast(t('toast.passwordDeleted'), 'info');
                    refreshList();
                  }
                },
              }, [el('span', { html: icon('trash') })]),
            ]);

            row.append(meta, actions);
            listContainer.append(row);
          }
        };

        const { field } = searchBox((val) => {
          currentSearch = val;
          refreshList();
        });

        const topActions = el('div', { class: 'actionRow', style: { marginBottom: '14px' } }, [
          el('button', {
            class: 'button primary',
            type: 'button',
            onclick: () => {
              renderLoginEditor(container, null, () => renderAll(), () => renderAll());
            },
          }, [el('span', { html: icon('plus') }), ` ${t('passwords.addLogin')}`]),
        ]);

        container.append(topActions, field, listContainer);
        refreshList();
      };

      renderUnlockOrSetup(container, renderAll);
      return container;
    },
  };
}

function passwordsGeneratorPage() {
  return {
    id: 'passwords-generator',
    icon: 'sparkles',
    labelKey: 'passwords.generator',
    render: () => {
      const container = el('div');
      container.append(head(t('passwords.generator'), t('passwords.desc')));

      let currentPassword = '';

      const display = el('div', { class: 'passwordsGenDisplay' });

      const strengthBarFill = el('div', { class: 'passwordsStrengthBarFill' });
      const strengthBarBg = el('div', { class: 'passwordsStrengthBarBg' }, [strengthBarFill]);
      const strengthLabel = el('span', { text: '' });
      const entropyLabel = el('span', { text: '' });
      const strengthWrap = el('div', { class: 'passwordsStrengthWrap' }, [
        strengthBarBg,
        el('div', { class: 'passwordsStrengthMeta' }, [strengthLabel, entropyLabel]),
      ]);

      const lengthVal = el('span', { style: { fontWeight: '600' }, text: '20' });
      const slider = el('input', { type: 'range', min: '8', max: '64', value: '20', class: 'slider', style: { width: '100%' } });

      const chkUpper = el('input', { type: 'checkbox', checked: true });
      const chkLower = el('input', { type: 'checkbox', checked: true });
      const chkNum = el('input', { type: 'checkbox', checked: true });
      const chkSym = el('input', { type: 'checkbox', checked: true });
      const chkAmb = el('input', { type: 'checkbox', checked: false });

      const refreshGen = async () => {
        const len = Number(slider.value) || 20;
        lengthVal.textContent = String(len);
        const res = await api().passwords.generatePassword({
          length: len,
          uppercase: chkUpper.checked,
          lowercase: chkLower.checked,
          numbers: chkNum.checked,
          symbols: chkSym.checked,
          avoidAmbiguous: chkAmb.checked,
        });

        currentPassword = res.password;
        display.textContent = currentPassword;

        const str = res.strength;
        strengthBarFill.style.width = `${str.score}%`;
        strengthBarFill.style.backgroundColor = str.color;

        let labelText = t('passwords.strengthStrong');
        if (str.score >= 100) labelText = t('passwords.strengthExcellent');
        else if (str.score >= 60) labelText = t('passwords.strengthGood');
        else if (str.score >= 40) labelText = t('passwords.strengthFair');
        else if (str.score <= 20) labelText = t('passwords.strengthWeak');

        strengthLabel.textContent = labelText;
        entropyLabel.textContent = `${str.entropy} Bits`;
      };

      slider.addEventListener('input', refreshGen);
      [chkUpper, chkLower, chkNum, chkSym, chkAmb].forEach((c) => c.addEventListener('change', refreshGen));

      const actions = el('div', { class: 'actionRow', style: { marginTop: '12px' } }, [
        el('button', {
          class: 'button primary',
          type: 'button',
          onclick: () => {
            copyToClipboard(currentPassword, 30);
            toast(t('toast.passwordCopied'), 'info');
          },
        }, [el('span', { html: icon('copy') }), ` ${t('passwords.copyGenerated')}`]),
        el('button', {
          class: 'button',
          type: 'button',
          onclick: refreshGen,
        }, [el('span', { html: icon('reload') }), ` ${t('passwords.generate')}`]),
        el('button', {
          class: 'button',
          type: 'button',
          onclick: async () => {
            const filled = await api().passwords.autofillActiveTab({ password: currentPassword });
            if (filled?.ok) toast(t('toast.autofillSuccess'), 'success');
            else toast(t('passwords.fillGenerated'), 'info');
          },
        }, [el('span', { html: icon('sparkles') }), ` ${t('passwords.fillGenerated')}`]),
      ]);

      const optionsBox = el('div', { class: 'card', style: { padding: '16px', marginTop: '14px' } }, [
        el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' } }, [
          el('span', { style: { fontSize: '13px', color: 'var(--textDim)' }, text: t('passwords.length') }),
          lengthVal,
        ]),
        slider,
        el('div', { class: 'passwordsOptionsGrid' }, [
          el('label', { class: 'passwordsCheckLabel' }, [chkUpper, t('passwords.uppercase')]),
          el('label', { class: 'passwordsCheckLabel' }, [chkLower, t('passwords.lowercase')]),
          el('label', { class: 'passwordsCheckLabel' }, [chkNum, t('passwords.numbers')]),
          el('label', { class: 'passwordsCheckLabel' }, [chkSym, t('passwords.symbols')]),
          el('label', { class: 'passwordsCheckLabel', style: { gridColumn: '1 / -1' } }, [chkAmb, t('passwords.avoidAmbiguous')]),
        ]),
      ]);

      container.append(display, strengthWrap, actions, optionsBox);
      refreshGen();
      return container;
    },
  };
}

function passwordsSettingsPage() {
  return {
    id: 'passwords-settings',
    icon: 'gear',
    labelKey: 'passwords.settings',
    render: () => {
      const container = el('div');

      const renderSettings = async () => {
        clear(container);
        renderVaultLockHeader(container, () => renderUnlockOrSetup(container, renderSettings));
        container.append(head(t('passwords.settings'), t('passwords.desc')));

        const status = await api().passwords.getStatus();
        const conf = status.settings || {};

        const list = el('div', { class: 'card' });

        // Auto-lock option
        const selectLock = el('select', { class: 'siteInfoPermSelect' }, [
          el('option', { value: '5', text: '5 min' }),
          el('option', { value: '15', text: '15 min' }),
          el('option', { value: '30', text: '30 min' }),
          el('option', { value: '60', text: '1 h' }),
          el('option', { value: '0', text: 'Nie' }),
        ]);
        selectLock.value = String(conf.autoLockMinutes ?? 15);
        selectLock.addEventListener('change', async () => {
          await api().passwords.updateSettings({ autoLockMinutes: Number(selectLock.value) });
          toast(t('toast.passwordUpdated'), 'success');
        });

        const autoLockRow = el('div', { class: 'optionRow' }, [
          el('div', { class: 'optionText' }, [
            el('div', { class: 'optionTitle', text: t('passwords.autoLock') }),
            el('div', { class: 'optionHint', text: t('passwords.autoLockDesc') }),
          ]),
          el('div', { class: 'optionControl' }, [selectLock]),
        ]);

        // Change master password
        const changePassBtn = el('button', {
          class: 'button small',
          type: 'button',
          onclick: () => {
            renderChangePasswordView(container, () => renderSettings());
          },
        }, [t('passwords.changeMaster')]);

        const changePassRow = el('div', { class: 'optionRow' }, [
          el('div', { class: 'optionText' }, [
            el('div', { class: 'optionTitle', text: t('passwords.changeMaster') }),
            el('div', { class: 'optionHint', text: t('passwords.setupDesc') }),
          ]),
          el('div', { class: 'optionControl' }, [changePassBtn]),
        ]);

        // Export Vault
        const exportBtn = el('button', {
          class: 'button small',
          type: 'button',
          onclick: async () => {
            await api().passwords.exportVault();
          },
        }, [el('span', { html: icon('download') }), ` ${t('passwords.export')}`]);

        const exportRow = el('div', { class: 'optionRow' }, [
          el('div', { class: 'optionText' }, [
            el('div', { class: 'optionTitle', text: t('passwords.export') }),
            el('div', { class: 'optionHint', text: 'JSON Backup' }),
          ]),
          el('div', { class: 'optionControl' }, [exportBtn]),
        ]);

        // Import Vault
        const importBtn = el('button', {
          class: 'button small',
          type: 'button',
          onclick: async () => {
            const res = await api().passwords.importVault();
            if (res?.ok) renderSettings();
          },
        }, [el('span', { html: icon('upload') }), ` ${t('passwords.import')}`]);

        const importRow = el('div', { class: 'optionRow' }, [
          el('div', { class: 'optionText' }, [
            el('div', { class: 'optionTitle', text: t('passwords.import') }),
            el('div', { class: 'optionHint', text: 'JSON Backup' }),
          ]),
          el('div', { class: 'optionControl' }, [importBtn]),
        ]);

        list.append(autoLockRow, changePassRow, exportRow, importRow);
        container.append(list);
      };

      renderUnlockOrSetup(container, renderSettings);
      return container;
    },
  };
}

function renderChangePasswordView(container, onDone) {
  clear(container);
  container.append(head(t('passwords.changeMaster'), t('passwords.setupDesc')));

  const currInput = el('input', { class: 'textInput', type: 'password', required: true, placeholder: t('passwords.currentMaster') });
  const newInput = el('input', { class: 'textInput', type: 'password', required: true, minlength: '8', placeholder: t('passwords.newMaster') });
  const confirmInput = el('input', { class: 'textInput', type: 'password', required: true, minlength: '8', placeholder: t('passwords.confirmMaster') });
  const errorMsg = el('div', { style: { color: 'var(--danger, #ef4444)', fontSize: '12px', minHeight: '16px' } });

  const form = el('form', { class: 'passwordsForm', style: { maxWidth: '480px', margin: '0 auto' } }, [
    el('div', { class: 'passwordsField' }, [
      el('label', { text: t('passwords.currentMaster') }),
      currInput,
    ]),
    el('div', { class: 'passwordsField' }, [
      el('label', { text: t('passwords.newMaster') }),
      newInput,
    ]),
    el('div', { class: 'passwordsField' }, [
      el('label', { text: t('passwords.confirmMaster') }),
      confirmInput,
    ]),
    errorMsg,
    el('div', { class: 'actionRow', style: { marginTop: '12px', justifyContent: 'flex-end' } }, [
      el('button', { class: 'button', type: 'button', onclick: onDone }, [t('action.cancel')]),
      el('button', { class: 'button primary', type: 'submit' }, [t('passwords.save')]),
    ]),
  ]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.textContent = '';
    if (newInput.value.length < 8) {
      errorMsg.textContent = t('passwords.minChars');
      return;
    }
    if (newInput.value !== confirmInput.value) {
      errorMsg.textContent = t('passwords.noMatch');
      return;
    }
    try {
      const res = await api().passwords.changeMasterPassword(currInput.value, newInput.value);
      if (res?.ok) {
        toast(t('toast.passwordUpdated'), 'success');
        onDone();
      } else {
        errorMsg.textContent = res?.error || 'Update failed';
      }
    } catch (err) {
      errorMsg.textContent = err.message;
    }
  });

  container.append(form);
}


/* ------------------------------------------------------------- account & sync */

export function openAccount(initialTab = 'account-status') {
  const activeId = initialTab.startsWith('account-') ? initialTab : `account-${initialTab}`;
  openModal({
    title: t('account.title'),
    iconName: 'user',
    activeId,
    nav: [
      accountStatusPage(),
      accountDevicesPage(),
      accountSyncSettingsPage(),
      accountProvidersPage(),
    ],
  });
}

function accountDevicesPage() {
  return {
    id: 'account-devices',
    icon: 'desktop',
    labelKey: 'account.tabDevices',
    render: () => {
      const container = el('div');
      container.append(head(t('account.tabDevices'), t('account.devicesDesc')));

      const list = el('div', { class: 'card', style: { padding: '16px' } });

      const refresh = async () => {
        clear(list);
        const devices = (await api().account.getDevices?.()) || [];

        for (const device of devices) {
          const isCurrent = device.current;
          const card = el('div', { class: `accountDeviceCard ${isCurrent ? 'accountDeviceCurrent' : ''}` }, [
            el('div', { class: 'accountDeviceMeta' }, [
              el('div', { class: 'accountDeviceName' }, [
                el('span', { html: icon(device.platform === 'win32' ? 'desktop' : 'laptop') }),
                device.name,
                isCurrent ? el('span', { class: 'accountBadge active', text: t('account.thisDevice') }) : null,
              ].filter(Boolean)),
              el('div', { class: 'accountDeviceSub', text: `${t('account.lastActive')}: ${new Date(device.lastActive).toLocaleString()}` }),
            ]),
            el('span', { class: `badge ${isCurrent ? 'badgeSuccess' : ''}`, text: isCurrent ? t('account.activeDevice') : 'Online' }),
          ]);
          list.append(card);
        }

        const pairingBox = el('div', { class: 'accountPairingCard' });
        const pairBtn = el('button', {
          class: 'button primary',
          type: 'button',
          onclick: async () => {
            const res = await api().account.pairDevice?.();
            if (res?.ok) {
              clear(pairingBox);
              pairingBox.append(
                el('h3', { style: { margin: '0 0 6px', fontSize: '15px' }, text: t('account.pairCode') }),
                el('p', { class: 'optionHint', text: t('account.pairCodeDesc') }),
                el('div', { class: 'accountPairingCode', text: res.code }),
                el('button', {
                  class: 'button small',
                  type: 'button',
                  onclick: () => {
                    navigator.clipboard.writeText(res.code);
                    toast(t('account.copied'), 'success');
                  },
                }, [el('span', { html: icon('copy') }), ` ${t('account.copyCode')}`]),
              );
            }
          },
        }, [el('span', { html: icon('plus') }), ` ${t('account.pairNewDevice')}`]);

        pairingBox.append(pairBtn);
        list.append(pairingBox);
      };

      refresh();
      container.append(list);
      return container;
    },
  };
}

function accountStatusPage() {
  return {
    id: 'account-status',
    icon: 'user',
    labelKey: 'account.tabStatus',
    render: () => {
      const container = el('div');
      const paint = async () => {
        clear(container);
        const status = await api().account.getStatus();
        if (status.isLoggedIn) {
          renderAccountConnected(container, status, paint);
        } else {
          renderAccountAuth(container, status, paint);
        }
      };
      paint();
      return container;
    },
  };
}

function renderAccountConnected(container, status, refresh) {
  const user = status.user || {};
  const email = user.email || 'user';
  const displayName = get('account.displayName', '') || user.displayName || email.split('@')[0];
  const initial = (displayName || email)[0].toUpperCase();
  const currentAvatar = get('account.avatar', 'logo');

  const providerLabel = status.provider === 'supabase'
    ? t('account.providerSupabase')
    : t('account.providerHinterland');

  let avatarElement;
  if (currentAvatar === 'logo') {
    avatarElement = el('img', { class: 'accountAvatarLogo', src: 'hinterland://assets/icon.png', alt: 'Hinterland' });
  } else if (currentAvatar === 'initials') {
    avatarElement = el('div', { class: 'accountAvatar', text: initial });
  } else {
    const emojiMap = { robot: '🤖', shield: '🛡️', sparkle: '✨', flame: '🔥' };
    avatarElement = el('div', { class: 'accountAvatar', text: emojiMap[currentAvatar] || '👤' });
  }

  const profileCard = el('div', { class: 'accountProfileCard' }, [
    avatarElement,
    el('div', { class: 'accountProfileMeta' }, [
      el('div', { class: 'accountProfileEmail', text: `${displayName} (${email})` }),
      el('div', { class: 'accountProfileBadges' }, [
        el('span', { class: 'accountBadge active' }, [
          el('span', { class: 'accountPulseDot' }),
          t('account.connected'),
        ]),
        el('span', { class: 'accountBadge', text: providerLabel }),
        status.hasPassphrase
          ? el('span', { class: 'accountBadge', text: t('account.e2eeActive') })
          : null,
      ].filter(Boolean)),
    ]),
    el('button', {
      class: 'button small',
      type: 'button',
      onclick: async () => {
        await api().account.signOut();
        toast(t('toast.signedOut'), 'info');
        refresh();
      },
    }, [t('account.signOut')]),
  ]);

  // Avatar Picker
  const avatarSection = el('div', { style: { margin: '14px 0 10px' } }, [
    el('div', { class: 'formLabel', style: { fontSize: '12px', fontWeight: 600, color: 'var(--textDim)' }, text: t('account.avatarPicker') }),
  ]);
  const avatarGrid = el('div', { class: 'accountAvatarGrid' });
  const avatarChoices = [
    { id: 'logo', node: el('img', { src: 'hinterland://assets/icon.png', alt: 'Logo' }) },
    { id: 'initials', node: el('span', { text: initial }) },
    { id: 'robot', node: el('span', { text: '🤖' }) },
    { id: 'shield', node: el('span', { text: '🛡️' }) },
    { id: 'sparkle', node: el('span', { text: '✨' }) },
    { id: 'flame', node: el('span', { text: '🔥' }) },
  ];
  for (const choice of avatarChoices) {
    const isSel = currentAvatar === choice.id;
    const opt = el('div', { class: `accountAvatarOption ${isSel ? 'selected' : ''}` }, [choice.node]);
    opt.addEventListener('click', async () => {
      await api().settings.set('account.avatar', choice.id);
      refresh();
    });
    avatarGrid.append(opt);
  }
  avatarSection.append(avatarGrid);

  // Display Name Inline Editor
  const nameInput = el('input', {
    class: 'textInput',
    type: 'text',
    style: { maxWidth: '240px', padding: '6px 10px', fontSize: '13px' },
    placeholder: t('account.displayName'),
    value: get('account.displayName', '') || displayName,
  });
  const nameRow = el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' } }, [
    nameInput,
    el('button', {
      class: 'button small',
      type: 'button',
      onclick: async () => {
        await api().settings.set('account.displayName', nameInput.value.trim());
        toast(t('toast.settingsSaved'), 'success');
        refresh();
      },
    }, [t('account.saveProfile')]),
  ]);

  const lastSyncStr = status.lastSyncedAt
    ? new Date(status.lastSyncedAt).toLocaleString()
    : t('account.neverSynced');

  const bookmarksCount = (get('data.bookmarks', []) ?? []).length;

  // Stats Grid
  const statsGrid = el('div', { class: 'accountStatsGrid' }, [
    el('div', { class: 'accountStatBox' }, [
      el('div', { class: 'accountStatVal', text: String(bookmarksCount) }),
      el('div', { class: 'accountStatLabel', text: t('account.bookmarksSynced') }),
    ]),
    el('div', { class: 'accountStatBox' }, [
      el('div', { class: 'accountStatVal', text: '17' }),
      el('div', { class: 'accountStatLabel', text: t('account.settingsSynced') }),
    ]),
    el('div', { class: 'accountStatBox' }, [
      el('div', { class: 'accountStatVal', text: status.hasPassphrase ? 'AES-256' : 'Standard' }),
      el('div', { class: 'accountStatLabel', text: status.hasPassphrase ? t('account.e2eeActive') : 'Zero-Knowledge' }),
    ]),
  ]);

  const syncBox = el('div', { class: 'accountSyncBox' }, [
    el('div', { class: 'accountSyncItem' }, [
      el('div', { class: 'accountSyncItemTitle' }, [
        el('span', { html: icon('clock') }),
        el('span', { text: `${t('account.lastSynced')}: ${lastSyncStr}` }),
      ]),
      el('span', { class: 'accountBadge', text: t(`account.status${status.status.charAt(0).toUpperCase() + status.status.slice(1)}`) }),
    ]),
  ]);

  const syncBtn = el('button', {
    class: 'button primary',
    type: 'button',
    onclick: async () => {
      syncBtn.disabled = true;
      syncBtn.classList.add('loading');
      try {
        const res = await api().account.syncNow();
        if (res?.ok) {
          toast(t('toast.syncSuccess'), 'success');
        } else {
          toast(t('toast.syncFailed'), 'error');
        }
      } finally {
        syncBtn.disabled = false;
        syncBtn.classList.remove('loading');
        refresh();
      }
    },
  }, [el('span', { html: icon('cloud') }), ` ${t('account.syncNow')}`]);

  const uploadBtn = el('button', {
    class: 'button',
    type: 'button',
    onclick: async () => {
      const res = await api().account.syncNow({ direction: 'push' });
      if (res?.ok) toast(t('toast.syncSuccess'), 'success');
      else toast(t('toast.syncFailed'), 'error');
      refresh();
    },
  }, [el('span', { html: icon('upload') }), ` ${t('account.uploadToCloud')}`]);

  const downloadBtn = el('button', {
    class: 'button',
    type: 'button',
    onclick: async () => {
      const res = await api().account.syncNow({ direction: 'pull' });
      if (res?.ok) toast(t('toast.syncSuccess'), 'success');
      else toast(t('toast.syncFailed'), 'error');
      refresh();
    },
  }, [el('span', { html: icon('download') }), ` ${t('account.downloadFromCloud')}`]);

  const actions = el('div', { class: 'actionRow', style: { gap: '10px', marginTop: '14px', flexWrap: 'wrap' } }, [
    syncBtn,
    uploadBtn,
    downloadBtn,
  ]);

  container.append(profileCard, avatarSection, nameRow, statsGrid, syncBox, actions);
}

function renderAccountAuth(container, status, refresh) {
  let isSignUp = false;

  const hero = el('div', { class: 'accountHero' }, [
    el('div', { class: 'accountHeroIcon', html: icon('cloud') }),
    el('h2', { text: t('account.heroTitle') }),
    el('p', { class: 'pageDesc', style: { marginBottom: '16px' }, text: t('account.heroSubtitle') }),
  ]);

  const modeSwitch = el('div', { class: 'accountModeSwitch' });
  const signInTab = el('button', { class: 'accountModeBtn active', type: 'button', text: t('account.signIn') });
  const signUpTab = el('button', { class: 'accountModeBtn', type: 'button', text: t('account.signUp') });

  modeSwitch.append(signInTab, signUpTab);

  const emailInput = el('input', { class: 'textInput', type: 'email', required: true, placeholder: 'name@example.com' });
  const passInput = el('input', { class: 'textInput', type: 'password', required: true, minlength: '6', placeholder: '••••••••' });
  const passWrap = el('div', { class: 'passwordsInputWrap' }, [passInput]);

  const e2eeInput = el('input', { class: 'textInput', type: 'password', placeholder: t('account.syncPassphraseHint') });
  const e2eeWrap = el('div', { class: 'passwordsField', style: { marginTop: '4px' } }, [
    el('label', { text: t('account.syncPassphrase') }),
    e2eeInput,
  ]);

  const errorMsg = el('div', { class: 'form-error', style: { color: 'var(--danger, #ef4444)', fontSize: '12px', minHeight: '16px' } });

  const submitBtn = el('button', { class: 'button primary', type: 'submit', text: t('account.signIn') });

  const form = el('form', { class: 'passwordsForm' }, [
    el('div', { class: 'passwordsField' }, [
      el('label', { text: t('account.email') }),
      emailInput,
    ]),
    el('div', { class: 'passwordsField' }, [
      el('label', { text: t('account.password') }),
      passWrap,
    ]),
    e2eeWrap,
    errorMsg,
    submitBtn,
  ]);

  signInTab.addEventListener('click', () => {
    isSignUp = false;
    signInTab.classList.add('active');
    signUpTab.classList.remove('active');
    submitBtn.textContent = t('account.signIn');
    errorMsg.textContent = '';
  });

  signUpTab.addEventListener('click', () => {
    isSignUp = true;
    signUpTab.classList.add('active');
    signInTab.classList.remove('active');
    submitBtn.textContent = t('account.signUp');
    errorMsg.textContent = '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.textContent = '';
    submitBtn.disabled = true;

    try {
      const email = emailInput.value.trim();
      const password = passInput.value;
      const syncPassphrase = e2eeInput.value || undefined;

      if (isSignUp) {
        const res = await api().account.signUp({ email, password, syncPassphrase });
        if (res?.ok) {
          toast(t('toast.signedUp'), 'success');
          refresh();
        } else {
          errorMsg.textContent = res?.error || 'Registration failed';
        }
      } else {
        const res = await api().account.signIn({ email, password, syncPassphrase });
        if (res?.ok) {
          toast(t('toast.signedIn'), 'success');
          refresh();
        } else {
          errorMsg.textContent = res?.error || 'Authentication failed';
        }
      }
    } catch (err) {
      errorMsg.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });

  container.append(hero, modeSwitch, form);
}

function accountSyncSettingsPage() {
  return {
    id: 'account-sync',
    icon: 'sliders',
    labelKey: 'account.tabSettings',
    render: () => {
      const container = el('div');
      container.append(head(t('account.tabSettings'), t('account.autoSyncDesc')));

      const list = el('div', { class: 'card' });

      (async () => {
        const status = await api().account.getStatus();

        // Auto Sync Toggle
        const autoSyncSwitch = el('button', {
          class: 'switch',
          type: 'button',
          role: 'switch',
          'aria-checked': String(Boolean(status.autoSync)),
        });
        autoSyncSwitch.addEventListener('click', async () => {
          const next = autoSyncSwitch.getAttribute('aria-checked') !== 'true';
          autoSyncSwitch.setAttribute('aria-checked', String(next));
          await api().account.updateConfig({ autoSync: next });
        });
        list.append(
          el('div', { class: 'option' }, [
            el('div', { class: 'optionText' }, [
              el('div', { class: 'optionLabel', text: t('account.autoSync') }),
              el('div', { class: 'optionHint', text: t('account.autoSyncDesc') }),
            ]),
            el('div', { class: 'optionControl' }, [autoSyncSwitch]),
          ]),
        );

        // Sync Bookmarks Toggle
        const bookmarksSwitch = el('button', {
          class: 'switch',
          type: 'button',
          role: 'switch',
          'aria-checked': String(Boolean(status.syncBookmarks)),
        });
        bookmarksSwitch.addEventListener('click', async () => {
          const next = bookmarksSwitch.getAttribute('aria-checked') !== 'true';
          bookmarksSwitch.setAttribute('aria-checked', String(next));
          await api().account.updateConfig({ syncBookmarks: next });
        });
        list.append(
          el('div', { class: 'option' }, [
            el('div', { class: 'optionText' }, [
              el('div', { class: 'optionLabel', text: t('account.syncBookmarks') }),
              el('div', { class: 'optionHint', text: t('account.syncBookmarksDesc') }),
            ]),
            el('div', { class: 'optionControl' }, [bookmarksSwitch]),
          ]),
        );

        // Sync Settings Toggle
        const settingsSwitch = el('button', {
          class: 'switch',
          type: 'button',
          role: 'switch',
          'aria-checked': String(Boolean(status.syncSettings)),
        });
        settingsSwitch.addEventListener('click', async () => {
          const next = settingsSwitch.getAttribute('aria-checked') !== 'true';
          settingsSwitch.setAttribute('aria-checked', String(next));
          await api().account.updateConfig({ syncSettings: next });
        });
        list.append(
          el('div', { class: 'option' }, [
            el('div', { class: 'optionText' }, [
              el('div', { class: 'optionLabel', text: t('account.syncSettings') }),
              el('div', { class: 'optionHint', text: t('account.syncSettingsDesc') }),
            ]),
            el('div', { class: 'optionControl' }, [settingsSwitch]),
          ]),
        );
      })();

      container.append(list);
      return container;
    },
  };
}

function accountProvidersPage() {
  return {
    id: 'account-providers',
    icon: 'globe',
    labelKey: 'account.tabProviders',
    render: () => {
      const container = el('div');
      container.append(head(t('account.tabProviders'), t('account.providerInfo')));

      const card = el('div', { class: 'card', style: { padding: '16px' } });

      (async () => {
        const status = await api().account.getStatus();

        const providerSelect = el('select', { class: 'select' }, [
          el('option', { value: 'hinterland', text: t('account.providerHinterland') }),
          el('option', { value: 'supabase', text: t('account.providerSupabase') }),
        ]);
        providerSelect.value = status.provider || 'hinterland';

        const supabaseUrlInput = el('input', {
          class: 'textInput wide',
          type: 'url',
          placeholder: 'https://your-project.supabase.co',
          value: status.supabaseUrl || '',
        });

        const supabaseKeyInput = el('input', {
          class: 'textInput wide',
          type: 'text',
          placeholder: 'eyJhbGciOi...',
          value: get('account.supabaseAnonKey', '') || '',
        });

        const supabaseSection = el('div', {
          style: {
            display: providerSelect.value === 'supabase' ? 'flex' : 'none',
            flexDirection: 'column',
            gap: '12px',
            marginTop: '12px',
          },
        }, [
          el('div', { class: 'passwordsField' }, [
            el('label', { text: t('account.supabaseUrl') }),
            supabaseUrlInput,
            el('div', { class: 'optionHint', text: t('account.supabaseUrlDesc') }),
          ]),
          el('div', { class: 'passwordsField' }, [
            el('label', { text: t('account.supabaseAnonKey') }),
            supabaseKeyInput,
            el('div', { class: 'optionHint', text: t('account.supabaseAnonKeyDesc') }),
          ]),
        ]);

        providerSelect.addEventListener('change', () => {
          supabaseSection.style.display = providerSelect.value === 'supabase' ? 'flex' : 'none';
        });

        const saveBtn = el('button', {
          class: 'button primary',
          type: 'button',
          style: { marginTop: '16px' },
          onclick: async () => {
            await api().account.updateConfig({
              provider: providerSelect.value,
              supabaseUrl: supabaseUrlInput.value.trim(),
              supabaseAnonKey: supabaseKeyInput.value.trim(),
            });
            toast(t('toast.settingsSaved'), 'success');
          },
        }, [t('account.saveProviderSettings')]);

        card.append(
          el('div', { class: 'passwordsField' }, [
            el('label', { text: t('account.tabProviders') }),
            providerSelect,
          ]),
          supabaseSection,
          saveBtn,
        );
      })();

      container.append(card);
      return container;
    },
  };
}

export { openQrCode } from './qrcode.js';
