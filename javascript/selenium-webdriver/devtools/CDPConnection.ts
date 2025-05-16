
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

import { logging } from '../lib/logging';

const RESPONSE_TIMEOUT = 1000 * 30;

interface WSConnection {
  send(data: string, callback?: () => void): void;
  on(event: string, listener: (data: Buffer | ArrayBuffer | Buffer[]) => void): WSConnection;
  off(event: string, listener: (data: Buffer | ArrayBuffer | Buffer[]) => void): void;
}

interface CDPMessage {
  method: string;
  id: number;
  sessionId?: string;
  params?: Record<string, any>;
}

export class CDPConnection {
  private _wsConnection: WSConnection;
  private cmd_id: number;
  public targetID: string | null;
  public sessionId: string | null;

  constructor(wsConnection: WSConnection) {
    this._wsConnection = wsConnection;
    this.cmd_id = 0;
    this.targetID = null;
    this.sessionId = null;
  }

  execute(method: string, params: Record<string, any>, callback?: () => void): void {
    let message: CDPMessage = {
      method,
      id: this.cmd_id++,
    };
    if (this.sessionId) {
      message['sessionId'] = this.sessionId;
    }

    const mergedMessage = Object.assign({ params: params }, message);
    this._wsConnection.send(JSON.stringify(mergedMessage), callback);
  }

  async send(method: string, params: Record<string, any>): Promise<any> {
    let cdp_id = this.cmd_id++;
    let message: CDPMessage = {
      method,
      id: cdp_id,
    };
    if (this.sessionId) {
      message['sessionId'] = this.sessionId;
    }

    const mergedMessage = Object.assign({ params: params }, message);
    this._wsConnection.send(JSON.stringify(mergedMessage));

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request with id ${cdp_id} timed out`));
        handler.off('message', listener);
      }, RESPONSE_TIMEOUT);

      const listener = (data: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const payload = JSON.parse(data.toString());
          if (payload.id === cdp_id) {
            clearTimeout(timeoutId);
            handler.off('message', listener);
            resolve(payload);
          }
        } catch (err: any) {
          logging.getLogger(logging.Type.BROWSER).severe(`Failed parse message: ${err.message}`);
        }
      };

      const handler = this._wsConnection.on('message', listener);
    });
  }
}
