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

import { SameSite, BytesValue } from './networkTypes';

/**
 * Represents a filter for fetching cookies.
 * Described in https://w3c.github.io/webdriver-bidi/#command-storage-getCookies
 */
class CookieFilter {
  #map: Map<string, any> = new Map();

  /**
   * Sets the name of the cookie.
   *
   * @param {string} name - The name of the cookie.
   * @returns {CookieFilter} - The updated CookieFilter instance for chaining.
   */
  name(name: string): CookieFilter {
    this.#map.set('name', name)
    return this
  }

  /**
   * Sets the value of the cookie.
   *
   * @param {BytesValue} value - The value to be set. Must be an instance of BytesValue.
   * @returns {CookieFilter} - The updated CookieFilter instance for chaining.
   * @throws {Error} - If the value is not an instance of BytesValue.
   */
  value(value: BytesValue): CookieFilter {
    if (!(value instanceof BytesValue)) {
      throw new Error(`Value must be an instance of BytesValue. Received:'${value}'`)
    }
    this.#map.set('value', Object.fromEntries(value.asMap()))
    return this
  }

  /**
   * Sets the domain for the cookie.
   *
   * @param {string} domain - The domain to set.
   * @returns {CookieFilter} - The updated CookieFilter instance for chaining.
   */
  domain(domain: string): CookieFilter {
    this.#map.set('domain', domain)
    return this
  }

  /**
   * Sets the url path for the cookie to be fetched.
   *
   * @param {string} path - The url path for the cookie to be fetched.
   * @returns {CookieFilter} - The updated CookieFilter instance for chaining.
   */
  path(path: string): CookieFilter {
    this.#map.set('path', path)
    return this
  }

  /**
   * Sets the size of the cookie to be fetched.
   *
   * @param {number} size - The size of the cookie.
   * @returns {CookieFilter} - The updated CookieFilter instance for chaining.
   */
  size(size: number): CookieFilter {
    this.#map.set('size', size)
    return this
  }

  /**
   * Sets the `httpOnly` flag for the cookie filter.
   *
   * @param {boolean} httpOnly - The value to set for the `httpOnly` flag.
   * @returns {CookieFilter} - The updated CookieFilter instance for chaining.
   */
  httpOnly(httpOnly: boolean): CookieFilter {
    this.#map.set('httpOnly', httpOnly)
    return this
  }

  /**
   * Sets the flag to fetch secure cookies.
   *
   * @param {boolean} secure - Whether the cookie fetched should be secure only or not.
   * @returns {CookieFilter} - The updated CookieFilter instance for chaining.
   */
  secure(secure: boolean): CookieFilter {
    this.#map.set('secure', secure)
    return this
  }

  /**
   * Sets the SameSite attribute for the cookie.
   *
   * @param {SameSite} sameSite - The SameSite value to be set for the cookie.
   * @returns {CookieFilter} - The updated CookieFilter instance for chaining.
   * @throws {Error} - If the provided sameSite value is not an instance of SameSite.
   */
  sameSite(sameSite: SameSite): CookieFilter {
    if (!(sameSite instanceof SameSite)) {
      throw new Error(`Params must be a value in SameSite. Received:'${sameSite}'`)
    }
    this.#map.set('sameSite', sameSite)
    return this
  }

  /**
   * Sets the expiry value.
   *
   * @param {number} expiry - The expiry value.
   * @returns {CookieFilter} - The updated CookieFilter instance for chaining.
   */
  expiry(expiry: number): CookieFilter {
    this.#map.set('expiry', expiry)
    return this
  }

  asMap(): Map<string, any> {
    return this.#map
  }
}

export { CookieFilter }
