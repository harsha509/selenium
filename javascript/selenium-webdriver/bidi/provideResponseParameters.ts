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

import { BytesValue, Header } from './networkTypes'
import * as self from './provideResponseParameters'

/**
 * Represents parameters for providingResponse command.
 * Described in https://w3c.github.io/webdriver-bidi/#command-network-provideResponse.
 */
export class ProvideResponseParameters {
  #map = new Map<string, unknown>()

  constructor(request: string) {
    this.#map.set('request', request)
  }

  /**
   * Sets the body value for the response parameters.
   * @param value - The value to set as the body. Must be an instance of BytesValue.
   * @returns Returns the ProvideResponseParameters object for chaining.
   * @throws {Error} - Throws an error if the value is not an instance of BytesValue.
   */
  body(value: BytesValue): this {
    if (!(value instanceof BytesValue)) {
      throw new Error(`Value must be an instance of BytesValue. Received: ${typeof value} with value: ${value}`)
    }
    this.#map.set('body', Object.fromEntries(value.asMap()))
    return this
  }

  /**
   * Sets the cookie headers for the response.
   * @param cookieHeaders - An array of cookie headers.
   * @returns Returns the ProvideResponseParameters object for chaining.
   * @throws {Error} - Throws an error if a cookie header is not an instance of Header.
   */
  cookies(cookieHeaders: Header[]): this {
    const cookies: Record<string, unknown>[] = []
    cookieHeaders.forEach((header) => {
      if (!(header instanceof Header)) {
        throw new Error(`CookieHeader must be an instance of Header. Received:'${header}'`)
      }
      cookies.push(Object.fromEntries(header.asMap()))
    })
    this.#map.set('cookies', cookies)
    return this
  }

  /**
   * Sets the headers for the response.
   * @param headers - The headers to be set.
   * @returns Returns the ProvideResponseParameters object for chaining.
   * @throws {Error} - If the provided header is not an instance of Header.
   */
  headers(headers: Header[]): this {
    const headerList: Record<string, unknown>[] = []
    headers.forEach((header) => {
      if (!(header instanceof Header)) {
        throw new Error(`Header must be an instance of Header. Received:'${header}'`)
      }
      headerList.push(Object.fromEntries(header.asMap()))
    })
    this.#map.set('headers', headerList)
    return this
  }

  /**
   * Sets the reason phrase for the response.
   * @param reasonPhrase - The reason phrase to set.
   * @returns Returns the ProvideResponseParameters object for chaining.
   * @throws {Error} - If the reason phrase is not a string.
   */
  reasonPhrase(reasonPhrase: string): this {
    if (typeof reasonPhrase !== 'string') {
      throw new Error(`Reason phrase must be a string. Received: '${reasonPhrase})'`)
    }
    this.#map.set('reasonPhrase', reasonPhrase)
    return this
  }

  /**
   * Sets the status code for the response.
   * @param statusCode - The status code to set.
   * @returns Returns the ProvideResponseParameters object for chaining.
   * @throws {Error} - If the status code is not an integer.
   */
  statusCode(statusCode: number): this {
    if (!Number.isInteger(statusCode)) {
      throw new Error(`Status must be an integer. Received:'${statusCode}'`)
    }

    this.#map.set('statusCode', statusCode)
    return this
  }

  asMap(): Map<string, unknown> {
    return this.#map
  }
}

/** Keeps `import x from '...'` working for esModuleInterop/Babel consumers; deliberate exception to the no-default-export rule. */
const defaultExport: typeof self = self
export default defaultExport
