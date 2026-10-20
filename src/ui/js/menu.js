import { openPopup, closePopup, row, separator, section, empty } from './popup.js';
import { t } from './i18n.js';
import { hostOf } from './util.js';
import { currentTab, currentSettings } from './state.js';

const api = () => window.hinterland;

export function openMainMenu() {
  const tab = window.hinterlandTab;
  openPopup({
    key: 'main',
    align: 'right',
    render: (card) => {
      card.append(
        row({
          iconName: 'plus',
          title: t('menu.newTab'),
          onSelect: () => api().tabs.create({ url: 'hinterland://newtab/' }),
        }),
        row({
          iconName: 'shield',
          title: t('menu.privateTab'),
          subtitle: t('menu.privateTabDesc'),
          onSelect: () => api().tabs.create({ url: 'hinterland://newtab/', privateMode: true }),
        }),
        separator(),
        row({
          iconName: 'clock',
          title: t('menu.history'),
          onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'history' } })),
        }),
        row({
          iconName: 'bookmark',
          title: t('menu.bookmarks'),
          onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'bookmarks' } })),
        }),
        row({
          iconName: 'puzzle',
          title: t('menu.extensions'),
          onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'extensions' } })),
        }),
        row({
          iconName: 'download',
          title: t('menu.downloads'),
          onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'downloads' } })),
        }),
        separator(),
        row({
          iconName: 'keyboard',
          title: t('menu.shortcuts'),
          onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'shortcuts' } })),
        }),
        row({
          iconName: 'gear',
          title: t('menu.settings'),
          onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:opensettings', {})),
        }),
      );
    },
  });
}

export function openTabMenu(tab, x, y) {
  openPopup({
    key: 'tabmenu',
    align: 'right',
    render: (card) => {
      card.append(
        section('menu.page'),
        row({
          iconName: 'copy',
          title: t('menu.copyLink'),
          onSelect: () => api().tab.copyUrl(tab.id),
        }),
        row({
          iconName: tab.privateMode ? 'shield' : 'globe',
          title: t('menu.openExternal'),
          onSelect: () => api().tab.openExternal(tab.id),
        }),
        row({
          iconName: 'code',
          title: t('menu.viewSource'),
          onSelect: async () => {
            await api().tab.navigate(tab.id, `view-source:${tab.url}`);
          },
        }),
        separator(),
        section('menu.tab'),
        row({
          iconName: 'copy',
          title: t('menu.duplicate'),
          onSelect: () => api().tabs.duplicate(tab.id),
        }),
        row({
          iconName: 'pin',
          title: tab.pinned ? t('menu.unpin') : t('menu.pin'),
          onSelect: () => api().tabs.pin(tab.id, !tab.pinned),
        }),
        row({
          iconName: tab.muted ? 'volumeOff' : 'volume',
          title: tab.muted ? t('menu.unmute') : t('menu.mute'),
          onSelect: () => api().tab.mute(tab.id, !tab.muted),
        }),
        row({
          iconName: 'minus',
          title: t('menu.closeOthers'),
          onSelect: () => api().tabs.closeOthers(tab.id),
        }),
        row({
          iconName: 'close',
          title: t('menu.close'),
          onSelect: () => api().tabs.close(tab.id),
        }),
      );
    },
  });
}

export function openOmniMenu() {
  const tab = currentTab();
  openPopup({
    key: 'omnimenu',
    align: 'right',
    render: (card) => {
      const url = tab?.url ?? '';
      const bookmarked = isBookmarked(url);
      const secure = url.startsWith('https://');

      card.append(
        section('menu.page'),
        row({
          iconName: 'copy',
          title: t('menu.copyLink'),
          onSelect: () => api().tab.copyUrl(tab?.id),
        }),
        row({
          iconName: 'bookmark',
          title: bookmarked ? t('menu.removeBookmark') : t('menu.addBookmark'),
          onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:bookmark')),
        }),
        row({
          iconName: 'external',
          title: t('menu.openExternal'),
          onSelect: () => api().tab.openExternal(tab?.id),
        }),
        row({
          iconName: 'shield',
          title: t('menu.openPrivate'),
          onSelect: () => api().tabs.create({ url: url || 'hinterland://newtab/', privateMode: true }),
        }),
        separator(),
        section('menu.tools'),
        row({
          iconName: 'find',
          title: t('menu.find'),
          onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:find')),
        }),
        row({
          iconName: 'print',
          title: t('menu.print'),
          onSelect: () => api().tab.print(tab?.id),
        }),
        row({
          iconName: 'zoomIn',
          title: t('menu.zoomIn'),
          onSelect: () => zoom(1),
        }),
        row({
          iconName: 'zoomOut',
          title: t('menu.zoomOut'),
          onSelect: () => zoom(-1),
        }),
        row({
          iconName: 'refresh',
          title: t('menu.resetZoom'),
          onSelect: () => zoom(0, true),
        }),
      );

      if (!secure && url.startsWith('http://')) {
        card.append(
          separator(),
          row({
            iconName: 'warning',
            title: t('menu.insecure'),
            subtitle: hostOf(url),
            onSelect: () => api().tab.navigate(tab?.id, url.replace(/^http:/, 'https:')),
          }),
        );
      }
    },
  });
}

function zoom(delta, reset = false) {
  const tab = currentTab();
  if (!tab) return;
  const current = tab.zoom || 1;
  const steps = reset ? 0 : Math.round(Math.log(current) / Math.log(1.1) + delta);
  api().tab.zoom(tab.id, Math.pow(1.1, Math.max(-3, Math.min(5, steps))));
}

function isBookmarked(url) {
  const list = currentSettings()?.data?.bookmarks ?? [];
  return list.some((entry) => entry.url === url);
}

export function openExtensionsButton() {
  openPopup({
    key: 'extensions',
    align: 'right',
    render: (card) => {
      api().extensions.list().then((list) => {
        card.replaceChildren();
        card.append(section('menu.extensions'));
        if (!list.length) {
          card.append(empty(t('extensions.none')));
        }
        for (const entry of list.slice(0, 8)) {
          card.append(
            row({
              iconName: 'puzzle',
              title: entry.name,
              subtitle: entry.error ? t('extensions.broken') : `v${entry.version}`,
              aside: entry.enabled ? t('extensions.on') : t('extensions.off'),
              onSelect: () => api().extensions.toggle(entry.id, !entry.enabled),
            }),
          );
        }
        card.append(separator());
        card.append(
          row({
            iconName: 'gear',
            title: t('menu.manageExtensions'),
            onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'extensions' } })),
          }),
        );
      });
    },
  });
}

export function closeMenus() {
  closePopup();
}