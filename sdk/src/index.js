/**
 * @fileoverview Hinterland Extension SDK
 * Official SDK for building secure, modern extensions for the Hinterland browser.
 */

export {
  PERMISSION_LEVELS,
  validateManifest,
  defineManifest,
} from './manifest.js';

export {
  escapeHtml,
  sanitizeHtml,
  safeHtml,
  rawSafeHtml,
  validateOrigin,
  maskSensitiveText,
  stripTracking,
  encryptData,
  decryptData,
  SecureStorage,
  createSecureStorage,
} from './security.js';

export {
  MessageBus,
  createMessageBus,
} from './messaging.js';

export {
  ContentHelper,
} from './content.js';

export {
  HINTERLAND_CSS_VARS,
  injectHinterlandTheme,
  Store,
  createStore,
  UIHelper,
} from './ui.js';

export {
  HinterlandExtension,
  createExtension,
} from './extension.js';
