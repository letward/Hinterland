import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join, dirname, basename, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, shell, BrowserWindow } from 'electron';
import { defaultSession } from './sessions.js';
import { settings } from './settings.js';
import { EXTENSIONS_ROOT, CHROME_PRELOAD } from './resources.js';
import { tabs } from './tabs.js';
import { surface } from './windows.js';

const REGISTRY_FILE = 'extensions.json';

function readManifest(directory) {
  const file = join(directory, 'manifest.json');
  if (!existsSync(file)) return null;
  try {
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    if (!manifest.manifest_version) return null;
    return manifest;
  } catch {
    return null;
  }
}

export class ExtensionManager {
  constructor() {
    this.filePath = join(app.getPath('userData'), REGISTRY_FILE);
    this.installed = new Map();
    this.live = new Map();
    this.errors = new Map();
  }

  registry() {
    try {
      if (!existsSync(this.filePath)) return [];
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8'));
      return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry?.path === 'string') : [];
    } catch {
      return [];
    }
  }

  writeRegistry() {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.tmp`;
      writeFileSync(temporary, JSON.stringify([...this.installed.values()], null, 2), 'utf8');
      renameSync(temporary, this.filePath);
    } catch (error) {
      console.warn('[Hinterland] Extension registry could not be written.', error.message);
    }
  }

  bundled() {
    if (!existsSync(EXTENSIONS_ROOT)) return [];
    try {
      return readdirSync(EXTENSIONS_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(EXTENSIONS_ROOT, entry.name));
    } catch {
      return [];
    }
  }

  enabledIds() {
    return new Set(settings.value('extensions.enabled'));
  }

  async start() {
    this.installed.clear();
    for (const directory of this.bundled()) {
      const manifest = readManifest(directory);
      if (!manifest) continue;
      const id = manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, '') || basename(directory).toLowerCase();
      this.installed.set(id, { id, path: directory, bundled: true, name: manifest.name, version: manifest.version ?? '0' });
    }
    for (const entry of this.registry()) {
      const manifest = readManifest(entry.path);
      if (!manifest) {
        this.errors.set(entry.id, 'manifestMissing');
        continue;
      }
      const id = entry.id || manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
      this.installed.set(id, { ...entry, id, bundled: false, name: manifest.name, version: manifest.version ?? '0' });
    }
    await this.loadAll();
    this.enableBundledByDefault();
  }

  async loadAll() {
    const enabled = this.enabledIds();
    const ses = defaultSession();
    this.live.clear();
    this.errors.clear();

    for (const entry of this.installed.values()) {
      if (!enabled.has(entry.id)) continue;
      try {
const extension = await ses.extensions.loadExtension(entry.path, {
        allowFileAccess: false,
        observeWindowCreation: false,
      });
        this.live.set(entry.id, extension);
      } catch (error) {
        this.errors.set(entry.id, error?.message ?? 'loadFailed');
        console.warn('[Hinterland] Extension could not be loaded.', entry.id, error?.message ?? error);
      }
    }
    this.surfaceChanged();
    return this.list();
  }

  surfaceChanged() {
    surface.send('extensions:changed');
  }

  async reload(id) {
    const entry = this.installed.get(id);
    if (!entry) return false;
    const extension = this.live.get(id);
    if (extension) {
      try {
        extension.reload();
        this.surfaceChanged();
        return true;
      } catch {
        return this.loadOne(id);
      }
    }
    return this.loadOne(id);
  }

  async loadOne(id) {
    const entry = this.installed.get(id);
    if (!entry) return false;
    try {
      const extension = await defaultSession().extensions.loadExtension(entry.path, {
        allowFileAccess: false,
        observeWindowCreation: false,
      });
      this.live.set(id, extension);
      this.errors.delete(id);
      this.surfaceChanged();
      return true;
    } catch (error) {
      this.errors.set(id, error?.message ?? 'loadFailed');
      return false;
    }
  }

  isEnabled(id) {
    return this.live.has(id);
  }

  info(id) {
    const entry = this.installed.get(id);
    if (!entry) return null;
    const extension = this.live.get(id);
    const manifest = extension ? extension.manifest : readManifest(entry.path);
    return {
      id: entry.id,
      name: manifest?.name ?? entry.name,
      version: manifest?.version ?? entry.version,
      description: manifest?.description ?? '',
      enabled: this.live.has(id),
      bundled: entry.bundled,
      error: this.errors.get(entry.id) ?? null,
      path: entry.path,
      action: manifest?.action ? {
        defaultTitle: manifest.action.default_title ?? '',
        defaultPopup: manifest.action.default_popup ?? null,
        defaultIcon: manifest.action.default_icon ?? null,
      } : null,
      icons: manifest?.icons ?? null,
      permissions: manifest?.permissions ?? [],
      content_scripts: manifest?.content_scripts ?? [],
    };
  }

  async executeAction(id) {
    const entry = this.installed.get(id);
    if (!entry) return false;
    const extension = this.live.get(id);
    if (!extension) return false;
    const manifest = extension.manifest || readManifest(entry.path);
    const action = manifest?.action;
    if (!action) return false;
    const tab = tabs.active;
    if (!tab) return false;
    const popup = action.default_popup;
    if (popup) {
      const base = pathToFileURL(entry.path).href;
      const baseWithSlash = base.endsWith('/') ? base : `${base}/`;
      const popupUrl = new URL(popup, baseWithSlash).toString();
      const win = new BrowserWindow({
        width: 350,
        height: 450,
        show: false,
        frame: false,
        parent: surface.window,
        modal: true,
        webPreferences: {
          preload: CHROME_PRELOAD,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      win.loadURL(popupUrl).catch(() => {});
      win.center();
      win.show();
      return true;
    }
    try {
      await tab.contents.executeJavaScript(`
        (function() {
          const event = new CustomEvent('hinterland:extension-action', { detail: { extensionId: '${id}' } });
          window.dispatchEvent(event);
        })();
      `);
      return true;
    } catch {
      return false;
    }
  }

  async setEnabled(id, enabled) {
    const current = new Set(settings.value('extensions.enabled'));
    const known = new Set([...this.installed.keys()]);
    if (known.size) current.forEach((value) => known.has(value) || current.delete(value));
    if (enabled) current.add(id);
    else current.delete(id);
    settings.set('extensions.enabled', [...current]);
    return this.loadAll();
  }

  async install(directory) {
    const path = isAbsolute(directory) ? directory : join(directory);
    if (!existsSync(path)) throw new Error('pathMissing');
    if (!statSync(path).isDirectory()) throw new Error('notADirectory');
    const manifest = readManifest(path);
    if (!manifest) throw new Error('manifestMissing');
    if (!manifest.name) throw new Error('nameMissing');

    const id = manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, '') || basename(path).toLowerCase();
    this.installed.set(id, {
      id,
      path,
      bundled: false,
      name: manifest.name,
      version: manifest.version ?? '0',
    });
    this.writeRegistry();

    const enabled = new Set(settings.value('extensions.enabled'));
    enabled.add(id);
    settings.set('extensions.enabled', [...enabled]);
    await this.loadAll();
    return id;
  }

  async uninstall(id) {
    const entry = this.installed.get(id);
    if (!entry || entry.bundled) return false;
    this.installed.delete(id);
    this.writeRegistry();
    const enabled = new Set(settings.value('extensions.enabled'));
    enabled.delete(id);
    settings.set('extensions.enabled', [...enabled]);
    await this.loadAll();
    return true;
  }

  reveal(id) {
    const entry = this.installed.get(id);
    if (!entry) return false;
    shell.openPath(entry.path).catch(() => {});
    return true;
  }

  list() {
    return [...this.installed.values()].map((entry) => ({
      ...entry,
      enabled: this.live.has(entry.id),
      error: this.errors.get(entry.id) ?? null,
      description: readDescription(entry.path),
    }));
  }

  enableBundledByDefault() {
    const enabled = new Set(settings.value('extensions.enabled'));
    let changed = false;
    for (const entry of this.installed.values()) {
      if (entry.bundled && !enabled.has(entry.id)) {
        enabled.add(entry.id);
        changed = true;
      }
    }
    if (changed) settings.set('extensions.enabled', [...enabled]);
  }
}

function readDescription(directory) {
  const file = join(directory, 'description.txt');
  try {
    return existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
  } catch {
    return '';
  }
}

export const extensions = new ExtensionManager();