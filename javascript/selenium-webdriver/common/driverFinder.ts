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
 *  This implementation is still in beta, and may change.
 *
 *  Utility to find if a given file is present and executable.
 */

import * as path from 'node:path';
import { binaryPaths } from './seleniumManager';
import { Capabilities } from '../lib/capabilities';

/**
 * Result of binary paths lookup
 */
export interface BinaryPathsResult {
  browserPath: string;
  driverPath: string;
}

/**
 * Determines the path of the correct Selenium Manager binary
 * @param capabilities browser options to fetch the driver
 * @returns path of the driver and browser location
 */
export function getBinaryPaths(capabilities: Capabilities): BinaryPathsResult {
  try {
    const args = getArgs(capabilities);
    return binaryPaths(args);
  } catch (e) {
    throw Error(
      `Unable to obtain browser driver.
        For more information on how to install drivers see
        https://www.selenium.dev/documentation/webdriver/troubleshooting/errors/driver_location/. ${e}`
    );
  }
}

/**
 * Gets the arguments for Selenium Manager based on capabilities
 * @param options The capabilities to extract arguments from
 * @returns Array of arguments for Selenium Manager
 */
function getArgs(options: Capabilities): string[] {
  let args = ['--browser', options.getBrowserName(), '--language-binding', 'javascript', '--output', 'json'];

  if (options.getBrowserVersion() && options.getBrowserVersion() !== '') {
    args.push('--browser-version', options.getBrowserVersion());
  }

  const vendorOptions =
    options.get('goog:chromeOptions') || options.get('ms:edgeOptions') || options.get('moz:firefoxOptions');
  if (vendorOptions && 
      typeof vendorOptions === 'object' && 
      'binary' in vendorOptions && 
      typeof vendorOptions.binary === 'string' && 
      vendorOptions.binary !== '') {
    args.push('--browser-path', path.resolve(vendorOptions.binary));
  }

  const proxyOptions = options.getProxy();

  // Check if proxyOptions exists and has properties
  if (proxyOptions && Object.keys(proxyOptions).length > 0) {
    const httpProxy = proxyOptions['httpProxy'];
    const sslProxy = proxyOptions['sslProxy'];

    if (httpProxy !== undefined) {
      args.push('--proxy', httpProxy);
    } else if (sslProxy !== undefined) {
      args.push('--proxy', sslProxy);
    }
  }
  return args;
}
