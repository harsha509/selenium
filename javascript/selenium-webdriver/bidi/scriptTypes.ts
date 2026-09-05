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

/** A script.Source as received on the wire. */
export interface SourceJson {
  realm: string
  context?: string
}

/**
 * Represents a message received through a channel.
 * Described in https://w3c.github.io/webdriver-bidi/#event-script-message.
 */
export class Message {
  private readonly _channel: string
  private readonly _data: unknown
  private readonly _source: Source

  /**
   * Creates a new Message instance.
   * @param channel - The channel through which the message is received.
   * @param data - The data contained in the message.
   * @param source - The source of the message.
   */
  constructor(channel: string, data: unknown, source: Source) {
    this._channel = channel
    this._data = data
    this._source = source
  }

  /**
   * Gets the channel through which the message is received.
   */
  get channel(): string {
    return this._channel
  }

  /**
   * Gets the data contained in the message.
   */
  get data(): unknown {
    return this._data
  }

  /**
   * Gets the source of the message.
   */
  get source(): Source {
    return this._source
  }
}

/**
 * Represents a source object.
 * Described in https://w3c.github.io/webdriver-bidi/#type-script-Source.
 */
export class Source {
  private readonly _browsingContextId: string | null
  private readonly _realmId: string

  constructor(source: SourceJson) {
    this._browsingContextId = null
    this._realmId = source.realm
    // Browsing context is returned as an optional parameter
    if ('context' in source) {
      this._browsingContextId = source.context ?? null
    }
  }

  /**
   * Get the browsing context ID.
   */
  get browsingContextId(): string | null {
    return this._browsingContextId
  }

  /**
   * Get the realm ID.
   */
  get realmId(): string {
    return this._realmId
  }
}
