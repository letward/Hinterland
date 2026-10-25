import { openPopup, closePopup, row, separator, section, empty } from './popup.js';
import { t } from './i18n.js';
import { hostOf, el } from './util.js';
import { icon } from './icons.js';
import { currentTab, currentSettings } from './state.js';
import { allTabs } from './tabs.js';
import { toast } from './toast.js';

const api = () => window.hinterland;

function zoomRow() {
  const cur = currentTab();
  const factor = cur?.zoom || 1;
  const pct = `${Math.round(factor * 100)}%`;

  const container = el('div', { class: 'menuZoomRow' });
  const label = el('div', { class: 'menuZoomLabel' }, [
    el('span', { class: 'rowIcon', html: icon('zoomIn') }),
    el('span', { text: t('menu.zoom') }),
  ]);

  const outBtn = el('button', {
    class: 'menuZoomBtn',
    type: 'button',
    html: icon('minus'),
    title: t('shortcuts.action.zoomOut'),
    onclick: () => {
      if (cur) api().tab.zoom(cur.id, factor / 1.1);
      closePopup();
    },
  });

  const pctLabel = el('span', { class: 'menuZoomPct', text: pct });

  const inBtn = el('button', {
    class: 'menuZoomBtn',
    type: 'button',
    html: icon('plus'),
    title: t('shortcuts.action.zoomIn'),
    onclick: () => {
      if (cur) api().tab.zoom(cur.id, factor * 1.1);
      closePopup();
    },
  });

  const fullBtn = el('button', {
    class: 'menuZoomBtn',
    type: 'button',
    html: icon('layout'),
    title: t('shortcuts.action.fullscreen'),
    onclick: () => {
      api().window.fullscreen();
      closePopup();
    },
  });

  const controls = el('div', { class: 'menuZoomControls' }, [outBtn, pctLabel, inBtn, fullBtn]);
  container.append(label, controls);
  return container;
}

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
          iconName: 'archive',
          title: t('menu.showBookmarksBar'),
          subtitle: 'Ctrl+Shift+B',
          onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:togglebookmarksbar')),
        }),
        row({
          iconName: 'bookmark',
          title: t('menu.readingList'),
          subtitle: 'Ctrl+Shift+L',
          onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'readingList' } })),
        }),
        row({
          iconName: 'notes',
          title: t('menu.notes'),
          subtitle: 'Ctrl+Shift+Y',
          onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'notes' } })),
        }),
        row({
          iconName: 'trash',
          title: t('menu.clearBrowsingData'),
          subtitle: 'Ctrl+Shift+Del',
          onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'clearData' } })),
        }),
        row({
          iconName: 'volume',
          title: t('menu.mediaControls'),
          subtitle: 'Ctrl+Alt+M',
          onSelect: () => openMediaControls(),
        }),
        row({
          iconName: 'store',
          title: t('menu.store'),
          subtitle: t('menu.storeDesc'),
          onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'store' } })),
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
        zoomRow(),
        row({
          iconName: 'camera',
          title: t('menu.capturePage'),
          subtitle: 'Ctrl+Shift+S',
          onSelect: () => {
            const cur = currentTab();
            if (cur) api().tab.capture(cur.id, { saveAs: false });
          },
        }),
        row({
          iconName: 'cpu',
          title: t('menu.taskManager'),
          subtitle: 'Shift+Esc',
          onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'taskManager' } })),
        }),
        row({
          iconName: 'keyboard',
          title: t('menu.shortcuts'),
          onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'shortcuts' } })),
        }),
        row({
          iconName: 'search',
          title: t('menu.commandPalette'),
          subtitle: 'Ctrl+Shift+P',
          onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:commandpalette')),
        }),
        row({
          iconName: 'refresh',
          title: t('menu.checkForUpdates'),
          onSelect: async () => {
            const result = await api().app.checkForUpdates();
            if (result?.ok) toast(t('toast.checkingUpdates'), 'info');
            else toast(t('toast.updateCheckFailed'), 'warning');
          },
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
          iconName: 'reader',
          title: tab.readerActive ? t('menu.exitReader') : t('menu.enterReader'),
          onSelect: () => api().tab.readerMode(tab.id),
        }),
        row({
          iconName: 'reload',
          title: t('menu.reloadTab'),
          onSelect: () => api().tab.reload(tab.id),
        }),
        row({
          iconName: 'copy',
          title: t('menu.copyLink'),
          onSelect: () => api().tab.copyUrl(tab.id),
        }),
        row({
          iconName: 'copy',
          title: t('menu.copyMarkdown'),
          onSelect: () => api().tab.copyMarkdown(tab.id),
        }),
        row({
          iconName: 'print',
          title: t('menu.saveAsPdf'),
          onSelect: () => api().tab.savePdf(tab.id),
        }),
        row({
          iconName: 'camera',
          title: t('menu.capturePage'),
          onSelect: () => api().tab.capture(tab.id, { saveAs: false }),
        }),
        row({
          iconName: 'pip',
          title: t('menu.pictureInPicture'),
          subtitle: 'Ctrl+Shift+X',
          onSelect: async () => {
            const res = await api().tab.togglePiP(tab.id);
            if (res?.success) toast(res.active ? t('toast.pipEntered') : t('toast.pipExited'), 'info');
            else toast(t('toast.noVideoFound'), 'warning');
          },
        }),
        row({
          iconName: 'bookmark',
          title: t('menu.addToReadingList'),
          onSelect: () => api().readingList.add({ url: tab.url, title: tab.title, favicon: tab.favicon }),
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
        separator(),
        section('menu.group'),
        row({
          iconName: 'layers',
          title: t('menu.groupNew'),
          onSelect: async () => {
            const name = prompt(t('menu.groupNamePrompt'), '');
            if (!name) return;
            const result = await api().tabs.groupCreate({ name, color: '#4f7cff' });
            if (result) toast(t('menu.groupCreated'), 'success');
          },
        }),
        row({
          iconName: 'tag',
          title: t('menu.groupSet'),
          subtitle: tab.groupId ? t('menu.groupSetCurrent') : t('menu.groupSetNone'),
          onSelect: async () => {
            const groups = await api().tabs.groups();
            const names = groups.map((g) => `${g.name} (${g.id})`).join('\n');
            const choice = prompt(`${t('menu.groupSetPrompt')}\n\n${names}`, '');
            if (!choice) return;
            await api().tabs.setGroup(tab.id, choice);
          },
        }),
        row({
          iconName: 'close',
          title: t('menu.groupRemove'),
          onSelect: async () => {
            await api().tabs.setGroup(tab.id, null);
          },
        }),
        row({
          iconName: 'moon',
          title: tab.sleeping ? t('menu.wakeTab') : t('menu.sleepTab'),
          onSelect: () => (tab.sleeping ? api().tab.wake(tab.id) : api().tab.sleep(tab.id)),
        }),
        row({
          iconName: 'moon',
          title: t('menu.sleepOtherTabs'),
          onSelect: () => api().tabs.sleepOthers(tab.id),
        }),
        row({
          iconName: tab.muted ? 'volumeOff' : 'volume',
          title: tab.muted ? t('menu.unmute') : t('menu.mute'),
          onSelect: () => api().tab.mute(tab.id, !tab.muted),
        }),
        row({
          iconName: 'volumeOff',
          title: t('menu.muteOthers'),
          onSelect: () => api().tabs.muteOthers(tab.id),
        }),
        row({
          iconName: 'reload',
          title: t('menu.reloadAll'),
          onSelect: () => api().tabs.reloadAll(),
        }),
        row({
          iconName: 'minus',
          title: t('menu.closeOthers'),
          onSelect: () => api().tabs.closeOthers(tab.id),
        }),
        row({
          iconName: 'minus',
          title: t('menu.closeDuplicates'),
          onSelect: () => api().tabs.closeDuplicates(),
        }),
        row({
          iconName: 'bookmark',
          title: t('menu.bookmarkAllTabs'),
          onSelect: async () => {
            const tabsList = allTabs().filter((item) => item.url && item.url.startsWith('http'));
            if (!tabsList.length) {
              toast(t('toast.noTabsToBookmark'), 'warning');
              return;
            }
            const dateStr = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            const folder = `${t('bookmarks.savedSession')} - ${dateStr}`;
            const existing = [...((await api().settings.get('data.bookmarks')) || [])];
            for (const tab of tabsList) {
              existing.push({
                url: tab.url,
                title: tab.title || tab.url,
                addedAt: Date.now(),
                folder,
              });
            }
            await api().settings.set('data.bookmarks', existing);
            toast(t('toast.allTabsBookmarked'), 'success');
          },
        }),
        row({
          iconName: 'minus',
          title: t('menu.closeLeft'),
          onSelect: () => api().tabs.closeLeft(tab.id),
        }),
        row({
          iconName: 'minus',
          title: t('menu.closeRight'),
          onSelect: () => api().tabs.closeRight(tab.id),
        }),
        row({
          iconName: 'clock',
          title: t('menu.reopenClosed'),
          onSelect: () => api().tabs.reopen(),
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
          iconName: 'external',
          title: t('menu.pasteAndGo'),
          onSelect: async () => {
            const text = await api().app.getClipboardText();
            if (text && text.trim()) {
              api().tab.navigate(tab?.id, text.trim());
            }
          },
        }),
        row({
          iconName: 'copy',
          title: t('menu.copyLink'),
          onSelect: () => api().tab.copyUrl(tab?.id),
        }),
        row({
          iconName: 'copy',
          title: t('menu.copyMarkdown'),
          onSelect: () => api().tab.copyMarkdown(tab?.id),
        }),
        row({
          iconName: 'bookmark',
          title: bookmarked ? t('menu.removeBookmark') : t('menu.addBookmark'),
          onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:bookmark')),
        }),
        row({
          iconName: 'bookmark',
          title: t('menu.addToReadingList'),
          onSelect: () => api().readingList.add({ url: tab?.url, title: tab?.title, favicon: tab?.favicon }),
        }),
        row({
          iconName: 'camera',
          title: t('menu.capturePage'),
          onSelect: () => api().tab.capture(tab?.id, { saveAs: false }),
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
          iconName: 'print',
          title: t('menu.saveAsPdf'),
          onSelect: () => api().tab.savePdf(tab?.id),
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
            iconName: 'store',
            title: t('menu.openStore'),
            onSelect: () => window.dispatchEvent(new CustomEvent('hinterland:openpanel', { detail: { panel: 'store' } })),
          }),
        );
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

export function openTabstripMenu() {
  openPopup({
    key: 'tabstripmenu',
    align: 'left',
    render: (card) => {
      card.append(
        row({
          iconName: 'plus',
          title: t('menu.newTab'),
          onSelect: () => api().tabs.create({ url: 'hinterland://newtab/' }),
        }),
        row({
          iconName: 'clock',
          title: t('menu.reopenClosed'),
          onSelect: () => api().tabs.reopen(),
        }),
        row({
          iconName: 'reload',
          title: t('menu.reloadAll'),
          onSelect: () => api().tabs.reloadAll(),
        }),
        row({
          iconName: 'minus',
          title: t('menu.closeDuplicates'),
          onSelect: () => api().tabs.closeDuplicates(),
        }),
        row({
          iconName: 'volumeOff',
          title: t('menu.muteAllTabs'),
          onSelect: () => api().tabs.muteAll(true),
        }),
        row({
          iconName: 'close',
          title: t('menu.closeAll'),
          onSelect: () => api().tabs.closeAll(),
        }),
      );
    },
  });
}

export function closeMenus() {
  closePopup();
}

export function openMediaControls() {
  const tabsList = allTabs().filter((t) => t.audible || t.muted);
  openPopup({
    key: 'media',
    align: 'right',
    render: (card) => {
      card.append(section('media.title'));
      if (!tabsList.length) {
        card.append(empty(t('media.noActiveMedia')));
        return;
      }
      for (const tab of tabsList) {
        const item = el('div', { class: 'mediaItem' });
        const info = el('div', { class: 'mediaInfo' }, [
          el('div', { class: 'mediaTitle', text: tab.title || tab.url }),
          el('div', { class: 'mediaHost', text: hostOf(tab.url) }),
        ]);

        const playBtn = el('button', {
          class: 'iconButton small',
          type: 'button',
          html: icon(tab.audible ? 'pause' : 'play'),
          title: t('media.playPause'),
          onclick: async (e) => {
            e.stopPropagation();
            await api().tab.toggleMediaPlay(tab.id);
            closePopup();
          },
        });

        const muteBtn = el('button', {
          class: 'iconButton small',
          type: 'button',
          html: icon(tab.muted ? 'volumeOff' : 'volume'),
          title: t(tab.muted ? 'menu.unmute' : 'menu.mute'),
          onclick: (e) => {
            e.stopPropagation();
            api().tab.mute(tab.id, !tab.muted);
            closePopup();
          },
        });

        const pipBtn = el('button', {
          class: 'iconButton small',
          type: 'button',
          html: icon('pip'),
          title: t('media.pip'),
          onclick: async (e) => {
            e.stopPropagation();
            const res = await api().tab.togglePiP(tab.id);
            closePopup();
            if (res?.success) toast(res.active ? t('toast.pipEntered') : t('toast.pipExited'), 'info');
            else toast(t('toast.noVideoFound'), 'warning');
          },
        });

        const openBtn = el('button', {
          class: 'iconButton small',
          type: 'button',
          html: icon('external'),
          title: t('action.open'),
          onclick: () => {
            api().tabs.activate(tab.id);
            closePopup();
          },
        });

        const controls = el('div', { class: 'mediaControls' }, [playBtn, muteBtn, pipBtn, openBtn]);
        item.append(
          el('div', { class: 'rowIcon', html: icon(tab.audible ? 'volume' : 'volumeOff') }),
          info,
          controls
        );
        card.append(item);
      }
    },
  });
}
