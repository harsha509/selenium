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
 * @fileoverview Defines a {@linkplain Driver WebDriver} client for
 * Microsoft's Edge web browser. Edge (Chromium) is supported and support
 * for Edge Legacy (EdgeHTML) as part of https://github.com/SeleniumHQ/selenium/issues/9166.
 * Before using this module, you must download and install the correct
 * [WebDriver](https://developer.microsoft.com/en-us/microsoft-edge/tools/webdriver/) server.
 *
 * Ensure that the msedgedriver (Chromium)
 * is on your [PATH](http://en.wikipedia.org/wiki/PATH_%28variable%29).
 *
 * You may use {@link Options} to specify whether Edge Chromium options should be used:

 *     const edge = require('selenium-webdriver/edge');
 *     const options = new edge.Options();

 * There are three primary classes exported by this module:
 *
 * 1. {@linkplain ServiceBuilder}: configures the
 *     {@link ./remote.DriverService remote.DriverService}
 *     that manages the [WebDriver] child process.
 *
 * 2. {@linkplain Options}: defines configuration options for each new
 *     WebDriver session, such as which
 *     {@linkplain Options#setProxy proxy} to use when starting the browser.
 *
 * 3. {@linkplain Driver}: the WebDriver client; each new instance will control
 *     a unique browser session.
 *
 * [WebDriver (Chromium)]: https://docs.microsoft.com/en-us/microsoft-edge/webdriver-chromium
 *
 * @module selenium-webdriver/edge
 */

import { Browser } from './lib/capabilities';
import * as chromium from './chromium';
import * as remote from './remote';
import { Capabilities } from './lib/capabilities';
import { Executor } from './lib/http';

const EDGE_CAPABILITY_KEY = 'ms:edgeOptions';

/**
 * Creates {@link selenium-webdriver/remote.DriverService} instances that manage
 * a [MSEdgeDriver](https://developer.microsoft.com/en-us/microsoft-edge/tools/webdriver/)
 * server in a child process.
 */
export class ServiceBuilder extends chromium.ServiceBuilder {
  /**
   * @param opt_exe Path to the server executable to use. If omitted,
   *     the builder will attempt to locate the msedgedriver on the current
   *     PATH.
   * @throws {Error} If provided executable does not exist, or the msedgedriver
   *     cannot be found on the PATH.
   */
  constructor(opt_exe?: string) {
    super(opt_exe);
    this.setLoopback(true);
  }
}

/**
 * Class for managing edge chromium specific options.
 */
export class Options extends chromium.Options {
  /**
   * @param other Another set of capabilities to initialize this instance from.
   */
  constructor(other: Capabilities | Map<string, any> | Record<string, any> = new Map()) {
    super(other);
    this.CAPABILITY_KEY = EDGE_CAPABILITY_KEY;
    this.BROWSER_NAME_VALUE = Browser.EDGE;
  }

  /**
   * Sets the path to the edge binary to use
   *
   * The binary path be absolute or relative to the msedgedriver server
   * executable, but it must exist on the machine that will launch edge chromium.
   *
   * @param path The path to the msedgedriver binary to use.
   * @return A self reference.
   */
  setEdgeChromiumBinaryPath(path: string): Options {
    return this.setBinaryPath(path) as Options;
  }

  /**
   * Changes the browser name to 'webview2' to enable
   * <a href="https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/webdriver">
   *   test automation of WebView2 apps with Microsoft Edge WebDriver
   * </a>
   *
   * @param enable flag to enable or disable the 'webview2' usage
   */
  useWebView(enable: boolean): Options {
    const browserName = enable ? 'webview2' : Browser.EDGE;
    const caps = this.toCapabilities();
    caps.setBrowserName(browserName);
    return new Options(caps);
  }
}

/**
 * Creates a new WebDriver client for Microsoft's Edge.
 */
export class Driver extends chromium.Driver {
  /**
   * Creates a new browser session for Microsoft's Edge browser.
   *
   * @param opt_config The configuration options.
   * @param opt_serviceExecutor The service to use; will create
   *     a new Legacy or Chromium service based on {@linkplain Options} by default.
   * @return A new driver instance.
   */
  static createSession(
    executorOrCaps?: Capabilities | Options | Executor,
    capabilitiesOrService?: Capabilities | remote.DriverService | Executor,
    onQuitOrVendorPrefix?: (() => any) | string,
    vendorCapabilityKey: string = EDGE_CAPABILITY_KEY
  ): Driver {
    if (executorOrCaps instanceof Executor) {
      return super.createSession(
        executorOrCaps,
        capabilitiesOrService as Capabilities,
        onQuitOrVendorPrefix as (() => any)
      ) as Driver;
    } else {
      const caps = executorOrCaps || new Options();
      return super.createSession(
        caps,
        capabilitiesOrService,
        'ms',
        EDGE_CAPABILITY_KEY
      ) as Driver;
    }
  }

  /**
   * returns new instance of edge driver service
   * @returns A driver service instance
   */
  static getDefaultService(): remote.DriverService {
    return new ServiceBuilder().build();
  }
}
