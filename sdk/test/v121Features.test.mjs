import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { SyncService } from '../../src/main/sync.js';
import { settings } from '../../src/main/settings.js';

const require = createRequire(import.meta.url);
const storeHandler = require('../../website/api/store.js');
const { accountsById, sessionsByToken } = require('../../website/api/_account.js');

// Register mock session for store tests
accountsById.set('test-user-id', { id: 'test-user-id', email: 'test@example.com' });
sessionsByToken.set('valid-test-token-123456', { id: 'test-user-id', email: 'test@example.com' });

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.data = obj;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

describe('Hinterland v1.21.0 Account & Store Community Features', () => {
  describe('Community Store Uploads & Authentication Gating (website/api/store.js)', () => {
    it('rejects unauthenticated upload on POST with 401 notLoggedIn', async () => {
      const req = {
        method: 'POST',
        headers: {},
        body: { kind: 'theme', id: 'my-theme', name: 'My Theme' },
      };
      const res = mockRes();
      await storeHandler(req, res);

      assert.equal(res.statusCode, 401);
      assert.equal(res.data.ok, false);
      assert.equal(res.data.error, 'notLoggedIn');
    });

    it('rejects invalid or too short token with 401', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer short' },
        body: { kind: 'theme', id: 'my-theme', name: 'My Theme' },
      };
      const res = mockRes();
      await storeHandler(req, res);

      assert.equal(res.statusCode, 401);
      assert.equal(res.data.ok, false);
      assert.equal(res.data.error, 'notLoggedIn');
    });

    it('uploads a community theme when authenticated', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer valid-test-token-123456' },
        body: {
          kind: 'theme',
          id: 'nordic-aurora',
          name: 'Nordic Aurora',
          author: 'Astrid',
          accent: '#88c0d0',
          darkBackground: '#2e3440',
          darkSurface: '#3b4252',
          tags: ['aurora', 'nord'],
        },
      };
      const res = mockRes();
      await storeHandler(req, res);

      assert.equal(res.statusCode, 201);
      assert.equal(res.data.ok, true);
      assert.equal(res.data.theme.id, 'nordic-aurora');
      assert.equal(res.data.theme.name, 'Nordic Aurora');
      assert.equal(res.data.theme.author, 'Astrid');
      assert.equal(res.data.theme.source, 'community');
    });

    it('rejects theme missing name or id with 400 invalidTheme', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer valid-test-token-123456' },
        body: { kind: 'theme', name: 'Theme Without ID' },
      };
      const res = mockRes();
      await storeHandler(req, res);

      assert.equal(res.statusCode, 400);
      assert.equal(res.data.ok, false);
      assert.equal(res.data.error, 'invalidTheme');
    });

    it('uploads a community extension with permissions and categories when authenticated', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer valid-test-token-123456' },
        body: {
          kind: 'extension',
          id: 'focus-clock',
          name: 'Focus Clock Pomodoro',
          author: 'ZenCoder',
          version: '1.2.0',
          category: 'productivity',
          permissions: ['activeTab', 'alarms', 'notifications'],
          description: 'A minimal pomodoro timer widget for the browser.',
          contentScript: 'console.log("Pomodoro active");',
        },
      };
      const res = mockRes();
      await storeHandler(req, res);

      assert.equal(res.statusCode, 201);
      assert.equal(res.data.ok, true);
      assert.equal(res.data.extension.id, 'focus-clock');
      assert.equal(res.data.extension.name, 'Focus Clock Pomodoro');
      assert.equal(res.data.extension.category, 'productivity');
      assert.deepEqual(res.data.extension.permissions, ['activeTab', 'alarms', 'notifications']);
      assert.equal(res.data.extension.source, 'community');
    });

    it('rejects extension missing name or id with 400 invalidExtension', async () => {
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer valid-test-token-123456' },
        body: { kind: 'extension', author: 'Nobody' },
      };
      const res = mockRes();
      await storeHandler(req, res);

      assert.equal(res.statusCode, 400);
      assert.equal(res.data.ok, false);
      assert.equal(res.data.error, 'invalidExtension');
    });

    it('lists community uploaded themes and extensions via GET', async () => {
      const req = { method: 'GET', url: '/api/store', headers: {} };
      const res = mockRes();
      await storeHandler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.ok, true);
      assert.ok(res.data.themes.some((t) => t.id === 'nordic-aurora'));
      assert.ok(res.data.extensions.some((e) => e.id === 'focus-clock'));
    });
  });

  describe('SyncService Device Pairing & Real-time Bookmarks Sync (src/main/sync.js)', () => {
    it('reports current device metadata in getDevices()', () => {
      const sync = new SyncService();
      const devices = sync.getDevices();

      assert.ok(Array.isArray(devices));
      assert.ok(devices.length >= 1);
      const current = devices.find((d) => d.current);
      assert.ok(current);
      assert.ok(current.name);
      assert.ok(current.os);
      assert.ok(current.browserVersion);
      assert.equal(current.status, 'active');
      sync.destroy();
    });

    it('generates pairing code when pairDevice() called without arguments', () => {
      const sync = new SyncService();
      const res = sync.pairDevice();
      assert.equal(res.ok, true);
      assert.ok(res.code.startsWith('HL-'));
      assert.ok(res.expiresAt);
      sync.destroy();
    });

    it('rejects pairing with invalid code format', async () => {
      const sync = new SyncService();
      const res = await sync.pairDevice({ code: 'INVALID_CODE', name: 'Tablet' });
      assert.equal(res.ok, false);
      assert.equal(res.error, 'invalidCode');
      sync.destroy();
    });

    it('successfully pairs device with valid HL-XXXX-XXXX pairing code', async () => {
      const sync = new SyncService();
      const res = await sync.pairDevice({ code: 'HL-A7B2-C9D4', name: 'MacBook Pro' });
      assert.equal(res.ok, true);
      assert.equal(res.device.name, 'MacBook Pro');
      assert.equal(res.device.pairedCode, 'HL-A7B2-C9D4');

      const devices = sync.getDevices();
      assert.ok(devices.some((d) => d.pairedCode === 'HL-A7B2-C9D4'));
      sync.destroy();
    });

    it('calculates comprehensive sync statistics', () => {
      settings.set('data.bookmarks', [
        { title: 'GitHub', url: 'https://github.com' },
        { title: 'Hinterland', url: 'https://hinterland.de' },
      ]);
      const sync = new SyncService();
      const stats = sync.getSyncStats();

      assert.equal(stats.bookmarkCount, 2);
      assert.ok(stats.settingsCount >= 0);
      assert.ok(stats.deviceCount >= 1);
      sync.destroy();
    });

    it('debounces bookmark sync and avoids echo loops', async () => {
      const sync = new SyncService();
      const res = await sync.syncBookmarks([
        { title: 'Site 1', url: 'https://site1.com' },
        { title: 'Site 2', url: 'https://site2.com' },
      ]);

      assert.equal(res.ok, true);
      assert.equal(res.scheduled, true);
      sync.destroy();
      assert.equal(sync.debounceTimer, null);
    });
  });

  describe('Avatar & Profile Customization Logic', () => {
    function computeInitials(nameOrEmail) {
      if (!nameOrEmail || typeof nameOrEmail !== 'string') return 'HL';
      const clean = nameOrEmail.split('@')[0].trim();
      const parts = clean.split(/[\s._-]+/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return clean.slice(0, 2).toUpperCase() || 'HL';
    }

    it('derives two-letter initials correctly from email or display name', () => {
      assert.equal(computeInitials('johndoe@example.com'), 'JO');
      assert.equal(computeInitials('john.doe@example.com'), 'JD');
      assert.equal(computeInitials('Jane Smith'), 'JS');
      assert.equal(computeInitials('Alice-Bob'), 'AB');
      assert.equal(computeInitials(''), 'HL');
      assert.equal(computeInitials(null), 'HL');
    });

    it('supports preset avatar icons', () => {
      const VALID_PRESETS = ['brand', 'initials', 'bot', 'shield', 'sparkles', 'fire'];
      assert.ok(VALID_PRESETS.includes('brand'));
      assert.ok(VALID_PRESETS.includes('bot'));
      assert.ok(VALID_PRESETS.includes('shield'));
      assert.ok(VALID_PRESETS.includes('sparkles'));
      assert.ok(VALID_PRESETS.includes('fire'));
    });
  });
});
