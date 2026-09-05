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
import type { BidiResponse } from './domain'
import type { Capabilities } from '../lib/capabilities'
import { EvaluateResultType, EvaluateResultSuccess, EvaluateResultException, ExceptionDetails } from './evaluateResult'
import { Message, Source, SourceJson, ScriptArgument, ScriptCallback, ScriptEventData } from './scriptTypes'
import { RealmInfo, RealmInfoJson, RealmType, WindowRealmInfo } from './realmInfo'
import { RemoteValue, RemoteValueJson } from './protocolValue'
import { WebDriverError } from '../lib/error'

/** The subset of a WebDriver needed to reach its BiDi connection. */
interface BidiDriver {
  getCapabilities(): Promise<Capabilities>
  getBidi(): Promise<BiDi>
}

const ScriptEvent = {
  MESSAGE: 'script.message',
  REALM_CREATED: 'script.realmCreated',
  REALM_DESTROYED: 'script.realmDestroyed',
} as const

/** Either target of script.callFunction / script.evaluate. */
type ScriptTarget = { context: string; sandbox?: string } | { realm: string }

/** Parameters of script.callFunction. */
interface CallFunctionParams {
  functionDeclaration: string
  awaitPromise: boolean
  target?: ScriptTarget
  arguments?: Record<string, unknown>[]
  this?: unknown
  resultOwnership?: string
}

/** Parameters of script.evaluate. */
interface EvaluateParams {
  expression: string
  awaitPromise: boolean
  target?: ScriptTarget
  resultOwnership?: string
}

/** Parameters of script.addPreloadScript. */
interface AddPreloadScriptParams {
  functionDeclaration: string
  arguments: Record<string, unknown>[]
  sandbox?: string
  contexts?: string[]
}

/** Result of script.callFunction / script.evaluate, as received on the wire. */
interface EvaluateResultJson {
  type: string
  realm: string
  result: RemoteValueJson
  exceptionDetails: Record<string, unknown>
}

/** The `params` of each script event, as received on the wire. */
type ScriptEventJson =
  | { channel: string; data: RemoteValueJson; source: SourceJson }
  | (RealmInfoJson & { realm: string | null; type: string | null; origin: string | null })

/**
 * Represents class to run events and commands of Script module.
 * Described in https://w3c.github.io/webdriver-bidi/#module-script.
 */
class ScriptManager {
  #callbackId = 0
  #listener: Map<string, Map<number, ScriptCallback>>
  private readonly _driver: BidiDriver
  private _browsingContextIds?: string[] | string | null
  bidi!: BiDi
  ws!: WebSocket

  constructor(driver: BidiDriver) {
    this._driver = driver
    this.#listener = new Map()
    this.#listener.set(ScriptEvent.MESSAGE, new Map())
    this.#listener.set(ScriptEvent.REALM_CREATED, new Map())
    this.#listener.set(ScriptEvent.REALM_DESTROYED, new Map())
  }

  addCallback(eventType: string, callback: ScriptCallback): number {
    const id = ++this.#callbackId

    const eventCallbackMap = this.#listener.get(eventType)
    eventCallbackMap?.set(id, callback)
    return id
  }

  removeCallback(id: number): void {
    let hasId = false
    for (const [, callbacks] of this.#listener) {
      if (callbacks.has(id)) {
        callbacks.delete(id)
        hasId = true
      }
    }

    if (!hasId) {
      throw Error(`Callback with id ${id} not found`)
    }
  }

  invokeCallbacks(eventType: string, data: ScriptEventData): void {
    const callbacks = this.#listener.get(eventType)
    if (callbacks) {
      for (const [, callback] of callbacks) {
        callback(data)
      }
    }
  }

  async init(browsingContextIds: string[] | string | null): Promise<void> {
    if (!(await this._driver.getCapabilities()).get('webSocketUrl')) {
      throw Error('WebDriver instance must support BiDi protocol')
    }
    this.bidi = await this._driver.getBidi()
    this._browsingContextIds = browsingContextIds
  }

  /**
   * Disowns the handles in the specified realm.
   * @param realmId - The ID of the realm.
   * @param handles - The handles to disown to allow garbage collection.
   * @returns A promise that resolves when the command is sent.
   */
  async disownRealmScript(realmId: string, handles: string[]): Promise<void> {
    const params = {
      method: 'script.disown',
      params: {
        handles: handles,
        target: {
          realm: realmId,
        },
      },
    }

    await this.bidi.send(params)
  }

  /**
   * Disowns the handles in the specified browsing context.
   * @param browsingContextId - The ID of the browsing context.
   * @param handles - The handles to disown to allow garbage collection.
   * @param sandbox - The sandbox name.
   * @returns A promise that resolves when the command is sent.
   */
  async disownBrowsingContextScript(
    browsingContextId: string,
    handles: string[],
    sandbox: string | null = null,
  ): Promise<void> {
    const params: { method: string; params: { handles: string[]; target: { context: string; sandbox?: string } } } = {
      method: 'script.disown',
      params: {
        handles: handles,
        target: {
          context: browsingContextId,
        },
      },
    }
    if (sandbox != null) {
      params.params.target['sandbox'] = sandbox
    }

    await this.bidi.send(params)
  }

  /**
   * Calls a function in the specified realm.
   * @param realmId - The ID of the realm.
   * @param functionDeclaration - The function to call.
   * @param awaitPromise - Whether to await the promise returned by the function.
   * @param argumentValueList - The list of argument values to pass to the function.
   * @param thisParameter - The value of 'this' parameter for the function.
   * @param resultOwnership - The ownership of the result.
   * @returns A promise that resolves to the evaluation result or exception.
   */
  async callFunctionInRealm(
    realmId: string,
    functionDeclaration: string,
    awaitPromise: boolean,
    argumentValueList: ScriptArgument[] | null = null,
    thisParameter: unknown = null,
    resultOwnership: string | null = null,
  ): Promise<EvaluateResultSuccess | EvaluateResultException> {
    const params = this.getCallFunctionParams(
      'realm',
      realmId,
      null,
      functionDeclaration,
      awaitPromise,
      argumentValueList,
      thisParameter,
      resultOwnership,
    )

    const command = {
      method: 'script.callFunction',
      params,
    }

    const response = await this.bidi.send<EvaluateResultJson>(command)
    return this.createEvaluateResult(response)
  }

  /**
   * Calls a function in the specified browsing context.
   * @param browsingContextId - The ID of the browsing context.
   * @param functionDeclaration - The function to call.
   * @param awaitPromise - Whether to await the promise returned by the function.
   * @param argumentValueList - The list of argument values to pass to the function.
   * @param thisParameter - The value of 'this' parameter for the function.
   * @param resultOwnership - The ownership of the result.
   * @returns A promise that resolves to the evaluation result or exception.
   */
  async callFunctionInBrowsingContext(
    browsingContextId: string,
    functionDeclaration: string,
    awaitPromise: boolean,
    argumentValueList: ScriptArgument[] | null = null,
    thisParameter: unknown = null,
    resultOwnership: string | null = null,
    sandbox: string | null = null,
  ): Promise<EvaluateResultSuccess | EvaluateResultException> {
    const params = this.getCallFunctionParams(
      'contextTarget',
      browsingContextId,
      sandbox,
      functionDeclaration,
      awaitPromise,
      argumentValueList,
      thisParameter,
      resultOwnership,
    )

    const command = {
      method: 'script.callFunction',
      params,
    }

    const response = await this.bidi.send<EvaluateResultJson>(command)
    return this.createEvaluateResult(response)
  }

  /**
   * Evaluates a function in the specified realm.
   * @param realmId - The ID of the realm.
   * @param expression - The expression to function to evaluate.
   * @param awaitPromise - Whether to await the promise.
   * @param resultOwnership - The ownership of the result.
   * @returns A promise that resolves to the evaluation result or exception.
   */
  async evaluateFunctionInRealm(
    realmId: string,
    expression: string,
    awaitPromise: boolean,
    resultOwnership: string | null = null,
  ): Promise<EvaluateResultSuccess | EvaluateResultException> {
    const params = this.getEvaluateParams('realm', realmId, null, expression, awaitPromise, resultOwnership)

    const command = {
      method: 'script.evaluate',
      params,
    }

    const response = await this.bidi.send<EvaluateResultJson>(command)
    return this.createEvaluateResult(response)
  }

  /**
   * Evaluates a function in the browsing context.
   * @param browsingContextId - The ID of the browsing context.
   * @param expression - The expression to function to evaluate.
   * @param awaitPromise - Whether to await the promise.
   * @param resultOwnership - The ownership of the result.
   * @returns A promise that resolves to the evaluation result or exception.
   */
  async evaluateFunctionInBrowsingContext(
    browsingContextId: string,
    expression: string,
    awaitPromise: boolean,
    resultOwnership: string | null = null,
    sandbox: string | null = null,
  ): Promise<EvaluateResultSuccess | EvaluateResultException> {
    const params = this.getEvaluateParams(
      'contextTarget',
      browsingContextId,
      sandbox,
      expression,
      awaitPromise,
      resultOwnership,
    )

    const command = {
      method: 'script.evaluate',
      params,
    }

    const response = await this.bidi.send<EvaluateResultJson>(command)
    return this.createEvaluateResult(response)
  }

  /**
   * Adds a preload script.
   * @param functionDeclaration - The declaration of the function to be added as a preload script.
   * @param argumentValueList - The list of argument values to be passed to the preload script function.
   * @param sandbox - The sandbox object to be used for the preload script.
   * @returns A promise that resolves to the added preload script ID.
   */
  async addPreloadScript(
    functionDeclaration: string,
    argumentValueList: ScriptArgument[] = [],
    sandbox: string | null = null,
  ): Promise<string> {
    const params: AddPreloadScriptParams = {
      functionDeclaration: functionDeclaration,
      arguments: [],
    }

    if (sandbox !== null) {
      params.sandbox = sandbox
    }

    if (Array.isArray(this._browsingContextIds) && this._browsingContextIds.length > 0) {
      params.contexts = this._browsingContextIds
    }

    if (typeof this._browsingContextIds === 'string') {
      params.contexts = [this._browsingContextIds]
    }

    if (argumentValueList != null) {
      const argumentParams: Record<string, unknown>[] = []
      argumentValueList.forEach((argumentValue) => {
        argumentParams.push(argumentValue.asMap())
      })
      params['arguments'] = argumentParams
    }

    const command = {
      method: 'script.addPreloadScript',
      params,
    }

    const response = await this.bidi.send<{ script: string }>(command)
    return response.result.script
  }

  /**
   * Removes a preload script.
   * @param script - The ID for the script to be removed.
   * @returns A promise that resolves with the result of the removal.
   * @throws {WebDriverError} - If an error occurs during the removal process.
   */
  async removePreloadScript(script: string): Promise<unknown> {
    const params = { script: script }

    const command = {
      method: 'script.removePreloadScript',
      params,
    }

    const response = await this.bidi.send(command)

    if ('error' in response) {
      throw new WebDriverError(response.error)
    }

    return response.result
  }

  getCallFunctionParams(
    targetType: string,
    id: string,
    sandbox: string | null,
    functionDeclaration: string,
    awaitPromise: boolean,
    argumentValueList: ScriptArgument[] | null = null,
    thisParameter: unknown = null,
    resultOwnership: string | null = null,
  ): CallFunctionParams {
    const params: CallFunctionParams = {
      functionDeclaration: functionDeclaration,
      awaitPromise: awaitPromise,
    }
    if (targetType === 'contextTarget') {
      if (sandbox != null) {
        params['target'] = { context: id, sandbox: sandbox }
      } else {
        params['target'] = { context: id }
      }
    } else {
      params['target'] = { realm: id }
    }

    if (argumentValueList != null) {
      const argumentParams: Record<string, unknown>[] = []
      argumentValueList.forEach((argumentValue) => {
        argumentParams.push(argumentValue.asMap())
      })
      params['arguments'] = argumentParams
    }

    if (thisParameter != null) {
      params['this'] = thisParameter
    }

    if (resultOwnership != null) {
      params['resultOwnership'] = resultOwnership
    }

    return params
  }

  getEvaluateParams(
    targetType: string,
    id: string,
    sandbox: string | null,
    expression: string,
    awaitPromise: boolean,
    resultOwnership: string | null = null,
  ): EvaluateParams {
    const params: EvaluateParams = {
      expression: expression,
      awaitPromise: awaitPromise,
    }
    if (targetType === 'contextTarget') {
      if (sandbox != null) {
        params['target'] = { context: id, sandbox: sandbox }
      } else {
        params['target'] = { context: id }
      }
    } else {
      params['target'] = { realm: id }
    }

    if (resultOwnership != null) {
      params['resultOwnership'] = resultOwnership
    }

    return params
  }

  createEvaluateResult(response: BidiResponse<EvaluateResultJson>): EvaluateResultSuccess | EvaluateResultException {
    const type = response.result.type
    const realmId = response.result.realm
    let evaluateResult

    if (type === EvaluateResultType.SUCCESS) {
      const result = response.result.result
      evaluateResult = new EvaluateResultSuccess(realmId, new RemoteValue(result))
    } else {
      const exceptionDetails = response.result.exceptionDetails
      evaluateResult = new EvaluateResultException(realmId, new ExceptionDetails(exceptionDetails))
    }

    return evaluateResult
  }

  realmInfoMapper(realms: RealmInfoJson[]): RealmInfo[] {
    const realmsList: RealmInfo[] = []
    realms.forEach((realm) => {
      realmsList.push(RealmInfo.fromJson(realm))
    })
    return realmsList
  }

  /**
   * Retrieves all realms.
   * @returns A promise that resolves to an array of RealmInfo objects.
   */
  async getAllRealms(): Promise<RealmInfo[]> {
    const command = {
      method: 'script.getRealms',
      params: {},
    }

    const response = await this.bidi.send<{ realms: RealmInfoJson[] }>(command)
    return this.realmInfoMapper(response.result.realms)
  }

  /**
   * Retrieves the realms by type.
   * @param type - The type of realms to retrieve.
   * @returns A promise that resolves to an array of RealmInfo objects.
   */
  async getRealmsByType(type: string): Promise<RealmInfo[]> {
    const command = {
      method: 'script.getRealms',
      params: { type: type },
    }

    const response = await this.bidi.send<{ realms: RealmInfoJson[] }>(command)
    return this.realmInfoMapper(response.result.realms)
  }

  /**
   * Retrieves the realms in the specified browsing context.
   * @param browsingContext - The browsing context ID.
   * @returns A promise that resolves to an array of RealmInfo objects.
   */
  async getRealmsInBrowsingContext(browsingContext: string): Promise<RealmInfo[]> {
    const command = {
      method: 'script.getRealms',
      params: { context: browsingContext },
    }

    const response = await this.bidi.send<{ realms: RealmInfoJson[] }>(command)
    return this.realmInfoMapper(response.result.realms)
  }

  /**
   * Retrieves the realms in a browsing context based on the specified type.
   * @param browsingContext - The browsing context ID.
   * @param type - The type of realms to retrieve.
   * @returns A promise that resolves to an array of RealmInfo objects.
   */
  async getRealmsInBrowsingContextByType(browsingContext: string, type: string): Promise<RealmInfo[]> {
    const command = {
      method: 'script.getRealms',
      params: { context: browsingContext, type: type },
    }

    const response = await this.bidi.send<{ realms: RealmInfoJson[] }>(command)
    return this.realmInfoMapper(response.result.realms)
  }

  /**
   * Subscribes to the 'script.message' event and handles the callback function when a message is received.
   * @param callback - The callback function to be executed when a message is received.
   * @returns A promise that resolves when the subscription is successful.
   */
  async onMessage(callback: ScriptCallback): Promise<number> {
    return await this.subscribeAndHandleEvent(ScriptEvent.MESSAGE, callback)
  }

  /**
   * Subscribes to the 'script.realmCreated' event and handles it with the provided callback.
   * @param callback - The callback function to handle the 'script.realmCreated' event.
   * @returns A promise that resolves when the subscription is successful.
   */
  async onRealmCreated(callback: ScriptCallback): Promise<number> {
    return await this.subscribeAndHandleEvent(ScriptEvent.REALM_CREATED, callback)
  }

  /**
   * Subscribes to the 'script.realmDestroyed' event and handles it with the provided callback function.
   * @param callback - The callback function to be executed when the 'script.realmDestroyed' event occurs.
   * @returns A promise that resolves when the subscription is successful.
   */
  async onRealmDestroyed(callback: ScriptCallback): Promise<number> {
    return await this.subscribeAndHandleEvent(ScriptEvent.REALM_DESTROYED, callback)
  }

  async subscribeAndHandleEvent(eventType: string, callback: ScriptCallback): Promise<number> {
    if (this._browsingContextIds != null) {
      await this.bidi.subscribe(eventType, this._browsingContextIds)
    } else {
      await this.bidi.subscribe(eventType)
    }

    const id = this.addCallback(eventType, callback)
    this.ws = await this.bidi.socket
    this.ws.on('message', (event) => {
      const { params }: { params?: ScriptEventJson } = JSON.parse(event.toString())
      if (params) {
        let response: ScriptEventData = null
        if ('channel' in params) {
          response = new Message(params.channel, new RemoteValue(params.data), new Source(params.source))
        } else if ('realm' in params) {
          if (params.type === RealmType.WINDOW) {
            response = new WindowRealmInfo(
              params.realm,
              params.origin,
              params.type,
              params.context ?? null,
              params.sandbox ?? null,
            )
          } else if (params.realm !== null && params.type !== null) {
            response = new RealmInfo(params.realm, params.origin, params.type)
          } else if (params.realm !== null) {
            response = params.realm
          }
        }
        this.invokeCallbacks(eventType, response)
      }
    })
    return id
  }

  async close(): Promise<void> {
    const events = ['script.message', 'script.realmCreated', 'script.realmDestroyed']
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

async function getScriptManagerInstance(
  browsingContextId: string[] | string | null,
  driver: BidiDriver,
): Promise<ScriptManager> {
  const instance = new ScriptManager(driver)
  await instance.init(browsingContextId)
  return instance
}

export = getScriptManagerInstance
