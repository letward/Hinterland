import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { defineManifest, validateManifest, PERMISSION_LEVELS } from '../src/manifest.js';

describe('Manifest Builder & Validator', () => {
  test('defineManifest creates a valid Manifest V3 object', () => {
    const manifest = defineManifest({
      name: 'Safe Reader',
      version: '1.2.0',
      description: 'A quiet reading assistant',
      permissions: ['storage', 'activeTab'],
    });

    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.name, 'Safe Reader');
    assert.equal(manifest.version, '1.2.0');
    assert.ok(manifest.content_security_policy);
  });

  test('validateManifest rejects missing name and version', () => {
    const res = validateManifest({ manifest_version: 3 });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('"name" is required')));
    assert.ok(res.errors.some((e) => e.includes('"version" must be a valid')));
  });

  test('validateManifest rejects non-MV3 manifests', () => {
    const res = validateManifest({ manifest_version: 2, name: 'Old Ext', version: '1.0' });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('Hinterland requires Manifest V3')));
  });

  test('validateManifest rejects forbidden permissions', () => {
    for (const forbidden of PERMISSION_LEVELS.FORBIDDEN) {
      const res = validateManifest({
        manifest_version: 3,
        name: 'Exploit Extension',
        version: '1.0.0',
        permissions: ['storage', forbidden],
      });
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.includes(`Forbidden permission "${forbidden}"`)));
    }
  });

  test('validateManifest warns on broad host permissions', () => {
    const res = validateManifest({
      manifest_version: 3,
      name: 'Broad Ext',
      version: '1.0.0',
      permissions: ['storage'],
      host_permissions: ['<all_urls>'],
    });
    assert.equal(res.valid, true);
    assert.ok(res.warnings.some((w) => w.includes('Broad host permission "<all_urls>"')));
  });

  test('validateManifest rejects CSP with unsafe-eval', () => {
    const res = validateManifest({
      manifest_version: 3,
      name: 'Insecure CSP Ext',
      version: '1.0.0',
      permissions: ['storage'],
      content_security_policy: {
        extension_pages: "script-src 'self' 'unsafe-eval';",
      },
    });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("'unsafe-eval'")));
  });

  test('validateManifest rejects relative path traversal in service worker', () => {
    const res = validateManifest({
      manifest_version: 3,
      name: 'Path Escape Ext',
      version: '1.0.0',
      background: { service_worker: '../escape.js' },
    });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('must not escape the extension directory')));
  });
});
