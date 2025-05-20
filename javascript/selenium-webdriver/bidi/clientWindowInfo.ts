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

export const WindowState = Object.freeze({
  FULLSCREEN: 'fullscreen',
  MAXIMIZED: 'maximized',
  MINIMIZED: 'minimized',
  NORMAL: 'normal',
});

export class ClientWindowInfo {
  clientWindow: string;
  state: string;
  width: number;
  height: number;
  x: number;
  y: number;
  active: boolean;

  /**
   * @param {Object} params Window information parameters
   * @param {string} params.clientWindow Window identifier
   * @param {string} params.state Window state from WindowState
   * @param {number} params.width Window width
   * @param {number} params.height Window height
   * @param {number} params.x Window x coordinate
   * @param {number} params.y Window y coordinate
   * @param {boolean} params.active Whether window is active and can receive keyboard input
   */
  constructor({ clientWindow, state, width, height, x, y, active }: {
    clientWindow: string;
    state: string;
    width: number;
    height: number;
    x: number;
    y: number;
    active: boolean;
  }) {
    this.clientWindow = clientWindow;
    this.state = state;
    this.width = width;
    this.height = height;
    this.x = x;
    this.y = y;
    this.active = active;
  }

  static fromJson(json: Record<string, any>): ClientWindowInfo {
    return new ClientWindowInfo({
      clientWindow: json.clientWindow || '',
      state: json.state ? json.state.toLowerCase() : '',
      width: json.width || 0,
      height: json.height || 0,
      x: json.x || 0,
      y: json.y || 0,
      active: json.active || false
    });
  }
}
