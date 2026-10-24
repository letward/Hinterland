import { Menu, clipboard, dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveLanguage, translate } from './i18n.js';
import { settings } from './settings.js';
import { tabs } from './tabs.js';
import { surface } from './windows.js';
import { downloadDirectory } from './sessions.js';

function t(key, values = {}) {
  const lang = resolveLanguage(settings.value('general.language'));
  return translate(lang, key, values);
}

export function showWebContextMenu(tab, params) {
  if (!tab || !tab.contents || tab.contents.isDestroyed()) return;

  const items = [];

  // 1. Link items
  if (params.linkURL) {
    items.push({
      label: t('context.openLinkInNewTab'),
      click: () => tabs.create({ url: params.linkURL, background: false }),
    });
    items.push({
      label: t('context.openLinkInNewPrivateTab'),
      click: () => tabs.create({ url: params.linkURL, privateMode: true }),
    });
    items.push({
      label: t('context.copyLinkAddress'),
      click: () => clipboard.writeText(params.linkURL),
    });
    items.push({
      label: t('context.copyLinkMarkdown'),
      click: () => {
        const text = (params.linkText || params.linkURL || '').trim();
        clipboard.writeText(`[${text}](${params.linkURL})`);
        surface.send('toast', { message: 'toast.copiedMarkdown', kind: 'info' });
      },
    });
  }

  // 2. Image / media items
  if (params.hasImageContents || params.mediaType === 'image' || (params.srcURL && !params.linkURL)) {
    if (items.length) items.push({ type: 'separator' });
    if (params.srcURL) {
      items.push({
        label: t('context.openImageInNewTab'),
        click: () => tabs.create({ url: params.srcURL }),
      });
      items.push({
        label: t('context.copyImageAddress'),
        click: () => clipboard.writeText(params.srcURL),
      });
      items.push({
        label: t('context.saveImageAs'),
        click: () => tab.contents.downloadURL(params.srcURL),
      });
    }
  }

  // 3. Selection items
  const query = (params.selectionText || '').trim();
  if (query) {
    if (items.length) items.push({ type: 'separator' });
    items.push({
      label: t('context.copy'),
      accelerator: 'CmdOrCtrl+C',
      role: 'copy',
    });
    const shortQuery = query.length > 25 ? `${query.slice(0, 25)}…` : query;
    items.push({
      label: t('context.searchWebFor', { query: shortQuery }),
      click: () => {
        const engines = settings.value('search.engines') || [];
        const defaultKey = settings.value('search.default') || 'duckduckgo';
        const engine = engines.find((e) => e.id === defaultKey) ?? engines[0];
        const searchUrl = engine?.url
          ? engine.url.replace('%s', encodeURIComponent(query))
          : `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
        tabs.create({ url: searchUrl });
      },
    });
    items.push({
      label: t('context.translateSelection', { query: shortQuery }),
      click: () => {
        const lang = resolveLanguage(settings.value('general.language')) || 'en';
        const searchUrl = `https://translate.google.com/?sl=auto&tl=${lang}&text=${encodeURIComponent(query)}&op=translate`;
        tabs.create({ url: searchUrl });
      },
    });
  }

  // 4. Editable fields
  if (params.isEditable) {
    if (items.length) items.push({ type: 'separator' });
    items.push({
      label: t('context.undo'),
      accelerator: 'CmdOrCtrl+Z',
      role: 'undo',
      enabled: Boolean(params.editFlags?.canUndo),
    });
    items.push({
      label: t('context.redo'),
      accelerator: 'CmdOrCtrl+Y',
      role: 'redo',
      enabled: Boolean(params.editFlags?.canRedo),
    });
    items.push({ type: 'separator' });
    items.push({
      label: t('context.cut'),
      accelerator: 'CmdOrCtrl+X',
      role: 'cut',
      enabled: Boolean(params.editFlags?.canCut),
    });
    items.push({
      label: t('context.copy'),
      accelerator: 'CmdOrCtrl+C',
      role: 'copy',
      enabled: Boolean(params.editFlags?.canCopy),
    });
    items.push({
      label: t('context.paste'),
      accelerator: 'CmdOrCtrl+V',
      role: 'paste',
      enabled: Boolean(params.editFlags?.canPaste),
    });
    items.push({
      label: t('context.selectAll'),
      accelerator: 'CmdOrCtrl+A',
      role: 'selectAll',
      enabled: Boolean(params.editFlags?.canSelectAll),
    });
  }

  // 5. Navigation & document actions (when not clicking on link or editable)
  if (!params.isEditable && !params.linkURL) {
    if (items.length) items.push({ type: 'separator' });
    items.push({
      label: t('context.back'),
      accelerator: 'Alt+Left',
      enabled: Boolean(tab.canGoBack),
      click: () => tab.contents.navigationHistory.canGoBack() && tab.contents.navigationHistory.goBack(),
    });
    items.push({
      label: t('context.forward'),
      accelerator: 'Alt+Right',
      enabled: Boolean(tab.canGoForward),
      click: () => tab.contents.navigationHistory.canGoForward() && tab.contents.navigationHistory.goForward(),
    });
    items.push({
      label: t('context.reload'),
      accelerator: 'CmdOrCtrl+R',
      click: () => tab.contents.reload(),
    });
    items.push({ type: 'separator' });
    items.push({
      label: t('context.viewSource'),
      accelerator: 'CmdOrCtrl+U',
      click: () => tabs.create({ url: `view-source:${tab.url}` }),
    });
    items.push({
      label: t('context.copyPageMarkdown'),
      click: () => {
        const title = (tab.title || tab.url || '').trim();
        clipboard.writeText(`[${title}](${tab.url})`);
        surface.send('toast', { message: 'toast.copiedMarkdown', kind: 'info' });
      },
    });
    items.push({
      label: t('context.print'),
      accelerator: 'CmdOrCtrl+P',
      click: () => tab.contents.print({ silent: false, printBackground: true }),
    });
    items.push({
      label: t('context.saveAsPdf'),
      click: async () => {
        const rawTitle = (tab.title || 'page').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) || 'page';
        const defaultPath = join(downloadDirectory(), `${rawTitle}.pdf`);
        const result = await dialog.showSaveDialog(surface.window ?? undefined, {
          title: 'Hinterland',
          defaultPath,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });
        if (result.canceled || !result.filePath) return;
        try {
          const data = await tab.contents.printToPDF({ printBackground: true, pageSize: 'A4' });
          await writeFile(result.filePath, data);
          surface.send('toast', { message: 'toast.pdfSaved', kind: 'success' });
        } catch (error) {
          console.warn('[Hinterland] PDF generation failed:', error?.message ?? error);
          surface.send('toast', { message: 'toast.pdfFailed', kind: 'error' });
        }
      },
    });
  }

  // 6. Inspect element
  if (items.length) items.push({ type: 'separator' });
  items.push({
    label: t('context.inspect'),
    click: () => {
      tab.contents.inspectElement(params.x, params.y);
      if (!tab.contents.isDevToolsOpened()) {
        tab.contents.openDevTools({ mode: 'detach' });
      }
    },
  });

  const menu = Menu.buildFromTemplate(items);
  const win = surface.window;
  if (win && !win.isDestroyed()) {
    menu.popup({ window: win });
  } else {
    menu.popup();
  }
}
