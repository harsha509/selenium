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
 * @fileoverview Defines an abstract {@linkplain Driver WebDriver} client for
 * Chromium-based web browsers. These classes should not be instantiated
 * directly.
 */

import * as http from './http';
import * as io from './io';
import { Capabilities, Capability } from './lib/capabilities';
import * as command from './lib/command';
import * as error from './lib/error';
import * as Symbols from './lib/symbols';
import * as webdriver from './lib/webdriver';
import * as remote from './remote';
import { getBinaryPaths } from './common/driverFinder';

/**
 * Custom command names supported by Chromium WebDriver.
 */
export enum Command {
  LAUNCH_APP = 'launchApp',
  GET_NETWORK_CONDITIONS = 'getNetworkConditions',
  SET_NETWORK_CONDITIONS = 'setNetworkConditions',
  DELETE_NETWORK_CONDITIONS = 'deleteNetworkConditions',
  SEND_DEVTOOLS_COMMAND = 'sendDevToolsCommand',
  SEND_AND_GET_DEVTOOLS_COMMAND = 'sendAndGetDevToolsCommand',
  SET_PERMISSION = 'setPermission',
  GET_CAST_SINKS = 'getCastSinks',
  SET_CAST_SINK_TO_USE = 'setCastSinkToUse',
  START_CAST_DESKTOP_MIRRORING = 'startDesktopMirroring',
  START_CAST_TAB_MIRRORING = 'setCastTabMirroring',
  GET_CAST_ISSUE_MESSAGE = 'getCastIssueMessage',
  STOP_CASTING = 'stopCasting'
}

/**
 * Creates a command executor with support for Chromium's custom commands.
 */
function createExecutor(url: Promise<string>, vendorPrefix: string): http.Executor {
  const agent = new http.Agent({ keepAlive: true });
  const client = url.then((url) => new http.HttpClient(url, agent));
  const executor = new http.Executor(client);
  configureExecutor(executor, vendorPrefix);
  return executor;
}

/**
 * Configures the given executor with Chromium-specific commands.
 */
function configureExecutor(executor: http.Executor, vendorPrefix: string): void {
  executor.defineCommand(Command.LAUNCH_APP, 'POST', '/session/:sessionId/chromium/launch_app');
  executor.defineCommand(Command.GET_NETWORK_CONDITIONS, 'GET', '/session/:sessionId/chromium/network_conditions');
  executor.defineCommand(Command.SET_NETWORK_CONDITIONS, 'POST', '/session/:sessionId/chromium/network_conditions');
  executor.defineCommand(Command.DELETE_NETWORK_CONDITIONS, 'DELETE', '/session/:sessionId/chromium/network_conditions');
  executor.defineCommand(Command.SEND_DEVTOOLS_COMMAND, 'POST', '/session/:sessionId/chromium/send_command');
  executor.defineCommand(
    Command.SEND_AND_GET_DEVTOOLS_COMMAND,
    'POST',
    '/session/:sessionId/chromium/send_command_and_get_result'
  );
  executor.defineCommand(Command.SET_PERMISSION, 'POST', '/session/:sessionId/permissions');
  executor.defineCommand(Command.GET_CAST_SINKS, 'GET', `/session/:sessionId/${vendorPrefix}/cast/get_sinks`);
  executor.defineCommand(
    Command.SET_CAST_SINK_TO_USE,
    'POST',
    `/session/:sessionId/${vendorPrefix}/cast/set_sink_to_use`
  );
  executor.defineCommand(
    Command.START_CAST_DESKTOP_MIRRORING,
    'POST',
    `/session/:sessionId/${vendorPrefix}/cast/start_desktop_mirroring`
  );
  executor.defineCommand(
    Command.START_CAST_TAB_MIRRORING,
    'POST',
    `/session/:sessionId/${vendorPrefix}/cast/start_tab_mirroring`
  );
  executor.defineCommand(
    Command.GET_CAST_ISSUE_MESSAGE,
    'GET',
    `/session/:sessionId/${vendorPrefix}/cast/get_issue_message`
  );
  executor.defineCommand(Command.STOP_CASTING, 'POST', `/session/:sessionId/${vendorPrefix}/cast/stop_casting`);
}

/**
 * Creates {@link selenium-webdriver/remote.DriverService} instances that manage
 * a WebDriver server in a child process.
 */
export class ServiceBuilder {
  private args_: string[] = [];
  private loopback_: boolean = false;
  private exe_: string | undefined;
  private path_: string = '';

  /**
   * @param exe Path to the server executable to use. Subclasses
   * should ensure a valid path to the appropriate exe is provided.
   */
  constructor(exe?: string) {
    this.exe_ = exe;
    this.setLoopback(true); // Required
  }

  /**
   * Sets whether the driver should only accept connections from the local
   * machine.
   */
  setLoopback(loopback: boolean): ServiceBuilder {
    this.loopback_ = loopback;
    return this;
  }

  /**
   * Sets the base path for WebDriver REST commands (e.g. "/wd/hub").
   * By default, the driver will accept commands relative to "/".
   */
  setPath(path: string): ServiceBuilder {
    this.path_ = path;
    return this.addArguments('--url-base=' + path);
  }

  /**
   * Defines the server's logging level. By default, the WebDriver server will
   * log to stdout.
   */
  setLoggingLevel(level: string): ServiceBuilder {
    return this.addArguments('--log-level=' + level);
  }

  /**
   * Adds a command-line argument to use when starting the service.
   */
  addArgument(arg: string): ServiceBuilder {
    this.args_.push(arg);
    return this;
  }

  /**
   * Adds command-line arguments to use when starting the service.
   */
  addArguments(...args: (string | string[])[]): ServiceBuilder {
    this.args_ = this.args_.concat(...args);
    return this;
  }

  /**
   * Sets which port adb is listening to.
   */
  setAdbPort(port: number): ServiceBuilder {
    return this.addArguments('--adb-port=' + port);
  }

  /**
   * Sets the path of the log file the driver should log to.
   */
  loggingTo(path: string): ServiceBuilder {
    return this.addArguments('--log-path=' + path);
  }

  /**
   * Enables Chrome logging.
   */
  enableChromeLogging(): ServiceBuilder {
    return this.addArguments('--enable-chrome-logs');
  }

  /**
   * Enables verbose logging.
   */
  enableVerboseLogging(): ServiceBuilder {
    return this.addArguments('--verbose');
  }

  /**
   * Sets the number of threads the driver should use to manage HTTP requests.
   */
  setNumHttpThreads(n: number): ServiceBuilder {
    return this.addArguments('--http-threads=' + n);
  }

  /**
   * Returns the path to the server executable.
   */
  getExecutable(): string | undefined {
    return this.exe_;
  }

  /**
   * Sets the path to the server executable.
   */
  setExecutable(exe: string): ServiceBuilder {
    this.exe_ = exe;
    return this;
  }

  /**
   * Builds the service.
   */
  build(): remote.DriverService {
    const args = this.args_.slice();
    if (this.loopback_) {
      args.push('--bind-address=localhost');
    }
    return new remote.DriverService(this.exe_ || '', args);
  }
}

/**
 * A list of extensions to install when launching the browser.
 */
class Extensions {
  private extensions: (string | Buffer)[] = [];

  /**
   * @return The length of the extensions list.
   */
  get length(): number {
    return this.extensions.length;
  }

  /**
   * Add additional extensions to install when launching the browser.
   */
  add(...args: (string | Buffer | (string | Buffer)[])[]): void {
    this.extensions = this.extensions.concat(...args);
  }

  /**
   * @return A serialized representation of this Extensions object.
   */
  [Symbols.serialize](): Promise<string>[] {
    return this.extensions.map(function(extension) {
      if (Buffer.isBuffer(extension)) {
        return extension.toString('base64');
      }
      return io.read(extension as string).then((buffer) => buffer.toString('base64'));
    });
  }
}

/**
 * Class for managing WebDriver options specific to a Chromium-based browser.
 */
export class Options {
  protected options_: Record<string, any> = {};
  
  /** The key to use when adding options to a capabilities object. */
  CAPABILITY_KEY: string = '';
  
  /** The browser name to use in the capabilities object. */
  BROWSER_NAME_VALUE: string = '';

  /**
   * @param other Another set of capabilities to initialize this instance from.
   */
  constructor(other: Capabilities | Map<string, any> | Record<string, any> = new Map()) {
    if (other instanceof Capabilities) {
      this.options_ = other.get(this.CAPABILITY_KEY) || {};
    } else if (other instanceof Map) {
      this.options_ = other.get(this.CAPABILITY_KEY) || {};
    } else {
      this.options_ = other[this.CAPABILITY_KEY] || {};
    }
  }

  /**
   * Add additional command line arguments to use when launching the browser.
   */
  addArguments(...args: (string | string[])[]): Options {
    let newArgs = (this.options_.args || []).concat(...args);
    if (newArgs.length) {
      this.options_.args = newArgs;
    }
    return this;
  }

  /**
   * Sets the address of a Chromium remote debugging server to connect to.
   */
  debuggerAddress(address: string): Options {
    this.options_.debuggerAddress = address;
    return this;
  }

  /**
   * Sets the initial window size.
   */
  windowSize({ width, height }: { width: number; height: number }): Options {
    function checkArg(arg: number): void {
      if (typeof arg !== 'number' || arg <= 0) {
        throw TypeError('Arguments must be {width, height} with numbers > 0');
      }
    }

    checkArg(width);
    checkArg(height);
    return this.addArguments(`window-size=${width},${height}`);
  }

  /**
   * List of Chrome command line switches to exclude.
   */
  excludeSwitches(...args: (string | string[])[]): Options {
    let switches = (this.options_.excludeSwitches || []).concat(...args);
    if (switches.length) {
      this.options_.excludeSwitches = switches;
    }
    return this;
  }

  /**
   * Add additional extensions to install when launching the browser.
   */
  addExtensions(...args: (string | Buffer | (string | Buffer)[])[]): Options {
    let extensions = this.options_.extensions || new Extensions();
    extensions.add(...args);
    if (extensions.length) {
      this.options_.extensions = extensions;
    }
    return this;
  }

  /**
   * Sets the path to the browser binary to use.
   */
  setBinaryPath(path: string): Options {
    this.options_.binary = path;
    return this;
  }

  /**
   * Sets whether to leave the started browser process running if the controlling
   * driver service is killed.
   */
  detachDriver(detach: boolean): Options {
    this.options_.detach = detach;
    return this;
  }

  /**
   * Sets the user preferences for Chrome's user profile.
   */
  setUserPreferences(prefs: Record<string, any>): Options {
    this.options_.prefs = prefs;
    return this;
  }

  /**
   * Sets the performance logging preferences.
   */
  setPerfLoggingPrefs(prefs: {
    enableNetwork?: boolean;
    enablePage?: boolean;
    enableTimeline?: boolean;
    traceCategories?: string;
    bufferUsageReportingInterval?: number;
  }): Options {
    this.options_.perfLoggingPrefs = prefs;
    return this;
  }

  /**
   * Sets preferences for the "Local State" file in Chrome's user data directory.
   */
  setLocalState(state: Record<string, any>): Options {
    this.options_.localState = state;
    return this;
  }

  /**
   * Sets the name of the activity hosting a Chrome-based Android WebView.
   */
  androidActivity(name: string): Options {
    this.options_.androidActivity = name;
    return this;
  }

  /**
   * Sets the device serial number to connect to via ADB.
   */
  androidDeviceSerial(serial: string): Options {
    this.options_.androidDeviceSerial = serial;
    return this;
  }

  /**
   * Sets the package name of the Chrome or WebView app.
   */
  androidPackage(pkg: string | null): Options {
    this.options_.androidPackage = pkg;
    return this;
  }

  /**
   * Sets the process name of the Activity hosting the WebView.
   */
  androidProcess(processName: string): Options {
    this.options_.androidProcess = processName;
    return this;
  }

  /**
   * Sets whether to connect to an already-running app.
   */
  androidUseRunningApp(useRunning: boolean): Options {
    this.options_.androidUseRunningApp = useRunning;
    return this;
  }

  /**
   * Sets the path to the browser's log file.
   */
  setBrowserLogFile(path: string): Options {
    this.options_.logPath = path;
    return this;
  }

  /**
   * Sets the directory to store browser minidumps in.
   */
  setBrowserMinidumpPath(path: string): Options {
    this.options_.minidumpPath = path;
    return this;
  }

  /**
   * Configures the browser to emulate a mobile device.
   */
  setMobileEmulation(config: { deviceName: string } | { width: number; height: number; pixelRatio: number } | null): Options {
    this.options_.mobileEmulation = config;
    return this;
  }

  /**
   * Sets a list of the window types that will appear when getting window handles.
   */
  windowTypes(...args: (string | string[])[]): Options {
    let windowTypes = (this.options_.windowTypes || []).concat(...args);
    if (windowTypes.length) {
      this.options_.windowTypes = windowTypes;
    }
    return this;
  }

  /**
   * Enable bidi connection
   */
  enableBidi(): Options {
    this.options_['webSocketUrl'] = true;
    return this;
  }

  /**
   * Converts this options instance to a capabilities object.
   */
  toCapabilities(): Capabilities {
    const caps = new Capabilities();
    caps.setBrowserName(this.BROWSER_NAME_VALUE);
    caps.set(this.CAPABILITY_KEY, this.options_);
    return caps;
  }
}

/**
 * Creates a new WebDriver client for Chromium-based browsers.
 */
export class Driver extends webdriver.WebDriver {
  /**
   * Creates a new session with the WebDriver server.
   */
  static createSession(
    caps?: Capabilities | Options,
    opt_serviceExecutor?: remote.DriverService | http.Executor,
    vendorPrefix: string = '',
    vendorCapabilityKey: string = ''
  ): Driver {
    let executor: http.Executor;
    let onQuit: (() => void) | undefined;
    
    if (opt_serviceExecutor instanceof http.Executor) {
      executor = opt_serviceExecutor;
      configureExecutor(executor, vendorPrefix);
    } else {
      let service = opt_serviceExecutor || (this as any).getDefaultService();
      if (!service.getExecutable()) {
        const { driverPath, browserPath } = getBinaryPaths(caps);
        service.setExecutable(driverPath);
        if (browserPath) {
          const vendorOptions = caps?.get?.(vendorCapabilityKey) || {};
          (vendorOptions as any)['binary'] = browserPath;
          if (caps instanceof Capabilities) {
            caps.set(vendorCapabilityKey, vendorOptions);
            caps.delete(Capability.BROWSER_VERSION);
          } else if (caps instanceof Options) {
            const newCaps = caps.toCapabilities();
            newCaps.set(vendorCapabilityKey, vendorOptions);
            newCaps.delete(Capability.BROWSER_VERSION);
            caps = newCaps;
          }
        }
      }
      onQuit = () => service.kill();
      executor = createExecutor(service.start(), vendorPrefix);
    }

    // W3C spec requires noProxy value to be an array of strings, but Chromium
    // expects a single host as a string.
    let proxy = caps instanceof Capabilities ? caps.get(Capability.PROXY) : null;
    if (proxy && typeof proxy === 'object' && Array.isArray((proxy as any).noProxy)) {
      (proxy as any).noProxy = (proxy as any).noProxy[0];
      if (!(proxy as any).noProxy) {
        (proxy as any).noProxy = undefined;
      }
    }

    const actualCaps = caps instanceof Options ? caps.toCapabilities() : (caps || new Capabilities());
    return webdriver.WebDriver.createSession(executor, actualCaps, onQuit) as Driver;
  }

  /**
   * This function is a no-op as file detectors are not supported by this
   * implementation.
   * @override
   */
  setFileDetector(): void {}

  /**
   * Schedules a command to launch Chrome App with given ID.
   */
  launchApp(id: string): Promise<void> {
    return this.execute(new command.Command(Command.LAUNCH_APP).setParameter('id', id));
  }

  /**
   * Schedules a command to get Chromium network emulation settings.
   */
  getNetworkConditions(): Promise<any> {
    return this.execute(new command.Command(Command.GET_NETWORK_CONDITIONS));
  }

  /**
   * Schedules a command to delete Chromium network emulation settings.
   */
  deleteNetworkConditions(): Promise<void> {
    return this.execute(new command.Command(Command.DELETE_NETWORK_CONDITIONS));
  }

  /**
   * Schedules a command to set Chromium network emulation settings.
   */
  setNetworkConditions(spec: {
    offline?: boolean;
    latency?: number;
    download_throughput?: number;
    upload_throughput?: number;
  }): Promise<void> {
    if (!spec || typeof spec !== 'object') {
      throw TypeError('setNetworkConditions called with non-network-conditions parameter');
    }
    return this.execute(new command.Command(Command.SET_NETWORK_CONDITIONS).setParameter('network_conditions', spec));
  }

  /**
   * Sends an arbitrary devtools command to the browser.
   */
  sendDevToolsCommand(cmd: string, params: Record<string, any> = {}): Promise<void> {
    return this.execute(
      new command.Command(Command.SEND_DEVTOOLS_COMMAND).setParameter('cmd', cmd).setParameter('params', params)
    );
  }

  /**
   * Sends an arbitrary devtools command to the browser and get the result.
   */
  sendAndGetDevToolsCommand(cmd: string, params: Record<string, any> = {}): Promise<string> {
    return this.execute(
      new command.Command(Command.SEND_AND_GET_DEVTOOLS_COMMAND)
        .setParameter('cmd', cmd)
        .setParameter('params', params)
    );
  }

  /**
   * Set a permission state to the given value.
   */
  setPermission(name: string, state: 'granted' | 'denied' | 'prompt'): Promise<any> {
    return this.execute(
      new command.Command(Command.SET_PERMISSION).setParameter('descriptor', { name }).setParameter('state', state)
    );
  }

  /**
   * Sends a DevTools command to change the browser's download directory.
   */
  async setDownloadPath(path: string): Promise<void> {
    if (!path || typeof path !== 'string') {
      throw new error.InvalidArgumentError('invalid download path');
    }
    const stat = await io.stat(path);
    if (!stat.isDirectory()) {
      throw new error.InvalidArgumentError('not a directory: ' + path);
    }
    return this.sendDevToolsCommand('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: path,
    });
  }

  /**
   * Returns the list of cast sinks (Cast devices) available to the Chrome media router.
   */
  getCastSinks(): Promise<string[]> {
    return this.execute(new command.Command(Command.GET_CAST_SINKS));
  }

  /**
   * Selects a cast sink (Cast device) as the recipient of media router intents.
   */
  setCastSinkToUse(deviceName: string): Promise<void> {
    return this.execute(new command.Command(Command.SET_CAST_SINK_TO_USE).setParameter('sinkName', deviceName));
  }

  /**
   * Initiates desktop mirroring for the current browser tab on the specified device.
   */
  startDesktopMirroring(deviceName: string): Promise<void> {
    return this.execute(new command.Command(Command.START_CAST_DESKTOP_MIRRORING).setParameter('sinkName', deviceName));
  }

  /**
   * Initiates tab mirroring for the current browser tab on the specified device.
   */
  startCastTabMirroring(deviceName: string): Promise<void> {
    return this.execute(new command.Command(Command.START_CAST_TAB_MIRRORING).setParameter('sinkName', deviceName));
  }

  /**
   * Returns an error message when there is any issue in a Cast session.
   */
  getCastIssueMessage(): Promise<string> {
    return this.execute(new command.Command(Command.GET_CAST_ISSUE_MESSAGE));
  }

  /**
   * Stops casting from media router to the specified device, if connected.
   */
  stopCasting(deviceName: string): Promise<void> {
    return this.execute(new command.Command(Command.STOP_CASTING).setParameter('sinkName', deviceName));
  }
}
