/**
 * @fileoverview Hinterland Extension SDK - Safe Message Bus
 * Provides typed, origin-verified communication between background, content scripts, and popups.
 */

import { validateOrigin } from './security.js';

/**
 * Safe, promise-based MessageBus for Hinterland extensions.
 */
export class MessageBus {
  /**
   * @param {object} [options]
   * @param {string[]} [options.allowedOrigins] - Allowed external origins (if any)
   * @param {number} [options.defaultTimeoutMs=5000] - Default message timeout
   */
  constructor(options = {}) {
    this.allowedOrigins = options.allowedOrigins || [];
    this.defaultTimeoutMs = options.defaultTimeoutMs || 5000;
    this.handlers = new Map();
    this.bound = false;

    this._setupListener();
  }

  _setupListener() {
    if (this.bound || typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // 1. Origin verification
      if (!validateOrigin(sender, this.allowedOrigins)) {
        console.warn('[Hinterland MessageBus] Rejected message from unverified sender:', sender);
        return false;
      }

      if (!message || typeof message !== 'object') return false;
      const { type, payload, messageId } = message;
      if (!type || typeof type !== 'string') return false;

      const registration = this.handlers.get(type);
      if (!registration) return false;

      // Execute handler
      (async () => {
        try {
          if (registration.validator) {
            const isValid = await registration.validator(payload);
            if (!isValid) throw new Error(`Payload validation failed for message type "${type}".`);
          }
          const response = await registration.handler(payload, sender);
          sendResponse({ ok: true, messageId, data: response });
        } catch (err) {
          sendResponse({ ok: false, messageId, error: err?.message ?? 'Handler execution failed' });
        }
      })();

      // Return true to keep channel open for async sendResponse
      return true;
    });

    this.bound = true;
  }

  /**
   * Registers a message handler for a specific message type.
   *
   * @param {string} type - Unique message action or type
   * @param {Function} handler - Handler function: (payload, sender) => Promise<*> | *
   * @param {Function} [validator] - Optional payload schema validator: (payload) => boolean
   * @returns {() => void} Unsubscribe function
   */
  on(type, handler, validator = null) {
    if (typeof type !== 'string' || !type) throw new Error('Message type must be a non-empty string.');
    if (typeof handler !== 'function') throw new Error('Message handler must be a function.');

    this.handlers.set(type, { handler, validator });
    return () => {
      if (this.handlers.get(type)?.handler === handler) {
        this.handlers.delete(type);
      }
    };
  }

  /**
   * Sends a message to the background service worker.
   *
   * @param {string} type - Message type
   * @param {*} [payload] - Serializable payload
   * @param {object} [options]
   * @param {number} [options.timeoutMs] - Timeout in milliseconds
   * @returns {Promise<*>} Response data
   */
  async sendToBackground(type, payload = null, options = {}) {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      throw new Error('chrome.runtime.sendMessage is not available in this context.');
    }

    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`[Hinterland MessageBus] Request timed out after ${timeoutMs}ms (type: "${type}")`));
      }, timeoutMs);

      try {
        chrome.runtime.sendMessage({ type, payload, messageId }, (res) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!res) {
            return resolve(undefined);
          }
          if (res.ok) {
            resolve(res.data);
          } else {
            reject(new Error(res.error || 'Message response indicated failure'));
          }
        });
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  /**
   * Sends a message to a content script in a specific tab.
   *
   * @param {number} tabId - Target tab ID
   * @param {string} type - Message type
   * @param {*} [payload] - Payload
   * @param {object} [options]
   * @returns {Promise<*>}
   */
  async sendToTab(tabId, type, payload = null, options = {}) {
    if (typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) {
      throw new Error('chrome.tabs.sendMessage is not available in this context.');
    }

    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`[Hinterland MessageBus] Tab ${tabId} request timed out after ${timeoutMs}ms (type: "${type}")`));
      }, timeoutMs);

      try {
        chrome.tabs.sendMessage(tabId, { type, payload, messageId }, (res) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!res) return resolve(undefined);
          if (res.ok) resolve(res.data);
          else reject(new Error(res.error || 'Message failed'));
        });
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  /**
   * Sends a message to the active tab in the current window.
   *
   * @param {string} type - Message type
   * @param {*} [payload] - Payload
   * @param {object} [options]
   * @returns {Promise<*>}
   */
  async sendToActiveTab(type, payload = null, options = {}) {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
      throw new Error('chrome.tabs.query is not available in this context.');
    }

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      throw new Error('No active tab found.');
    }

    return this.sendToTab(activeTab.id, type, payload, options);
  }
}

/**
 * Creates a configured MessageBus instance.
 *
 * @param {object} [options]
 * @returns {MessageBus}
 */
export function createMessageBus(options = {}) {
  return new MessageBus(options);
}
