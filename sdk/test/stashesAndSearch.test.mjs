import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SHORTCUTS } from '../../src/main/constants.js';

function buildSearchUrl(template, query) {
  const encoded = encodeURIComponent(query);
  return String(template).includes('{q}') ? String(template).replaceAll('{q}', encoded) : `${template}${encoded}`;
}

describe('Hinterland v1.14.0 Features', () => {
  describe('Shortcuts Registry', () => {
    test('registers default shortcut for tabStash', () => {
      assert.equal(DEFAULT_SHORTCUTS.tabStash, 'Ctrl+Shift+U');
    });
  });

  describe('Search Keywords & Engine Resolver', () => {
    const engines = [
      { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={q}', shortcut: '@ddg', enabled: true },
      { id: 'google', name: 'Google', url: 'https://www.google.com/search?q={q}', shortcut: '@g', enabled: true },
      { id: 'mojeek', name: 'Mojeek', url: 'https://www.mojeek.com/search?q={q}', shortcut: '@m', enabled: true },
      { id: 'github', name: 'GitHub', url: 'https://github.com/search?q={q}', shortcut: '@gh', enabled: true },
      { id: 'wikipedia', name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Special:Search?search={q}', shortcut: '@w', enabled: true },
      { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/results?search_query={q}', shortcut: '@yt', enabled: true },
      { id: 'npm', name: 'npm', url: 'https://www.npmjs.com/search?q={q}', shortcut: '@npm', enabled: true },
    ];

    function resolveEngineTarget(input, engineList = engines) {
      const value = String(input || '').trim();
      if (!value) return null;

      const spaceIndex = value.indexOf(' ');
      const firstWord = spaceIndex > 0 ? value.slice(0, spaceIndex) : value;
      const queryPart = spaceIndex > 0 ? value.slice(spaceIndex + 1).trim() : '';

      const matchedEngine = engineList.find((eng) => {
        if (!eng.shortcut) return false;
        const s = eng.shortcut.toLowerCase();
        const w = firstWord.toLowerCase();
        return s === w || s.replace(/^@/, '') === w || s === `@${w}`;
      });

      if (matchedEngine) {
        if (!queryPart) {
          try {
            const u = new URL(matchedEngine.url);
            return { kind: 'url', url: `${u.protocol}//${u.host}/`, query: '' };
          } catch {
            return { kind: 'search', url: buildSearchUrl(matchedEngine.url, ''), query: '', engine: matchedEngine.name };
          }
        }
        return { kind: 'search', url: buildSearchUrl(matchedEngine.url, queryPart), query: queryPart, engine: matchedEngine.name };
      }

      return { kind: 'search', url: buildSearchUrl(engineList[0].url, value), query: value, engine: engineList[0].name };
    }

    test('resolves keyword query to specific search engine URL', () => {
      const resGh = resolveEngineTarget('@gh electron framework');
      assert.equal(resGh.kind, 'search');
      assert.equal(resGh.engine, 'GitHub');
      assert.equal(resGh.url, 'https://github.com/search?q=electron%20framework');

      const resWiki = resolveEngineTarget('@w Albert Einstein');
      assert.equal(resWiki.kind, 'search');
      assert.equal(resWiki.engine, 'Wikipedia');
      assert.equal(resWiki.url, 'https://en.wikipedia.org/wiki/Special:Search?search=Albert%20Einstein');

      const resYt = resolveEngineTarget('@yt lofi beats');
      assert.equal(resYt.kind, 'search');
      assert.equal(resYt.engine, 'YouTube');
      assert.equal(resYt.url, 'https://www.youtube.com/results?search_query=lofi%20beats');

      const resNpm = resolveEngineTarget('@npm electron-builder');
      assert.equal(resNpm.kind, 'search');
      assert.equal(resNpm.engine, 'npm');
      assert.equal(resNpm.url, 'https://www.npmjs.com/search?q=electron-builder');
    });

    test('handles keywords without @ prefix and case-insensitivity', () => {
      const res = resolveEngineTarget('GH react hooks');
      assert.equal(res.kind, 'search');
      assert.equal(res.engine, 'GitHub');
      assert.equal(res.url, 'https://github.com/search?q=react%20hooks');

      const resLower = resolveEngineTarget('w quantum mechanics');
      assert.equal(resLower.kind, 'search');
      assert.equal(resLower.engine, 'Wikipedia');
      assert.equal(resLower.url, 'https://en.wikipedia.org/wiki/Special:Search?search=quantum%20mechanics');
    });

    test('resolves standalone keyword to engine homepage', () => {
      const res = resolveEngineTarget('@gh');
      assert.equal(res.kind, 'url');
      assert.equal(res.url, 'https://github.com/');

      const resYt = resolveEngineTarget('@yt');
      assert.equal(resYt.kind, 'url');
      assert.equal(resYt.url, 'https://www.youtube.com/');
    });

    test('falls back to default engine when no keyword matches', () => {
      const res = resolveEngineTarget('how to bake sourdough bread');
      assert.equal(res.kind, 'search');
      assert.equal(res.engine, 'DuckDuckGo');
      assert.equal(res.url, 'https://duckduckgo.com/?q=how%20to%20bake%20sourdough%20bread');
    });
  });

  describe('Tab Stash Data Engine', () => {
    test('creates and serializes tab stash with metadata', () => {
      const tabList = [
        { url: 'https://github.com/hinterland', title: 'Hinterland GitHub', favicon: 'https://github.com/favicon.ico' },
        { url: 'https://electronjs.org', title: 'Electron Framework', favicon: 'https://electronjs.org/favicon.ico' },
      ];

      const stash = {
        id: 'stash_123',
        title: 'Development Project',
        createdAt: 1700000000000,
        tabs: tabList.map((t) => ({ url: t.url, title: t.title, favicon: t.favicon })),
      };

      assert.equal(stash.id, 'stash_123');
      assert.equal(stash.tabs.length, 2);
      assert.equal(stash.tabs[0].title, 'Hinterland GitHub');
    });

    test('removes tab from stash and cleans up empty stash', () => {
      let stashes = [
        {
          id: 's1',
          title: 'Research',
          tabs: [
            { url: 'https://siteA.com', title: 'Site A' },
            { url: 'https://siteB.com', title: 'Site B' },
          ],
        },
      ];

      // Remove tab at index 0
      stashes[0].tabs.splice(0, 1);
      assert.equal(stashes[0].tabs.length, 1);
      assert.equal(stashes[0].tabs[0].url, 'https://siteB.com');

      // Remove remaining tab -> delete stash
      stashes[0].tabs.splice(0, 1);
      if (stashes[0].tabs.length === 0) {
        stashes = stashes.filter((s) => s.id !== 's1');
      }
      assert.equal(stashes.length, 0);
    });

    test('validates and imports tab stashes from JSON correctly', () => {
      const jsonPayload = JSON.stringify([
        {
          id: 'imported_1',
          title: 'Design Inspiration',
          createdAt: 1690000000000,
          tabs: [
            { url: 'https://dribbble.com', title: 'Dribbble' },
            { url: 'https://behance.net', title: 'Behance' },
          ],
        },
        {
          id: 'invalid_empty',
          title: 'Empty stash',
          tabs: [], // should be rejected or skipped
        },
      ]);

      const parsed = JSON.parse(jsonPayload);
      const valid = parsed
        .filter((s) => s && Array.isArray(s.tabs) && s.tabs.length > 0)
        .map((s) => ({
          id: s.id,
          title: s.title,
          createdAt: s.createdAt,
          tabs: s.tabs.map((t) => ({ url: t.url, title: t.title })),
        }));

      assert.equal(valid.length, 1);
      assert.equal(valid[0].title, 'Design Inspiration');
      assert.equal(valid[0].tabs.length, 2);
    });
  });

  describe('Per-Site Zoom Level Storage', () => {
    test('saves and clears site zoom factors based on hostname', () => {
      const levels = {};

      function saveZoom(url, factor) {
        const host = new URL(url).hostname;
        if (Math.abs(factor - 1) < 0.02) {
          delete levels[host];
        } else {
          levels[host] = factor;
        }
      }

      saveZoom('https://github.com/letward/Hinterland', 1.2);
      assert.equal(levels['github.com'], 1.2);

      saveZoom('https://en.wikipedia.org/wiki/Main_Page', 0.9);
      assert.equal(levels['en.wikipedia.org'], 0.9);

      // Reset github.com to 1.0 -> should remove override
      saveZoom('https://github.com/pulls', 1.0);
      assert.equal(levels['github.com'], undefined);
      assert.equal(levels['en.wikipedia.org'], 0.9);
    });
  });

  describe('Site Permissions Origin Policy', () => {
    const globalDefaults = {
      camera: 'ask',
      microphone: 'ask',
      geolocation: 'ask',
      notifications: 'ask',
      clipboard: 'ask',
    };

    const siteExceptions = {
      'https://meet.google.com': {
        camera: 'allow',
        microphone: 'allow',
      },
      'https://untrusted-site.com': {
        notifications: 'deny',
        geolocation: 'deny',
      },
    };

    function checkPermission(origin, permission) {
      if (origin && siteExceptions[origin] && siteExceptions[origin][permission]) {
        return siteExceptions[origin][permission];
      }
      return globalDefaults[permission] || 'ask';
    }

    test('prefers site exception over global default', () => {
      assert.equal(checkPermission('https://meet.google.com', 'camera'), 'allow');
      assert.equal(checkPermission('https://meet.google.com', 'microphone'), 'allow');
      assert.equal(checkPermission('https://untrusted-site.com', 'notifications'), 'deny');
    });

    test('falls back to global default when site has no override for that permission', () => {
      assert.equal(checkPermission('https://meet.google.com', 'geolocation'), 'ask');
      assert.equal(checkPermission('https://example.com', 'camera'), 'ask');
    });

    test('normalizes complex URL to origin key properly', () => {
      const fullUrl = 'https://meet.google.com:443/call-abc-123?authuser=0#main';
      const parsed = new URL(fullUrl);
      const origin = `${parsed.protocol}//${parsed.host}`;
      assert.equal(origin, 'https://meet.google.com');
      assert.equal(checkPermission(origin, 'camera'), 'allow');
    });
  });
});
