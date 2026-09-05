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
 * @fileoverview Defines the {@linkplain Driver WebDriver} client for Firefox.
 * Before using this module, you must download the latest
 * [geckodriver release] and ensure it can be found on your system [PATH].
 *
 * Each FirefoxDriver instance will be created with an anonymous profile,
 * ensuring browser historys do not share session data (cookies, history, cache,
 * offline storage, etc.)
 *
 * __Customizing the Firefox Profile__
 *
 * The profile used for each WebDriver session may be configured using the
 * {@linkplain Options} class. For example, you may install an extension, like
 * Firebug:
 *
 *     const {Builder} = require('selenium-webdriver');
 *     const firefox = require('selenium-webdriver/firefox');
 *
 *     let options = new firefox.Options()
 *         .addExtensions('/path/to/firebug.xpi')
 *         .setPreference('extensions.firebug.showChromeErrors', true);
 *
 *     let driver = new Builder()
 *         .forBrowser('firefox')
 *         .setFirefoxOptions(options)
 *         .build();
 *
 * The {@linkplain Options} class may also be used to configure WebDriver based
 * on a pre-existing browser profile:
 *
 *     let profile = '/usr/local/home/bob/.mozilla/firefox/3fgog75h.testing';
 *     let options = new firefox.Options().setProfile(profile);
 *
 * The FirefoxDriver will _never_ modify a pre-existing profile; instead it will
 * create a copy for it to modify. By extension, there are certain browser
 * preferences that are required for WebDriver to function properly and they
 * will always be overwritten.
 *
 * __Using a Custom Firefox Binary__
 *
 * On Windows and MacOS, the FirefoxDriver will search for Firefox in its
 * default installation location:
 *
 * - Windows: C:\Program Files and C:\Program Files (x86).
 * - MacOS: /Applications/Firefox.app
 *
 * For Linux, Firefox will always be located on the PATH: `$(where firefox)`.
 *
 * You can provide a custom location for Firefox by setting the binary in the
 * {@link Options}:setBinary method.
 *
 *     const {Builder} = require('selenium-webdriver');
 *     const firefox = require('selenium-webdriver/firefox');
 *
 *    let options = new firefox.Options()
 *         .setBinary('/my/firefox/install/dir/firefox');
 *     let driver = new Builder()
 *         .forBrowser('firefox')
 *         .setFirefoxOptions(options)
 *         .build();
 *
 * __Remote Testing__
 *
 * You may customize the Firefox binary and profile when running against a
 * remote Selenium server. Your custom profile will be packaged as a zip and
 * transferred to the remote host for use. The profile will be transferred
 * _once for each new session_. The performance impact should be minimal if
 * you've only configured a few extra browser preferences. If you have a large
 * profile with several extensions, you should consider installing it on the
 * remote host and defining its path via the {@link Options} class. Custom
 * binaries are never copied to remote machines and must be referenced by
 * installation path.
 *
 *     const {Builder} = require('selenium-webdriver');
 *     const firefox = require('selenium-webdriver/firefox');
 *
 *     let options = new firefox.Options()
 *         .setProfile('/profile/path/on/remote/host')
 *         .setBinary('/install/dir/on/remote/host/firefox');
 *
 *     let driver = new Builder()
 *         .forBrowser('firefox')
 *         .usingServer('http://127.0.0.1:4444/wd/hub')
 *         .setFirefoxOptions(options)
 *         .build();
 *
 * [geckodriver release]: https://github.com/mozilla/geckodriver/releases/
 * [PATH]: http://en.wikipedia.org/wiki/PATH_%28variable%29
 *
 * @module selenium-webdriver/firefox
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as Symbols from './lib/symbols'
import * as command from './lib/command'
import * as http from './http/index'
import * as io from './io/index'
import * as remote from './remote/index'
import * as webdriver from './lib/webdriver'
import * as zip from './io/zip'
import { Browser, Capabilities, Capability } from './lib/capabilities'
import type { CapabilitiesLike } from './lib/capabilities'
import { Zip } from './io/zip'
import { getBinaryPaths } from './common/driverFinder'
import { findFreePort } from './net/portprober'
const FIREFOX_CAPABILITY_KEY = 'moz:firefoxOptions'

/** The `moz:firefoxOptions` dictionary. */
interface FirefoxOptionsDict {
  profile?: Profile
  args?: string[]
  prefs?: Record<string, string | number | boolean>
  binary?: string | Channel
  androidPackage?: string
  androidActivity?: string
  deviceSerial?: string
}

/** The parts of a WebExtension manifest used to find the add-on ID. */
interface AddonManifest {
  browser_specific_settings?: { gecko?: { id?: string } }
  applications?: { gecko?: { id?: string } }
}

/**
 * Thrown when there an add-on is malformed.
 * @final
 */
class AddonFormatError extends Error {
  /** @param msg The error message. */
  constructor(msg: string) {
    super(msg)
    /** @override */
    this.name = this.constructor.name
  }
}

/**
 * Installs an extension to the given directory.
 * @param extension Path to the xpi extension file to install.
 * @param dir Path to the directory to install the extension in.
 * @return A promise for the add-on ID once installed.
 */
async function installExtension(extension: string, dir: string): Promise<string> {
  const ext = extension.slice(-4)
  if (ext !== '.xpi' && ext !== '.zip') {
    throw Error('File name does not end in ".zip" or ".xpi": ' + ext)
  }

  const archive = await zip.load(extension)
  if (!archive.has('manifest.json')) {
    throw new AddonFormatError(`Couldn't find manifest.json in ${extension}`)
  }

  const buf = await archive.getFile('manifest.json')
  const parsedJSON: AddonManifest = JSON.parse(buf.toString('utf8'))

  const { browser_specific_settings } = parsedJSON

  if (browser_specific_settings && browser_specific_settings.gecko) {
    /* browser_specific_settings is an alternative to applications
     * It is meant to facilitate cross-browser plugins since Firefox48
     * see https://bugzilla.mozilla.org/show_bug.cgi?id=1262005
     */
    parsedJSON.applications = browser_specific_settings
  }

  const { applications } = parsedJSON
  if (!(applications && applications.gecko && applications.gecko.id)) {
    throw new AddonFormatError(`Could not find add-on ID for ${extension}`)
  }

  await io.copy(extension, `${path.join(dir, applications.gecko.id)}.xpi`)
  return applications.gecko.id
}

class Profile {
  template_: string | null
  extensions_: string[]

  constructor() {
    this.template_ = null
    this.extensions_ = []
  }

  addExtensions(paths: string[]): void {
    this.extensions_ = this.extensions_.concat(...paths)
  }

  /**
   * @return a promise for a base64 encoded profile, or undefined if there's no
   *     data to include.
   */
  [Symbols.serialize](): Promise<string> | undefined {
    if (this.template_ || this.extensions_.length) {
      return buildProfile(this.template_, this.extensions_)
    }
    return undefined
  }
}

/**
 * @param template path to an existing profile to use as a template.
 * @param extensions paths to extensions to install in the new profile.
 * @return a promise for the base64 encoded profile.
 */
async function buildProfile(template: string | null, extensions: string[]): Promise<string> {
  let dir = template

  if (extensions.length) {
    dir = await io.tmpDir()
    if (template) {
      await io.copyDir(template, dir, /(parent\.lock|lock|\.parentlock)/)
    }

    const extensionsDir = path.join(dir, 'extensions')
    await io.mkdir(extensionsDir)

    for (let i = 0; i < extensions.length; i++) {
      await installExtension(extensions[i], extensionsDir)
    }
  }

  const zip = new Zip()
  return zip
    .addDir(String(dir))
    .then(() => zip.toBuffer())
    .then((buf) => buf.toString('base64'))
}

/**
 * Configuration options for the FirefoxDriver.
 */
class Options extends Capabilities {
  /**
   * @param other Another set of capabilities to initialize this instance from.
   */
  constructor(other?: CapabilitiesLike) {
    super(other)
    this.setBrowserName(Browser.FIREFOX)
    // https://fxdx.dev/deprecating-cdp-support-in-firefox-embracing-the-future-with-webdriver-bidi/.
    // Enable BiDi only
    this.setPreference('remote.active-protocols', 1)
  }

  /**
   * @private
   */
  firefoxOptions_(): FirefoxOptionsDict {
    let options = this.get<FirefoxOptionsDict | undefined>(FIREFOX_CAPABILITY_KEY)
    if (!options) {
      options = {}
      this.set(FIREFOX_CAPABILITY_KEY, options)
    }
    return options
  }

  /**
   * @private
   */
  profile_(): Profile {
    const options = this.firefoxOptions_()
    if (!options.profile) {
      options.profile = new Profile()
    }
    return options.profile
  }

  /**
   * Specify additional command line arguments that should be used when starting
   * the Firefox browser.
   *
   * @param args The arguments to include.
   * @return A self reference.
   */
  addArguments(...args: (string | string[])[]): this {
    if (args.length) {
      const options = this.firefoxOptions_()
      options.args = options.args ? options.args.concat(...args) : args.flat()
    }
    return this
  }

  /**
   * Sets the initial window size
   *
   * @param size The desired window size.
   * @return A self reference.
   * @throws {TypeError} if width or height is unspecified, not a number, or
   *     less than or equal to 0.
   */
  windowSize({ width, height }: { width: number; height: number }): this {
    function checkArg(arg: unknown): void {
      if (typeof arg !== 'number' || arg <= 0) {
        throw TypeError('Arguments must be {width, height} with numbers > 0')
      }
    }

    checkArg(width)
    checkArg(height)
    return this.addArguments(`--width=${width}`, `--height=${height}`)
  }

  /**
   * Add extensions that should be installed when starting Firefox.
   *
   * @param paths The paths to the extension XPI files to install.
   * @return A self reference.
   * @deprecated Use {@link Driver#installAddon} instead.
   */
  addExtensions(...paths: string[]): this {
    this.profile_().addExtensions(paths)
    return this
  }

  /**
   * @param key the preference key.
   * @param value the preference value.
   * @return A self reference.
   * @throws {TypeError} if either the key or value has an invalid type.
   */
  setPreference(key: string, value: string | number | boolean): this {
    if (typeof key !== 'string') {
      throw TypeError(`key must be a string, but got ${typeof key}`)
    }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw TypeError(`value must be a string, number, or boolean, but got ${typeof value}`)
    }
    const options = this.firefoxOptions_()
    options.prefs = options.prefs || {}
    options.prefs[key] = value
    return this
  }

  /**
   * Sets the path to an existing profile to use as a template for new browser
   * sessions. This profile will be copied for each new session - changes will
   * not be applied to the profile itself.
   *
   * @param profile The profile to use.
   * @return A self reference.
   * @throws {TypeError} if profile is not a string.
   */
  setProfile(profile: string): this {
    if (typeof profile !== 'string') {
      throw TypeError(`profile must be a string, but got ${typeof profile}`)
    }
    this.profile_().template_ = profile
    return this
  }

  /**
   * Sets the binary to use. The binary may be specified as the path to a
   * Firefox executable.
   *
   * @param binary The binary to use.
   * @return A self reference.
   * @throws {TypeError} If `binary` is an invalid type.
   */
  setBinary(binary: string | Channel): this {
    if (binary instanceof Channel || typeof binary === 'string') {
      this.firefoxOptions_().binary = binary
      return this
    }
    throw TypeError('binary must be a string path ')
  }

  /**
   * Enables Mobile start up features
   *
   * @param androidPackage The package to use
   * @return A self reference
   */
  enableMobile(
    androidPackage = 'org.mozilla.firefox',
    androidActivity: string | null = null,
    deviceSerial: string | null = null,
  ): this {
    this.firefoxOptions_().androidPackage = androidPackage

    if (androidActivity) {
      this.firefoxOptions_().androidActivity = androidActivity
    }
    if (deviceSerial) {
      this.firefoxOptions_().deviceSerial = deviceSerial
    }
    return this
  }

  /**
   * Enables moz:debuggerAddress for firefox cdp
   */
  enableDebugger(): this {
    return this.set('moz:debuggerAddress', true)
  }

  /**
   * Enable bidi connection
   * @returns A self reference.
   */
  enableBidi(): this {
    return this.set('webSocketUrl', true)
  }
}

/**
 * Enum of available command contexts.
 *
 * Command contexts are specific to Marionette, and may be used with the
 * {@link #context=} method. Contexts allow you to direct all subsequent
 * commands to either "content" (default) or "chrome". The latter gives
 * you elevated security permissions.
 */
const Context = {
  CONTENT: 'content',
  CHROME: 'chrome',
} as const
type Context = (typeof Context)[keyof typeof Context]

/**
 * @param file Path to the file to find, relative to the program files root.
 * @return A promise for the located executable.
 *     The promise will resolve to {@code null} if Firefox was not found.
 */
function findInProgramFiles(file: string): Promise<string | null> {
  const files = [
    process.env['PROGRAMFILES'] || 'C:\\Program Files',
    process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
  ].map((prefix) => path.join(prefix, file))
  return io.exists(files[0]).then(function (exists) {
    return exists
      ? files[0]
      : io.exists(files[1]).then(function (exists) {
          return exists ? files[1] : null
        })
  })
}

const ExtensionCommand = {
  GET_CONTEXT: 'getContext',
  SET_CONTEXT: 'setContext',
  INSTALL_ADDON: 'install addon',
  UNINSTALL_ADDON: 'uninstall addon',
  FULL_PAGE_SCREENSHOT: 'fullPage screenshot',
} as const

/**
 * Creates a command executor with support for Marionette's custom commands.
 * @param serverUrl The server's URL.
 * @return The new command executor.
 */
function createExecutor(serverUrl: Promise<string>): http.Executor {
  const client = serverUrl.then((url) => new http.HttpClient(url))
  const executor = new http.Executor(client)
  configureExecutor(executor)
  return executor
}

/**
 * Configures the given executor with Firefox-specific commands.
 * @param executor the executor to configure.
 */
function configureExecutor(executor: http.Executor): void {
  executor.defineCommand(ExtensionCommand.GET_CONTEXT, 'GET', '/session/:sessionId/moz/context')

  executor.defineCommand(ExtensionCommand.SET_CONTEXT, 'POST', '/session/:sessionId/moz/context')

  executor.defineCommand(ExtensionCommand.INSTALL_ADDON, 'POST', '/session/:sessionId/moz/addon/install')

  executor.defineCommand(ExtensionCommand.UNINSTALL_ADDON, 'POST', '/session/:sessionId/moz/addon/uninstall')

  executor.defineCommand(ExtensionCommand.FULL_PAGE_SCREENSHOT, 'GET', '/session/:sessionId/moz/screenshot/full')
}

/**
 * Creates {@link selenium-webdriver/remote.DriverService} instances that manage
 * a [geckodriver](https://github.com/mozilla/geckodriver) server in a child
 * process.
 */
class ServiceBuilder extends remote.DriverService.Builder {
  /**
   * @param opt_exe Path to the server executable to use. If omitted,
   *     the builder will attempt to locate the geckodriver on the system PATH.
   */
  constructor(opt_exe?: string) {
    super(opt_exe)
    this.setLoopback(true) // Required.
  }

  /**
   * Enables verbose logging.
   *
   * @param opt_trace Whether to enable trace-level logging. By
   *     default, only debug logging is enabled.
   * @return A self reference.
   */
  enableVerboseLogging(opt_trace?: boolean): this {
    return this.addArguments(opt_trace ? '-vv' : '-v')
  }

  /**
   * Overrides the parent build() method to add the websocket port argument
   * for Firefox when not connecting to an existing instance.
   *
   * @return A new driver service instance.
   */
  build(): remote.DriverService {
    const port = this.options_.port || findFreePort()
    const argsPromise = Promise.resolve(port).then((port) => {
      // Start with the default --port argument.
      const args = this.options_.args.concat(`--port=${port}`)
      // If the "--connect-existing" flag is not set, add the websocket port.
      if (!this.options_.args.some((arg) => arg === '--connect-existing')) {
        return findFreePort().then((wsPort) => {
          args.push(`--websocket-port=${wsPort}`)
          return args
        })
      }
      return args
    })

    const options: remote.ServiceOptions = { ...this.options_, args: argsPromise, port }
    return new remote.DriverService(this.exe_, options)
  }
}

/**
 * A WebDriver client for Firefox.
 */
// @ts-expect-error TS2417: the static createSession intentionally differs from WebDriver.createSession (public API).
class Driver extends webdriver.WebDriver {
  /**
   * Creates a new Firefox session.
   *
   * @param opt_config The configuration options for this driver, specified as
   *    either an {@link Options} or {@link Capabilities}, or as a raw hash object.
   * @param opt_executor Either a pre-configured command executor to use for
   *   communicating with an externally managed remote end (which is assumed to
   *   already be running), or the `DriverService` to use to start the
   *   geckodriver in a child process.
   *
   *   If an executor is provided, care should e taken not to use reuse it with
   *   other clients as its internal command mappings will be updated to support
   *   Firefox-specific commands.
   *
   *   _This parameter may only be used with Mozilla's GeckoDriver._
   *
   * @throws {Error} If a custom command executor is provided and the driver is
   *     configured to use the legacy FirefoxDriver from the Selenium project.
   * @return A new driver instance.
   */
  static createSession<T extends Driver>(
    this: webdriver.WebDriverConstructor<T>,
    opt_config?: CapabilitiesLike,
    opt_executor?: http.Executor | remote.DriverService,
  ): T {
    const caps = opt_config instanceof Capabilities ? opt_config : new Options(opt_config)

    let firefoxBrowserPath: string | null = null

    let executor: http.Executor
    let onQuit: (() => unknown) | undefined

    if (opt_executor instanceof http.Executor) {
      executor = opt_executor
      configureExecutor(executor)
    } else if (opt_executor instanceof remote.DriverService) {
      if (!opt_executor.getExecutable()) {
        const { driverPath, browserPath } = getBinaryPaths(caps)
        opt_executor.setExecutable(driverPath)
        firefoxBrowserPath = browserPath
      }
      executor = createExecutor(opt_executor.start())
      onQuit = () => opt_executor.kill()
    } else {
      const service = new ServiceBuilder().build()
      if (!service.getExecutable()) {
        const { driverPath, browserPath } = getBinaryPaths(caps)
        service.setExecutable(driverPath)
        firefoxBrowserPath = browserPath
      }
      executor = createExecutor(service.start())
      onQuit = () => service.kill()
    }

    if (firefoxBrowserPath) {
      const vendorOptions = caps.get<Record<string, unknown> | undefined>(FIREFOX_CAPABILITY_KEY)
      if (vendorOptions) {
        vendorOptions['binary'] = firefoxBrowserPath
        caps.set(FIREFOX_CAPABILITY_KEY, vendorOptions)
      } else {
        caps.set(FIREFOX_CAPABILITY_KEY, { binary: firefoxBrowserPath })
      }
      caps.delete(Capability.BROWSER_VERSION)
    }

    return super.createSession<T>(executor, caps, onQuit)
  }

  /**
   * This function is a no-op as file detectors are not supported by this
   * implementation.
   * @override
   */
  setFileDetector(): void {}

  /**
   * Get the context that is currently in effect.
   *
   * @return Current context.
   */
  getContext(): Promise<Context> {
    return this.execute<Context>(new command.Command(ExtensionCommand.GET_CONTEXT))
  }

  /**
   * Changes target context for commands between chrome- and content.
   *
   * Changing the current context has a stateful impact on all subsequent
   * commands. The {@link Context.CONTENT} context has normal web
   * platform document permissions, as if you would evaluate arbitrary
   * JavaScript. The {@link Context.CHROME} context gets elevated
   * permissions that lets you manipulate the browser chrome itself,
   * with full access to the XUL toolkit.
   *
   * Use your powers wisely.
   *
   * @param ctx The context to switch to.
   */
  setContext(ctx: Context): Promise<void> {
    return this.execute<void>(new command.Command(ExtensionCommand.SET_CONTEXT).setParameter('context', ctx))
  }

  /**
   * Installs a new addon with the current session. This function will return an
   * ID that may later be used to {@linkplain #uninstallAddon uninstall} the
   * addon.
   *
   *
   * @param path Path on the local filesystem to the web extension to install.
   * @param temporary Flag indicating whether the extension should be
   *     installed temporarily - gets removed on restart
   * @return A promise that will resolve to an ID for the newly installed addon.
   * @see #uninstallAddon
   */
  async installAddon(path: string, temporary = false): Promise<string> {
    const stats = fs.statSync(path)
    let buf: Buffer
    if (stats.isDirectory()) {
      const zip = new Zip()
      await zip.addDir(path)
      buf = await zip.toBuffer('DEFLATE')
    } else {
      buf = await io.read(path)
    }
    return this.execute<string>(
      new command.Command(ExtensionCommand.INSTALL_ADDON)
        .setParameter('addon', buf.toString('base64'))
        .setParameter('temporary', temporary),
    )
  }

  /**
   * Uninstalls an addon from the current browser session's profile.
   *
   * @param id ID of the addon to uninstall.
   * @return A promise that will resolve when the operation has completed.
   * @see #installAddon
   */
  async uninstallAddon(id: string | Promise<string>): Promise<void> {
    id = await Promise.resolve(id)
    return this.execute<void>(new command.Command(ExtensionCommand.UNINSTALL_ADDON).setParameter('id', id))
  }

  /**
   * Take full page screenshot of the visible region
   *
   * @return A promise that will be resolved to the screenshot as a base-64 encoded PNG.
   */
  takeFullPageScreenshot(): Promise<string> {
    return this.execute<string>(new command.Command(ExtensionCommand.FULL_PAGE_SCREENSHOT))
  }
}

/**
 * Provides methods for locating the executable for a Firefox release channel
 * on Windows and MacOS. For other systems (i.e. Linux), Firefox will always
 * be located on the system PATH.
 * @deprecated Instead of using this class, you should configure the
 *    {@link Options} with the appropriate binary location or let Selenium
 *    Manager handle it for you.
 * @final
 */
class Channel {
  private readonly darwin_: string
  private readonly win32_: string
  private found_: Promise<string> | null

  /**
   * @param darwin The path to check when running on MacOS.
   * @param win32 The path to check when running on Windows.
   */
  constructor(darwin: string, win32: string) {
    this.darwin_ = darwin
    this.win32_ = win32
    this.found_ = null
  }

  /**
   * Attempts to locate the Firefox executable for this release channel. This
   * will first check the default installation location for the channel before
   * checking the user's PATH. The returned promise will be rejected if Firefox
   * can not be found.
   *
   * @return A promise for the location of the located Firefox executable.
   */
  locate(): Promise<string> {
    if (this.found_) {
      return this.found_
    }

    let found: Promise<string | null>
    switch (process.platform) {
      case 'darwin':
        found = io.exists(this.darwin_).then((exists) => (exists ? this.darwin_ : io.findInPath('firefox')))
        break

      case 'win32':
        found = findInProgramFiles(this.win32_).then((found) => found || io.findInPath('firefox.exe'))
        break

      default:
        found = Promise.resolve(io.findInPath('firefox'))
        break
    }

    this.found_ = found.then((found) => {
      if (found) {
        // TODO: verify version info.
        return found
      }
      throw Error('Could not locate Firefox on the current system')
    })
    return this.found_
  }

  [Symbols.serialize](): Promise<string> {
    return this.locate()
  }

  /**
   * Firefox's developer channel.
   * @see <https://www.mozilla.org/en-US/firefox/channel/desktop/#developer>
   */
  static DEV = new Channel(
    '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox',
    'Firefox Developer Edition\\firefox.exe',
  )

  /**
   * Firefox's beta channel. Note this is provided mainly for convenience as
   * the beta channel has the same installation location as the main release
   * channel.
   * @see <https://www.mozilla.org/en-US/firefox/channel/desktop/#beta>
   */
  static BETA = new Channel('/Applications/Firefox.app/Contents/MacOS/firefox', 'Mozilla Firefox\\firefox.exe')

  /**
   * Firefox's release channel.
   * @see <https://www.mozilla.org/en-US/firefox/desktop/>
   */
  static RELEASE = new Channel('/Applications/Firefox.app/Contents/MacOS/firefox', 'Mozilla Firefox\\firefox.exe')

  /**
   * Firefox's nightly release channel.
   * @see <https://www.mozilla.org/en-US/firefox/channel/desktop/#nightly>
   */
  static NIGHTLY = new Channel('/Applications/Firefox Nightly.app/Contents/MacOS/firefox', 'Nightly\\firefox.exe')
}

// PUBLIC API

export { Channel, Context, Driver, Options, ServiceBuilder }
