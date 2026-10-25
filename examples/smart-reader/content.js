/**
 * Smart Reading Companion - Content Script
 * Safely calculates reading time and displays a discrete, encapsulated HUD badge.
 */

(function init() {
  const BADGE_HOST_ID = 'hinterland-smart-reader-host';

  function calculateReadingStats() {
    const candidate = document.querySelector('article, main, [role="main"], .post-content, body');
    if (!candidate) return { words: 0, minutes: 0 };

    const clone = candidate.cloneNode(true);
    // Strip sensitive and interactive elements
    const ignored = clone.querySelectorAll('script, style, noscript, form, input, textarea, select, button, iframe');
    for (const el of ignored) el.remove();

    const text = clone.textContent.replace(/\s+/g, ' ').trim();
    const words = text ? text.split(/\s+/).length : 0;
    const minutes = Math.max(1, Math.ceil(words / 225));
    return { words, minutes };
  }

  function mountReaderHud(stats) {
    if (document.getElementById(BADGE_HOST_ID)) return;
    if (stats.words < 80) return; // Don't show badge on tiny or non-article pages

    const host = document.createElement('div');
    host.id = BADGE_HOST_ID;
    host.style.cssText = 'all: initial; position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;';

    // Mount Shadow DOM in closed mode to isolate styles from the page
    const shadow = host.attachShadow({ mode: 'closed' });

    const container = document.createElement('div');
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: #181b22;
      color: #e6edf3;
      border: 1px solid #2d3340;
      border-radius: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      cursor: pointer;
      user-select: none;
      transition: transform 0.2s ease, opacity 0.2s ease;
    `;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', '#388bfd');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '10');

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '12 6 12 12 16 14');
    svg.append(circle, polyline);

    const textSpan = document.createElement('span');
    textSpan.textContent = `${stats.minutes} min read`;

    const countSpan = document.createElement('span');
    countSpan.style.cssText = 'color: #8b949e; font-size: 11px;';
    countSpan.textContent = `(${stats.words.toLocaleString()} words)`;

    container.append(svg, textSpan, countSpan);

    container.addEventListener('mouseenter', () => {
      container.style.transform = 'translateY(-2px)';
    });
    container.addEventListener('mouseleave', () => {
      container.style.transform = 'translateY(0)';
    });

    // Record read metric on click
    let recorded = false;
    container.addEventListener('click', () => {
      if (!recorded) {
        recorded = true;
        chrome.runtime.sendMessage({ type: 'RECORD_ARTICLE_READ', payload: { words: stats.words } });
        container.style.borderColor = '#3fb950';
      }
    });

    shadow.appendChild(container);
    document.documentElement.appendChild(host);
  }

  // Run on page idle
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    const stats = calculateReadingStats();
    mountReaderHud(stats);
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      const stats = calculateReadingStats();
      mountReaderHud(stats);
    });
  }

  // Handle runtime messages
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'CONFIG_UPDATED') {
      const host = document.getElementById(BADGE_HOST_ID);
      if (host) {
        host.style.display = message.config?.enabled === false ? 'none' : 'block';
      }
    }
  });
})();
