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

import type WebSocket from 'ws'
import type BiDi from './index'
import { BrowsingContextInfo, NavigationInfo, UserPromptOpened, UserPromptClosed } from './browsingContextTypes'

/** The subset of a WebDriver needed to reach its BiDi connection. */
interface BidiDriver {
  getBidi(): Promise<BiDi>
}

/** The `params` of each browsingContext event this inspector reports, as received on the wire. */
type BrowsingContextEventJson =
  | { context: string; navigation: string; timestamp: number; url: string }
  | { context: string; accepted: boolean; userText?: string }
  | { context: string; type: string; message: string }
  | { context: string; url: string; children: unknown[] | null; parent: string | null }

/** What the inspector hands to a subscribed callback. */
type BrowsingContextEvent = NavigationInfo | UserPromptClosed | UserPromptOpened | BrowsingContextInfo

/**
 * Represents a browsing context related events.
 * Described in https://w3c.github.io/webdriver-bidi/#module-contexts-events.
 * While BrowsingContext class represents a browsing context lifecycle and related commands.
 * This class is specific to listening to events. Events can be subscribed to multiple browsing contexts or all of them.
 */
class BrowsingContextInspector {
  private readonly _driver: BidiDriver
  private readonly _browsingContextIds: string[] | null
  bidi!: BiDi
  ws!: WebSocket

  constructor(driver: BidiDriver, browsingContextIds: string[] | null) {
    this._driver = driver
    this._browsingContextIds = browsingContextIds
  }

  async init(): Promise<void> {
    this.bidi = await this._driver.getBidi()
  }

  /**
   * Subscribes to the 'browsingContext.contextCreated' event.
   * @param callback - The callback function to handle the event.
   * @returns A promise that resolves when the event is emitted.
   */
  async onBrowsingContextCreated(callback: (event: BrowsingContextEvent) => void): Promise<void> {
    await this.subscribeAndHandleEvent('browsingContext.contextCreated', callback)
  }

  /**
   * Subscribes to the 'browsingContext.contextDestroyed' event.
   * @param callback - The callback function to handle the event.
   * @returns A promise that resolves when the event is emitted.
   */
  async onBrowsingContextDestroyed(callback: (event: BrowsingContextEvent) => void): Promise<void> {
    await this.subscribeAndHandleEvent('browsingContext.contextDestroyed', callback)
  }

  /**
   * Subscribe to the 'browsingContext.navigationStarted' event.
   * @param callback - The callback function to handle the event.
   * @returns A promise that resolves when the event is emitted.
   */
  async onNavigationStarted(callback: (event: BrowsingContextEvent) => void): Promise<void> {
    await this.subscribeAndHandleEvent('browsingContext.navigationStarted', callback)
  }

  /**
   * Subscribes to the 'browsingContext.fragmentNavigated' event.
   *
   * @param callback - The callback function to handle the event.
   * @returns A promise that resolves when the event is emitted.
   */
  async onFragmentNavigated(callback: (event: BrowsingContextEvent) => void): Promise<void> {
    await this.subscribeAndHandleEvent('browsingContext.fragmentNavigated', callback)
  }

  /**
   * Subscribes to the 'browsingContext.userPromptClosed' event.
   *
   * @param callback - The callback function to handle the event.
   * @returns A promise that resolves when the event is emitted.
   */
  async onUserPromptClosed(callback: (event: BrowsingContextEvent) => void): Promise<void> {
    await this.subscribeAndHandleEvent('browsingContext.userPromptClosed', callback)
  }

  /**
   * Subscribes to the 'browsingContext.userPromptOpened' event.
   *
   * @param callback - The callback function to handle the event.
   * @returns A promise that resolves when the event is emitted.
   */
  async onUserPromptOpened(callback: (event: BrowsingContextEvent) => void): Promise<void> {
    await this.subscribeAndHandleEvent('browsingContext.userPromptOpened', callback)
  }

  /**
   * Subscribes to the 'browsingContext.domContentLoaded' event.
   *
   * @param callback - The callback function to handle the event.
   * @returns A promise that resolves when the event is emitted.
   */
  async onDomContentLoaded(callback: (event: BrowsingContextEvent) => void): Promise<void> {
    await this.subscribeAndHandleEvent('browsingContext.domContentLoaded', callback)
  }

  /**
   * Subscribes to the 'browsingContext.load' event.
   *
   * @param callback - The callback function to handle the event.
   * @returns A promise that resolves when the event is emitted.
   */
  async onBrowsingContextLoaded(callback: (event: BrowsingContextEvent) => void): Promise<void> {
    await this.subscribeAndHandleEvent('browsingContext.load', callback)
  }

  async subscribeAndHandleEvent(eventType: string, callback: (event: BrowsingContextEvent) => void): Promise<void> {
    if (this._browsingContextIds != null) {
      await this.bidi.subscribe(eventType, this._browsingContextIds)
    } else {
      await this.bidi.subscribe(eventType)
    }
    await this._on(callback)
  }

  async _on(callback: (event: BrowsingContextEvent) => void): Promise<void> {
    this.ws = await this.bidi.socket
    this.ws.on('message', (event) => {
      const { params }: { params?: BrowsingContextEventJson } = JSON.parse(event.toString())
      if (params) {
        let response: BrowsingContextEvent
        if ('navigation' in params) {
          response = new NavigationInfo(params.context, params.navigation, params.timestamp, params.url)
        } else if ('accepted' in params) {
          response = new UserPromptClosed(params.context, params.accepted, params.userText)
        } else if ('type' in params) {
          response = new UserPromptOpened(params.context, params.type, params.message)
        } else {
          response = new BrowsingContextInfo(params.context, params.url, params.children, params.parent)
        }
        callback(response)
      }
    })
  }

  async close(): Promise<void> {
    const events = [
      'browsingContext.contextCreated',
      'browsingContext.contextDestroyed',
      'browsingContext.fragmentNavigated',
      'browsingContext.userPromptClosed',
    ]
    if (
      this._browsingContextIds !== null &&
      this._browsingContextIds !== undefined &&
      this._browsingContextIds.length > 0
    ) {
      await this.bidi.unsubscribe(events, this._browsingContextIds)
    } else {
      await this.bidi.unsubscribe(events)
    }
  }
}

async function getBrowsingContextInstance(
  driver: BidiDriver,
  browsingContextIds: string[] | null = null,
): Promise<BrowsingContextInspector> {
  const instance = new BrowsingContextInspector(driver, browsingContextIds)
  await instance.init()
  return instance
}

export = getBrowsingContextInstance
