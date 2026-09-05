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

import type BiDi from '../index'
import type { Capabilities } from '../../lib/capabilities'
import * as self from './permissions'

export const PermissionState = Object.freeze({
  GRANTED: 'granted',
  DENIED: 'denied',
  PROMPT: 'prompt',
} as const)

export type PermissionState = (typeof PermissionState)[keyof typeof PermissionState]

/** The subset of a WebDriver needed to reach its BiDi connection. */
interface PermissionDriver {
  getCapabilities(): Promise<Capabilities>
  getBidi(): Promise<BiDi>
}

/** The permissions.setPermission command payload. */
interface SetPermissionCommand {
  method: 'permissions.setPermission'
  params: {
    descriptor: unknown
    state: PermissionState
    origin: string
    userContext?: string
  }
}

class Permission {
  private readonly _driver: PermissionDriver
  bidi!: BiDi

  constructor(driver: PermissionDriver) {
    this._driver = driver
  }

  async init(): Promise<void> {
    if (!(await this._driver.getCapabilities()).get('webSocketUrl')) {
      throw Error('WebDriver instance must support BiDi protocol')
    }
    this.bidi = await this._driver.getBidi()
  }

  /**
   * Sets a permission state for a given permission descriptor.
   * @param permissionDescriptor The permission descriptor.
   * @param state The permission state (granted, denied, prompt).
   * @param origin The origin for which the permission is set.
   * @param userContext The user context id (optional).
   */
  async setPermission(
    permissionDescriptor: unknown,
    state: PermissionState,
    origin: string,
    userContext: string | null = null,
  ): Promise<void> {
    if (!Object.values(PermissionState).some((allowed) => allowed === state)) {
      throw new Error(`Invalid permission state. Must be one of: ${Object.values(PermissionState).join(', ')}`)
    }

    const command: SetPermissionCommand = {
      method: 'permissions.setPermission',
      params: {
        descriptor: permissionDescriptor,
        state: state,
        origin: origin,
      },
    }

    if (userContext) {
      command.params.userContext = userContext
    }

    await this.bidi.send(command)
  }
}

export async function getPermissionInstance(driver: PermissionDriver): Promise<Permission> {
  const instance = new Permission(driver)
  await instance.init()
  return instance
}

/** Keeps `import x from '...'` working for esModuleInterop/Babel consumers; deliberate exception to the no-default-export rule. */
const defaultExport: typeof self = self
export default defaultExport
