import { el, clear, prettyUrl } from './util.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { get } from './store.js';
import { openPopup, closePopup, row, separator, section } from './popup.js';
import { activeTab } from './tabs.js';
import { toast } from './toast.js';

const api = () => window.hinterland;

let barNode = null;

export function bindBookmarksBar(node) {
  barNode = node;
  barNode.addEventListener('contextmenu', (event) => {
    if (event.target.closest('.bookmarkBarItem')) return;
    event.preventDefault();
    openBarContextMenu(event.clientX, event.clientY);
  });
}

export function syncBookmarksBar() {
  if (!barNode) return;
  const enabled = Boolean(get('general.showBookmarksBar', false));
  barNode.hidden = !enabled;
  if (!enabled) return;

  renderBookmarks();
}

function renderBookmarks() {
  clear(barNode);
  const items = get('data.bookmarks', []) ?? [];

  if (!items.length) {
    const emptySpan = el('span', { class: 'bookmarkBarEmpty', text: t('bookmarksBar.empty') });
    barNode.append(emptySpan);
    return;
  }

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const button = el('button', {
      class: 'bookmarkBarItem',
      type: 'button',
      'data-url': item.url,
      title: `${item.title || item.url}\n${item.url}`,
    });

    button.append(
      el('span', { class: 'bookmarkBarFavicon', html: icon('bookmark') }),
      el('span', { class: 'bookmarkBarTitle', text: item.title || prettyUrl(item.url) }),
    );

    button.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey) {
        api().tabs.create({ url: item.url });
      } else {
        const cur = activeTab();
        if (cur) api().tab.navigate(cur.id, item.url);
        else api().tabs.create({ url: item.url });
      }
    });

    button.addEventListener('auxclick', (event) => {
      if (event.button === 1) {
        event.preventDefault();
        api().tabs.create({ url: item.url });
      }
    });

    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openItemContextMenu(item, index, event.clientX, event.clientY);
    });

    barNode.append(button);
  }
}

function openItemContextMenu(item, index, x, y) {
  openPopup({
    key: `bookmarkItem:${index}`,
    align: 'left',
    render: (card) => {
      card.append(
        section('menu.bookmarks'),
        row({
          iconName: 'external',
          title: t('action.open'),
          onSelect: () => {
            closePopup();
            const cur = activeTab();
            if (cur) api().tab.navigate(cur.id, item.url);
          },
        }),
        row({
          iconName: 'plus',
          title: t('menu.newTab'),
          onSelect: () => {
            closePopup();
            api().tabs.create({ url: item.url });
          },
        }),
        row({
          iconName: 'shield',
          title: t('menu.openPrivate'),
          onSelect: () => {
            closePopup();
            api().tabs.create({ url: item.url, privateMode: true });
          },
        }),
        row({
          iconName: 'copy',
          title: t('menu.copyLink'),
          onSelect: () => {
            closePopup();
            api().tab.copyText(item.url);
            toast(t('toast.linkCopied'), 'success');
          },
        }),
        separator(),
        row({
          iconName: 'trash',
          title: t('action.remove'),
          onSelect: async () => {
            closePopup();
            const current = [...(get('data.bookmarks', []) ?? [])];
            current.splice(index, 1);
            await api().settings.set('data.bookmarks', current);
            syncBookmarksBar();
            toast(t('bookmarks.removed'), 'success');
          },
        }),
      );
    },
  });
}

function openBarContextMenu(x, y) {
  openPopup({
    key: 'bookmarkBarMenu',
    align: 'left',
    render: (card) => {
      card.append(
        row({
          iconName: 'bookmark',
          title: t('menu.addBookmark'),
          onSelect: () => {
            closePopup();
            window.dispatchEvent(new CustomEvent('hinterland:bookmark'));
          },
        }),
        row({
          iconName: 'archive',
          title: t('menu.bookmarks'),
          onSelect: () => {
            closePopup();
            window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'bookmarks' } }));
          },
        }),
        row({
          iconName: 'cloud',
          title: t('account.syncNow'),
          onSelect: async () => {
            closePopup();
            const res = await api().account.syncNow();
            if (res?.ok) toast(t('toast.syncSuccess'), 'success');
            else toast(t('toast.syncFailed'), 'error');
          },
        }),
        separator(),
        row({
          iconName: 'close',
          title: t('menu.hideBookmarksBar'),
          onSelect: async () => {
            closePopup();
            await api().settings.set('general.showBookmarksBar', false);
            syncBookmarksBar();
          },
        }),
      );
    },
  });
}
