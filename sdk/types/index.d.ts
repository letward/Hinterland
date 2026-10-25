/**
 * TypeScript definitions for @hinterland/extension-sdk
 */

export interface ManifestAction {
  default_title?: string;
  default_popup?: string;
  default_icon?: string | Record<string, string>;
}

export interface ContentScriptDefinition {
  matches: string[];
  js?: string[];
  css?: string[];
  run_at?: 'document_start' | 'document_end' | 'document_idle';
  all_frames?: boolean;
}

export interface ExtensionManifest {
  manifest_version: 3;
  name: string;
  version: string;
  description?: string;
  author?: string;
  icons?: Record<string, string>;
  permissions?: string[];
  host_permissions?: string[];
  action?: ManifestAction;
  background?: {
    service_worker: string;
    type?: 'module';
  };
  content_scripts?: ContentScriptDefinition[];
  content_security_policy?: {
    extension_pages?: string;
  };
  web_accessible_resources?: Array<{
    resources: string[];
    matches: string[];
  }>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export declare const PERMISSION_LEVELS: {
  SAFE: string[];
  SENSITIVE: string[];
  FORBIDDEN: string[];
};

export declare function validateManifest(
  manifest: unknown,
  options?: { strict?: boolean }
): ValidationResult;

export declare function defineManifest(
  config: Omit<ExtensionManifest, 'manifest_version'> & { manifest_version?: 3 }
): ExtensionManifest;

/* ------------------------------------------------------------- Security */

export declare function escapeHtml(str: unknown): string;
export declare function sanitizeHtml(dirty: string): string;
export declare function safeHtml(strings: TemplateStringsArray, ...values: unknown[]): string;
export declare function rawSafeHtml(content: string): { __rawSafeHtml: true; content: string };
export declare function validateOrigin(sender: any, allowedOrigins?: string[]): boolean;
export declare function maskSensitiveText(text: string): string;
export declare function encryptData(plaintext: string, secretKey: string): Promise<string>;
export declare function decryptData(ciphertext: string, secretKey: string): Promise<string>;

export interface SecureStorageOptions {
  namespace?: string;
  encryptionKey?: string;
  area?: 'local' | 'session' | 'memory';
}

export declare class SecureStorage {
  constructor(options?: SecureStorageOptions);
  get<T = any>(key: string, fallback?: T): Promise<T>;
  set(key: string, value: any, options?: { encrypt?: boolean }): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

export declare function createSecureStorage(options?: SecureStorageOptions): SecureStorage;

/* ------------------------------------------------------------ Messaging */

export interface MessageBusOptions {
  allowedOrigins?: string[];
  defaultTimeoutMs?: number;
}

export declare class MessageBus {
  constructor(options?: MessageBusOptions);
  on<T = any, R = any>(
    type: string,
    handler: (payload: T, sender: any) => Promise<R> | R,
    validator?: (payload: T) => boolean | Promise<boolean>
  ): () => void;
  sendToBackground<T = any, R = any>(type: string, payload?: T, options?: { timeoutMs?: number }): Promise<R>;
  sendToTab<T = any, R = any>(tabId: number, type: string, payload?: T, options?: { timeoutMs?: number }): Promise<R>;
  sendToActiveTab<T = any, R = any>(type: string, payload?: T, options?: { timeoutMs?: number }): Promise<R>;
}

export declare function createMessageBus(options?: MessageBusOptions): MessageBus;

/* -------------------------------------------------------------- Content */

export declare class ContentHelper {
  static mountShadowRoot(host: HTMLElement, options?: { mode?: 'open' | 'closed' }): ShadowRoot;
  static injectStyles(cssText: string, target?: Document | ShadowRoot | HTMLElement): () => void;
  static onPageReady(callback: () => void): void;
  static extractSafeArticleText(options?: { selector?: string }): {
    title: string;
    text: string;
    wordCount: number;
    readingTimeMinutes: number;
  };
  static observeDom(
    target: Node,
    callback: MutationCallback,
    options?: MutationObserverInit
  ): () => void;
}

/* ------------------------------------------------------------------- UI */

export declare const HINTERLAND_CSS_VARS: string;
export declare function injectHinterlandTheme(doc?: Document): void;

export declare class Store<T extends object = Record<string, any>> {
  constructor(initialState?: T);
  get<K extends keyof T>(key: K): T[K];
  getState(): T;
  set<K extends keyof T>(key: K, val: T[K]): void;
  set(patch: Partial<T>): void;
  subscribe(listener: (state: T) => void): () => void;
}

export declare function createStore<T extends object = Record<string, any>>(initialState?: T): Store<T>;

export interface ButtonOptions {
  label: string;
  variant?: 'default' | 'primary' | 'danger';
  onClick?: (event: MouseEvent) => void;
}

export interface SwitchOptions {
  label: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

export interface CardOptions {
  title?: string;
  subtitle?: string;
  content?: HTMLElement | HTMLElement[];
}

export interface BadgeOptions {
  text: string;
  status?: 'success' | 'warning' | 'danger' | 'neutral';
}

export declare class UIHelper {
  static createButton(options: ButtonOptions): HTMLButtonElement;
  static createSwitch(options: SwitchOptions): HTMLElement;
  static createCard(options: CardOptions): HTMLDivElement;
  static createBadge(options: BadgeOptions): HTMLSpanElement;
}

/* ------------------------------------------------------------ Extension */

export interface ExtensionConfig {
  id?: string;
  storage?: SecureStorageOptions;
  messaging?: MessageBusOptions;
}

export declare class HinterlandExtension {
  readonly id: string;
  readonly storage: SecureStorage;
  readonly messaging: MessageBus;

  constructor(config?: ExtensionConfig);
  onInstalled(callback: (details: any) => Promise<void> | void): this;
  onStartup(callback: () => Promise<void> | void): this;
  onActionClicked(callback: (tab: any) => Promise<void> | void): this;
  onTabUpdated(callback: (tabId: number, changeInfo: any, tab: any) => void): this;
  onMessage<T = any, R = any>(
    type: string,
    handler: (payload: T, sender: any) => Promise<R> | R,
    validator?: (payload: T) => boolean | Promise<boolean>
  ): this;
}

export declare function createExtension(config?: ExtensionConfig): HinterlandExtension;
