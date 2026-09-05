// Licensed to the Software Freedom Conservancy (SFC) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The SFC licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

/**
 * @fileoverview Defines types related to describing the capabilities of a
 * WebDriver session.
 */

import * as Symbols from './symbols'

/**
 * Recognized browser names.
 */
export const Browser = {
  CHROME: 'chrome',
  EDGE: 'MicrosoftEdge',
  FIREFOX: 'firefox',
  INTERNET_EXPLORER: 'internet explorer',
  SAFARI: 'safari',
} as const

export type Browser = (typeof Browser)[keyof typeof Browser]

/**
 * Strategies for waiting for [document readiness] after a navigation
 * event.
 *
 * [document readiness]: https://html.spec.whatwg.org/#current-document-readiness
 */
export const PageLoadStrategy = {
  /**
   * Indicates WebDriver should not wait on the document readiness state after a
   * navigation event.
   */
  NONE: 'none',

  /**
   * Indicates WebDriver should wait for the document readiness state to
   * become "interactive" after navigation.
   */
  EAGER: 'eager',

  /**
   * Indicates WebDriver should wait for the document readiness state to
   * be "complete" after navigation. This is the default page loading strategy.
   */
  NORMAL: 'normal',
} as const

export type PageLoadStrategy = (typeof PageLoadStrategy)[keyof typeof PageLoadStrategy]

/**
 * Common platform names. These platforms are not explicitly defined by the
 * WebDriver spec, however, their use is encouraged for interoperability.
 *
 * @see <https://w3c.github.io/webdriver/webdriver-spec.html>
 */
export const Platform = {
  LINUX: 'linux',
  MAC: 'mac',
  WINDOWS: 'windows',
} as const

export type Platform = (typeof Platform)[keyof typeof Platform]

/**
 * Record object defining the timeouts that apply to certain WebDriver actions.
 */
export interface Timeouts {
  /**
   * Defines when, in milliseconds, to interrupt a script that is being
   * {@linkplain ./webdriver.IWebDriver#executeScript evaluated}.
   */
  script: number

  /**
   * The timeout, in milliseconds, to apply to navigation events along with the
   * {@link PageLoadStrategy}.
   */
  pageLoad: number

  /**
   * The maximum amount of time, in milliseconds, to spend attempting to
   * {@linkplain ./webdriver.IWebDriver#findElement locate} an element on the
   * current page.
   */
  implicit: number
}

/** Runtime placeholder so `Timeouts` stays an export; the shape is the interface above. */
export function Timeouts(): void {}

/**
 * The possible default actions a WebDriver session can take to respond to
 * unhandled user prompts (`window.alert()`, `window.confirm()`, and
 * `window.prompt()`).
 */
export const UserPromptHandler = {
  /** All prompts should be silently accepted. */
  ACCEPT: 'accept',
  /** All prompts should be silently dismissed. */
  DISMISS: 'dismiss',
  /**
   * All prompts should be automatically accepted, but an error should be
   * returned to the next (or currently executing) WebDriver command.
   */
  ACCEPT_AND_NOTIFY: 'accept and notify',
  /**
   * All prompts should be automatically dismissed, but an error should be
   * returned to the next (or currently executing) WebDriver command.
   */
  DISMISS_AND_NOTIFY: 'dismiss and notify',
  /** All prompts should be left unhandled. */
  IGNORE: 'ignore',
} as const

export type UserPromptHandler = (typeof UserPromptHandler)[keyof typeof UserPromptHandler]

/**
 * The standard WebDriver capability keys.
 *
 * @see <https://w3c.github.io/webdriver/webdriver-spec.html#capabilities>
 */
export const Capability = {
  /**
   * Indicates whether a WebDriver session implicitly trusts otherwise untrusted
   * and self-signed TLS certificates during navigation.
   */
  ACCEPT_INSECURE_TLS_CERTS: 'acceptInsecureCerts',

  /**
   * The browser name. Common browser names are defined in the
   * {@link ./capabilities.Browser Browser} enum.
   */
  BROWSER_NAME: 'browserName',

  /** Identifies the browser version. */
  BROWSER_VERSION: 'browserVersion',

  /**
   * Key for the logging driver logging preferences.
   * The browser name. Common browser names are defined in the
   * {@link ./capabilities.Browser Browser} enum.
   */
  LOGGING_PREFS: 'goog:loggingPrefs',

  /**
   * Defines the session's
   * {@linkplain ./capabilities.PageLoadStrategy page loading strategy}.
   */
  PAGE_LOAD_STRATEGY: 'pageLoadStrategy',

  /**
   * Identifies the operating system of the endpoint node. Common values
   * recognized by the most WebDriver server implementations are predefined in
   * the {@link ./capabilities.Platform Platform} enum.
   */
  PLATFORM_NAME: 'platformName',

  /**
   * Describes the proxy configuration to use for a new WebDriver session.
   */
  PROXY: 'proxy',

  /**
   * Indicates whether the remote end supports all of the window resizing and
   * positioning commands:
   *
   * -  {@linkplain ./webdriver.Window#getRect Window.getRect()}
   * -  {@linkplain ./webdriver.Window#setRect Window.setRect()}
   * -  {@linkplain ./webdriver.Window#maximize Window.maximize()}
   * -  {@linkplain ./webdriver.Window#minimize Window.minimize()}
   * -  {@linkplain ./webdriver.Window#fullscreen Window.fullscreen()}
   */
  SET_WINDOW_RECT: 'setWindowRect',

  /**
   * Describes the {@linkplain ./capabilities.Timeouts timeouts} imposed on
   * certain session operations.
   */
  TIMEOUTS: 'timeouts',

  /**
   * Defines how a WebDriver session should
   * {@linkplain ./capabilities.UserPromptHandler respond} to unhandled user
   * prompts.
   */
  UNHANDLED_PROMPT_BEHAVIOR: 'unhandledPromptBehavior',

  /**
   * Defines the current session’s strict file interactability.
   * Used to upload a file when strict file interactability is on
   */
  STRICT_FILE_INTERACTABILITY: 'strictFileInteractability',

  ENABLE_DOWNLOADS: 'se:downloadsEnabled',
} as const

export type Capability = (typeof Capability)[keyof typeof Capability]

/** Anything a {@link Capabilities} instance can be built from or merged with. */
export type CapabilitiesLike = Capabilities | Map<string, unknown> | Record<string, unknown>

/**
 * Converts a generic hash object to a map.
 * @param hash The hash object.
 * @return The converted map.
 */
function toMap(hash: Record<string, unknown>): Map<string, unknown> {
  const m = new Map<string, unknown>()
  for (const key in hash) {
    if (Object.prototype.hasOwnProperty.call(hash, key)) {
      m.set(key, hash[key])
    }
  }
  return m
}

/**
 * Describes a set of capabilities for a WebDriver session.
 */
export class Capabilities {
  /** Backing store; read directly by webdriver/index/bidi_connection and by test fakes. */
  readonly map_: Map<string, unknown>

  /**
   * @param other Another set of capabilities to initialize this instance from.
   */
  constructor(other?: CapabilitiesLike) {
    if (other instanceof Capabilities) {
      other = other.map_
    } else if (other && !(other instanceof Map)) {
      other = toMap(other)
    }
    this.map_ = new Map(other)
  }

  /** @return The number of capabilities set. */
  get size(): number {
    return this.map_.size
  }

  /**
   * @return A basic set of capabilities for Chrome.
   */
  static chrome(): Capabilities {
    return new Capabilities().setBrowserName(Browser.CHROME)
  }

  /**
   * @return A basic set of capabilities for Microsoft Edge.
   */
  static edge(): Capabilities {
    return new Capabilities().setBrowserName(Browser.EDGE)
  }

  /**
   * @return A basic set of capabilities for Firefox.
   */
  static firefox(): Capabilities {
    return new Capabilities().setBrowserName(Browser.FIREFOX).set('moz:debuggerAddress', true)
  }

  /**
   * @return A basic set of capabilities for Internet Explorer.
   */
  static ie(): Capabilities {
    return new Capabilities().setBrowserName(Browser.INTERNET_EXPLORER)
  }

  /**
   * @return A basic set of capabilities for Safari.
   */
  static safari(): Capabilities {
    return new Capabilities().setBrowserName(Browser.SAFARI)
  }

  /**
   * @return The JSON representation of this instance.
   *     Note, the returned object may contain nested promised values.
   */
  [Symbols.serialize](): Record<string, unknown> {
    return serialize(this)
  }

  /**
   * Returns a stored value; the caller asserts its type, as with Closure's
   * `@template T`.
   * @param key the parameter key to get.
   * @return the stored parameter value.
   */
  get<T = unknown>(key: string): T {
    return this.map_.get(key) as T
  }

  /**
   * @param key the key to test.
   * @return whether this capability set has the specified key.
   */
  has(key: string): boolean {
    return this.map_.has(key)
  }

  /**
   * @return an iterator of the keys set.
   */
  keys(): IterableIterator<string> {
    return this.map_.keys()
  }

  /**
   * Merges another set of capabilities into this instance.
   * @param other The other set of capabilities to merge.
   * @return A self reference.
   */
  merge(other: CapabilitiesLike): this {
    if (other) {
      let otherMap: Map<string, unknown>
      if (other instanceof Capabilities) {
        otherMap = other.map_
      } else if (other instanceof Map) {
        otherMap = other
      } else {
        otherMap = toMap(other)
      }
      otherMap.forEach((value, key) => {
        this.set(key, value)
      })
      return this
    } else {
      throw new TypeError('no capabilities provided for merge')
    }
  }

  /**
   * Deletes an entry from this set of capabilities.
   *
   * @param key the capability key to delete.
   */
  delete(key: string): void {
    this.map_.delete(key)
  }

  /**
   * @param key The capability key.
   * @param value The capability value.
   * @return A self reference.
   * @throws {TypeError} If the `key` is not a string.
   */
  set(key: string, value: unknown): this {
    if (typeof key !== 'string') {
      throw new TypeError('Capability keys must be strings: ' + typeof key)
    }
    this.map_.set(key, value)
    return this
  }

  /**
   * Sets whether a WebDriver session should implicitly accept self-signed, or
   * other untrusted TLS certificates on navigation.
   *
   * @param accept whether to accept insecure certs.
   * @return a self reference.
   */
  setAcceptInsecureCerts(accept: boolean): this {
    return this.set(Capability.ACCEPT_INSECURE_TLS_CERTS, accept)
  }

  /**
   * @return whether the session is configured to accept insecure
   *     TLS certificates.
   */
  getAcceptInsecureCerts(): boolean | undefined {
    return this.get<boolean | undefined>(Capability.ACCEPT_INSECURE_TLS_CERTS)
  }

  /**
   * Sets the name of the target browser.
   *
   * @param name the browser name.
   * @return a self reference.
   */
  setBrowserName(name: string): this {
    return this.set(Capability.BROWSER_NAME, name)
  }

  /**
   * @return the configured browser name, or undefined if not set.
   */
  getBrowserName(): string | undefined {
    return this.get<string | undefined>(Capability.BROWSER_NAME)
  }

  /**
   * Sets the desired version of the target browser.
   *
   * @param version the desired version.
   * @return a self reference.
   */
  setBrowserVersion(version: string): this {
    return this.set(Capability.BROWSER_VERSION, version)
  }

  /**
   * @return the configured browser version, or undefined if not set.
   */
  getBrowserVersion(): string | undefined {
    return this.get<string | undefined>(Capability.BROWSER_VERSION)
  }

  /**
   * Sets the desired page loading strategy for a new WebDriver session.
   *
   * @param strategy the desired strategy.
   * @return a self reference.
   */
  setPageLoadStrategy(strategy: PageLoadStrategy): this {
    return this.set(Capability.PAGE_LOAD_STRATEGY, strategy)
  }

  /**
   * Returns the configured page load strategy.
   *
   * @return the page load strategy.
   */
  getPageLoadStrategy(): string | undefined {
    return this.get<string | undefined>(Capability.PAGE_LOAD_STRATEGY)
  }

  /**
   * Sets the target platform.
   *
   * @param platform the target platform.
   * @return a self reference.
   */
  setPlatform(platform: string): this {
    return this.set(Capability.PLATFORM_NAME, platform)
  }

  /**
   * @return the configured platform or undefined if not set.
   */
  getPlatform(): string | undefined {
    return this.get<string | undefined>(Capability.PLATFORM_NAME)
  }

  /**
   * Sets the logging preferences. Preferences may be specified as a
   * {@link ./logging.Preferences} instance, or as a map of log-type to
   * log-level.
   * @param prefs The logging preferences.
   * @return A self reference.
   */
  setLoggingPrefs(prefs: object): this {
    return this.set(Capability.LOGGING_PREFS, prefs)
  }

  /**
   * Sets the proxy configuration for this instance.
   * @param proxy The desired proxy configuration.
   * @return A self reference.
   */
  setProxy(proxy: object): this {
    return this.set(Capability.PROXY, proxy)
  }

  /**
   * @return the configured proxy settings, or undefined if not set.
   */
  getProxy(): object | undefined {
    return this.get<object | undefined>(Capability.PROXY)
  }

  /**
   * Sets the default action to take with an unexpected alert before returning
   * an error. If unspecified, WebDriver will default to
   * {@link UserPromptHandler.DISMISS_AND_NOTIFY}.
   *
   * @param behavior The way WebDriver should respond to unhandled user prompts.
   * @return A self reference.
   */
  setAlertBehavior(behavior: UserPromptHandler | null): this {
    return this.set(Capability.UNHANDLED_PROMPT_BEHAVIOR, behavior)
  }

  /**
   * @return the behavior pattern for responding to unhandled user prompts, or
   *     undefined if not set.
   */
  getAlertBehavior(): UserPromptHandler | undefined {
    return this.get<UserPromptHandler | undefined>(Capability.UNHANDLED_PROMPT_BEHAVIOR)
  }

  /**
   * Sets the boolean flag configuration for this instance.
   */
  setStrictFileInteractability(strictFileInteractability: boolean): this {
    return this.set(Capability.STRICT_FILE_INTERACTABILITY, strictFileInteractability)
  }

  enableDownloads(): this {
    return this.set(Capability.ENABLE_DOWNLOADS, true)
  }
}

/**
 * Serializes a capabilities object. This is defined as a standalone function
 * so it may be type checked (where Capabilities[Symbols.serialize] has type
 * checking disabled since it is defined with [] access on a struct).
 *
 * @param caps The capabilities to serialize.
 * @return The JSON representation of this instance.
 *     Note, the returned object may contain nested promised values.
 */
function serialize(caps: Capabilities): Record<string, unknown> {
  const ret: Record<string, unknown> = {}
  for (const key of caps.keys()) {
    const cap = caps.get(key)
    if (cap !== undefined && cap !== null) {
      ret[key] = cap
    }
  }
  return ret
}
