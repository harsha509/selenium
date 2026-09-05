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

import { Capabilities, CapabilitiesLike } from './capabilities'

/**
 * Contains information about a single WebDriver session.
 */
export class Session {
  private readonly id_: string
  private readonly caps_: Capabilities

  /**
   * @param id The session ID.
   * @param capabilities The session capabilities.
   */
  constructor(id: string, capabilities: CapabilitiesLike) {
    this.id_ = id
    this.caps_ = capabilities instanceof Capabilities ? capabilities : new Capabilities(capabilities)
  }

  /**
   * @return This session's ID.
   */
  getId(): string {
    return this.id_
  }

  /**
   * @return This session's capabilities.
   */
  getCapabilities(): Capabilities {
    return this.caps_
  }

  /**
   * Retrieves the value of a specific capability.
   * @param key The capability to retrieve.
   * @return The capability value.
   */
  getCapability(key: string): unknown {
    return this.caps_.get(key)
  }

  /**
   * Returns the JSON representation of this object, which is just the string
   * session ID.
   * @return The JSON representation of this Session.
   */
  toJSON(): string {
    return this.getId()
  }
}
