import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join, dirname, basename, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, shell, BrowserWindow } from 'electron';
import { defaultSession } from './sessions.js';
import { settings } from './settings.js';
import { EXTENSIONS_ROOT, EXTENSION_PRELOAD, safeJoin } from './resources.js';
import { tabs } from './tabs.js';
import { surface } from './windows.js';

const REGISTRY_FILE = 'extensions.json';

const FORBIDDEN_PERMISSIONS = new Set([
  'debugger',
  'nativeMessaging',
  'management',
  'privacy',
  'proxy',
  'vpnProvider',
]);

export function validateExtension(manifest, directory) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('manifestInvalid');
  }
  if (manifest.manifest_version !== 3) {
    throw new Error('manifestVersionNotSupported');
  }
  if (!manifest.name || typeof manifest.name !== 'string' || !manifest.name.trim()) {
    throw new Error('nameMissing');
  }

  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  for (const perm of permissions) {
    if (FORBIDDEN_PERMISSIONS.has(perm)) {
      throw new Error(`forbiddenPermission:${perm}`);
    }
  }

  const csp = manifest.content_security_policy?.extension_pages;
  if (typeof csp === 'string' && csp.includes("'unsafe-eval'")) {
    throw new Error('insecureCspUnsafeEval');
  }

  const filesToCheck = [];
  if (typeof manifest.background?.service_worker === 'string') {
    filesToCheck.push(manifest.background.service_worker);
  }
  if (Array.isArray(manifest.content_scripts)) {
    for (const cs of manifest.content_scripts) {
      if (Array.isArray(cs.js)) filesToCheck.push(...cs.js);
      if (Array.isArray(cs.css)) filesToCheck.push(...cs.css);
    }
  }
  if (typeof manifest.action?.default_popup === 'string') {
    filesToCheck.push(manifest.action.default_popup);
  }

  for (const file of filesToCheck) {
    const resolved = safeJoin(directory, file);
    if (!resolved || !existsSync(resolved)) {
      throw new Error(`fileNotFoundOrEscapes:${file}`);
    }
  }

  return true;
}

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

function readIconDataUrl(directory, relativePath) {
  if (!directory || !relativePath || typeof relativePath !== 'string') return null;
  const fullPath = safeJoin(directory, relativePath);
  if (!fullPath || !existsSync(fullPath)) return null;
  try {
    const ext = relativePath.toLowerCase().split('.').pop();
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
    const buffer = readFileSync(fullPath);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function resolveIcons(directory, manifest) {
  if (!manifest) return { icons: null, defaultIcon: null, iconUrl: null };
  const rawIcons = manifest.icons;
  const rawActionIcons = manifest.action?.default_icon;

  const resolvedIcons = {};
  if (rawIcons && typeof rawIcons === 'object') {
    for (const [size, path] of Object.entries(rawIcons)) {
      const dataUrl = readIconDataUrl(directory, path);
      if (dataUrl) resolvedIcons[size] = dataUrl;
    }
  }

  let resolvedActionIcon = null;
  if (typeof rawActionIcons === 'string') {
    resolvedActionIcon = readIconDataUrl(directory, rawActionIcons);
  } else if (rawActionIcons && typeof rawActionIcons === 'object') {
    resolvedActionIcon = {};
    for (const [size, path] of Object.entries(rawActionIcons)) {
      const dataUrl = readIconDataUrl(directory, path);
      if (dataUrl) resolvedActionIcon[size] = dataUrl;
    }
  }

  const allDataUrls = [
    resolvedIcons['32'],
    resolvedIcons['48'],
    resolvedIcons['16'],
    resolvedIcons['128'],
    ...(typeof resolvedActionIcon === 'object' && resolvedActionIcon ? Object.values(resolvedActionIcon) : [resolvedActionIcon]),
    ...Object.values(resolvedIcons),
  ].filter(Boolean);

  return {
    icons: Object.keys(resolvedIcons).length ? resolvedIcons : null,
    defaultIcon: resolvedActionIcon,
    iconUrl: allDataUrls[0] ?? null,
  };
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
    this.enableBundledByDefault();
    await this.loadAll();
  }

  async loadAll() {
    const enabled = this.enabledIds();
    const ses = defaultSession();
    const loadedExtensions = ses.extensions.getAllExtensions?.() ?? [];

    for (const loaded of loadedExtensions) {
      const entry = [...this.installed.values()].find((e) => e.path === loaded.path || this.live.get(e.id)?.id === loaded.id);
      if (!entry || !enabled.has(entry.id)) {
        try {
          await ses.extensions.removeExtension(loaded.id);
        } catch (error) {
          console.warn('[Hinterland] Could not remove extension from session:', loaded.id, error?.message ?? error);
        }
        if (entry) {
          this.live.delete(entry.id);
          this.errors.delete(entry.id);
        }
      }
    }

    for (const [id, liveExt] of this.live.entries()) {
      if (!enabled.has(id)) {
        if (liveExt?.id) {
          try {
            await ses.extensions.removeExtension(liveExt.id);
          } catch {}
        }
        this.live.delete(id);
        this.errors.delete(id);
      }
    }

    for (const entry of this.installed.values()) {
      if (!enabled.has(entry.id)) continue;

      const currentLive = this.live.get(entry.id);
      const allNow = ses.extensions.getAllExtensions?.() ?? [];
      const alreadyInSession = allNow.find((e) => e.path === entry.path || (currentLive && e.id === currentLive.id));

      if (currentLive && alreadyInSession) {
        this.errors.delete(entry.id);
        continue;
      }

      if (alreadyInSession?.id) {
        try {
          await ses.extensions.removeExtension(alreadyInSession.id);
        } catch {}
      }

      try {
        const extension = await ses.extensions.loadExtension(entry.path, {
          allowFileAccess: false,
          observeWindowCreation: false,
        });
        this.live.set(entry.id, extension);
        this.errors.delete(entry.id);
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
    if (extension?.reload) {
      try {
        extension.reload();
        this.errors.delete(id);
        this.surfaceChanged();
        return true;
      } catch {
        /* fallback to clean unload & loadOne */
      }
    }
    const ses = defaultSession();
    if (extension?.id) {
      try {
        await ses.extensions.removeExtension(extension.id);
      } catch {}
    }
    this.live.delete(id);
    return this.loadOne(id);
  }

  async loadOne(id) {
    const entry = this.installed.get(id);
    if (!entry) return false;
    const ses = defaultSession();
    const all = ses.extensions.getAllExtensions?.() ?? [];
    const stale = all.find((e) => e.path === entry.path);
    if (stale?.id) {
      try {
        await ses.extensions.removeExtension(stale.id);
      } catch {}
    }
    try {
      const extension = await ses.extensions.loadExtension(entry.path, {
        allowFileAccess: false,
        observeWindowCreation: false,
      });
      this.live.set(id, extension);
      this.errors.delete(id);
      this.surfaceChanged();
      return true;
    } catch (error) {
      this.errors.set(id, error?.message ?? 'loadFailed');
      this.surfaceChanged();
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
    const iconData = resolveIcons(entry.path, manifest);
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
        defaultIcon: iconData.defaultIcon,
      } : null,
      icons: iconData.icons,
      iconUrl: iconData.iconUrl,
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
      const popupClean = popup.replace(/^\/+/, '');
      const popupUrl = extension?.id
        ? `chrome-extension://${extension.id}/${popupClean}`
        : new URL(popup, baseWithSlash).toString();
      const win = new BrowserWindow({
        width: 380,
        height: 560,
        show: false,
        frame: false,
        parent: surface.window,
        modal: false,
        resizable: false,
        webPreferences: {
          preload: EXTENSION_PRELOAD,
          webSecurity: true,
          allowRunningInsecureContent: false,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      win.loadURL(popupUrl).catch(() => {});
      win.center();
      win.show();
      win.on('blur', () => {
        if (!win.isDestroyed()) win.close();
      });
      win.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'Escape' && !win.isDestroyed()) {
          win.close();
        }
      });
      return true;
    }
    try {
      await tab.contents.executeJavaScript(`
        (function() {
          const event = new CustomEvent('hinterland:extension-action', { detail: { extensionId: ${JSON.stringify(id)} } });
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
    validateExtension(manifest, path);
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

  manifestForUrl(url) {
    if (!url || typeof url !== 'string') return null;
    for (const [id, ext] of this.live.entries()) {
      if (ext.id && url.includes(ext.id)) return ext.manifest ?? null;
      const entry = this.installed.get(id);
      if (entry && url.startsWith(pathToFileURL(entry.path).href)) {
        return ext.manifest || readManifest(entry.path);
      }
    }
    return null;
  }

  list() {
    return [...this.installed.values()].map((entry) => {
      const manifest = readManifest(entry.path);
      const iconData = resolveIcons(entry.path, manifest);
      return {
        ...entry,
        enabled: this.live.has(entry.id),
        error: this.errors.get(entry.id) ?? null,
        description: readDescription(entry.path),
        iconUrl: iconData.iconUrl,
      };
    });
  }

  enableBundledByDefault() {
    const isInitialized = settings.value('extensions.initialized');
    const enabled = new Set(settings.value('extensions.enabled'));
    if (!isInitialized || enabled.size === 0) {
      for (const entry of this.installed.values()) {
        if (entry.bundled) enabled.add(entry.id);
      }
      settings.set('extensions.enabled', [...enabled]);
      settings.set('extensions.initialized', true);
    }
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