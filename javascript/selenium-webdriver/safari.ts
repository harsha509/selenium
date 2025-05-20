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
 * @fileoverview Defines a WebDriver client for Safari.
 *
 * @module selenium-webdriver/safari
 */

import * as http from './http';
import * as remote from './remote';
import * as webdriver from './lib/webdriver';
import { Browser, Capabilities } from './lib/capabilities';
import { getBinaryPaths } from './common/driverFinder';
import { Executor } from './lib/http';

/**
 * Creates {@link remote.DriverService} instances that manage
 * a [safaridriver] server in a child process.
 *
 * [safaridriver]: https://developer.apple.com/library/prerelease/content/releasenotes/General/WhatsNewInSafari/Articles/Safari_10_0.html#//apple_ref/doc/uid/TP40014305-CH11-DontLinkElementID_28
 */
export class ServiceBuilder extends remote.DriverService.Builder {
  /**
   * @param opt_exe Path to the server executable to use. If omitted,
   *     the builder will attempt to locate the safaridriver on the system PATH.
   */
  constructor(opt_exe?: string) {
    super(opt_exe);
    this.setLoopback(true); // Required.
  }
}

const OPTIONS_CAPABILITY_KEY = 'safari:options';
const TECHNOLOGY_PREVIEW_OPTIONS_KEY = 'technologyPreview';

/**
 * Configuration options specific to the {@link Driver SafariDriver}.
 */
export class Options extends Capabilities {
  /** @private */
  private options_: Record<string, any>;

  /**
   * @param other Another set of capabilities to initialize this instance from.
   */
  constructor(other: Capabilities | Map<string, any> | Record<string, any> = new Map()) {
    super(other);

    this.options_ = this.get(OPTIONS_CAPABILITY_KEY) as Record<string, any> || {};

    this.set(OPTIONS_CAPABILITY_KEY, this.options_);
    this.setBrowserName(Browser.SAFARI);
  }

  /**
   * Instruct the SafariDriver to use the Safari Technology Preview if true.
   * Otherwise, use the release version of Safari. Defaults to using the release version of Safari.
   *
   * @param useTechnologyPreview Whether to use Safari Technology Preview.
   * @return A self reference.
   */
  setTechnologyPreview(useTechnologyPreview: boolean): Options {
    this.options_[TECHNOLOGY_PREVIEW_OPTIONS_KEY] = !!useTechnologyPreview;
    return this;
  }

  /**
   * Enables diagnostic logging for Safari.
   *
   * This method sets the `safari:diagnose` option to `true` in the current configuration.
   * It is used to enable additional logging or diagnostic features specific to Safari.
   *
   * @returns Returns the current instance
   */
  enableLogging(): Options {
    this.set('safari:diagnose', true);
    return this;
  }
}

/**
 * Determines if Safari Technology Preview should be used.
 * @param o The options object
 * @return Whether to use Safari Technology Preview
 */
function useTechnologyPreview(o?: Capabilities | Record<string, any>): boolean {
  if (o instanceof Capabilities) {
    const options = o.get(OPTIONS_CAPABILITY_KEY);
    return !!(options && (options as Record<string, any>)[TECHNOLOGY_PREVIEW_OPTIONS_KEY]);
  }

  if (o && typeof o === 'object') {
    return !!(o as Record<string, any>)[TECHNOLOGY_PREVIEW_OPTIONS_KEY];
  }

  return false;
}

const SAFARIDRIVER_TECHNOLOGY_PREVIEW_EXE = '/Applications/Safari Technology Preview.app/Contents/MacOS/safaridriver';

/**
 * A WebDriver client for Safari. This class should never be instantiated
 * directly; instead, use the {@linkplain ./builder.Builder Builder}:
 *
 *     var driver = new Builder()
 *         .forBrowser('safari')
 *         .build();
 *
 */
export class Driver extends webdriver.WebDriver {
  /**
   * Creates a new Safari session.
   *
   * @param options The configuration options.
   * @return A new driver instance.
   */
  static createSession(
    executorOrCaps?: Options | Capabilities | Executor,
    capabilitiesOrService?: Capabilities | remote.DriverService | Executor,
    onQuitOrVendorPrefix?: (() => any) | string
  ): Driver {
    // Handle the WebDriver.createSession signature
    if (executorOrCaps instanceof Executor && 
        capabilitiesOrService instanceof Capabilities) {
      return super.createSession(
        executorOrCaps, 
        capabilitiesOrService, 
        typeof onQuitOrVendorPrefix === 'function' ? onQuitOrVendorPrefix : undefined
      ) as Driver;
    }

    const caps = executorOrCaps || new Options();

    let exe: string | undefined;
    if (useTechnologyPreview(caps instanceof Capabilities ? caps.get(OPTIONS_CAPABILITY_KEY) as Record<string, any> : undefined)) {
      exe = SAFARIDRIVER_TECHNOLOGY_PREVIEW_EXE;
    }

    const service = new ServiceBuilder(exe).build();
    if (!service.getExecutable()) {
      service.setExecutable(getBinaryPaths(caps as Capabilities).driverPath);
    }
    const executor = new http.Executor(service.start().then((url) => new http.HttpClient(url)));

    return super.createSession(executor, caps as Capabilities, () => service.kill()) as Driver;
  }
}
