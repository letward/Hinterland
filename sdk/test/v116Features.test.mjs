import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stripTracking } from '../src/security.js';

describe('Hinterland v1.16.0 Features', () => {
  describe('stripTracking (Clean Link Stripping)', () => {
    it('strips common UTM tracking parameters', () => {
      const input = 'https://example.com/article?utm_source=twitter&utm_medium=social&utm_campaign=spring2026&id=42';
      const clean = stripTracking(input);
      assert.equal(clean, 'https://example.com/article?id=42');
    });

    it('strips advertising click IDs (gclid, fbclid, msclkid, yclid)', () => {
      const input = 'https://shop.example.org/item?product=123&gclid=xyz123&fbclid=abc456&msclkid=def789&yclid=ghi012';
      const clean = stripTracking(input);
      assert.equal(clean, 'https://shop.example.org/item?product=123');
    });

    it('leaves clean URLs untouched', () => {
      const input = 'https://github.com/letward/Hinterland?tab=readme-ov-file#installation';
      const clean = stripTracking(input);
      assert.equal(clean, input);
    });

    it('gracefully handles invalid URLs without throwing', () => {
      assert.equal(stripTracking('not-a-valid-url'), 'not-a-valid-url');
      assert.equal(stripTracking(''), '');
    });
  });

  describe('Close Tabs Left/Right Preservation Logic', () => {
    const sampleTabs = [
      { id: 'tab-1', pinned: true, title: 'Pinned 1' },
      { id: 'tab-2', pinned: false, title: 'Tab 2' },
      { id: 'tab-3', pinned: false, title: 'Active 3' },
      { id: 'tab-4', pinned: false, title: 'Tab 4' },
      { id: 'tab-5', pinned: true, title: 'Pinned 5' },
      { id: 'tab-6', pinned: false, title: 'Tab 6' },
    ];

    it('determines tabs to close to the right excluding pinned tabs', () => {
      const activeIndex = sampleTabs.findIndex((t) => t.id === 'tab-3');
      const toClose = sampleTabs.slice(activeIndex + 1).filter((t) => !t.pinned);
      const toCloseIds = toClose.map((t) => t.id);

      assert.deepEqual(toCloseIds, ['tab-4', 'tab-6']);
      // pinned tab-5 must NOT be in toClose
      assert.ok(!toCloseIds.includes('tab-5'));
    });

    it('determines tabs to close to the left excluding pinned tabs', () => {
      const activeIndex = sampleTabs.findIndex((t) => t.id === 'tab-3');
      const toClose = sampleTabs.slice(0, activeIndex).filter((t) => !t.pinned);
      const toCloseIds = toClose.map((t) => t.id);

      assert.deepEqual(toCloseIds, ['tab-2']);
      // pinned tab-1 must NOT be in toClose
      assert.ok(!toCloseIds.includes('tab-1'));
    });
  });
});
