import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXTENSIONS_DIR = join(ROOT, 'src', 'extensions');
const BUNDLED_DIRS = ['hinterlandFocus', 'hinterlandPanel', 'hinterlandPass'];

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

function readIconDataUrl(directory, relativePath) {
  if (!directory || !relativePath || typeof relativePath !== 'string') return null;
  const fullPath = join(directory, relativePath);
  if (!existsSync(fullPath)) return null;
  const ext = relativePath.toLowerCase().split('.').pop();
  const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
  const buffer = readFileSync(fullPath);
  return `data:${mime};base64,${buffer.toString('base64')}`;
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

test('Bundled Extensions & Icon Assets', async (t) => {
  const bundledDirs = ['hinterlandFocus', 'hinterlandPanel', 'hinterlandPass'];

  await t.test('all bundled extensions exist and have valid manifests', () => {
    for (const dirName of bundledDirs) {
      const dirPath = join(EXTENSIONS_DIR, dirName);
      assert.ok(existsSync(dirPath), `${dirName} directory exists`);

      const manifestPath = join(dirPath, 'manifest.json');
      assert.ok(existsSync(manifestPath), `${dirName} manifest.json exists`);

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      assert.equal(manifest.manifest_version, 3);
      assert.ok(typeof manifest.name === 'string' && manifest.name.length > 0);
      assert.ok(typeof manifest.version === 'string');
    }
  });

  await t.test('all bundled extensions declare complete icon sets with real PNG files', () => {
    const requiredSizes = ['16', '32', '48', '128'];

    for (const dirName of bundledDirs) {
      const dirPath = join(EXTENSIONS_DIR, dirName);
      const manifest = JSON.parse(readFileSync(join(dirPath, 'manifest.json'), 'utf8'));

      assert.ok(manifest.icons, `${dirName} has icons definition`);
      assert.ok(manifest.action?.default_icon, `${dirName} has action.default_icon definition`);

      for (const size of requiredSizes) {
        const iconRel = manifest.icons[size];
        assert.ok(iconRel, `${dirName} defines icons[${size}]`);

        const iconPath = join(dirPath, iconRel);
        assert.ok(existsSync(iconPath), `${dirName} icon file exists at ${iconRel}`);

        const buf = readFileSync(iconPath);
        assert.ok(buf.length > 50, `${dirName} icon ${size} has nonzero size`);
        assert.deepEqual(buf.subarray(0, 8), PNG_HEADER, `${dirName} icon ${size} is a valid PNG`);
      }
    }
  });

  await t.test('resolveIcons transforms extension icon paths to valid Base64 data URLs', () => {
    for (const dirName of bundledDirs) {
      const dirPath = join(EXTENSIONS_DIR, dirName);
      const manifest = JSON.parse(readFileSync(join(dirPath, 'manifest.json'), 'utf8'));

      const result = resolveIcons(dirPath, manifest);
      assert.ok(result.iconUrl, `${dirName} has primary iconUrl`);
      assert.ok(result.iconUrl.startsWith('data:image/png;base64,'), `${dirName} iconUrl is data URI`);

      assert.ok(result.icons, `${dirName} resolved icons object`);
      assert.ok(result.icons['16'].startsWith('data:image/png;base64,'));
      assert.ok(result.icons['32'].startsWith('data:image/png;base64,'));
      assert.ok(result.icons['48'].startsWith('data:image/png;base64,'));
      assert.ok(result.icons['128'].startsWith('data:image/png;base64,'));
    }
  });
});

test('Extension Default Enablement & Lifecycle Logic', async (t) => {
  const bundledIds = ['hinterlandfocus', 'hinterlandpanel', 'hinterlandpass'];

  await t.test('schema defaults bundled extensions to enabled', () => {
    const schemaFile = join(ROOT, 'src', 'main', 'schema.js');
    const content = readFileSync(schemaFile, 'utf8');

    assert.ok(
      content.includes("option('extensions.enabled', 'multiselect', ['hinterlandfocus', 'hinterlandpanel', 'hinterlandpass']"),
      'schema.js sets extensions.enabled default to all 3 bundled extensions'
    );
    assert.ok(
      content.includes("option('extensions.initialized', 'bool', false)"),
      'schema.js declares extensions.initialized internal option'
    );
  });

  await t.test('enableBundledByDefault seeds bundled extensions when empty or uninitialized', () => {
    function simulateEnableBundled(installedBundledIds, currentSetting, isInitialized) {
      const enabled = new Set(Array.isArray(currentSetting) ? currentSetting : []);
      let updatedInitialized = isInitialized;
      if (!isInitialized || enabled.size === 0) {
        for (const id of installedBundledIds) {
          enabled.add(id);
        }
        updatedInitialized = true;
      }
      return { enabled: [...enabled], initialized: updatedInitialized };
    }

    // Uninitialized first run
    const firstRun = simulateEnableBundled(bundledIds, [], false);
    assert.deepEqual(firstRun.enabled.sort(), bundledIds.sort());
    assert.equal(firstRun.initialized, true);

    // User disables one extension: should remain disabled on next start
    const afterUserDisabledOne = simulateEnableBundled(bundledIds, ['hinterlandfocus'], true);
    assert.deepEqual(afterUserDisabledOne.enabled, ['hinterlandfocus']);

    // Stale empty array from older versions should re-seed
    const recoverStaleEmpty = simulateEnableBundled(bundledIds, [], true);
    assert.deepEqual(recoverStaleEmpty.enabled.sort(), bundledIds.sort());
  });

  await t.test('toggling extensions maintains clean set membership', () => {
    const enabled = new Set(['hinterlandfocus', 'hinterlandpanel', 'hinterlandpass']);

    // Disable hinterlandpanel
    enabled.delete('hinterlandpanel');
    assert.equal(enabled.has('hinterlandpanel'), false);
    assert.equal(enabled.size, 2);

    // Re-enable hinterlandpanel
    enabled.add('hinterlandpanel');
    assert.equal(enabled.has('hinterlandpanel'), true);
    assert.equal(enabled.size, 3);
  });

  await t.test('all bundled service workers declare type: module in manifest.json when using ES modules', () => {
    for (const dirName of BUNDLED_DIRS) {
      const dirPath = join(EXTENSIONS_DIR, dirName);
      const manifest = JSON.parse(readFileSync(join(dirPath, 'manifest.json'), 'utf8'));
      if (manifest.background?.service_worker) {
        const swContent = readFileSync(join(dirPath, manifest.background.service_worker), 'utf8');
        if (swContent.includes('import ') || swContent.includes('export ')) {
          assert.equal(
            manifest.background.type,
            'module',
            `${dirName} background service worker uses ES imports and must declare "type": "module" in manifest.json`,
          );
        }
      }
    }
  });

  await t.test('action content scripts declare listeners for hinterland:extension-action', () => {
    const focusContent = readFileSync(join(EXTENSIONS_DIR, 'hinterlandFocus', 'content.js'), 'utf8');
    assert.ok(
      focusContent.includes("hinterland:extension-action") && focusContent.includes('hinterlandfocus'),
      'hinterlandFocus content.js must listen for hinterland:extension-action',
    );

    const panelContent = readFileSync(join(EXTENSIONS_DIR, 'hinterlandPanel', 'content.js'), 'utf8');
    assert.ok(
      panelContent.includes("hinterland:extension-action") && panelContent.includes('hinterlandpanel'),
      'hinterlandPanel content.js must listen for hinterland:extension-action',
    );
  });

  await t.test('package.json declares asarUnpack for src/extensions', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    assert.ok(Array.isArray(pkg.build?.asarUnpack), 'package.json build defines asarUnpack array');
    assert.ok(
      pkg.build.asarUnpack.some((pattern) => pattern.includes('src/extensions')),
      'package.json asarUnpack includes src/extensions',
    );
  });

  await t.test('extension popup URL builder correctly appends activeUrl and tabId parameters', () => {
    function buildPopupUrl(extensionId, popupPath, tab) {
      const popupClean = popupPath.replace(/^\/+/, '');
      const query = tab
        ? `?activeUrl=${encodeURIComponent(tab.url || '')}&tabId=${tab.contents?.id || ''}`
        : '';
      return `chrome-extension://${extensionId}/${popupClean}${query}`;
    }

    const url = buildPopupUrl('abc123ext', 'popup.html', {
      url: 'https://github.com/login',
      contents: { id: 42 },
    });

    assert.ok(url.startsWith('chrome-extension://abc123ext/popup.html?'));
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('activeUrl'), 'https://github.com/login');
    assert.equal(parsed.searchParams.get('tabId'), '42');
  });
});
