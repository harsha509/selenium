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

import { BytesValue, SameSiteValue } from './networkTypes'

/**
 * Represents a partial cookie used to set cookies.
 * Described in https://w3c.github.io/webdriver-bidi/#command-storage-setCookie.
 */
export class PartialCookie {
  #map = new Map<string, unknown>()

  /**
   * Represents a partial cookie.
   * @param name - The name of the cookie.
   * @param value - The value of the cookie as an instance of BytesValue.
   * @param domain - The domain of the cookie.
   */
  constructor(name: string, value: BytesValue, domain: string) {
    this.#map.set('name', name)
    if (!(value instanceof BytesValue)) {
      throw new Error(`Value must be an instance of BytesValue. Received:'${value}'`)
    }
    this.#map.set('value', Object.fromEntries(value.asMap()))
    this.#map.set('domain', domain)
  }

  /**
   * Sets the path for the cookie.
   * @param path - The path for the cookie.
   * @returns The updated PartialCookie instance for chaining.
   */
  path(path: string): this {
    this.#map.set('path', path)
    return this
  }

  /**
   * Sets the size of the cookie.
   * @param size - The size of the cookie.
   * @returns The updated PartialCookie instance for chaining.
   */
  size(size: number): this {
    this.#map.set('size', size)
    return this
  }

  /**
   * Sets the `httpOnly` flag for the cookie.
   * @param httpOnly - The value to set for the `httpOnly` flag.
   * @returns The updated PartialCookie instance for chaining.
   */
  httpOnly(httpOnly: boolean): this {
    this.#map.set('httpOnly', httpOnly)
    return this
  }

  /**
   * Sets the secure flag for the cookie.
   * @param secure - Indicates whether the cookie should only be sent over secure connections.
   * @returns The updated PartialCookie instance for chaining.
   */
  secure(secure: boolean): this {
    this.#map.set('secure', secure)
    return this
  }

  /**
   * Sets the SameSite attribute for the cookie.
   * @param sameSite - The SameSite attribute value for the cookie.
   * @returns The updated PartialCookie instance for chaining.
   */
  sameSite(sameSite: SameSiteValue): this {
    this.#map.set('sameSite', sameSite)
    return this
  }

  /**
   * Sets the expiry for the cookie.
   * @param expiry - The expiry time of the cookie.
   * @returns The updated PartialCookie instance for chaining.
   */
  expiry(expiry: number): this {
    this.#map.set('expiry', expiry)
    return this
  }

  asMap(): Map<string, unknown> {
    return this.#map
  }
}
