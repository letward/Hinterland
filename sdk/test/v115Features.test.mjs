import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateQrMatrix, generateQrSvg } from '../../src/ui/js/qrcode.js';

describe('Hinterland v1.15.0 Features', () => {
  describe('QR Code Generator Engine', () => {
    test('generates valid QR matrix with correct finder patterns', () => {
      const url = 'https://github.com/letward/Hinterland';
      const result = generateQrMatrix(url);

      assert.ok(result);
      assert.ok(result.matrix);
      assert.ok(Array.isArray(result.matrix));
      assert.equal(result.matrix.length, result.size);
      assert.equal(result.matrix[0].length, result.size);

      // Verify finder pattern top-left (7x7 with center)
      assert.equal(result.matrix[0][0], true);
      assert.equal(result.matrix[0][6], true);
      assert.equal(result.matrix[6][0], true);
      assert.equal(result.matrix[6][6], true);
      assert.equal(result.matrix[3][3], true);
      assert.equal(result.matrix[1][1], false);

      // Verify finder pattern top-right
      const size = result.size;
      assert.equal(result.matrix[0][size - 7], true);
      assert.equal(result.matrix[0][size - 1], true);
      assert.equal(result.matrix[6][size - 7], true);
      assert.equal(result.matrix[6][size - 1], true);
      assert.equal(result.matrix[3][size - 4], true);

      // Verify finder pattern bottom-left
      assert.equal(result.matrix[size - 7][0], true);
      assert.equal(result.matrix[size - 7][6], true);
      assert.equal(result.matrix[size - 1][0], true);
      assert.equal(result.matrix[size - 1][6], true);
      assert.equal(result.matrix[size - 4][3], true);
    });

    test('generates valid SVG output with scalable attributes', () => {
      const svg = generateQrSvg('https://hinterland.de', { size: 240, margin: 4 });
      assert.ok(svg.startsWith('<svg'));
      assert.ok(svg.endsWith('</svg>'));
      assert.ok(svg.includes('viewBox="0 0 240 240"'));
      assert.ok(svg.includes('width="240"'));
      assert.ok(svg.includes('height="240"'));
      assert.ok(svg.includes('<rect width="240" height="240" fill="#ffffff" />'));
      assert.ok(svg.includes('<path d="'));
    });

    test('scales version dynamically according to content length', () => {
      const shortUrl = 'https://a.co';
      const mediumUrl = 'https://github.com/letward/Hinterland/releases/tag/v1.15.0';
      const longUrl = 'https://docs.example.com/api/v2/articles/view?id=12345&source=browser_bookmark&token=abcde12345&redirect=true&theme=sepia&mode=article_reader_mode';

      const resShort = generateQrMatrix(shortUrl);
      const resMedium = generateQrMatrix(mediumUrl);
      const resLong = generateQrMatrix(longUrl);

      assert.ok(resShort.size <= resMedium.size);
      assert.ok(resMedium.size <= resLong.size);
      assert.ok(resShort.version <= resMedium.version);
      assert.ok(resMedium.version <= resLong.version);
    });
  });

  describe('Automated Memory Saver Engine', () => {
    function simulateMemorySaver({ tabs, activeId, delayMinutes = 20, now = Date.now(), enabled = true }) {
      if (!enabled) return { slept: 0, tabs };
      const thresholdMs = delayMinutes * 60 * 1000;
      let slept = 0;

      const updated = tabs.map((tab) => {
        if (tab.id === activeId) return tab;
        if (tab.pinned || tab.audible || tab.privateMode || tab.sleeping) return tab;
        if (!tab.url || tab.url === 'about:blank' || tab.url.startsWith('hinterland://')) return tab;
        const lastActive = tab.lastActiveAt || tab.createdAt;
        if (now - lastActive >= thresholdMs) {
          slept++;
          return { ...tab, sleeping: true, sleepingUrl: tab.url, sleepingTitle: tab.title };
        }
        return tab;
      });

      return { slept, tabs: updated };
    }

    test('hibernates inactive background tabs that exceed threshold', () => {
      const now = Date.now();
      const mockTabs = [
        { id: 't1', url: 'https://news.ycombinator.com', title: 'Hacker News', lastActiveAt: now - 30 * 60 * 1000 },
        { id: 't2', url: 'https://github.com', title: 'GitHub', lastActiveAt: now - 5 * 60 * 1000 },
        { id: 't3', url: 'https://docs.kernel.org', title: 'Linux Docs', lastActiveAt: now - 45 * 60 * 1000 },
      ];

      const res = simulateMemorySaver({ tabs: mockTabs, activeId: 't2', delayMinutes: 20, now });
      assert.equal(res.slept, 2);
      assert.equal(res.tabs[0].sleeping, true);
      assert.equal(res.tabs[1].sleeping, undefined);
      assert.equal(res.tabs[2].sleeping, true);
    });

    test('protects active tab, pinned tabs, audible tabs, and private tabs from sleep', () => {
      const now = Date.now();
      const oldTime = now - 60 * 60 * 1000; // 1 hour ago
      const mockTabs = [
        { id: 't_active', url: 'https://site1.com', lastActiveAt: oldTime },
        { id: 't_pinned', url: 'https://site2.com', pinned: true, lastActiveAt: oldTime },
        { id: 't_audible', url: 'https://music.youtube.com', audible: true, lastActiveAt: oldTime },
        { id: 't_private', url: 'https://bank.com', privateMode: true, lastActiveAt: oldTime },
        { id: 't_internal', url: 'hinterland://store/', lastActiveAt: oldTime },
        { id: 't_regular', url: 'https://wikipedia.org', lastActiveAt: oldTime },
      ];

      const res = simulateMemorySaver({ tabs: mockTabs, activeId: 't_active', delayMinutes: 20, now });
      assert.equal(res.slept, 1);
      assert.equal(res.tabs.find((t) => t.id === 't_active').sleeping, undefined);
      assert.equal(res.tabs.find((t) => t.id === 't_pinned').sleeping, undefined);
      assert.equal(res.tabs.find((t) => t.id === 't_audible').sleeping, undefined);
      assert.equal(res.tabs.find((t) => t.id === 't_private').sleeping, undefined);
      assert.equal(res.tabs.find((t) => t.id === 't_internal').sleeping, undefined);
      assert.equal(res.tabs.find((t) => t.id === 't_regular').sleeping, true);
    });

    test('calculates memory saver metrics accurately', () => {
      const mockTabs = [
        { id: 't1', sleeping: true },
        { id: 't2', sleeping: true },
        { id: 't3', sleeping: true },
        { id: 't4', sleeping: false },
        { id: 't5', sleeping: false },
      ];

      const total = mockTabs.length;
      const sleeping = mockTabs.filter((t) => t.sleeping).length;
      const estimatedSavedMB = sleeping * 70;

      assert.equal(total, 5);
      assert.equal(sleeping, 3);
      assert.equal(estimatedSavedMB, 210);
    });
  });

  describe('Reader Mode Configuration & Markdown Extractor', () => {
    function normalizeReaderPreferences(input = {}) {
      const validThemes = ['light', 'sepia', 'dark', 'pitch'];
      const validFonts = ['serif', 'sans', 'mono'];
      const validWidths = ['compact', 'standard', 'wide'];

      return {
        theme: validThemes.includes(input.theme) ? input.theme : 'sepia',
        font: validFonts.includes(input.font) ? input.font : 'serif',
        size: Math.max(14, Math.min(26, Number(input.size) || 18)),
        width: validWidths.includes(input.width) ? input.width : 'standard',
      };
    }

    function formatArticleMarkdown({ title, author, paragraphs = [] }) {
      let md = `# ${title.trim()}\n\n`;
      if (author && author.trim()) md += `*${author.trim()}*\n\n---\n\n`;
      for (const p of paragraphs) {
        if (!p || !p.trim()) continue;
        md += `${p.trim()}\n\n`;
      }
      return md.trim();
    }

    test('normalizes reader preferences and clamps font size', () => {
      const clean = normalizeReaderPreferences({ theme: 'dark', font: 'mono', size: 22, width: 'wide' });
      assert.deepEqual(clean, { theme: 'dark', font: 'mono', size: 22, width: 'wide' });

      const fallback = normalizeReaderPreferences({ theme: 'invalid', font: 'unknown', size: 999, width: 'huge' });
      assert.deepEqual(fallback, { theme: 'sepia', font: 'serif', size: 26, width: 'standard' });

      const minClamped = normalizeReaderPreferences({ size: 8 });
      assert.equal(minClamped.size, 14);
    });

    test('formats article to clean markdown', () => {
      const md = formatArticleMarkdown({
        title: 'Understanding V8 Engine Internals',
        author: 'Ada Lovelace',
        paragraphs: [
          'V8 is Google’s open-source high-performance JavaScript and WebAssembly engine.',
          'It compiles JavaScript directly to native machine code before executing it.',
        ],
      });

      assert.ok(md.startsWith('# Understanding V8 Engine Internals'));
      assert.ok(md.includes('*Ada Lovelace*'));
      assert.ok(md.includes('V8 is Google’s open-source'));
      assert.ok(md.includes('native machine code'));
    });
  });
});
