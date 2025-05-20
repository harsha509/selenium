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

export const PermissionState = Object.freeze({
  GRANTED: 'granted',
  DENIED: 'denied',
  PROMPT: 'prompt',
});

class Permission {
  private _driver: any;
  private bidi: any;

  constructor(driver: any) {
    this._driver = driver;
  }

  async init(): Promise<void> {
    if (!(await this._driver.getCapabilities()).get('webSocketUrl')) {
      throw Error('WebDriver instance must support BiDi protocol');
    }

    this.bidi = await this._driver.getBidi();
  }

  /**
   * Sets a permission state for a given permission descriptor.
   * @param {Object} permissionDescriptor The permission descriptor.
   * @param {string} state The permission state (granted, denied, prompt).
   * @param {string} origin The origin for which the permission is set.
   * @param {string} [userContext] The user context id (optional).
   * @returns {Promise<void>}
   */
  async setPermission(
    permissionDescriptor: Record<string, any>,
    state: "granted" | "denied" | "prompt",
    origin: string,
    userContext: string | null = null
  ): Promise<void> {
    if (!Object.values(PermissionState).includes(state)) {
      throw new Error(`Invalid permission state. Must be one of: ${Object.values(PermissionState).join(', ')}`);
    }

    const params: {
      descriptor: Record<string, any>;
      state: "granted" | "denied" | "prompt";
      origin: string;
      userContext?: string;
    } = {
      descriptor: permissionDescriptor,
      state: state,
      origin: origin,
    };

    if (userContext) {
      params.userContext = userContext;
    }

    const command = {
      method: 'permissions.setPermission',
      params
    };

    await this.bidi.send(command);
  }
}

export async function getPermissionInstance(driver: any): Promise<Permission> {
  let instance = new Permission(driver);
  await instance.init();
  return instance;
}
