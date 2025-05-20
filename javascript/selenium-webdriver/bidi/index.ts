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

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

const RESPONSE_TIMEOUT = 1000 * 30;

interface BidiParams {
  method: string;
  params: Record<string, any>;
}

interface BidiResponse {
  id: number;
  [key: string]: any;
}

class Index extends EventEmitter {
  id = 0;
  connected = false;
  events: string[] = [];
  browsingContexts: string[] = [];
  private _ws: WebSocket;

  /**
   * Create a new websocket connection
   * @param _webSocketUrl
   */
  constructor(_webSocketUrl: string) {
    super();
    this.connected = false;
    this._ws = new WebSocket(_webSocketUrl);
    this._ws.on('open', () => {
      this.connected = true;
    });
  }

  /**
   * @returns {WebSocket}
   */
  get socket(): WebSocket {
    return this._ws;
  }

  /**
   * @returns {boolean|*}
   */
  get isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get Bidi Status
   * @returns {Promise<*>}
   */
  get status(): Promise<BidiResponse> {
    return this.send({
      method: 'session.status',
      params: {},
    });
  }

  /**
   * Resolve connection
   * @returns {Promise<unknown>}
   */
  async waitForConnection(): Promise<void> {
    return new Promise((resolve) => {
      if (this.connected) {
        resolve();
      } else {
        this._ws.once('open', () => {
          resolve();
        });
      }
    });
  }

  /**
   * Sends a bidi request
   * @param params
   * @returns {Promise<unknown>}
   */
  async send(params: BidiParams): Promise<BidiResponse> {
    if (!this.connected) {
      await this.waitForConnection();
    }

    const id = ++this.id;

    this._ws.send(JSON.stringify({ id, ...params }));

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request with id ${id} timed out`));
        handler.off('message', listener);
      }, RESPONSE_TIMEOUT);

      const listener = (data: WebSocket.Data) => {
        try {
          const payload = JSON.parse(data.toString());
          if (payload.id === id) {
            clearTimeout(timeoutId);
            handler.off('message', listener);
            resolve(payload);
          }
        } catch (err) {
          // eslint-disable-next-line no-undef
          console.error(`Failed parse message: ${(err as Error).message}`);
        }
      };

      const handler = this._ws.on('message', listener);
    });
  }

  /**
   * Subscribe to events
   * @param events
   * @param browsingContexts
   * @returns {Promise<void>}
   */
  async subscribe(events?: string | string[], browsingContexts?: string | string[]): Promise<void> {
    function toArray(arg: undefined | string | string[]): string[] {
      if (arg === undefined) {
        return [];
      }

      return Array.isArray(arg) ? [...arg] : [arg];
    }

    const eventsArray = toArray(events);
    const contextsArray = toArray(browsingContexts);

    const params: BidiParams = {
      method: 'session.subscribe',
      params: {},
    };

    if (eventsArray.length && eventsArray.some((event) => typeof event !== 'string')) {
      throw new TypeError('events should be string or string array');
    }

    if (contextsArray.length && contextsArray.some((context) => typeof context !== 'string')) {
      throw new TypeError('browsingContexts should be string or string array');
    }

    if (eventsArray.length) {
      params.params.events = eventsArray;
    }

    if (contextsArray.length) {
      params.params.contexts = contextsArray;
    }

    this.events.push(...eventsArray);

    await this.send(params);
  }

  /**
   * Unsubscribe to events
   * @param events
   * @param browsingContexts
   * @returns {Promise<void>}
   */
  async unsubscribe(events?: string | string[], browsingContexts?: string | string[]): Promise<void> {
    const eventsToRemove = typeof events === 'string' ? [events] : events;

    if (!eventsToRemove) {
      return;
    }

    // Check if the eventsToRemove are in the subscribed events array
    // Filter out events that are not in this.events before filtering
    const existingEvents = eventsToRemove.filter((event) => this.events.includes(event));

    // Remove the events from the subscribed events array
    this.events = this.events.filter((event) => !existingEvents.includes(event));

    if (typeof browsingContexts === 'string') {
      this.browsingContexts.pop();
    } else if (Array.isArray(browsingContexts)) {
      this.browsingContexts = this.browsingContexts.filter((id) => !browsingContexts.includes(id));
    }

    if (existingEvents.length === 0) {
      return;
    }
    const params: BidiParams = {
      method: 'session.unsubscribe',
      params: {
        events: existingEvents,
      },
    };

    if (this.browsingContexts.length > 0) {
      params.params.contexts = this.browsingContexts;
    }

    await this.send(params);
  }

  /**
   * Close ws connection.
   * @returns {Promise<unknown>}
   */
  close(): Promise<void> {
    const closeWebSocket = (callback: () => void) => {
      // don't close if it's already closed
      if (this._ws.readyState === 3) {
        callback();
      } else {
        // don't notify on user-initiated shutdown ('disconnect' event)
        this._ws.removeAllListeners('close');
        this._ws.once('close', () => {
          this._ws.removeAllListeners();
          callback();
        });
        this._ws.close();
      }
    };
    return new Promise((fulfill, _) => {
      closeWebSocket(fulfill);
    });
  }
}

/**
 * API
 * @type {function(*): Promise<Index>}
 */
export default Index;
