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
 * [geckodriver release]: https://github.com/mozilla/geckodriver/releases/
 * [PATH]: http://en.wikipedia.org/wiki/PATH_%28variable%29
 *
 * @module selenium-webdriver/firefox
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as Symbols from './lib/symbols';
import * as command from './lib/command';
import * as http from './http';
import * as io from './io';
import * as remote from './remote';
import * as webdriver from './lib/webdriver';
import * as zip from './io/zip';
import { Browser, Capabilities, Capability } from './lib/capabilities';
import { Zip } from './io/zip';
import { getBinaryPaths } from './common/driverFinder';
import { findFreePort } from './net/portprober';

const FIREFOX_CAPABILITY_KEY = 'moz:firefoxOptions';

/**
 * Thrown when there an add-on is malformed.
 * @final
 */
class AddonFormatError extends Error {
  /** @param {string} msg The error message. */
  constructor(msg: string) {
    super(msg);
    /** @override */
    this.name = this.constructor.name;
  }
}

/**
 * Installs an extension to the given directory.
 * @param {string} extension Path to the xpi extension file to install.
 * @param {string} dir Path to the directory to install the extension in.
 * @return {!Promise<string>} A promise for the add-on ID once
 *     installed.
 */
async function installExtension(extension: string, dir: string): Promise<string> {
  const ext = extension.slice(-4);
  if (ext !== '.xpi' && ext !== '.zip') {
    throw Error('File name does not end in ".zip" or ".xpi": ' + ext);
  }

  let archive = await zip.load(extension);
  if (!archive.has('manifest.json')) {
    throw new AddonFormatError(`Couldn't find manifest.json in ${extension}`);
  }

  let buf = await archive.getFile('manifest.json');
  let parsedJSON = JSON.parse(buf.toString('utf8'));

  let { browser_specific_settings } = parsedJSON as {
    browser_specific_settings?: { gecko?: { id?: string } }
  };

  if (browser_specific_settings && browser_specific_settings.gecko) {
    /* browser_specific_settings is an alternative to applications
     * It is meant to facilitate cross-browser plugins since Firefox48
     * see https://bugzilla.mozilla.org/show_bug.cgi?id=1262005
     */
    parsedJSON.applications = browser_specific_settings;
  }

  let { applications } = parsedJSON as {
    applications?: { gecko?: { id?: string } }
  };

  if (!(applications && applications.gecko && applications.gecko.id)) {
    throw new AddonFormatError(`Could not find add-on ID for ${extension}`);
  }

  await io.copy(extension, `${path.join(dir, applications.gecko.id)}.xpi`);
  return applications.gecko.id;
}

class Profile {
  /** @private */
  template_: string | null = null;

  /** @private */
  extensions_: string[] = [];

  addExtensions(paths: string[]): void {
    this.extensions_ = this.extensions_.concat(...paths);
  }

  /**
   * @return A promise for a base64 encoded profile, or undefined if there's no data to include.
   */
  [Symbols.serialize](): Promise<string> | undefined {
    if (this.template_ || this.extensions_.length) {
      return buildProfile(this.template_, this.extensions_);
    }
    return undefined;
  }
}

/**
 * @param template path to an existing profile to use as a template.
 * @param extensions paths to extensions to install in the new profile.
 * @return a promise for the base64 encoded profile.
 */
async function buildProfile(template: string | null, extensions: string[]): Promise<string> {
  let dir = template;

  if (extensions.length) {
    dir = await io.tmpDir();
    if (template) {
      await io.copyDir(template, dir, /(parent\.lock|lock|\.parentlock)/);
    }

    const extensionsDir = path.join(dir as string, 'extensions');
    await io.mkdir(extensionsDir);

    for (let i = 0; i < extensions.length; i++) {
      await installExtension(extensions[i], extensionsDir);
    }
  }

  let zipFile = new Zip();
  return zipFile
    .addDir(dir as string)
    .then(() => zipFile.toBuffer())
    .then((buf) => buf.toString('base64'));
}

/**
 * Configuration options for the FirefoxDriver.
 */
export class Options extends Capabilities {
  /**
   * @param other Another set of capabilities to initialize this instance from.
   */
  constructor(other?: Capabilities | Map<string, any> | Record<string, any>) {
    super(other);
    this.setBrowserName(Browser.FIREFOX);
    // Firefox 129 onwards the CDP protocol will not be enabled by default. Setting this preference will enable it.
    // https://fxdx.dev/deprecating-cdp-support-in-firefox-embracing-the-future-with-webdriver-bidi/.
    this.setPreference('remote.active-protocols', 3);
  }

  /**
   * @return The Firefox specific options object.
   * @private
   */
  firefoxOptions_(): Record<string, any> {
    let options = this.get(FIREFOX_CAPABILITY_KEY) as Record<string, any>;
    if (!options) {
      options = {};
      this.set(FIREFOX_CAPABILITY_KEY, options);
    }
    return options;
  }

  /**
   * @return The Firefox profile.
   * @private
   */
  profile_(): Profile {
    let options = this.firefoxOptions_();
    if (!options.profile) {
      options.profile = new Profile();
    }
    return options.profile;
  }

  /**
   * Specify additional command line arguments that should be used when starting
   * the Firefox browser.
   *
   * @param args The arguments to include.
   * @return A self reference.
   */
  addArguments(...args: (string | string[])[]): Options {
    if (args.length) {
      let options = this.firefoxOptions_();
      options.args = options.args ? options.args.concat(...args) : args;
    }
    return this;
  }

  /**
   * Sets the initial window size
   *
   * @param size The desired window size.
   * @return A self reference.
   * @throws {TypeError} if width or height is unspecified, not a number, or
   *     less than or equal to 0.
   */
  windowSize({ width, height }: { width: number; height: number }): Options {
    function checkArg(arg: number): void {
      if (typeof arg !== 'number' || arg <= 0) {
        throw TypeError('Arguments must be {width, height} with numbers > 0');
      }
    }

    checkArg(width);
    checkArg(height);
    return this.addArguments(`--width=${width}`, `--height=${height}`);
  }

  /**
   * Add extensions that should be installed when starting Firefox.
   *
   * @param paths The paths to the extension XPI files to install.
   * @return A self reference.
   */
  addExtensions(...paths: string[]): Options {
    this.profile_().addExtensions(paths);
    return this;
  }

  /**
   * @param key the preference key.
   * @param value the preference value.
   * @return A self reference.
   * @throws {TypeError} if either the key or value has an invalid type.
   */
  setPreference(key: string, value: string | number | boolean): Options {
    if (typeof key !== 'string') {
      throw TypeError(`key must be a string, but got ${typeof key}`);
    }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw TypeError(`value must be a string, number, or boolean, but got ${typeof value}`);
    }
    let options = this.firefoxOptions_();
    options.prefs = options.prefs || {};
    options.prefs[key] = value;
    return this;
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
  setProfile(profile: string): Options {
    if (typeof profile !== 'string') {
      throw TypeError(`profile must be a string, but got ${typeof profile}`);
    }
    this.profile_().template_ = profile;
    return this;
  }

  /**
   * Sets the binary to use. The binary may be specified as the path to a
   * Firefox executable.
   *
   * @param binary The binary to use.
   * @return A self reference.
   * @throws {TypeError} If `binary` is an invalid type.
   */
  setBinary(binary: string | Channel): Options {
    if (binary instanceof Channel || typeof binary === 'string') {
      this.firefoxOptions_().binary = binary;
      return this;
    }
    throw TypeError('binary must be a string path ');
  }

  /**
   * Enables Mobile start up features
   *
   * @param androidPackage The package to use
   * @param androidActivity The activity to use
   * @param deviceSerial The device serial to use
   * @return A self reference
   */
  enableMobile(
    androidPackage: string = 'org.mozilla.firefox',
    androidActivity: string | null = null,
    deviceSerial: string | null = null
  ): Options {
    this.firefoxOptions_().androidPackage = androidPackage;

    if (androidActivity) {
      this.firefoxOptions_().androidActivity = androidActivity;
    }
    if (deviceSerial) {
      this.firefoxOptions_().deviceSerial = deviceSerial;
    }
    return this;
  }

  /**
   * Enables moz:debuggerAddress for firefox cdp
   */
  enableDebugger(): Options {
    return <Options>this.set('moz:debuggerAddress', true);
  }

  /**
   * Enable bidi connection
   * @returns A self reference
   */
  enableBidi(): Options {
    return <Options>this.set('webSocketUrl', true);
  }
}

/**
 * Enum of available command contexts.
 *
 * Command contexts are specific to Marionette, and may be used with the
 * {@link #context=} method. Contexts allow you to direct all subsequent
 * commands to either "content" (default) or "chrome". The latter gives
 * you elevated security permissions.
 *
 * @enum {string}
 */
export enum Context {
  CONTENT = 'content',
  CHROME = 'chrome',
}

/**
 * @param file Path to the file to find, relative to the program files root.
 * @return A promise for the located executable.
 *     The promise will resolve to {@code null} if Firefox was not found.
 */
function findInProgramFiles(file: string): Promise<string | null> {
  let files = [
    process.env['PROGRAMFILES'] || 'C:\\Program Files',
    process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
  ].map((prefix) => path.join(prefix, file));

  return io.exists(files[0]).then(function(exists) {
    return exists
      ? files[0]
      : io.exists(files[1]).then(function(exists) {
          return exists ? files[1] : null;
        });
  });
}

/** @enum {string} */
enum ExtensionCommand {
  GET_CONTEXT = 'getContext',
  SET_CONTEXT = 'setContext',
  INSTALL_ADDON = 'install addon',
  UNINSTALL_ADDON = 'uninstall addon',
  FULL_PAGE_SCREENSHOT = 'fullPage screenshot',
}

/**
 * Creates a command executor with support for Marionette's custom commands.
 * @param serverUrl The server's URL.
 * @return The new command executor.
 */
function createExecutor(serverUrl: Promise<string>): command.Executor {
  let client = serverUrl.then((url) => new http.HttpClient(url));
  let executor = new http.Executor(client);
  configureExecutor(executor);
  return executor;
}

/**
 * Configures the given executor with Firefox-specific commands.
 * @param executor the executor to configure.
 */
function configureExecutor(executor: any): void {
  executor.defineCommand(ExtensionCommand.GET_CONTEXT, 'GET', '/session/:sessionId/moz/context');
  executor.defineCommand(ExtensionCommand.SET_CONTEXT, 'POST', '/session/:sessionId/moz/context');
  executor.defineCommand(ExtensionCommand.INSTALL_ADDON, 'POST', '/session/:sessionId/moz/addon/install');
  executor.defineCommand(ExtensionCommand.UNINSTALL_ADDON, 'POST', '/session/:sessionId/moz/addon/uninstall');
  executor.defineCommand(ExtensionCommand.FULL_PAGE_SCREENSHOT, 'GET', '/session/:sessionId/moz/screenshot/full');
}

/**
 * Creates {@link selenium-webdriver/remote.DriverService} instances that manage
 * a [geckodriver](https://github.com/mozilla/geckodriver) server in a child
 * process.
 */
export class ServiceBuilder extends remote.DriverService.Builder {
  /**
   * @param opt_exe Path to the server executable to use. If omitted,
   *     the builder will attempt to locate the geckodriver on the system PATH.
   */
  constructor(opt_exe?: string) {
    super(opt_exe);
    this.setLoopback(true); // Required.
  }

  /**
   * Enables verbose logging.
   *
   * @param opt_trace Whether to enable trace-level logging. By
   *     default, only debug logging is enabled.
   * @return A self reference.
   */
  enableVerboseLogging(opt_trace?: boolean): ServiceBuilder {
    return this.addArguments(opt_trace ? '-vv' : '-v');
  }

  /**
   * Overrides the parent build() method to add the websocket port argument
   * for Firefox when not connecting to an existing instance.
   *
   * @return A new driver service instance.
   */
  build(): remote.DriverService {
    // Add the websocket port argument as a promise
    // This is required for Firefox to work properly
    this.addArguments(findFreePort().then((wsPort) => `--websocket-port=${wsPort}`));
    
    // Now build using the parent class which will handle all arguments properly
    return super.build();
  }
}

/**
 * A WebDriver client for Firefox.
 */
export class Driver extends webdriver.WebDriver {
  /**
   * Creates a new Firefox session.
   *
   *    configuration options for this driver, specified as either an
   *    {@link Options} or {@link Capabilities}, or as a raw hash object.
   *   pre-configured command executor to use for communicating with an
   *   externally managed remote end (which is assumed to already be running),
   *   or the `DriverService` to use to start the geckodriver in a child
   *   process.
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
   * @param executorOrCaps
   * @param capabilitiesOrService
   * @param onQuitOrVendorPrefix
   */
  static createSession(
    executorOrCaps?: Options | Capabilities | Record<string, any> | typeof http.Executor ,
    capabilitiesOrService?: Capabilities | remote.DriverService | typeof http.Executor ,
    onQuitOrVendorPrefix?: (() => any) | string
  ): Driver {
    // Handle the WebDriver.createSession signature
    if (executorOrCaps instanceof http.Executor &&
        capabilitiesOrService instanceof Capabilities) {
      // Convert Capabilities to Options if needed
      const caps = capabilitiesOrService instanceof Options ?
        capabilitiesOrService :
        new Options(capabilitiesOrService);

      return super.createSession(
        executorOrCaps,
        caps,
        typeof onQuitOrVendorPrefix === 'function' ? onQuitOrVendorPrefix : undefined
      ) as Driver;
    }

    // Use type assertion to avoid type errors
    let caps: Options;

    if (executorOrCaps instanceof Options) {
      caps = executorOrCaps;
    } else {
      caps = new Options();

      if (executorOrCaps instanceof Capabilities) {
        // Copy properties from Capabilities to Options
        const capMap = (executorOrCaps as any).map_;
        if (capMap) {
          for (const [key, value] of capMap.entries()) {
            caps.set(key, value);
          }
        }
      } else if (executorOrCaps && typeof executorOrCaps === 'object' &&
                !(executorOrCaps instanceof http.Executor)) {
        // Copy properties from object to Options
        for (const [key, value] of Object.entries(executorOrCaps as Record<string, any>)) {
          caps.set(key, value);
        }
      }
    }

    let firefoxBrowserPath = null;

    let executor: command.Executor;
    let onQuit: (() => void) | undefined;

    if (capabilitiesOrService instanceof http.Executor ||
        (typeof capabilitiesOrService === 'function' && capabilitiesOrService === http.Executor)) {
      executor = capabilitiesOrService instanceof http.Executor ?
        capabilitiesOrService :
        new http.Executor(Promise.resolve(new http.HttpClient('')));
      configureExecutor(executor);
    } else if (capabilitiesOrService instanceof remote.DriverService) {
      if (!capabilitiesOrService.getExecutable()) {
        const { driverPath, browserPath } = getBinaryPaths(caps);
        capabilitiesOrService.setExecutable(driverPath);
        firefoxBrowserPath = browserPath;
      }
      executor = createExecutor(capabilitiesOrService.start());
      onQuit = () => capabilitiesOrService.kill();
    } else {
      let service = new ServiceBuilder().build();
      if (!service.getExecutable()) {
        const { driverPath, browserPath } = getBinaryPaths(caps);
        service.setExecutable(driverPath);
        firefoxBrowserPath = browserPath;
      }
      executor = createExecutor(service.start());
      onQuit = () => service.kill();
    }

    if (firefoxBrowserPath) {
      const vendorOptions = caps.get(FIREFOX_CAPABILITY_KEY);
      if (vendorOptions) {
        (vendorOptions as Record<string, any>)['binary'] = firefoxBrowserPath;
        caps.set(FIREFOX_CAPABILITY_KEY, vendorOptions);
      } else {
        caps.set(FIREFOX_CAPABILITY_KEY, { binary: firefoxBrowserPath });
      }
      caps.delete(Capability.BROWSER_VERSION);
    }

    return super.createSession(executor, caps, onQuit) as Driver;
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
    return this.execute(new command.Command(ExtensionCommand.GET_CONTEXT));
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
    return this.execute(new command.Command(ExtensionCommand.SET_CONTEXT).setParameter('context', ctx));
  }

  /**
   * Installs a new addon with the current session. This function will return an
   * ID that may later be used to {@linkplain #uninstallAddon uninstall} the
   * addon.
   *
   * @param path Path on the local filesystem to the web extension to install.
   * @param temporary Flag indicating whether the extension should be
   *     installed temporarily - gets removed on restart
   * @return A promise that will resolve to an ID for the
   *     newly installed addon.
   * @see #uninstallAddon
   */
  async installAddon(path: string, temporary: boolean = false): Promise<string> {
    let stats = fs.statSync(path);
    let buf: Buffer;
    if (stats.isDirectory()) {
      let zipFile = new Zip();
      await zipFile.addDir(path);
      buf = await zipFile.toBuffer('DEFLATE');
    } else {
      buf = await io.read(path);
    }
    return this.execute(
      new command.Command(ExtensionCommand.INSTALL_ADDON)
        .setParameter('addon', buf.toString('base64'))
        .setParameter('temporary', temporary),
    );
  }

  /**
   * Uninstalls an addon from the current browser session's profile.
   *
   * @param id ID of the addon to uninstall.
   * @return A promise that will resolve when the operation has completed.
   * @see #installAddon
   */
  async uninstallAddon(id: string | Promise<string>): Promise<void> {
    id = await Promise.resolve(id);
    return this.execute(new command.Command(ExtensionCommand.UNINSTALL_ADDON).setParameter('id', id));
  }

  /**
   * Take full page screenshot of the visible region
   *
   * @return A promise that will be
   *     resolved to the screenshot as a base-64 encoded PNG.
   */
  takeFullPageScreenshot(): Promise<string> {
    return this.execute(new command.Command(ExtensionCommand.FULL_PAGE_SCREENSHOT));
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
export class Channel {
  /** @private @const */
  private darwin_: string;
  /** @private @const */
  private win32_: string;
  /** @private */
  private found_: Promise<string> | null = null;

  /**
   * @param darwin The path to check when running on MacOS.
   * @param win32 The path to check when running on Windows.
   */
  constructor(darwin: string, win32: string) {
    this.darwin_ = darwin;
    this.win32_ = win32;
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
      return this.found_;
    }

    let found: Promise<string>;
    switch (process.platform) {
      case 'darwin':
        found = io.exists(this.darwin_).then((exists) => (exists ? this.darwin_ : io.findInPath('firefox')));
        break;

      case 'win32':
        found = findInProgramFiles(this.win32_).then((found) => found || io.findInPath('firefox.exe'));
        break;

      default:
        found = Promise.resolve(io.findInPath('firefox'));
        break;
    }

    this.found_ = found.then((found) => {
      if (found) {
        // TODO: verify version info.
        return found;
      }
      throw Error('Could not locate Firefox on the current system');
    });
    return this.found_;
  }

  /** @return */
  [Symbols.serialize](): Promise<string> {
    return this.locate();
  }

  /**
   * Firefox's developer channel.
   * @see <https://www.mozilla.org/en-US/firefox/channel/desktop/#developer>
   */
  static DEV = new Channel(
    '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox',
    'Firefox Developer Edition\\firefox.exe',
  );

  /**
   * Firefox's beta channel. Note this is provided mainly for convenience as
   * the beta channel has the same installation location as the main release
   * channel.
   * @see <https://www.mozilla.org/en-US/firefox/channel/desktop/#beta>
   */
  static BETA = new Channel('/Applications/Firefox.app/Contents/MacOS/firefox', 'Mozilla Firefox\\firefox.exe');

  /**
   * Firefox's release channel.
   * @see <https://www.mozilla.org/en-US/firefox/desktop/>
   */
  static RELEASE = new Channel('/Applications/Firefox.app/Contents/MacOS/firefox', 'Mozilla Firefox\\firefox.exe');

  /**
   * Firefox's nightly release channel.
   * @see <https://www.mozilla.org/en-US/firefox/channel/desktop/#nightly>
   */
  static NIGHTLY = new Channel('/Applications/Firefox Nightly.app/Contents/MacOS/firefox', 'Nightly\\firefox.exe');
}
