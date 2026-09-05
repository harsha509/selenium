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

import * as fs from 'node:fs'
import * as path from 'node:path'
import type BiDi from '../bidi/index'
import logInspector from '../bidi/logInspector'
import scriptManager from '../bidi/scriptManager'
import { LocalValue, ChannelValue } from '../bidi/protocolValue'
import { EvaluateResultSuccess } from '../bidi/evaluateResult'
import type { LogCallback } from '../bidi/logEntries'
import type { ScriptArgument } from '../bidi/scriptTypes'
import type { Capabilities } from './capabilities'
import * as by from './by'

type LogInspector = Awaited<ReturnType<typeof logInspector>>
type ScriptManager = Awaited<ReturnType<typeof scriptManager>>

/** The subset of a WebDriver that {@link Script} drives. */
interface ScriptDriver {
  getCapabilities(): Promise<Capabilities>
  getBidi(): Promise<BiDi>
  getWindowHandle(): Promise<string>
  findElements(locator: by.ByHash): Promise<object[]>
}

/** The DOM mutation reported to an {@link Script#addDomMutationHandler} callback. */
interface DomMutationEvent {
  element: object
  attribute_name: unknown
  current_value: unknown
  old_value: unknown
}

/** The payload posted by the bidi-mutation-listener atom. */
interface MutationPayload {
  target: string
  name: unknown
  value: unknown
  oldValue: unknown
}

class Script {
  #driver: ScriptDriver
  #logInspector?: LogInspector
  #script?: ScriptManager

  constructor(driver: ScriptDriver) {
    this.#driver = driver
  }

  // This should be done in the constructor.
  // But since it needs to call async methods we cannot do that in the constructor.
  // We can have a separate async method that initialises the Script instance.
  // However, that pattern does not allow chaining the methods as we would like the user to use it.
  // Since it involves awaiting to get the instance and then another await to call the method.
  // Using this allows the user to do this "await driver.script().addJavaScriptErrorHandler(callback)"
  async #init(): Promise<LogInspector> {
    if (this.#logInspector !== undefined) {
      return this.#logInspector
    }
    this.#logInspector = await logInspector(this.#driver)
    return this.#logInspector
  }

  async #initScript(): Promise<ScriptManager> {
    if (this.#script !== undefined) {
      return this.#script
    }
    this.#script = await scriptManager([], this.#driver)
    return this.#script
  }

  async addJavaScriptErrorHandler(callback: LogCallback): Promise<number> {
    const inspector = await this.#init()
    return await inspector.onJavascriptException(callback)
  }

  async removeJavaScriptErrorHandler(id: number): Promise<void> {
    const inspector = await this.#init()
    await inspector.removeCallback(id)
  }

  async addConsoleMessageHandler(callback: LogCallback): Promise<number> {
    const inspector = await this.#init()
    return inspector.onConsoleEntry(callback)
  }

  async removeConsoleMessageHandler(id: number): Promise<void> {
    const inspector = await this.#init()
    await inspector.removeCallback(id)
  }

  async addDomMutationHandler(callback: (event: DomMutationEvent) => void): Promise<number> {
    const script = await this.#initScript()

    const argumentValues: ScriptArgument[] = []
    const value = LocalValue.createChannelValue(new ChannelValue('channel_name'))
    argumentValues.push(value)

    const filePath = path.join(__dirname, 'atoms', 'bidi-mutation-listener.js')

    const mutationListener = fs.readFileSync(filePath, 'utf-8').toString()
    await script.addPreloadScript(mutationListener, argumentValues)

    const id = await script.onMessage(async (message) => {
      if (typeof message === 'string' || message === null || !('data' in message)) {
        return
      }
      const payload: MutationPayload = JSON.parse(String(message.data.value))
      const elements = await this.#driver.findElements({
        css: '*[data-__webdriver_id=' + by.escapeCss(payload['target']) + ']',
      })

      if (elements.length === 0) {
        return
      }

      const event: DomMutationEvent = {
        element: elements[0],
        attribute_name: payload['name'],
        current_value: payload['value'],
        old_value: payload['oldValue'],
      }

      callback(event)
    })

    return id
  }

  async removeDomMutationHandler(id: number): Promise<void> {
    const script = await this.#initScript()
    await script.removeCallback(id)
  }

  async pin(script: string): Promise<string> {
    const manager = await this.#initScript()
    return await manager.addPreloadScript(script)
  }

  async unpin(id: string): Promise<void> {
    const manager = await this.#initScript()
    await manager.removePreloadScript(id)
  }

  async execute(script: string, ...args: unknown[]): Promise<unknown> {
    const manager = await this.#initScript()

    const browsingContextId = await this.#driver.getWindowHandle()

    const argumentList: ScriptArgument[] = []
    args.forEach((arg) => {
      const value = LocalValue.getArgument(arg)
      if (value === null) {
        throw new TypeError(`Unsupported script argument of type ${typeof arg}`)
      }
      argumentList.push(value)
    })

    const response = await manager.callFunctionInBrowsingContext(browsingContextId, script, true, argumentList)

    return response instanceof EvaluateResultSuccess ? response.result : undefined
  }
}

export = Script
