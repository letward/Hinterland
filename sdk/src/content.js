/**
 * @fileoverview Hinterland Extension SDK - Safe Content Script Toolkit
 * Shadow DOM encapsulation, safe text extraction, and isolated DOM manipulation.
 */

export class ContentHelper {
  /**
   * Mounts an encapsulated ShadowRoot on a host element to isolate extension UI
   * from the host page. Protects extension elements from page scripts and CSS.
   *
   * @param {HTMLElement} host - Host DOM element
   * @param {object} [options]
   * @param {'open'|'closed'} [options.mode='closed'] - Shadow root mode
   * @returns {ShadowRoot} The mounted ShadowRoot
   */
  static mountShadowRoot(host, options = {}) {
    if (!host || typeof host.attachShadow !== 'function') {
      throw new Error('Host must be a valid HTMLElement that supports attachShadow.');
    }
    const mode = options.mode || 'closed';
    return host.attachShadow({ mode });
  }

  /**
   * Injects CSS styles into a document head or ShadowRoot safely.
   *
   * @param {string} cssText - CSS rules
   * @param {Document|ShadowRoot|HTMLElement} [target=document.head] - Target root
   * @returns {() => void} Cleanup function to remove injected styles
   */
  static injectStyles(cssText, target = document.head) {
    if (!target) return () => {};
    const style = document.createElement('style');
    style.setAttribute('data-hinterland-ext', 'true');
    style.textContent = cssText;
    target.appendChild(style);
    return () => style.remove();
  }

  /**
   * Waits for DOM readiness safely.
   *
   * @param {Function} callback - Function executed when DOM is interactive/ready
   */
  static onPageReady(callback) {
    if (typeof document === 'undefined') return;
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
      callback();
    } else {
      document.addEventListener('DOMContentLoaded', () => callback(), { once: true });
    }
  }

  /**
   * Extracts readable text from the document while strictly ignoring sensitive inputs,
   * passwords, form controls, and hidden fields to guarantee user data privacy.
   *
   * @param {object} [options]
   * @param {string} [options.selector='article, main, .content, #content, body'] - Candidate content selectors
   * @returns {{ title: string, text: string, wordCount: number, readingTimeMinutes: number }}
   */
  static extractSafeArticleText(options = {}) {
    if (typeof document === 'undefined') {
      return { title: '', text: '', wordCount: 0, readingTimeMinutes: 0 };
    }

    const title = document.title || '';
    const selector = options.selector || 'article, main, [role="main"], .content, #content, body';
    const root = document.querySelector(selector) || document.body;
    if (!root) return { title, text: '', wordCount: 0, readingTimeMinutes: 0 };

    // Clone element to avoid modifying the active DOM
    const clone = root.cloneNode(true);

    // Remove scripts, styles, forms, and sensitive input controls
    const forbiddenSelectors = [
      'script',
      'style',
      'noscript',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'textarea',
      'select',
      'button',
      '[type="password"]',
      '[autocomplete*="cc-"]',
      '[data-private]',
      '[aria-hidden="true"]',
    ];

    for (const sel of forbiddenSelectors) {
      for (const el of clone.querySelectorAll(sel)) {
        el.remove();
      }
    }

    const rawText = clone.textContent || '';
    const cleanText = rawText.replace(/\s+/g, ' ').trim();
    const words = cleanText ? cleanText.split(/\s+/).length : 0;
    const readingTimeMinutes = Math.max(1, Math.ceil(words / 200));

    return {
      title,
      text: cleanText,
      wordCount: words,
      readingTimeMinutes,
    };
  }

  /**
   * Observes DOM mutations with automatic cleanup.
   *
   * @param {Node} target - Node to observe
   * @param {MutationCallback} callback - Mutation handler
   * @param {MutationObserverInit} [options] - Mutation options
   * @returns {() => void} Disconnect function
   */
  static observeDom(target, callback, options = { childList: true, subtree: true }) {
    if (typeof MutationObserver === 'undefined' || !target) return () => {};
    const observer = new MutationObserver(callback);
    observer.observe(target, options);
    return () => observer.disconnect();
  }

  /**
   * Registers a handler for the Hinterland extension action toolbar trigger.
   *
   * @param {string} [extensionId] - Optional extension ID to filter events
   * @param {(detail: object) => void} callback - Handler called when action button is triggered
   * @returns {() => void} Cleanup function to remove event listener
   */
  static onExtensionAction(extensionId, callback) {
    if (typeof window === 'undefined') return () => {};
    const handler = (event) => {
      const detail = event?.detail;
      if (!extensionId || detail?.extensionId?.toLowerCase() === String(extensionId).toLowerCase()) {
        callback(detail);
      }
    };
    window.addEventListener('hinterland:extension-action', handler);
    return () => window.removeEventListener('hinterland:extension-action', handler);
  }
}
