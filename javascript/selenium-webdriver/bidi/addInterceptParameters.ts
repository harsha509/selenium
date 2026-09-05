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

import { UrlPattern } from './urlPattern'
import type { InterceptPhase } from './interceptPhase'

/** One serialised URL pattern: a builder's map, or a raw string pattern. */
type UrlPatternJson = Record<string, string> | { type: 'string'; pattern: string }

export class AddInterceptParameters {
  #phases: InterceptPhase[] = []
  #urlPatterns: UrlPatternJson[] = []

  constructor(phases: InterceptPhase | InterceptPhase[]) {
    if (phases instanceof Array) {
      phases.forEach((phase) => this.#phases.push(phase))
    } else {
      this.#phases.push(phases)
    }
  }

  /**
   * Adds a URL pattern to intercept.
   *
   * @param pattern - The URL pattern to add.
   * @returns Returns the current instance of the class AddInterceptParameters for chaining.
   * @throws {Error} - Throws an error if the pattern is not an instance of UrlPattern.
   */
  urlPattern(pattern: UrlPattern): this {
    if (!(pattern instanceof UrlPattern)) {
      throw new Error(`Pattern must be an instance of UrlPattern. Received: '${pattern})'`)
    }
    this.#urlPatterns.push(Object.fromEntries(pattern.asMap()))
    return this
  }

  /**
   * Adds array of URL patterns to intercept.
   *
   * @param patterns - An array of UrlPattern instances representing the URL patterns to intercept.
   * @returns Returns the instance of AddInterceptParameters for chaining.
   * @throws {Error} - Throws an error if the pattern is not an instance of UrlPattern.
   */
  urlPatterns(patterns: UrlPattern[]): this {
    patterns.forEach((pattern) => {
      if (!(pattern instanceof UrlPattern)) {
        throw new Error(`Pattern must be an instance of UrlPattern. Received:'${pattern}'`)
      }
      this.#urlPatterns.push(Object.fromEntries(pattern.asMap()))
    })
    return this
  }

  /**
   * Adds string URL to intercept.
   *
   * @param pattern - The URL pattern to be added.
   * @returns Returns the instance of AddInterceptParameters for chaining..
   * @throws {Error} - If the pattern is not an instance of String.
   */
  urlStringPattern(pattern: string): this {
    if (typeof pattern !== 'string') {
      throw new Error(`Pattern must be an instance of String. Received:'${pattern}'`)
    }

    this.#urlPatterns.push({ type: 'string', pattern: pattern })
    return this
  }

  /**
   * Adds array of string URLs to intercept.
   * @param patterns - An array of URL string patterns.
   * @returns Returns the instance of AddInterceptParameters for chaining.
   */
  urlStringPatterns(patterns: string[]): this {
    patterns.forEach((pattern) => {
      if (typeof pattern !== 'string') {
        throw new Error(`Pattern must be an instance of String. Received:'${pattern}'`)
      }
      this.#urlPatterns.push({ type: 'string', pattern: pattern })
    })
    return this
  }

  asMap(): Map<string, unknown> {
    const map = new Map<string, unknown>()
    map.set('phases', this.#phases)
    if (this.#urlPatterns.length > 0) {
      map.set('urlPatterns', this.#urlPatterns)
    }
    return map
  }
}
