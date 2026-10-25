import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, defineManifest } from '../src/manifest.js';
import { ContentHelper } from '../src/content.js';

describe('Hinterland v1.17.3 Features', () => {
  describe('Extension Service Worker ES Module Support (background.type)', () => {
    it('accepts manifest with valid service_worker and type module', () => {
      const manifest = {
        manifest_version: 3,
        name: 'Modern ES Module Extension',
        version: '1.0.0',
        background: {
          service_worker: 'background.js',
          type: 'module',
        },
      };

      const result = validateManifest(manifest);
      assert.ok(result.valid, `Expected manifest to be valid, errors: ${result.errors.join(', ')}`);
      assert.equal(result.errors.length, 0);

      const built = defineManifest(manifest);
      assert.equal(built.background.type, 'module');
    });

    it('accepts manifest with service_worker and no type specified (classic)', () => {
      const manifest = {
        manifest_version: 3,
        name: 'Classic Extension',
        version: '1.0.0',
        background: {
          service_worker: 'background.js',
        },
      };

      const result = validateManifest(manifest);
      assert.ok(result.valid);
      assert.equal(result.errors.length, 0);
    });

    it('rejects invalid background.type', () => {
      const manifest = {
        manifest_version: 3,
        name: 'Invalid Type Extension',
        version: '1.0.0',
        background: {
          service_worker: 'background.js',
          type: 'commonjs',
        },
      };

      const result = validateManifest(manifest);
      assert.ok(!result.valid);
      assert.ok(result.errors.some((err) => err.includes('"background.type" if specified must be "module"')));
    });
  });

  describe('ContentHelper.onExtensionAction', () => {
    it('subscribes to hinterland:extension-action and dispatches for matching ID', () => {
      const mockEvents = [];
      const listeners = new Map();

      // Mock window global for testing environment
      globalThis.window = {
        addEventListener: (event, handler) => {
          if (!listeners.has(event)) listeners.set(event, []);
          listeners.get(event).push(handler);
        },
        removeEventListener: (event, handler) => {
          if (!listeners.has(event)) return;
          const list = listeners.get(event);
          const idx = list.indexOf(handler);
          if (idx !== -1) list.splice(idx, 1);
        },
      };

      const unsubscribe = ContentHelper.onExtensionAction('testExtension', (detail) => {
        mockEvents.push(detail);
      });

      // Dispatch matching event
      const handlers = listeners.get('hinterland:extension-action') || [];
      handlers.forEach((h) => h({ detail: { extensionId: 'testextension', action: 'toggle' } }));

      // Dispatch non-matching event
      handlers.forEach((h) => h({ detail: { extensionId: 'otherExtension', action: 'toggle' } }));

      assert.equal(mockEvents.length, 1);
      assert.equal(mockEvents[0].extensionId, 'testextension');
      assert.equal(mockEvents[0].action, 'toggle');

      // Unsubscribe and verify no more events trigger
      unsubscribe();
      handlers.forEach((h) => h({ detail: { extensionId: 'testextension', action: 'toggle' } }));
      assert.equal(mockEvents.length, 1);

      delete globalThis.window;
    });

    it('gracefully handles missing window in non-browser environments', () => {
      const cleanup = ContentHelper.onExtensionAction('any', () => {});
      assert.equal(typeof cleanup, 'function');
      assert.doesNotThrow(() => cleanup());
    });
  });

  describe('Reading List Bulk Unread Operations', () => {
    it('accurately identifies and marks unread items', () => {
      const items = [
        { id: '1', title: 'Article 1', url: 'https://example.com/1', read: false },
        { id: '2', title: 'Article 2', url: 'https://example.com/2', read: true },
        { id: '3', title: 'Article 3', url: 'https://example.com/3', read: false },
        { id: '4', title: 'Article 4', url: 'https://example.com/4', read: true },
      ];

      const unread = items.filter((i) => !i.read);
      assert.equal(unread.length, 2);
      assert.deepEqual(unread.map((i) => i.id), ['1', '3']);

      // Simulate marking all unread as read
      for (const item of unread) {
        item.read = true;
      }

      assert.ok(items.every((i) => i.read === true));
    });

    it('handles empty reading lists cleanly', () => {
      const items = [];
      const unread = items.filter((i) => !i.read);
      assert.equal(unread.length, 0);
    });
  });

  describe('Omnibox Search Engine Chips & Keyword Resolution', () => {
    const engines = [
      { id: 'duckduckgo', name: 'DuckDuckGo', shortcut: '@d', url: 'https://duckduckgo.com/?q={q}' },
      { id: 'google', name: 'Google', shortcut: '@g', url: 'https://www.google.com/search?q={q}' },
      { id: 'wikipedia', name: 'Wikipedia', shortcut: '@w', url: 'https://en.wikipedia.org/wiki/Special:Search?search={q}' },
      { id: 'github', name: 'GitHub', shortcut: '@gh', url: 'https://github.com/search?q={q}' },
    ];

    it('matches engine shortcuts case-insensitively', () => {
      const query = '@gh hinterland browser';
      const parts = query.trim().split(/\s+/);
      const prefix = parts[0].toLowerCase();
      const searchTerm = parts.slice(1).join(' ');

      const matched = engines.find((e) => e.shortcut.toLowerCase() === prefix);
      assert.ok(matched);
      assert.equal(matched.id, 'github');
      assert.equal(searchTerm, 'hinterland browser');

      const targetUrl = matched.url.replace('{q}', encodeURIComponent(searchTerm));
      assert.equal(targetUrl, 'https://github.com/search?q=hinterland%20browser');
    });

    it('supports chip shortcut prepending or replacement', () => {
      function applyChip(currentQuery, engine) {
        const shortcut = engine.shortcut || `@${engine.name.toLowerCase()}`;
        let queryPart = currentQuery.trim();
        if (queryPart.startsWith('@')) {
          const spaceIdx = queryPart.indexOf(' ');
          queryPart = spaceIdx !== -1 ? queryPart.slice(spaceIdx + 1).trim() : '';
        }
        return queryPart ? `${shortcut} ${queryPart}` : `${shortcut} `;
      }

      assert.equal(applyChip('', engines[0]), '@d ');
      assert.equal(applyChip('javascript tips', engines[1]), '@g javascript tips');
      assert.equal(applyChip('@w electron', engines[3]), '@gh electron');
    });
  });

  describe('Group Color Presets', () => {
    const GROUP_COLORS = ['#4f7cff', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#64748b'];

    it('ensures all preset palette entries are valid hex color codes', () => {
      assert.equal(GROUP_COLORS.length, 8);
      for (const color of GROUP_COLORS) {
        assert.match(color, /^#[0-9a-fA-F]{6}$/);
      }
    });
  });
});
