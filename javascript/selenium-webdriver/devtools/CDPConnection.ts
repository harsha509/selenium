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

import WebSocket from 'ws'
import * as logging from '../lib/logging'

const RESPONSE_TIMEOUT = 1000 * 30

/** A CDP command message as sent over the socket. */
interface CdpMessage {
  method: string
  id: number
  sessionId?: string
}

/** A parsed CDP response; `id` matches the command it answers. */
export interface CdpResponse {
  id: number
  [key: string]: unknown
}

class CDPConnection {
  private readonly _wsConnection: WebSocket
  cmd_id: number
  targetID: string | null
  sessionId: string | null

  constructor(wsConnection: WebSocket) {
    this._wsConnection = wsConnection
    this.cmd_id = 0
    this.targetID = null
    this.sessionId = null
  }

  execute(method: string, params: unknown, callback?: (err?: Error) => void): void {
    const message: CdpMessage = {
      method,
      id: this.cmd_id++,
    }
    if (this.sessionId) {
      message['sessionId'] = this.sessionId
    }

    const mergedMessage = Object.assign({ params: params }, message)
    this._wsConnection.send(JSON.stringify(mergedMessage), callback)
  }

  async send(method: string, params: unknown): Promise<CdpResponse> {
    const cdp_id = this.cmd_id++
    const message: CdpMessage = {
      method,
      id: cdp_id,
    }
    if (this.sessionId) {
      message['sessionId'] = this.sessionId
    }

    const mergedMessage = Object.assign({ params: params }, message)
    this._wsConnection.send(JSON.stringify(mergedMessage))

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request with id ${cdp_id} timed out`))
        handler.off('message', listener)
      }, RESPONSE_TIMEOUT)

      const listener = (data: WebSocket.RawData) => {
        try {
          const payload: CdpResponse = JSON.parse(data.toString())
          if (payload.id === cdp_id) {
            clearTimeout(timeoutId)
            handler.off('message', listener)
            resolve(payload)
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          logging.getLogger(logging.Type.BROWSER).severe(`Failed parse message: ${message}`)
        }
      }

      const handler = this._wsConnection.on('message', listener)
    })
  }
}

export { CDPConnection as CdpConnection }
