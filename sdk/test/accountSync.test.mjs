import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeBookmarks,
  normalizeBookmarkUrl,
  extractSyncableSettings,
  mergeSettings,
  encryptSyncPayload,
  decryptSyncPayload,
  deriveSyncKey,
  SYNCABLE_SETTINGS,
  SyncService,
} from '../../src/main/sync.js';
import handler from '../../website/api/sync.js';

describe('Hinterland Account & Cloud Sync Engine', () => {
  describe('Bookmark Normalization & Intelligent Merge', () => {
    it('normalizes bookmark URLs with trailing slashes consistently', () => {
      assert.equal(normalizeBookmarkUrl('https://example.com/'), 'https://example.com');
      assert.equal(normalizeBookmarkUrl('https://example.com/page/'), 'https://example.com/page');
      assert.equal(normalizeBookmarkUrl('https://github.com'), 'https://github.com');
      assert.equal(normalizeBookmarkUrl(''), '');
    });

    it('merges local and remote bookmarks without duplicates', () => {
      const local = [
        { title: 'Google', url: 'https://google.com', created: 100 },
        { title: 'GitHub', url: 'https://github.com/', created: 101 },
      ];
      const remote = [
        { title: 'GitHub Code', url: 'https://github.com', updatedAt: 200 },
        { title: 'Wikipedia', url: 'https://wikipedia.org', created: 102 },
      ];

      const merged = mergeBookmarks(local, remote);
      assert.equal(merged.length, 3);

      const gh = merged.find((b) => b.url.includes('github.com'));
      assert.ok(gh);
      assert.equal(gh.title, 'GitHub Code');

      const wiki = merged.find((b) => b.url.includes('wikipedia.org'));
      assert.ok(wiki);
      assert.equal(wiki.title, 'Wikipedia');
    });

    it('handles empty, null, or corrupted bookmark lists safely', () => {
      assert.deepEqual(mergeBookmarks([], []), []);
      assert.deepEqual(mergeBookmarks(null, null), []);
      assert.equal(mergeBookmarks([{ title: 'A', url: 'https://a.com' }], null).length, 1);
    });
  });

  describe('Syncable Settings Extraction & Merge', () => {
    it('extracts only portable user preferences and ignores machine-specific settings', () => {
      const rawSettings = {
        general: { language: 'de', startMode: 'newtab' },
        appearance: { theme: 'dark', density: 'compact', showBookmarksBar: true },
        privacy: { blockTrackers: true },
        advanced: { hardwareAcceleration: false }, // Should NOT be synced
        data: { passwordsVault: { secret: 'do-not-sync' } }, // Should NOT be synced
      };

      const extracted = extractSyncableSettings(rawSettings);
      assert.equal(extracted['general.language'], 'de');
      assert.equal(extracted['appearance.theme'], 'dark');
      assert.equal(extracted['appearance.showBookmarksBar'], true);
      assert.equal(extracted['advanced.hardwareAcceleration'], undefined);
      assert.equal(extracted['data.passwordsVault'], undefined);
    });

    it('merges remote settings into local settings patch', () => {
      const local = { 'general.language': 'en', 'appearance.theme': 'light' };
      const remote = { 'general.language': 'de', 'appearance.density': 'compact', 'forbidden.key': 'bad' };

      const patch = mergeSettings(local, remote);
      assert.equal(patch['general.language'], 'de');
      assert.equal(patch['appearance.density'], 'compact');
      assert.equal(patch['forbidden.key'], undefined);
    });
  });

  describe('End-to-End Zero-Knowledge Encryption', () => {
    it('encrypts and decrypts sync payloads round-trip with passphrase', () => {
      const payload = {
        bookmarks: [{ title: 'Secret Vault', url: 'https://vault.internal' }],
        settings: { 'appearance.theme': 'dark' },
        updatedAt: '2026-10-26T12:00:00Z',
      };
      const passphrase = 'UltraSecureSyncPassphrase!123';

      const encrypted = encryptSyncPayload(payload, passphrase);
      assert.equal(encrypted.encrypted, true);
      assert.ok(encrypted.salt);
      assert.ok(encrypted.iv);
      assert.ok(encrypted.tag);
      assert.ok(encrypted.ciphertext);

      const decrypted = decryptSyncPayload(encrypted, passphrase);
      assert.deepEqual(decrypted, payload);
    });

    it('rejects decryption when given an incorrect passphrase', () => {
      const payload = { test: 'confidential' };
      const encrypted = encryptSyncPayload(payload, 'CorrectPassphrase');

      assert.throws(() => {
        decryptSyncPayload(encrypted, 'WrongPassphrase');
      });
    });

    it('derives 32-byte cryptographic key deterministically from salt and passphrase', () => {
      const salt = Buffer.from('0123456789abcdef');
      const key1 = deriveSyncKey('MasterSyncPass', salt);
      const key2 = deriveSyncKey('MasterSyncPass', salt);
      assert.equal(key1.length, 32);
      assert.deepEqual(key1, key2);
    });
  });

  describe('Vercel Serverless Sync API Endpoint (website/api/sync.js)', () => {
    function mockRes() {
      const res = {
        statusCode: 200,
        headers: {},
        data: null,
        setHeader(k, v) {
          res.headers[k.toLowerCase()] = v;
          return res;
        },
        status(code) {
          res.statusCode = code;
          return res;
        },
        json(payload) {
          res.data = payload;
          return res;
        },
        end() {
          return res;
        },
      };
      return res;
    }

    it('handles GET health check request and returns service status', async () => {
      const req = { method: 'GET', headers: {} };
      const res = mockRes();
      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.data.ok, true);
      assert.equal(res.data.service, 'hinterland-sync');
      assert.equal(res.data.version, '1.21.0');
    });

    it('handles OPTIONS request with CORS headers', async () => {
      const req = { method: 'OPTIONS', headers: {} };
      const res = mockRes();
      await handler(req, res);

      assert.equal(res.statusCode, 204);
      assert.equal(res.headers['access-control-allow-origin'], '*');
    });

    it('registers a new user and returns authentication token', async () => {
      const email = `test-${Date.now()}@hinterland.de`;
      const req = {
        method: 'POST',
        headers: { 'x-forwarded-for': '127.0.0.1' },
        body: { action: 'signup', email, password: 'StrongPassword123!' },
      };
      const res = mockRes();
      await handler(req, res);

      assert.equal(res.statusCode, 201);
      assert.equal(res.data.ok, true);
      assert.ok(res.data.token);
      assert.equal(res.data.user.email, email);
    });

    it('authenticates user and syncs bookmarks & settings', async () => {
      const email = `syncuser-${Date.now()}@hinterland.de`;
      const password = 'SyncPassword2026!';

      // Signup
      const signupRes = mockRes();
      await handler({
        method: 'POST',
        headers: { 'x-forwarded-for': '127.0.0.1' },
        body: { action: 'signup', email, password },
      }, signupRes);

      const token = signupRes.data.token;
      assert.ok(token);

      // Push initial bookmarks & settings
      const syncRes1 = mockRes();
      await handler({
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: {
          action: 'sync',
          data: {
            bookmarks: [{ title: 'Doc 1', url: 'https://docs.example.com' }],
            settings: { 'appearance.theme': 'dark' },
          },
        },
      }, syncRes1);

      assert.equal(syncRes1.statusCode, 200);
      assert.equal(syncRes1.data.ok, true);
      assert.equal(syncRes1.data.data.bookmarks.length, 1);

      // Push merged bookmarks from second client
      const syncRes2 = mockRes();
      await handler({
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: {
          action: 'sync',
          data: {
            bookmarks: [{ title: 'Doc 2', url: 'https://developer.example.com' }],
            settings: { 'appearance.density': 'compact' },
          },
        },
      }, syncRes2);

      assert.equal(syncRes2.statusCode, 200);
      assert.equal(syncRes2.data.ok, true);
      assert.equal(syncRes2.data.data.bookmarks.length, 2);
      assert.equal(syncRes2.data.data.settings['appearance.theme'], 'dark');
      assert.equal(syncRes2.data.data.settings['appearance.density'], 'compact');
    });

    it('rejects unauthorized sync requests without token', async () => {
      const req = {
        method: 'POST',
        headers: {},
        body: { action: 'sync', data: {} },
      };
      const res = mockRes();
      await handler(req, res);

      assert.equal(res.statusCode, 401);
      assert.equal(res.data.ok, false);
      assert.equal(res.data.error, 'unauthorized');
    });
  });

  describe('SyncService State & Protocol Client', () => {
    it('manages initial unauthenticated state and reports capabilities', () => {
      const service = new SyncService();
      const status = service.getStatus();

      assert.equal(status.isLoggedIn, false);
      assert.equal(status.user, null);
      assert.equal(status.status, 'idle');
      assert.equal(status.autoSync, true);
      assert.equal(status.syncBookmarks, true);
      assert.equal(status.syncSettings, true);
    });

    it('updates configuration and manages sync passphrase', async () => {
      const service = new SyncService();
      await service.updateConfig({
        syncPassphrase: 'UserSecretKey',
        autoSync: false,
      });

      const status = service.getStatus();
      assert.equal(status.hasPassphrase, true);
      assert.equal(status.autoSync, false);
    });
  });
});
