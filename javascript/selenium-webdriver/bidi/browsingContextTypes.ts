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

import * as self from './browsingContextTypes'

/**
 * Represents information about a browsing context.
 * Described in https://w3c.github.io/webdriver-bidi/#type-browsingContext-Info
 */
export class BrowsingContextInfo {
  private readonly _id: string
  private readonly _url: string
  private readonly _children: unknown[] | null
  private readonly _parentBrowsingContext: string | null

  constructor(id: string, url: string, children: unknown[] | null, parentBrowsingContext: string | null) {
    this._id = id
    this._url = url
    this._children = children
    this._parentBrowsingContext = parentBrowsingContext
  }

  /**
   * Get the ID of the browsing context.
   */
  get id(): string {
    return this._id
  }

  /**
   * Get the URL of the browsing context.
   */
  get url(): string {
    return this._url
  }

  /**
   * Get the children of the browsing context, as received on the wire.
   */
  get children(): unknown[] | null {
    return this._children
  }

  /**
   * Get the parent browsing context id.
   */
  get parentBrowsingContext(): string | null {
    return this._parentBrowsingContext
  }
}

/**
 * Represents information about a navigation.
 * Described in https://w3c.github.io/webdriver-bidi/#type-browsingContext-NavigationInfo.
 */
export class NavigationInfo {
  browsingContextId: string
  navigationId: string
  timestamp: number
  url: string

  /**
   * Constructs a new NavigationInfo object.
   * @param browsingContextId - The ID of the browsing context.
   * @param navigationId - The ID of the navigation.
   * @param timestamp - The timestamp of the navigation.
   * @param url - The URL of the page navigated to.
   */
  constructor(browsingContextId: string, navigationId: string, timestamp: number, url: string) {
    this.browsingContextId = browsingContextId
    this.navigationId = navigationId
    this.timestamp = timestamp
    this.url = url
  }
}

export class UserPromptOpened {
  browsingContextId: string
  type: string
  message: string

  constructor(browsingContextId: string, type: string, message: string) {
    this.browsingContextId = browsingContextId
    this.type = type
    this.message = message
  }
}

export class UserPromptClosed {
  browsingContextId: string
  accepted: boolean
  userText: string | undefined

  constructor(browsingContextId: string, accepted: boolean, userText: string | undefined = undefined) {
    this.browsingContextId = browsingContextId
    this.accepted = accepted
    this.userText = userText
  }
}

/** Keeps `import x from '...'` working for esModuleInterop/Babel consumers; deliberate exception to the no-default-export rule. */
const defaultExport: typeof self = self
export default defaultExport
