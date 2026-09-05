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
 * @fileoverview The main user facing module. Exports WebDriver's primary
 * public API and provides convenience assessors to certain sub-modules.
 */

import { createRequire } from 'node:module'
import * as _http from './http/index'
import * as by from './lib/by'
import * as capabilities from './lib/capabilities'
import type { CapabilitiesLike, UserPromptHandler } from './lib/capabilities'
import * as chrome from './chrome'
import * as edge from './edge'
import * as error from './lib/error'
import * as firefox from './firefox'
import * as ie from './ie'
import * as input from './lib/input'
import * as logging from './lib/logging'
import * as color from './lib/color'
import * as promise from './lib/promise'
import type * as proxy from './lib/proxy'
import * as remote from './remote/index'
import * as safari from './safari'
import * as session from './lib/session'
import * as until from './lib/until'
import * as webdriver from './lib/webdriver'
import * as select from './lib/select'
import LogInspector from './bidi/logInspector'
import BrowsingContext from './bidi/browsingContext'
import BrowsingContextInspector from './bidi/browsingContextInspector'
import ScriptManager from './bidi/scriptManager'
import NetworkInspector from './bidi/networkInspector'

const version: string = createRequire(__filename)('./package.json').version

const Browser = capabilities.Browser
const Capabilities = capabilities.Capabilities
const Capability = capabilities.Capability
const WebDriver = webdriver.WebDriver

/**
 * A WebDriver subclass as the {@link Builder} drives it: constructible from a
 * session and creatable through its static factory. TS mixins require the
 * `any[]` rest constructor.
 */
interface DriverClass {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (...args: any[]): webdriver.WebDriver
  createSession(...args: unknown[]): webdriver.WebDriver
}

let seleniumServer: remote.SeleniumServer | undefined

/**
 * Starts an instance of the Selenium server if not yet running.
 * @param jar Path to the server jar to use.
 * @return A promise for the server's address once started.
 */
function startSeleniumServer(jar: string): Promise<string> {
  if (!seleniumServer) {
    seleniumServer = new remote.SeleniumServer(jar)
  }
  return seleniumServer.start()
}

/**
 * {@linkplain webdriver.WebDriver#setFileDetector WebDriver's setFileDetector}
 * method uses a non-standard command to transfer files from the local client
 * to the remote end hosting the browser. Many of the WebDriver sub-types, like
 * the {@link chrome.Driver} and {@link firefox.Driver}, do not support this
 * command. Thus, these classes override the `setFileDetector` to no-op.
 *
 * This function uses a mixin to re-enable `setFileDetector` by calling the
 * original method on the WebDriver prototype directly. This is used only when
 * the builder creates a Chrome or Firefox instance that communicates with a
 * remote end (and thus, support for remote file detectors is unknown).
 */
function ensureFileDetectorsAreEnabled<T extends DriverClass>(ctor: T): T {
  return class extends ctor {
    setFileDetector(detector: input.FileDetector | null): void {
      webdriver.WebDriver.prototype.setFileDetector.call(this, detector)
    }
  }
}

/**
 * A thenable wrapper around a {@linkplain webdriver.IWebDriver IWebDriver}
 * instance that allows commands to be issued directly instead of having to
 * repeatedly call `then`:
 *
 *     let driver = new Builder().build();
 *     driver.then(d => d.get(url));  // You can do this...
 *     driver.get(url);               // ...or this
 *
 * If the driver instance fails to resolve (e.g. the session cannot be created),
 * every issued command will fail.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- interface-only class, kept for the runtime export
class ThenableWebDriver {
  static createSession(..._args: unknown[]): void {}
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface ThenableWebDriver extends webdriver.WebDriver, Promise<webdriver.WebDriver> {}

const THENABLE_DRIVERS = new Map<DriverClass, DriverClass>()

/**
 * Creates a session through a cached thenable subclass of `ctor`. The cast is
 * the same assertion trunk made: the subclass instance carries `then`/`catch`.
 */
function createDriver(ctor: DriverClass, ...args: unknown[]): ThenableWebDriver {
  let thenableWebDriverProxy = THENABLE_DRIVERS.get(ctor)
  if (!thenableWebDriverProxy) {
    thenableWebDriverProxy = class extends ctor {
      declare then: Promise<webdriver.WebDriver>['then']
      declare catch: Promise<webdriver.WebDriver>['catch']

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(...args: any[]) {
        super(...args)

        const rest = args.slice(1)
        const pd = this.getSession().then((session) => {
          return new ctor(session, ...rest)
        })

        this.then = pd.then.bind(pd)
        this.catch = pd.catch.bind(pd)
      }
    }
    THENABLE_DRIVERS.set(ctor, thenableWebDriverProxy)
  }
  return thenableWebDriverProxy.createSession(...args) as ThenableWebDriver
}

/**
 * Creates new {@link webdriver.WebDriver WebDriver} instances. The environment
 * variables listed below may be used to override a builder's configuration,
 * allowing quick runtime changes.
 *
 * - {@code SELENIUM_BROWSER}: defines the target browser in the form
 *   {@code browser[:version][:platform]}.
 *
 * - {@code SELENIUM_REMOTE_URL}: defines the remote URL for all builder
 *   instances. This environment variable should be set to a fully qualified
 *   URL for a WebDriver server (e.g. http://localhost:4444/wd/hub). This
 *   option always takes precedence over {@code SELENIUM_SERVER_JAR}.
 *
 * - {@code SELENIUM_SERVER_JAR}: defines the path to the
 *   <a href="https://www.selenium.dev/downloads/">
 *   standalone Selenium server</a> jar to use. The server will be started the
 *   first time a WebDriver instance and be killed when the process exits.
 *
 * Suppose you had mytest.js that created WebDriver with
 *
 *     var driver = new webdriver.Builder()
 *         .forBrowser('chrome')
 *         .build();
 *
 * This test could be made to use Firefox on the local machine by running with
 * `SELENIUM_BROWSER=firefox node mytest.js`. Rather than change the code to
 * target Google Chrome on a remote machine, you can simply set the
 * `SELENIUM_BROWSER` and `SELENIUM_REMOTE_URL` environment variables:
 *
 *     SELENIUM_BROWSER=chrome:36:LINUX \
 *     SELENIUM_REMOTE_URL=http://www.example.com:4444/wd/hub \
 *     node mytest.js
 *
 * You could also use a local copy of the standalone Selenium server:
 *
 *     SELENIUM_BROWSER=chrome:36:LINUX \
 *     SELENIUM_SERVER_JAR=/path/to/selenium-server-standalone.jar \
 *     node mytest.js
 */
class Builder {
  private readonly log_: logging.Logger
  private url_: string
  private proxy_: string | null
  private capabilities_: capabilities.Capabilities
  private chromeOptions_: chrome.Options | null
  private chromeService_: chrome.ServiceBuilder | null
  private firefoxOptions_: firefox.Options | null
  private firefoxService_: firefox.ServiceBuilder | null
  private ieOptions_: ie.Options | null
  private ieService_: ie.ServiceBuilder | null
  private safariOptions_: safari.Options | null
  private edgeOptions_: edge.Options | null
  private edgeService_: edge.ServiceBuilder | null
  private ignoreEnv_: boolean
  private agent_: _http.Agent | null

  constructor() {
    this.log_ = logging.getLogger(`${logging.Type.DRIVER}.Builder`)
    this.url_ = ''
    this.proxy_ = null
    this.capabilities_ = new Capabilities()
    this.chromeOptions_ = null
    this.chromeService_ = null
    this.firefoxOptions_ = null
    this.firefoxService_ = null
    this.ieOptions_ = null
    this.ieService_ = null
    this.safariOptions_ = null
    this.edgeOptions_ = null
    this.edgeService_ = null
    this.ignoreEnv_ = false
    this.agent_ = null
  }

  /**
   * Configures this builder to ignore any environment variable overrides and to
   * only use the configuration specified through this instance's API.
   *
   * @return A self reference.
   */
  disableEnvironmentOverrides(): this {
    this.ignoreEnv_ = true
    return this
  }

  /**
   * Sets the URL of a remote WebDriver server to use. Once a remote URL has
   * been specified, the builder direct all new clients to that server. If this
   * method is never called, the Builder will attempt to create all clients
   * locally.
   *
   * As an alternative to this method, you may also set the
   * `SELENIUM_REMOTE_URL` environment variable.
   *
   * @param url The URL of a remote server to use.
   * @return A self reference.
   */
  usingServer(url: string): this {
    this.url_ = url
    return this
  }

  /**
   * @return The URL of the WebDriver server this instance is configured to use.
   */
  getServerUrl(): string {
    return this.url_
  }

  /**
   * Sets the URL of the proxy to use for the WebDriver's HTTP connections.
   * If this method is never called, the Builder will create a connection
   * without a proxy.
   *
   * @param proxy The URL of a proxy to use.
   * @return A self reference.
   */
  usingWebDriverProxy(proxy: string): this {
    this.proxy_ = proxy
    return this
  }

  /**
   * @return The URL of the proxy server to use for the WebDriver's
   *    HTTP connections, or `null` if not set.
   */
  getWebDriverProxy(): string | null {
    return this.proxy_
  }

  /**
   * Sets the http agent to use for each request.
   * If this method is not called, the Builder will use http.globalAgent by default.
   *
   * @param agent The agent to use for each request.
   * @return A self reference.
   */
  usingHttpAgent(agent: _http.Agent): this {
    this.agent_ = agent
    return this
  }

  /**
   * @return The http agent used for each request
   */
  getHttpAgent(): _http.Agent | null {
    return this.agent_
  }

  /**
   * Recommended way is to use set*Options where * is the browser(eg setChromeOptions)
   *
   * Sets the desired capabilities when requesting a new session. This will
   * overwrite any previously set capabilities.
   * @param capabilities The desired capabilities for a new session.
   * @return A self reference.
   */
  withCapabilities(capabilities: CapabilitiesLike): this {
    this.capabilities_ = new Capabilities(capabilities)
    return this
  }

  /**
   * Returns the base set of capabilities this instance is currently configured
   * to use.
   * @return The current capabilities for this builder.
   */
  getCapabilities(): capabilities.Capabilities {
    return this.capabilities_
  }

  /**
   * Sets the desired capability when requesting a new session.
   * If there is already a capability named key, its value will be overwritten with value.
   * This is a convenience wrapper around builder.getCapabilities().set(key, value) to support Builder method chaining.
   * @param key The capability key.
   * @param value The capability value.
   * @return A self reference.
   */
  setCapability(key: string, value: unknown): this {
    this.capabilities_.set(key, value)
    return this
  }

  /**
   * Configures the target browser for clients created by this instance.
   * Any calls to {@link #withCapabilities} after this function will
   * overwrite these settings.
   *
   * You may also define the target browser using the {@code SELENIUM_BROWSER}
   * environment variable. If set, this environment variable should be of the
   * form `browser[:[version][:platform]]`.
   *
   * @param name The name of the target browser;
   *     common defaults are available on the {@link webdriver.Browser} enum.
   * @param opt_version A desired version; may be omitted if any
   *     version should be used.
   * @param opt_platform The desired platform; may be omitted if any platform may be used.
   * @return A self reference.
   */
  forBrowser(name: string, opt_version?: string, opt_platform?: string): this {
    this.capabilities_.setBrowserName(name)
    if (opt_version) {
      this.capabilities_.setBrowserVersion(opt_version)
    }
    if (opt_platform) {
      this.capabilities_.setPlatform(opt_platform)
    }
    return this
  }

  /**
   * Sets the proxy configuration for the target browser.
   * Any calls to {@link #withCapabilities} after this function will
   * overwrite these settings.
   *
   * @param config The configuration to use.
   * @return A self reference.
   */
  setProxy(config: proxy.Config): this {
    this.capabilities_.setProxy(config)
    return this
  }

  /**
   * Sets the logging preferences for the created session. Preferences may be
   * changed by repeated calls, or by calling {@link #withCapabilities}.
   * @param prefs The desired logging preferences.
   * @return A self reference.
   */
  setLoggingPrefs(prefs: logging.Preferences | Record<string, string>): this {
    this.capabilities_.setLoggingPrefs(prefs)
    return this
  }

  /**
   * Sets the default action to take with an unexpected alert before returning
   * an error.
   *
   * @param behavior The desired behavior.
   * @return A self reference.
   * @see capabilities.Capabilities#setAlertBehavior
   */
  setAlertBehavior(behavior: UserPromptHandler | null): this {
    this.capabilities_.setAlertBehavior(behavior)
    return this
  }

  /**
   * Sets Chrome specific {@linkplain chrome.Options options} for drivers
   * created by this builder. Any logging or proxy settings defined on the given
   * options will take precedence over those set through
   * {@link #setLoggingPrefs} and {@link #setProxy}, respectively.
   *
   * @param options The ChromeDriver options to use.
   * @return A self reference.
   */
  setChromeOptions(options: chrome.Options): this {
    this.chromeOptions_ = options
    return this
  }

  /**
   * @return the Chrome specific options currently configured for this builder.
   */
  getChromeOptions(): chrome.Options | null {
    return this.chromeOptions_
  }

  /**
   * Sets the service builder to use for managing the chromedriver child process
   * when creating new Chrome sessions.
   *
   * @param service the service to use.
   * @return A self reference.
   */
  setChromeService(service: chrome.ServiceBuilder | null): this {
    if (service && !(service instanceof chrome.ServiceBuilder)) {
      throw TypeError('not a chrome.ServiceBuilder object')
    }
    this.chromeService_ = service
    return this
  }

  /**
   * Sets Firefox specific {@linkplain firefox.Options options} for drivers
   * created by this builder. Any logging or proxy settings defined on the given
   * options will take precedence over those set through
   * {@link #setLoggingPrefs} and {@link #setProxy}, respectively.
   *
   * @param options The FirefoxDriver options to use.
   * @return A self reference.
   */
  setFirefoxOptions(options: firefox.Options): this {
    this.firefoxOptions_ = options
    return this
  }

  /**
   * @return the Firefox specific options currently configured for this instance.
   */
  getFirefoxOptions(): firefox.Options | null {
    return this.firefoxOptions_
  }

  /**
   * @return the Firefox service currently configured for this instance.
   */
  getFirefoxService(): firefox.ServiceBuilder | null {
    return this.firefoxService_
  }

  /**
   * Sets the {@link firefox.ServiceBuilder} to use to manage the geckodriver
   * child process when creating Firefox sessions locally.
   *
   * @param service the service to use.
   * @return a self reference.
   */
  setFirefoxService(service: firefox.ServiceBuilder | null): this {
    if (service && !(service instanceof firefox.ServiceBuilder)) {
      throw TypeError('not a firefox.ServiceBuilder object')
    }
    this.firefoxService_ = service
    return this
  }

  /**
   * Set Internet Explorer specific {@linkplain ie.Options options} for drivers
   * created by this builder. Any proxy settings defined on the given options
   * will take precedence over those set through {@link #setProxy}.
   *
   * @param options The IEDriver options to use.
   * @return A self reference.
   */
  setIeOptions(options: ie.Options): this {
    this.ieOptions_ = options
    return this
  }

  /**
   * Sets the {@link ie.ServiceBuilder} to use to manage the geckodriver
   * child process when creating IE sessions locally.
   *
   * @param service the service to use.
   * @return a self reference.
   */
  setIeService(service: ie.ServiceBuilder | null): this {
    this.ieService_ = service
    return this
  }

  /**
   * Set {@linkplain edge.Options options} specific to Microsoft's Edge browser
   * for drivers created by this builder. Any proxy settings defined on the
   * given options will take precedence over those set through
   * {@link #setProxy}.
   *
   * @param options The MicrosoftEdgeDriver options to use.
   * @return A self reference.
   */
  setEdgeOptions(options: edge.Options): this {
    this.edgeOptions_ = options
    return this
  }

  /**
   * Sets the {@link edge.ServiceBuilder} to use to manage the
   * MicrosoftEdgeDriver child process when creating sessions locally.
   *
   * @param service the service to use.
   * @return a self reference.
   */
  setEdgeService(service: edge.ServiceBuilder | null): this {
    if (service && !(service instanceof edge.ServiceBuilder)) {
      throw TypeError('not a edge.ServiceBuilder object')
    }
    this.edgeService_ = service
    return this
  }

  /**
   * Sets Safari specific {@linkplain safari.Options options} for drivers
   * created by this builder. Any logging settings defined on the given options
   * will take precedence over those set through {@link #setLoggingPrefs}.
   *
   * @param options The Safari options to use.
   * @return A self reference.
   */
  setSafariOptions(options: safari.Options): this {
    this.safariOptions_ = options
    return this
  }

  /**
   * @return the Safari specific options currently configured for this instance.
   */
  getSafariOptions(): safari.Options | null {
    return this.safariOptions_
  }

  /**
   * Creates a new WebDriver client based on this builder's current
   * configuration.
   *
   * This method will return a {@linkplain ThenableWebDriver} instance, allowing
   * users to issue commands directly without calling `then()`. The returned
   * thenable wraps a promise that will resolve to a concrete
   * {@linkplain webdriver.WebDriver WebDriver} instance. The promise will be
   * rejected if the remote end fails to create a new session.
   *
   * @return A new WebDriver instance.
   * @throws {Error} If the current configuration is invalid.
   */
  build(): ThenableWebDriver {
    // Create a copy for any changes we may need to make based on the current
    // environment.
    const capabilities = new Capabilities(this.capabilities_)

    if (!this.ignoreEnv_ && process.env.SELENIUM_BROWSER) {
      this.log_.fine(`SELENIUM_BROWSER=${process.env.SELENIUM_BROWSER}`)
      const browserSpec = process.env.SELENIUM_BROWSER.split(/:/, 3)
      capabilities.setBrowserName(browserSpec[0])

      if (browserSpec[1]) {
        capabilities.setBrowserVersion(browserSpec[1])
      }
      if (browserSpec[2]) {
        capabilities.setPlatform(browserSpec[2])
      }
    }

    let browser: unknown = capabilities.get(Capability.BROWSER_NAME)

    /**
     * If browser is not defined in forBrowser, check if browserOptions are defined to pick the browserName
     */
    if (!browser) {
      const options =
        this.chromeOptions_ || this.firefoxOptions_ || this.ieOptions_ || this.safariOptions_ || this.edgeOptions_
      if (options) {
        browser = options['map_'].get(Capability.BROWSER_NAME)
      }
    }

    if (typeof browser !== 'string') {
      throw TypeError(
        `Target browser must be a string, but is <${typeof browser}>;` + ' did you forget to call forBrowser()?',
      )
    }

    if (browser === 'ie') {
      browser = Browser.INTERNET_EXPLORER
    }

    // Apply browser specific overrides.
    if (browser === Browser.CHROME && this.chromeOptions_) {
      capabilities.merge(this.chromeOptions_)
    } else if (browser === Browser.FIREFOX && this.firefoxOptions_) {
      capabilities.merge(this.firefoxOptions_)
    } else if (browser === Browser.INTERNET_EXPLORER && this.ieOptions_) {
      capabilities.merge(this.ieOptions_)
    } else if (browser === Browser.SAFARI && this.safariOptions_) {
      capabilities.merge(this.safariOptions_)
    } else if (browser === Browser.EDGE && this.edgeOptions_) {
      capabilities.merge(this.edgeOptions_)
    }

    checkOptions(capabilities, 'chromeOptions', chrome.Options, 'setChromeOptions')
    checkOptions(capabilities, 'moz:firefoxOptions', firefox.Options, 'setFirefoxOptions')
    checkOptions(capabilities, 'safari.options', safari.Options, 'setSafariOptions')

    // Check for a remote browser.
    let url: string | Promise<string> = this.url_
    if (!this.ignoreEnv_) {
      if (process.env.SELENIUM_REMOTE_URL) {
        this.log_.fine(`SELENIUM_REMOTE_URL=${process.env.SELENIUM_REMOTE_URL}`)
        url = process.env.SELENIUM_REMOTE_URL
      } else if (process.env.SELENIUM_SERVER_JAR) {
        this.log_.fine(`SELENIUM_SERVER_JAR=${process.env.SELENIUM_SERVER_JAR}`)
        url = startSeleniumServer(process.env.SELENIUM_SERVER_JAR)
      }
    }

    if (url) {
      this.log_.fine('Creating session on remote server')

      if (typeof url === 'string') {
        capabilities.set('se:remoteUrl', url)
      }

      const client = Promise.resolve(url).then((url) => new _http.HttpClient(url, this.agent_, this.proxy_))
      const executor = new _http.Executor(client)

      if (browser === Browser.CHROME) {
        const driver = ensureFileDetectorsAreEnabled(chrome.Driver)
        return createDriver(driver, capabilities, executor)
      }

      if (browser === Browser.FIREFOX) {
        const driver = ensureFileDetectorsAreEnabled(firefox.Driver)
        return createDriver(driver, capabilities, executor)
      }
      return createDriver(WebDriver, executor, capabilities)
    }

    // Check for a native browser.
    switch (browser) {
      case Browser.CHROME: {
        let service: remote.DriverService | null = null
        if (this.chromeService_) {
          service = this.chromeService_.build()
        }
        return createDriver(chrome.Driver, capabilities, service)
      }

      case Browser.FIREFOX: {
        let service: remote.DriverService | null = null
        if (this.firefoxService_) {
          service = this.firefoxService_.build()
        }
        return createDriver(firefox.Driver, capabilities, service)
      }

      case Browser.INTERNET_EXPLORER: {
        let service: remote.DriverService | null = null
        if (this.ieService_) {
          service = this.ieService_.build()
        }
        return createDriver(ie.Driver, capabilities, service)
      }

      case Browser.EDGE: {
        let service: remote.DriverService | null = null
        if (this.edgeService_) {
          service = this.edgeService_.build()
        }
        return createDriver(edge.Driver, capabilities, service)
      }

      case Browser.SAFARI:
        return createDriver(safari.Driver, capabilities)

      default:
        throw new Error('Do not know how to build driver: ' + browser + '; did you forget to call usingServer(url)?')
    }
  }
}

/**
 * In the 3.x releases, the various browser option classes
 * (e.g. firefox.Options) had to be manually set as an option using the
 * Capabilities class:
 *
 *     let ffo = new firefox.Options();
 *     // Configure firefox options...
 *
 *     let caps = new Capabilities();
 *     caps.set('moz:firefoxOptions', ffo);
 *
 *     let driver = new Builder()
 *         .withCapabilities(caps)
 *         .build();
 *
 * The options are now subclasses of Capabilities and can be used directly. A
 * direct translation of the above is:
 *
 *     let ffo = new firefox.Options();
 *     // Configure firefox options...
 *
 *     let driver = new Builder()
 *         .withCapabilities(ffo)
 *         .build();
 *
 * You can also set the options for various browsers at once and let the builder
 * choose the correct set at runtime (see Builder docs above):
 *
 *     let ffo = new firefox.Options();
 *     // Configure ...
 *
 *     let co = new chrome.Options();
 *     // Configure ...
 *
 *     let driver = new Builder()
 *         .setChromeOptions(co)
 *         .setFirefoxOptions(ffo)
 *         .build();
 *
 * @throws {error.InvalidArgumentError}
 */
function checkOptions(
  caps: capabilities.Capabilities,
  key: string,
  optionType: typeof Capabilities,
  setMethod: string,
): void {
  const val = caps.get(key)
  if (val instanceof optionType) {
    throw new error.InvalidArgumentError(
      'Options class extends Capabilities and should not be set as key ' +
        `"${key}"; set browser-specific options with ` +
        `Builder.${setMethod}(). For more information, see the ` +
        'documentation attached to the function that threw this error',
    )
  }
}

// PUBLIC API

export { Browser, Builder, Capabilities, Capability, ThenableWebDriver, WebDriver, version }
export const Button = input.Button
export const By = by.By
export const RelativeBy = by.RelativeBy
export const withTagName = by.withTagName
export const locateWith = by.locateWith
export const Condition = webdriver.Condition
export const FileDetector = input.FileDetector
export const Key = input.Key
export const Origin = input.Origin
export const Session = session.Session
export const WebElement = webdriver.WebElement
export const WebElementCondition = webdriver.WebElementCondition
export const WebElementPromise = webdriver.WebElementPromise
export { error, logging, promise, until }
export const Select = select.Select
export const Color = color.Color
export const Colors = color.Colors
export { LogInspector, BrowsingContext, BrowsingContextInspector, ScriptManager, NetworkInspector }
