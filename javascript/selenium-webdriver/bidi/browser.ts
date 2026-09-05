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

import type BiDi from './index'
import type { Capabilities } from '../lib/capabilities'
import { WindowState, ClientWindowInfo, ClientWindowInfoParams } from './clientWindowInfo'

/** The subset of a WebDriver needed to reach its BiDi connection. */
interface BidiDriver {
  getCapabilities(): Promise<Capabilities>
  getBidi(): Promise<BiDi>
}

/**
 * Represents the commands and events under Browser Module.
 * Described in https://w3c.github.io/webdriver-bidi/#module-browser
 */
class Browser {
  private readonly _driver: BidiDriver
  bidi!: BiDi

  constructor(driver: BidiDriver) {
    this._driver = driver
  }

  async init(): Promise<void> {
    if (!(await this._driver.getCapabilities()).get('webSocketUrl')) {
      throw Error('WebDriver instance must support BiDi protocol')
    }
    this.bidi = await this._driver.getBidi()
  }

  /**
   * Creates a new user context.
   * @returns A promise that resolves to the user context id.
   */
  async createUserContext(): Promise<string> {
    const command = {
      method: 'browser.createUserContext',
      params: {},
    }
    const response = await this.bidi.send<{ userContext: string }>(command)
    return response.result.userContext
  }

  /**
   * Gets the list of all user contexts.
   * @returns A promise that resolves to an array of user context ids.
   */
  async getUserContexts(): Promise<string[]> {
    const command = {
      method: 'browser.getUserContexts',
      params: {},
    }
    const response = await this.bidi.send<{ userContexts: { userContext: string }[] }>(command)
    const userContexts: string[] = []
    const userContextsArray = response.result.userContexts
    for (const userContextJson of userContextsArray) {
      userContexts.push(userContextJson.userContext)
    }
    return userContexts
  }

  /**
   * Removes a user context.
   * @param userContext The user context id to be removed.
   */
  async removeUserContext(userContext: string): Promise<void> {
    const command = {
      method: 'browser.removeUserContext',
      params: { userContext: userContext },
    }
    await this.bidi.send(command)
  }

  /**
   * Gets information about all client windows.
   * @returns Array of client window information
   */
  async getClientWindows(): Promise<ClientWindowInfo[]> {
    const command = {
      method: 'browser.getClientWindows',
      params: {},
    }
    const response = await this.bidi.send<{ clientWindows: ClientWindowInfoParams[] }>(command)
    return response.result.clientWindows.map((window) => ClientWindowInfo.fromJson(window))
  }
}

async function getBrowserInstance(driver: BidiDriver): Promise<Browser> {
  const instance = new Browser(driver)
  await instance.init()
  return instance
}

getBrowserInstance.WindowState = WindowState

export = getBrowserInstance
