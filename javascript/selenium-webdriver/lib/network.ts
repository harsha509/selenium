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

import type BiDi from '../bidi/index'
import { Network as getNetwork } from '../bidi/network'
import { InterceptPhase } from '../bidi/interceptPhase'
import { AddInterceptParameters } from '../bidi/addInterceptParameters'

type NetworkInstance = Awaited<ReturnType<typeof getNetwork>>

/** The subset of a WebDriver needed to reach its BiDi connection. */
interface NetworkDriver {
  getBidi(): Promise<BiDi>
}

/** Credentials to answer an auth challenge whose URL matches `uri`. */
interface AuthHandler {
  username: string
  password: string
  uri: string
}

class Network {
  #callbackId = 0
  #driver: NetworkDriver
  #network?: NetworkInstance
  #authHandlers = new Map<number, AuthHandler>()

  constructor(driver: NetworkDriver) {
    this.#driver = driver
  }

  // This should be done in the constructor.
  // But since it needs to call async methods we cannot do that in the constructor.
  // We can have a separate async method that initialises the Network instance.
  // However, that pattern does not allow chaining the methods as we would like the user to use it.
  // Since it involves awaiting to get the instance and then another await to call the method.
  // Using this allows the user to do this "await driver.network.addAuthenticationHandler(callback)"
  async #init(): Promise<void> {
    if (this.#network !== undefined) {
      return
    }
    const network = await getNetwork(this.#driver)
    this.#network = network

    await network.addIntercept(new AddInterceptParameters(InterceptPhase.AUTH_REQUIRED))

    await network.authRequired(async (event) => {
      if (event === null) {
        return
      }
      const requestId = event.request.request
      const uri = event.request.url
      const credentials = this.getAuthCredentials(uri)
      if (credentials !== null) {
        await network.continueWithAuth(requestId, credentials.username, credentials.password)
        return
      }

      await network.continueWithAuthNoCredentials(requestId)
    })
  }

  getAuthCredentials(uri: string): AuthHandler | null {
    for (const [, value] of this.#authHandlers) {
      if (uri.match(value.uri)) {
        return value
      }
    }
    return null
  }

  async addAuthenticationHandler(username: string, password: string, uri = '//'): Promise<number> {
    await this.#init()

    const id = this.#callbackId++
    this.#authHandlers.set(id, { username, password, uri })
    return id
  }

  async removeAuthenticationHandler(id: number): Promise<void> {
    await this.#init()

    if (this.#authHandlers.has(id)) {
      this.#authHandlers.delete(id)
    } else {
      throw Error(`Callback with id ${id} not found`)
    }
  }

  async clearAuthenticationHandlers(): Promise<void> {
    this.#authHandlers.clear()
  }
}

export = Network
