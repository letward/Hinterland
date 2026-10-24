import { el, clear, prettyUrl } from './util.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { openPopup, closePopup, isOpen } from './popup.js';
import { activeTab, allTabs } from './tabs.js';

const api = () => window.hinterland;

export function openCommandPalette() {
  if (isOpen('palette')) {
    closePopup();
    return;
  }

  openPopup({
    key: 'palette',
    align: 'center',
    render: (card) => {
      const searchBox = el('div', { class: 'paletteSearch' }, [
        el('span', { html: icon('search') }),
      ]);

      const input = el('input', {
        class: 'paletteInput',
        type: 'text',
        placeholder: t('commandPalette.placeholder'),
        spellcheck: 'false',
        autocomplete: 'off',
      });
      searchBox.append(input);

      const listContainer = el('div', { class: 'paletteList' });

      card.append(searchBox, listContainer);

      let selectedIndex = 0;
      let visibleItems = [];

      const buildCommands = () => {
        const current = activeTab();
        return [
          {
            id: 'newTab',
            title: t('menu.newTab'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Ctrl+T',
            icon: 'plus',
            run: () => api().tabs.create({ url: 'hinterland://newtab/' }),
          },
          {
            id: 'privateTab',
            title: t('menu.privateTab'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Ctrl+Shift+N',
            icon: 'shield',
            run: () => api().tabs.create({ url: 'hinterland://newtab/', privateMode: true }),
          },
          {
            id: 'reopenTab',
            title: t('menu.reopenClosed'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Ctrl+Shift+T',
            icon: 'clock',
            run: () => api().tabs.reopen(),
          },
          {
            id: 'closeTab',
            title: t('menu.close'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Ctrl+W',
            icon: 'close',
            run: () => { if (current) api().tabs.close(current.id); },
          },
          {
            id: 'closeOthers',
            title: t('menu.closeOthers'),
            category: t('commandPalette.categoryCommand'),
            icon: 'minus',
            run: () => { if (current) api().tabs.closeOthers(current.id); },
          },
          {
            id: 'closeLeft',
            title: t('menu.closeLeft'),
            category: t('commandPalette.categoryCommand'),
            icon: 'minus',
            run: () => { if (current) api().tabs.closeLeft(current.id); },
          },
          {
            id: 'closeRight',
            title: t('menu.closeRight'),
            category: t('commandPalette.categoryCommand'),
            icon: 'minus',
            run: () => { if (current) api().tabs.closeRight(current.id); },
          },
          {
            id: 'closeAll',
            title: t('menu.closeAll'),
            category: t('commandPalette.categoryCommand'),
            icon: 'close',
            run: () => api().tabs.closeAll(),
          },
          {
            id: 'copyUrl',
            title: t('menu.copyLink'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Ctrl+C',
            icon: 'link',
            run: () => { if (current) api().tab.copyUrl(current.id); },
          },
          {
            id: 'duplicateTab',
            title: t('menu.duplicate'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Ctrl+Shift+D',
            icon: 'copy',
            run: () => { if (current) api().tabs.duplicate(current.id); },
          },
          {
            id: 'pinTab',
            title: current?.pinned ? t('menu.unpin') : t('menu.pin'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Alt+P',
            icon: 'pin',
            run: () => { if (current) api().tabs.pin(current.id, !current.pinned); },
          },
          {
            id: 'muteTab',
            title: current?.muted ? t('menu.unmute') : t('menu.mute'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Ctrl+M',
            icon: 'volume',
            run: () => { if (current) api().tab.mute(current.id, !current.muted); },
          },
          {
            id: 'muteOthers',
            title: t('menu.muteOthers'),
            category: t('commandPalette.categoryCommand'),
            icon: 'volumeOff',
            run: () => { if (current) api().tabs.muteOthers(current.id); },
          },
          {
            id: 'reload',
            title: t('action.reload'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Ctrl+R',
            icon: 'reload',
            run: () => { if (current) api().tab.reload(current.id); },
          },
          {
            id: 'reloadAll',
            title: t('menu.reloadAll'),
            category: t('commandPalette.categoryCommand'),
            icon: 'reload',
            run: () => api().tabs.reloadAll(),
          },
          {
            id: 'readerMode',
            title: t('menu.reader'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Ctrl+Alt+R',
            icon: 'reader',
            run: () => { if (current) api().tab.readerMode(current.id); },
          },
          {
            id: 'hardReload',
            title: t('shortcuts.action.hardReload'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Ctrl+Shift+R',
            icon: 'reload',
            run: () => { if (current) api().tab.reload(current.id, true); },
          },
          {
            id: 'find',
            title: t('menu.find'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Ctrl+F',
            icon: 'find',
            run: () => window.dispatchEvent(new CustomEvent('hinterland:find')),
          },
          {
            id: 'bookmark',
            title: t('menu.addBookmark'),
            category: t('commandPalette.categoryCommand'),
            icon: 'bookmark',
            run: () => window.dispatchEvent(new CustomEvent('hinterland:bookmark')),
          },
          {
            id: 'siteInfo',
            title: t('omni.viewSiteInfo'),
            category: t('commandPalette.categoryCommand'),
            icon: 'shield',
            run: () => window.dispatchEvent(new CustomEvent('hinterland:siteinfo')),
          },
          {
            id: 'copyLink',
            title: t('menu.copyLink'),
            category: t('commandPalette.categoryCommand'),
            icon: 'copy',
            run: () => { if (current) api().tab.copyUrl(current.id); },
          },
          {
            id: 'print',
            title: t('menu.print'),
            category: t('commandPalette.categoryCommand'),
            icon: 'print',
            run: () => { if (current) api().tab.print(current.id); },
          },
          {
            id: 'viewSource',
            title: t('menu.viewSource'),
            category: t('commandPalette.categoryCommand'),
            icon: 'code',
            run: () => { if (current) api().tab.navigate(current.id, `view-source:${current.url}`); },
          },
          {
            id: 'openExternal',
            title: t('menu.openExternal'),
            category: t('commandPalette.categoryCommand'),
            icon: 'globe',
            run: () => { if (current) api().tab.openExternal(current.id); },
          },
          {
            id: 'zoomIn',
            title: t('menu.zoomIn'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Ctrl+=',
            icon: 'zoomIn',
            run: () => { if (current) api().tab.zoom(current.id, (current.zoom || 1) * 1.1); },
          },
          {
            id: 'zoomOut',
            title: t('menu.zoomOut'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Ctrl+-',
            icon: 'zoomOut',
            run: () => { if (current) api().tab.zoom(current.id, (current.zoom || 1) / 1.1); },
          },
          {
            id: 'resetZoom',
            title: t('menu.resetZoom'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Ctrl+0',
            icon: 'zoomReset',
            run: () => { if (current) api().tab.zoom(current.id, 1); },
          },
          {
            id: 'history',
            title: t('menu.history'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Ctrl+H',
            icon: 'clock',
            run: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'history' } })),
          },
          {
            id: 'bookmarks',
            title: t('menu.bookmarks'),
            category: t('commandPalette.categoryCommand'),
            icon: 'bookmark',
            run: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'bookmarks' } })),
          },
          {
            id: 'toggleBookmarksBar',
            title: t('menu.showBookmarksBar'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Ctrl+Shift+B',
            icon: 'archive',
            run: () => window.dispatchEvent(new CustomEvent('hinterland:togglebookmarksbar')),
          },
          {
            id: 'downloads',
            title: t('menu.downloads'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Ctrl+J',
            icon: 'download',
            run: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'downloads' } })),
          },
          {
            id: 'extensions',
            title: t('menu.extensions'),
            category: t('commandPalette.categoryCommand'),
            icon: 'puzzle',
            run: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'extensions' } })),
          },
          {
            id: 'shortcuts',
            title: t('menu.shortcuts'),
            category: t('commandPalette.categoryCommand'),
            icon: 'keyboard',
            run: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'shortcuts' } })),
          },
          {
            id: 'settings',
            title: t('menu.settings'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'Ctrl+,',
            icon: 'gear',
            run: () => window.dispatchEvent(new CustomEvent('hinterland:opensettings', {})),
          },
          {
            id: 'about',
            title: t('menu.about'),
            category: t('commandPalette.categoryCommand'),
            icon: 'info',
            run: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'about' } })),
          },
          {
            id: 'fullscreen',
            title: t('shortcuts.action.fullscreen'),
            category: t('commandPalette.categoryCommand'),
            shortcut: 'F11',
            icon: 'monitor',
            run: () => api().window.fullscreen(),
          },
          {
            id: 'updates',
            title: t('menu.checkForUpdates'),
            category: t('commandPalette.categoryCommand'),
            icon: 'refresh',
            run: () => api().app.checkForUpdates(),
          },
        ];
      };

      const buildTabs = () => {
        const current = activeTab();
        const tabs = allTabs() ?? [];
        return tabs.map((tab) => ({
          id: `tab:${tab.id}`,
          title: tab.title || prettyUrl(tab.url) || t('confirm.untitled'),
          subtitle: tab.url,
          category: t('commandPalette.categoryTab'),
          aside: tab.id === current?.id ? t('commandPalette.activeTab') : '',
          icon: 'globe',
          favicon: tab.favicon,
          run: () => api().tabs.activate(tab.id),
        }));
      };

      const executeItem = (item) => {
        closePopup();
        try {
          item?.run?.();
        } catch (error) {
          console.warn('[Hinterland] Command failed.', error);
        }
      };

      let closedItems = [];
      api().tabs.recentlyClosed().then((closed) => {
        if (!Array.isArray(closed) || !closed.length) return;
        closedItems = closed.map((entry, index) => ({
          id: `closed:${index}`,
          title: entry.title || prettyUrl(entry.url) || t('confirm.untitled'),
          subtitle: entry.url,
          category: t('commandPalette.categoryRecentlyClosed'),
          icon: 'clock',
          favicon: entry.favicon,
          run: () => api().tabs.restoreClosed(index),
        }));
        renderList();
      }).catch(() => {});

      const renderList = () => {
        clear(listContainer);
        const query = input.value.trim().toLowerCase();

        const commands = buildCommands();
        const tabs = buildTabs();
        const all = [...tabs, ...closedItems, ...commands];

        if (!query) {
          visibleItems = all;
        } else {
          visibleItems = all.filter((item) => {
            const matchTitle = item.title?.toLowerCase().includes(query);
            const matchSubtitle = item.subtitle?.toLowerCase().includes(query);
            const matchCategory = item.category?.toLowerCase().includes(query);
            const matchShortcut = item.shortcut?.toLowerCase().includes(query);
            return matchTitle || matchSubtitle || matchCategory || matchShortcut;
          });
        }

        if (!visibleItems.length) {
          listContainer.append(el('div', { class: 'empty', style: { padding: '24px 12px' }, text: t('commandPalette.noResults') }));
          return;
        }

        if (selectedIndex >= visibleItems.length) selectedIndex = 0;
        if (selectedIndex < 0) selectedIndex = visibleItems.length - 1;

        visibleItems.forEach((item, index) => {
          const isSelected = index === selectedIndex;
          const button = el('button', {
            class: `row${isSelected ? ' rowSelected' : ''}`,
            type: 'button',
            'data-index': String(index),
          });

          let iconSlot;
          if (item.favicon) {
            const img = el('img', { src: item.favicon, alt: '', style: 'width:16px;height:16px;border-radius:2px;' });
            img.addEventListener('error', () => {
              img.replaceWith(el('span', { class: 'rowIcon', html: icon(item.icon || 'globe') }));
            });
            iconSlot = el('span', { class: 'rowIcon' }, [img]);
          } else {
            iconSlot = el('span', { class: 'rowIcon', html: icon(item.icon || 'globe') });
          }

          button.append(
            iconSlot,
            el('span', { class: 'rowBody' }, [
              el('span', { class: 'rowTitle', text: item.title }),
              item.subtitle ? el('span', { class: 'rowSub', text: item.subtitle }) : null,
            ]),
          );

          if (item.aside) {
            button.append(el('span', { class: 'rowAside', text: item.aside }));
          }

          if (item.shortcut) {
            button.append(el('span', { class: 'paletteBadge', text: item.shortcut }));
          } else if (item.category) {
            button.append(el('span', { class: 'paletteBadge', text: item.category }));
          }

          button.addEventListener('click', () => executeItem(item));
          button.addEventListener('mouseenter', () => {
            selectedIndex = index;
            for (const child of listContainer.querySelectorAll('.row')) {
              child.classList.toggle('rowSelected', child.dataset.index === String(index));
            }
          });

          listContainer.append(button);
        });

        const activeRow = listContainer.querySelector('.rowSelected');
        activeRow?.scrollIntoView({ block: 'nearest' });
      };

      input.addEventListener('input', () => {
        selectedIndex = 0;
        renderList();
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          if (visibleItems.length > 0) {
            selectedIndex = (selectedIndex + 1) % visibleItems.length;
            renderList();
          }
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          if (visibleItems.length > 0) {
            selectedIndex = (selectedIndex - 1 + visibleItems.length) % visibleItems.length;
            renderList();
          }
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          if (visibleItems[selectedIndex]) {
            executeItem(visibleItems[selectedIndex]);
          }
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          closePopup();
        }
      });

      renderList();

      setTimeout(() => {
        input.focus();
        input.select();
      }, 20);
    },
  });
}
