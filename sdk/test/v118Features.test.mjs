import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { categorizeTracker, normalizeSiteDomain } from '../../src/main/security.js';

describe('Hinterland v1.18.0 Features', () => {
  describe('Privacy Shield & Tracker Categorization Engine', () => {
    it('categorizes tracking and telemetry URLs accurately', () => {
      assert.equal(categorizeTracker('https://www.google-analytics.com/analytics.js'), 'analytics');
      assert.equal(categorizeTracker('https://stats.wp.com/g/collect?v=2'), 'beacons');
      assert.equal(categorizeTracker('https://connect.facebook.net/signals/config/pixel.js'), 'beacons');
      assert.equal(categorizeTracker('https://adservice.google.com/adserver/telemetry.js'), 'advertising');
      assert.equal(categorizeTracker('https://tracker.example.com/tracking/event'), 'tracking');
    });

    it('normalizes site domains reliably from diverse URI structures', () => {
      assert.equal(normalizeSiteDomain('https://www.example.com/page?query=1'), 'example.com');
      assert.equal(normalizeSiteDomain('http://sub.domain.org:8080/path'), 'sub.domain.org');
      assert.equal(normalizeSiteDomain('WWW.GITHUB.COM'), 'github.com');
      assert.equal(normalizeSiteDomain('   hinterland.de   '), 'hinterland.de');
      assert.equal(normalizeSiteDomain(''), '');
    });

    it('evaluates per-site shield exemption logic', () => {
      let allowedSites = {};

      const isSiteAllowed = (site) => {
        const clean = normalizeSiteDomain(site);
        return Boolean(allowedSites[clean]);
      };

      const toggleShield = (site) => {
        const clean = normalizeSiteDomain(site);
        if (allowedSites[clean]) {
          delete allowedSites[clean];
          return { enabled: true, domain: clean };
        }
        allowedSites[clean] = 'allow';
        return { enabled: false, domain: clean };
      };

      // Initially enabled (not in allowed list)
      assert.equal(isSiteAllowed('example.com'), false);

      // Toggle off (whitelist domain)
      const toggledOff = toggleShield('example.com');
      assert.equal(toggledOff.enabled, false);
      assert.equal(isSiteAllowed('example.com'), true);

      // Toggle back on
      const toggledOn = toggleShield('example.com');
      assert.equal(toggledOn.enabled, true);
      assert.equal(isSiteAllowed('example.com'), false);
    });

    it('aggregates blocked tracker counts and categories per domain', () => {
      const siteTrackerMap = new Map();

      const recordBlock = (initiator, trackerUrl) => {
        const site = normalizeSiteDomain(initiator);
        if (!siteTrackerMap.has(site)) siteTrackerMap.set(site, new Map());
        const siteMap = siteTrackerMap.get(site);
        const trackerHost = new URL(trackerUrl).hostname;
        const category = categorizeTracker(trackerUrl);
        const existing = siteMap.get(trackerHost) || { host: trackerHost, category, count: 0 };
        existing.count += 1;
        siteMap.set(trackerHost, existing);
      };

      recordBlock('https://news.example.com/article', 'https://www.google-analytics.com/analytics.js');
      recordBlock('https://news.example.com/article', 'https://www.google-analytics.com/collect?v=1');
      recordBlock('https://news.example.com/article', 'https://adservice.google.com/adserver/telemetry.js');

      const siteData = siteTrackerMap.get('news.example.com');
      assert.ok(siteData);
      assert.equal(siteData.get('www.google-analytics.com').count, 2);
      assert.equal(siteData.get('www.google-analytics.com').category, 'analytics');
      assert.equal(siteData.get('adservice.google.com').count, 1);
      assert.equal(siteData.get('adservice.google.com').category, 'advertising');
    });
  });

  describe('Site Cookies & Storage Inspector Logic', () => {
    it('normalizes cookie records and builds correct removal target URLs', () => {
      const mockRawCookies = [
        {
          name: 'session_id',
          value: 'secret12345',
          domain: '.example.com',
          path: '/',
          secure: true,
          httpOnly: true,
          sameSite: 'lax',
          session: true,
        },
        {
          name: 'theme',
          value: 'dark',
          domain: 'example.com',
          path: '/app',
          secure: false,
          httpOnly: false,
          session: false,
          expirationDate: 1893456000,
        },
      ];

      const normalizeCookie = (c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        secure: Boolean(c.secure),
        httpOnly: Boolean(c.httpOnly),
        sameSite: c.sameSite || 'unspecified',
        session: Boolean(c.session),
        expirationDate: c.expirationDate ? new Date(c.expirationDate * 1000).toISOString() : 'Session',
      });

      const normalized = mockRawCookies.map(normalizeCookie);

      assert.equal(normalized[0].name, 'session_id');
      assert.equal(normalized[0].expirationDate, 'Session');
      assert.equal(normalized[0].secure, true);
      assert.equal(normalized[0].httpOnly, true);

      assert.equal(normalized[1].name, 'theme');
      assert.equal(normalized[1].secure, false);
      assert.ok(normalized[1].expirationDate.startsWith('2030'));

      // Test deletion target URL construction
      const getRemovalTarget = (c) => {
        const cleanDomain = c.domain.replace(/^\./, '');
        const scheme = c.secure ? 'https' : 'http';
        return `${scheme}://${cleanDomain}${c.path || '/'}`;
      };

      assert.equal(getRemovalTarget(normalized[0]), 'https://example.com/');
      assert.equal(getRemovalTarget(normalized[1]), 'http://example.com/app');
    });

    it('deduplicates cookies across host and domain lookups', () => {
      const urlCookies = [
        { name: 'auth', domain: 'example.com', path: '/' },
        { name: 'pref', domain: 'example.com', path: '/' },
      ];
      const domainCookies = [
        { name: 'auth', domain: 'example.com', path: '/' },
        { name: 'global', domain: '.example.com', path: '/' },
      ];

      const map = new Map();
      for (const c of [...urlCookies, ...domainCookies]) {
        const key = `${c.domain}:${c.path}:${c.name}`;
        if (!map.has(key)) map.set(key, c);
      }

      const deduplicated = [...map.values()];
      assert.equal(deduplicated.length, 3);
      assert.ok(deduplicated.some((c) => c.name === 'auth'));
      assert.ok(deduplicated.some((c) => c.name === 'pref'));
      assert.ok(deduplicated.some((c) => c.name === 'global'));
    });
  });

  describe('Downloads Manager Overhaul & History Persistence', () => {
    it('merges active downloads with stored history without duplicate IDs', () => {
      const activeDownloads = [
        { id: 'd1', filename: 'active.zip', state: 'progressing', receivedBytes: 500, totalBytes: 1000 },
      ];
      const storedHistory = [
        { id: 'd1', filename: 'active.zip', state: 'interrupted', receivedBytes: 200, totalBytes: 1000 },
        { id: 'd2', filename: 'manual.pdf', state: 'completed', receivedBytes: 2048, totalBytes: 2048 },
      ];

      const map = new Map();
      for (const item of storedHistory) map.set(item.id, item);
      for (const item of activeDownloads) map.set(item.id, { ...map.get(item.id), ...item });

      const merged = [...map.values()];
      assert.equal(merged.length, 2);
      const d1 = merged.find((item) => item.id === 'd1');
      assert.equal(d1.state, 'progressing');
      assert.equal(d1.receivedBytes, 500);
    });

    it('filters downloads by status categories and search query', () => {
      const entries = [
        { id: '1', filename: 'setup.exe', url: 'https://example.com/setup.exe', state: 'completed', ok: true },
        { id: '2', filename: 'book.pdf', url: 'https://archive.org/book.pdf', state: 'interrupted', ok: false },
        { id: '3', filename: 'video.mp4', url: 'https://video.org/video.mp4', state: 'progressing', paused: false },
      ];

      const filterBy = (list, filter, query = '') => {
        return list.filter((item) => {
          if (query) {
            const q = query.toLowerCase();
            if (!item.filename.toLowerCase().includes(q) && !item.url.toLowerCase().includes(q)) return false;
          }
          if (filter === 'completed') return item.state === 'completed' || item.ok === true;
          if (filter === 'active') return item.state === 'progressing' || item.paused;
          if (filter === 'failed') return item.state === 'interrupted' || item.state === 'cancelled' || item.ok === false;
          return true;
        });
      };

      assert.equal(filterBy(entries, 'all').length, 3);
      assert.equal(filterBy(entries, 'completed').length, 1);
      assert.equal(filterBy(entries, 'completed')[0].filename, 'setup.exe');
      assert.equal(filterBy(entries, 'active').length, 1);
      assert.equal(filterBy(entries, 'active')[0].filename, 'video.mp4');
      assert.equal(filterBy(entries, 'failed').length, 1);
      assert.equal(filterBy(entries, 'failed')[0].filename, 'book.pdf');

      // Search query
      assert.equal(filterBy(entries, 'all', 'setup').length, 1);
      assert.equal(filterBy(entries, 'all', 'archive.org').length, 1);
      assert.equal(filterBy(entries, 'all', 'nonexistent').length, 0);
    });

    it('caps persisted download history at 200 entries and orders by recency', () => {
      let history = [];
      const record = (entry) => {
        const index = history.findIndex((it) => it.id === entry.id);
        if (index !== -1) history[index] = { ...history[index], ...entry };
        else history.unshift(entry);
        if (history.length > 200) history.length = 200;
      };

      for (let i = 0; i < 250; i += 1) {
        record({ id: `item_${i}`, filename: `file_${i}.txt`, timestamp: i });
      }

      assert.equal(history.length, 200);
      assert.equal(history[0].id, 'item_249');
      assert.equal(history[199].id, 'item_50');
    });
  });
});
