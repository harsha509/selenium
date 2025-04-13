'use strict';

import { Symbols } from './symbols';

export enum Browser {
  CHROME = 'chrome',
  EDGE = 'MicrosoftEdge',
  FIREFOX = 'firefox',
  INTERNET_EXPLORER = 'internet explorer',
  SAFARI = 'safari',
}

export enum PageLoadStrategy {
  NONE = 'none',
  EAGER = 'eager',
  NORMAL = 'normal',
}

export enum Platform {
  LINUX = 'linux',
  MAC = 'mac',
  WINDOWS = 'windows',
}

export interface Timeouts {
  script?: number;
  pageLoad?: number;
  implicit?: number;
}

export enum UserPromptHandler {
  ACCEPT = 'accept',
  DISMISS = 'dismiss',
  ACCEPT_AND_NOTIFY = 'accept and notify',
  DISMISS_AND_NOTIFY = 'dismiss and notify',
  IGNORE = 'ignore',
}

export enum Capability {
  ACCEPT_INSECURE_TLS_CERTS = 'acceptInsecureCerts',
  BROWSER_NAME = 'browserName',
  BROWSER_VERSION = 'browserVersion',
  LOGGING_PREFS = 'goog:loggingPrefs',
  PAGE_LOAD_STRATEGY = 'pageLoadStrategy',
  PLATFORM_NAME = 'platformName',
  PROXY = 'proxy',
  SET_WINDOW_RECT = 'setWindowRect',
  TIMEOUTS = 'timeouts',
  UNHANDLED_PROMPT_BEHAVIOR = 'unhandledPromptBehavior',
  STRICT_FILE_INTERACTABILITY = 'strictFileInteractability',
  ENABLE_DOWNLOADS = 'se:downloadsEnabled',
}

function toMap<T>(hash: Record<string, T>): Map<string, T> {
  const m = new Map<string, T>();
  for (const key in hash) {
    if (Object.prototype.hasOwnProperty.call(hash, key)) {
      m.set(key, hash[key]);
    }
  }
  return m;
}

export class Capabilities {
  private readonly map_: Map<string, unknown>;

  constructor(other: Capabilities | Map<string, unknown> | Record<string, unknown> = new Map()) {
    if (other instanceof Capabilities) {
      other = other.map_;
    } else if (other && !(other instanceof Map)) {
      other = toMap(other);
    }
    this.map_ = new Map(other as Map<string, unknown>);
  }

  get size(): number {
    return this.map_.size;
  }

  static chrome(): Capabilities {
    return new Capabilities().setBrowserName(Browser.CHROME);
  }

  static edge(): Capabilities {
    return new Capabilities().setBrowserName(Browser.EDGE);
  }

  static firefox(): Capabilities {
    return new Capabilities().setBrowserName(Browser.FIREFOX).set('moz:debuggerAddress', true);
  }

  static ie(): Capabilities {
    return new Capabilities().setBrowserName(Browser.INTERNET_EXPLORER);
  }

  static safari(): Capabilities {
    return new Capabilities().setBrowserName(Browser.SAFARI);
  }

  [Symbols.serialize](): Record<string, unknown> {
    return serialize(this);
  }

  get<T>(key: string): T | undefined {
    return this.map_.get(key) as T | undefined;
  }

  has(key: string): boolean {
    return this.map_.has(key);
  }

  keys(): IterableIterator<string> {
    return this.map_.keys();
  }

  merge(other: Capabilities | Map<string, unknown> | Record<string, unknown>): Capabilities {
    if (other) {
      let otherMap: Map<string, unknown>;
      if (other instanceof Capabilities) {
        otherMap = other.map_;
      } else if (other instanceof Map) {
        otherMap = other;
      } else {
        otherMap = toMap(other);
      }
      otherMap.forEach((value, key) => {
        this.set(key, value);
      });
      return this;
    } else {
      throw new TypeError('no capabilities provided for merge');
    }
  }

  delete(key: string): void {
    this.map_.delete(key);
  }

  set(key: string, value: unknown): Capabilities {
    if (typeof key !== 'string') {
      throw new TypeError('Capability keys must be strings: ' + typeof key);
    }
    this.map_.set(key, value);
    return this;
  }

  setAcceptInsecureCerts(accept: boolean): Capabilities {
    return this.set(Capability.ACCEPT_INSECURE_TLS_CERTS, accept);
  }

  getAcceptInsecureCerts(): boolean | undefined {
    return this.get<boolean>(Capability.ACCEPT_INSECURE_TLS_CERTS);
  }

  setBrowserName(name: Browser | string): Capabilities {
    return this.set(Capability.BROWSER_NAME, name);
  }

  getBrowserName(): string | undefined {
    return this.get<string>(Capability.BROWSER_NAME);
  }

  setBrowserVersion(version: string): Capabilities {
    return this.set(Capability.BROWSER_VERSION, version);
  }

  getBrowserVersion(): string | undefined {
    return this.get<string>(Capability.BROWSER_VERSION);
  }

  setPageLoadStrategy(strategy: PageLoadStrategy): Capabilities {
    return this.set(Capability.PAGE_LOAD_STRATEGY, strategy);
  }

  getPageLoadStrategy(): string | undefined {
    return this.get<string>(Capability.PAGE_LOAD_STRATEGY);
  }

  setPlatform(platform: Platform | string): Capabilities {
    return this.set(Capability.PLATFORM_NAME, platform);
  }

  getPlatform(): string | undefined {
    return this.get<string>(Capability.PLATFORM_NAME);
  }

  setLoggingPrefs(prefs: unknown): Capabilities {
    return this.set(Capability.LOGGING_PREFS, prefs);
  }

  setProxy(proxy: unknown): Capabilities {
    return this.set(Capability.PROXY, proxy);
  }

  getProxy(): unknown {
    return this.get(Capability.PROXY);
  }

  setAlertBehavior(behavior: UserPromptHandler | undefined): Capabilities {
    return this.set(Capability.UNHANDLED_PROMPT_BEHAVIOR, behavior);
  }

  getAlertBehavior(): UserPromptHandler | undefined {
    return this.get<UserPromptHandler>(Capability.UNHANDLED_PROMPT_BEHAVIOR);
  }

  setStrictFileInteractability(strictFileInteractability: boolean): Capabilities {
    return this.set(Capability.STRICT_FILE_INTERACTABILITY, strictFileInteractability);
  }

  enableDownloads(): Capabilities {
    return this.set(Capability.ENABLE_DOWNLOADS, true);
  }
}

function serialize(caps: Capabilities): Record<string, unknown> {
  const ret: Record<string, unknown> = {};
  for (const key of caps.keys()) {
    const cap = caps.get(key);
    if (cap !== undefined) {
      ret[key] = cap;
    }
  }
  return ret;
}
