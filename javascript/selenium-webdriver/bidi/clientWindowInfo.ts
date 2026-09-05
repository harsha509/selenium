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

import * as self from './clientWindowInfo'

export const WindowState = Object.freeze({
  FULLSCREEN: 'fullscreen',
  MAXIMIZED: 'maximized',
  MINIMIZED: 'minimized',
  NORMAL: 'normal',
} as const)

export type WindowState = (typeof WindowState)[keyof typeof WindowState]

/** Window information parameters, as received from the remote end. */
export interface ClientWindowInfoParams {
  clientWindow: string
  state: string
  width: number
  height: number
  x: number
  y: number
  active: boolean
}

export class ClientWindowInfo {
  clientWindow: string
  state: string
  width: number
  height: number
  x: number
  y: number
  active: boolean

  /**
   * @param params Window information parameters
   * @param params.clientWindow Window identifier
   * @param params.state Window state from WindowState
   * @param params.width Window width
   * @param params.height Window height
   * @param params.x Window x coordinate
   * @param params.y Window y coordinate
   * @param params.active Whether window is active and can receive keyboard input
   */
  constructor({ clientWindow, state, width, height, x, y, active }: ClientWindowInfoParams) {
    this.clientWindow = clientWindow
    this.state = state
    this.width = width
    this.height = height
    this.x = x
    this.y = y
    this.active = active
  }

  static fromJson(json: ClientWindowInfoParams): ClientWindowInfo {
    return new ClientWindowInfo({
      ...json,
      state: json.state.toLowerCase(),
    })
  }
}

/** Keeps `import x from '...'` working for esModuleInterop/Babel consumers; deliberate exception to the no-default-export rule. */
const defaultExport: typeof self = self
export default defaultExport
