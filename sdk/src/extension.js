/**
 * @fileoverview Hinterland Extension SDK - Extension Orchestrator
 * High-level lifecycle orchestrator for Hinterland background service workers.
 */

import { createSecureStorage } from './security.js';
import { createMessageBus } from './messaging.js';

export class HinterlandExtension {
  /**
   * @param {object} [config]
   * @param {string} [config.id] - Optional extension identifier
   * @param {object} [config.storage] - Storage options passed to createSecureStorage
   * @param {object} [config.messaging] - Messaging options passed to createMessageBus
   */
  constructor(config = {}) {
    this.id = config.id || (typeof chrome !== 'undefined' ? chrome.runtime?.id : 'hinterland_ext');
    this.storage = createSecureStorage({
      namespace: config.id || 'ext',
      ...(config.storage || {}),
    });
    this.messaging = createMessageBus(config.messaging || {});
  }

  /**
   * Registers a listener for extension installation or update.
   *
   * @param {(details: chrome.runtime.InstalledDetails) => Promise<void>|void} callback
   */
  onInstalled(callback) {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
      chrome.runtime.onInstalled.addListener(callback);
    }
    return this;
  }

  /**
   * Registers a listener for browser profile startup.
   *
   * @param {() => Promise<void>|void} callback
   */
  onStartup(callback) {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onStartup) {
      chrome.runtime.onStartup.addListener(callback);
    }
    return this;
  }

  /**
   * Registers a click handler for the extension's browser action button.
   *
   * @param {(tab: chrome.tabs.Tab) => Promise<void>|void} callback
   */
  onActionClicked(callback) {
    if (typeof chrome !== 'undefined' && chrome.action?.onClicked) {
      chrome.action.onClicked.addListener(callback);
    }
    return this;
  }

  /**
   * Registers a listener for tab status or URL changes.
   *
   * @param {(tabId: number, changeInfo: object, tab: chrome.tabs.Tab) => void} callback
   */
  onTabUpdated(callback) {
    if (typeof chrome !== 'undefined' && chrome.tabs?.onUpdated) {
      chrome.tabs.onUpdated.addListener(callback);
    }
    return this;
  }

  /**
   * Shorthand to register a typed message handler on the message bus.
   *
   * @param {string} type - Message type
   * @param {Function} handler - Message handler
   * @param {Function} [validator] - Optional schema validator
   */
  onMessage(type, handler, validator = null) {
    this.messaging.on(type, handler, validator);
    return this;
  }
}

/**
 * Creates and configures a Hinterland extension background orchestrator.
 *
 * @param {object} [config]
 * @returns {HinterlandExtension}
 */
export function createExtension(config = {}) {
  return new HinterlandExtension(config);
}
