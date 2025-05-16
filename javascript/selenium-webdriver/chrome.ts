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
 * @fileoverview Defines a {@linkplain Driver WebDriver} client for the Chrome
 * web browser. Before using this module, you must download the latest
 * [ChromeDriver release] and ensure it can be found on your system [PATH].
 *
 * There are three primary classes exported by this module:
 *
 * 1. {@linkplain ServiceBuilder}: configures the
 *     {@link selenium-webdriver/remote.DriverService remote.DriverService}
 *     that manages the [ChromeDriver] child process.
 *
 * 2. {@linkplain Options}: defines configuration options for each new Chrome
 *     session, such as which {@linkplain Options#setProxy proxy} to use,
 *     what {@linkplain Options#addExtensions extensions} to install, or
 *     what {@linkplain Options#addArguments command-line switches} to use when
 *     starting the browser.
 *
 * 3. {@linkplain Driver}: the WebDriver client; each new instance will control
 *     a unique browser session with a clean user profile (unless otherwise
 *     configured through the {@link Options} class).
 *
 *     let chrome = require('selenium-webdriver/chrome');
 *     let {Builder} = require('selenium-webdriver');
 *
 *     let driver = new Builder()
 *         .forBrowser('chrome')
 *         .setChromeOptions(new chrome.Options())
 *         .build();
 *
 * [ChromeDriver]: https://chromedriver.chromium.org/
 * [ChromeDriver release]: http://chromedriver.storage.googleapis.com/index.html
 * [PATH]: http://en.wikipedia.org/wiki/PATH_%28variable%29
 */

import { Browser } from './lib/capabilities';
import * as chromium from './chromium';
import * as remote from './remote';
import { Executor } from './lib/http';
import { Capabilities } from './lib/capabilities';

const CHROME_CAPABILITY_KEY = 'goog:chromeOptions';

/**
 * Creates {@link selenium-webdriver/remote.DriverService} instances that manage
 * a [ChromeDriver](https://chromedriver.chromium.org/)
 * server in a child process.
 */
export class ServiceBuilder extends chromium.ServiceBuilder {
  /**
   * @param opt_exe Path to the server executable to use. If omitted,
   *     the builder will attempt to locate the chromedriver on the current
   *     PATH. If the chromedriver is not available in path, selenium-manager will
   *     download the chromedriver
   * @throws {Error} If provided executable does not exist, or the chromedriver
   *     cannot be found on the PATH.
   */
  constructor(opt_exe?: string) {
    super(opt_exe);
  }
}

/**
 * Class for managing ChromeDriver specific options.
 */
export class Options extends chromium.Options {
  /**
   * @param other Another set of capabilities to initialize this instance from.
   */
  constructor(other: Capabilities | Map<string, any> | Record<string, any> = new Map()) {
    super(other);
    this.CAPABILITY_KEY = CHROME_CAPABILITY_KEY;
    this.BROWSER_NAME_VALUE = Browser.CHROME;
  }

  /**
   * Sets the path to the Chrome binary to use. On Mac OS X, this path should
   * reference the actual Chrome executable, not just the application binary
   * (e.g. "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome").
   *
   * The binary path be absolute or relative to the chromedriver server
   * executable, but it must exist on the machine that will launch Chrome.
   *
   * @param path The path to the Chrome binary to use.
   * @return A self reference.
   */
  setChromeBinaryPath(path: string): Options {
    return <Options>this.setBinaryPath(path);
  }

  /**
   * Configures the ChromeDriver to launch Chrome on Android via adb. This
   * function is shorthand for
   * {@link #androidPackage options.androidPackage('com.android.chrome')}.
   * @return A self reference.
   */
  androidChrome(): Options {
    return <Options>this.androidPackage('com.android.chrome');
  }

  /**
   * Sets the path to Chrome's log file. This path should exist on the machine
   * that will launch Chrome.
   * @param path Path to the log file to use.
   * @return A self reference.
   */
  setChromeLogFile(path: string): Options {
    return <Options>this.setBrowserLogFile(path);
  }

  /**
   * Sets the directory to store Chrome minidumps in. This option is only
   * supported when ChromeDriver is running on Linux.
   * @param path The directory path.
   * @return A self reference.
   */
  setChromeMinidumpPath(path: string): Options {
    return <Options>this.setBrowserMinidumpPath(path);
  }
}

/**
 * Creates a new WebDriver client for Chrome.
 */
export class Driver extends chromium.Driver {
  /**
   * Creates a new session with the ChromeDriver.
   *
   * @param opt_config The configuration options.
   * @param opt_serviceExecutor Either
   *     a DriverService to use for the remote end, or a preconfigured executor
   *     for an externally managed endpoint. If neither is provided, the
   *     {@linkplain ##getDefaultService default service} will be used by
   *     default.
   * @return A new driver instance.
   */
  static createSession(
    opt_config?: Capabilities | Options,
    opt_serviceExecutor?: remote.DriverService | Executor
  ): Driver {
    const caps = opt_config || new Options();
    return super.createSession(
      caps,
      opt_serviceExecutor,
      'goog',
      CHROME_CAPABILITY_KEY
    ) as Driver;
  }

  /**
   * returns new instance chrome driver service
   * @returns {remote.DriverService}
   */
  static getDefaultService(): remote.DriverService {
    return new ServiceBuilder().build();
  }
}
