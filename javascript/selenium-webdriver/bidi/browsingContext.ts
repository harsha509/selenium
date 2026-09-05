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

import type BiDi from './index'
import type { BidiResponse } from './domain'
import { InvalidArgumentError, NoSuchFrameError } from '../lib/error'
import { BrowsingContextInfo } from './browsingContextTypes'
import { SerializationOptions, ReferenceValue, RemoteValue, RemoteValueJson } from './protocolValue'
import { WebDriver, WebElement, PrintPageOptions, PrintPageParams } from '../lib/webdriver'
import { CaptureScreenshotParameters } from './captureScreenshotParameters'
import { CreateContextParameters } from './createContextParameters'

/** A browsingContext.Info as this module reads it: getTree() reads `context`, getTopLevelContexts() reads `id`. */
interface ContextInfoJson {
  context: string
  id: string
  url: string
  children: unknown[] | null
  parent: string | null
}

/** How to obtain a {@link BrowsingContext}: an existing id, or a type (and parameters) to create one. */
interface BrowsingContextOptions {
  browsingContextId?: string
  type?: string
  createParameters?: CreateContextParameters
}

/**
 * Represents the locator to locate nodes in the browsing context.
 * Described in https://w3c.github.io/webdriver-bidi/#type-browsingContext-Locator.
 */
class Locator {
  static readonly Type = Object.freeze({
    CSS: 'css',
    INNER_TEXT: 'innerText',
    XPATH: 'xpath',
  } as const)

  #type: string
  #value: string
  #ignoreCase: boolean | undefined
  #matchType: string | undefined
  #maxDepth: number | undefined

  constructor(
    type: string,
    value: string,
    ignoreCase: boolean | undefined = undefined,
    matchType: string | undefined = undefined,
    maxDepth: number | undefined = undefined,
  ) {
    this.#type = type
    this.#value = value
    this.#ignoreCase = ignoreCase
    this.#matchType = matchType
    this.#maxDepth = maxDepth
  }

  /**
   * Creates a new Locator object with CSS selector type.
   * @param value - The CSS selector value.
   * @returns A new Locator object with CSS selector type.
   */
  static css(value: string): Locator {
    return new Locator(Locator.Type.CSS, value)
  }

  /**
   * Creates a new Locator object with the given XPath value.
   * @param value - The XPath value.
   * @returns A new Locator object.
   */
  static xpath(value: string): Locator {
    return new Locator(Locator.Type.XPATH, value)
  }

  /**
   * Creates a new Locator object with the specified inner text value.
   * @param value - The inner text value to locate.
   * @param ignoreCase - Whether to ignore the case when matching the inner text value.
   * @param matchType - The type of matching to perform (full or partial).
   * @param maxDepth - The maximum depth to search for the inner text value.
   * @returns A new Locator object with the specified inner text value.
   */
  static innerText(
    value: string,
    ignoreCase: boolean | undefined = undefined,
    matchType: string | undefined = undefined,
    maxDepth: number | undefined = undefined,
  ): Locator {
    return new Locator(Locator.Type.INNER_TEXT, value, ignoreCase, matchType, maxDepth)
  }

  toMap(): Map<string, unknown> {
    const map = new Map<string, unknown>()
    map.set('type', this.#type.toString())
    map.set('value', this.#value)
    map.set('ignoreCase', this.#ignoreCase)
    map.set('matchType', this.#matchType)
    map.set('maxDepth', this.#maxDepth)
    return map
  }
}

/**
 * Represents the contains under BrowsingContext module commands.
 * Described in https://w3c.github.io/webdriver-bidi/#module-browsingContext
 * Each browsing context command requires a browsing context id.
 * Hence, this class represent browsing context lifecycle.
 */
class BrowsingContext {
  private readonly _driver: WebDriver
  private _id!: string
  bidi!: BiDi

  constructor(driver: WebDriver) {
    this._driver = driver
  }

  /**
   * @returns id
   */
  get id(): string {
    return this._id
  }

  async init({
    browsingContextId = undefined,
    type = undefined,
    createParameters = undefined,
  }: BrowsingContextOptions): Promise<void> {
    if (!(await this._driver.getCapabilities()).get('webSocketUrl')) {
      throw Error('WebDriver instance must support BiDi protocol')
    }

    if (browsingContextId === undefined && type === undefined && createParameters === undefined) {
      throw Error('Either BrowsingContextId or Type or CreateParameters must be provided')
    }

    if (type === undefined && createParameters !== undefined) {
      throw Error('Type must be provided with CreateParameters')
    }

    if (type !== undefined && !['window', 'tab'].includes(type)) {
      throw Error(`Valid types are 'window' & 'tab'. Received: ${type}`)
    }

    this.bidi = await this._driver.getBidi()
    if (browsingContextId !== undefined) {
      this._id = browsingContextId
      return
    }
    if (type === undefined) {
      throw Error('Type must be provided with CreateParameters')
    }
    this._id = (await this.create(type, createParameters))['result']['context']
  }

  /**
   * Creates a browsing context for the given type with the given parameters
   */
  async create(
    type: string,
    createParameters: CreateContextParameters | undefined = undefined,
  ): Promise<BidiResponse<{ context: string }>> {
    if (createParameters !== undefined && !(createParameters instanceof CreateContextParameters)) {
      throw Error(`Pass in the instance of CreateContextParameters. Received: ${createParameters}`)
    }

    const parameters = new Map<string, unknown>()
    parameters.set('type', type)

    if (createParameters !== undefined) {
      createParameters.asMap().forEach((value, key) => {
        parameters.set(key, value)
      })
    }

    const params = {
      method: 'browsingContext.create',
      params: Object.fromEntries(parameters),
    }
    return await this.bidi.send<{ context: string }>(params)
  }

  /**
   * @param url the url to navigate to
   * @param readinessState type of readiness state: "none" / "interactive" / "complete"
   * @returns NavigateResult object
   */
  async navigate(url: string, readinessState: string | undefined = undefined): Promise<NavigateResult> {
    if (readinessState !== undefined && !['none', 'interactive', 'complete'].includes(readinessState)) {
      throw Error(`Valid readiness states are 'none', 'interactive' & 'complete'. Received: ${readinessState}`)
    }

    const params = {
      method: 'browsingContext.navigate',
      params: {
        context: this._id,
        url: url,
        wait: readinessState,
      },
    }
    const navigateResult = (await this.bidi.send<{ url: string; navigation: string }>(params))['result']

    return new NavigateResult(navigateResult['url'], navigateResult['navigation'])
  }

  /**
   * @param maxDepth the max depth of the descendents of browsing context tree
   * @returns BrowsingContextInfo object
   */
  async getTree(maxDepth: number | undefined = undefined): Promise<BrowsingContextInfo> {
    const params = {
      method: 'browsingContext.getTree',
      params: {
        root: this._id,
        maxDepth: maxDepth,
      },
    }

    const response = await this.bidi.send<{ contexts: ContextInfoJson[] }>(params)
    if ('error' in response) {
      throw Error(response['error'])
    }

    const result = response['result']['contexts'][0]
    return new BrowsingContextInfo(result['context'], result['url'], result['children'], result['parent'])
  }

  /**
   * @returns A Promise that resolves to an array of BrowsingContextInfo objects representing the top-level browsing contexts.
   */
  async getTopLevelContexts(): Promise<BrowsingContextInfo[]> {
    const params = {
      method: 'browsingContext.getTree',
      params: {},
    }

    const result = await this.bidi.send<{ contexts: ContextInfoJson[] }>(params)
    if ('error' in result) {
      throw Error(result['error'])
    }

    const contexts = result['result']['contexts']
    const browsingContexts = contexts.map((context) => {
      return new BrowsingContextInfo(context['id'], context['url'], context['children'], context['parent'])
    })
    return browsingContexts
  }

  /**
   * Closes the browsing context
   */
  async close(): Promise<void> {
    const params = {
      method: 'browsingContext.close',
      params: {
        context: this._id,
      },
    }
    await this.bidi.send(params)
  }

  /**
   * Prints PDF of the webpage
   * @param options print options given by the user
   * @returns PrintResult object
   */
  async printPage(options: PrintPageOptions = {}): Promise<PrintResult> {
    const params: { method: string; params: PrintPageParams & { context: string } } = {
      method: 'browsingContext.print',
      // Setting default values for parameters
      params: {
        context: this._id,
        background: false,
        margin: {
          bottom: 1.0,
          left: 1.0,
          right: 1.0,
          top: 1.0,
        },
        orientation: 'portrait',
        page: {
          height: 27.94,
          width: 21.59,
        },
        pageRanges: [],
        scale: 1.0,
        shrinkToFit: true,
      },
    }

    // Updating parameter values based on the options passed
    params.params = this._driver.validatePrintPageParams(options, params.params)

    const response = await this.bidi.send<{ data: string }>(params)
    return new PrintResult(response.result.data)
  }

  /**
   * Captures a screenshot of the browsing context.
   * @param captureScreenshotParameters - Optional parameters for capturing the screenshot.
   * @returns A promise that resolves to the base64-encoded string representation of the captured screenshot.
   * @throws {InvalidArgumentError} - If the provided captureScreenshotParameters is not an instance of CaptureScreenshotParameters.
   */
  async captureScreenshot(
    captureScreenshotParameters: CaptureScreenshotParameters | undefined = undefined,
  ): Promise<string> {
    if (
      captureScreenshotParameters !== undefined &&
      !(captureScreenshotParameters instanceof CaptureScreenshotParameters)
    ) {
      throw new InvalidArgumentError(
        `Pass in a CaptureScreenshotParameters object. Received: ${captureScreenshotParameters}`,
      )
    }

    const screenshotParams = new Map<string, unknown>()
    screenshotParams.set('context', this._id)

    if (captureScreenshotParameters !== undefined) {
      captureScreenshotParameters.asMap().forEach((value, key) => {
        screenshotParams.set(key, value)
      })
    }

    const params = {
      method: 'browsingContext.captureScreenshot',
      params: Object.fromEntries(screenshotParams),
    }

    const response = await this.bidi.send<{ data: string }>(params)
    this.checkErrorInScreenshot(response)
    return response['result']['data']
  }

  async captureBoxScreenshot(x: number, y: number, width: number, height: number): Promise<string> {
    const params = {
      method: 'browsingContext.captureScreenshot',
      params: {
        context: this._id,
        clip: {
          type: 'box',
          x: x,
          y: y,
          width: width,
          height: height,
        },
      },
    }

    const response = await this.bidi.send<{ data: string }>(params)
    this.checkErrorInScreenshot(response)
    return response['result']['data']
  }

  /**
   * Captures a screenshot of a specific element within the browsing context.
   * @param sharedId - The shared ID of the element to capture.
   * @param handle - The handle of the element to capture (optional).
   * @returns A promise that resolves to the base64-encoded screenshot data.
   */
  async captureElementScreenshot(sharedId: string, handle: string | undefined = undefined): Promise<string> {
    const params = {
      method: 'browsingContext.captureScreenshot',
      params: {
        context: this._id,
        clip: {
          type: 'element',
          element: {
            sharedId: sharedId,
            handle: handle,
          },
        },
      },
    }

    const response = await this.bidi.send<{ data: string }>(params)
    this.checkErrorInScreenshot(response)
    return response['result']['data']
  }

  checkErrorInScreenshot(response: BidiResponse<unknown>): void {
    if ('error' in response) {
      const { error, message } = response

      switch (error) {
        case 'invalid argument':
          throw new InvalidArgumentError(message)
        case 'no such frame':
          throw new NoSuchFrameError(message)
      }
    }
  }

  /**
   * Activates and focuses the top-level browsing context.
   * @returns A promise that resolves when the browsing context is activated.
   * @throws {Error} If there is an error while activating the browsing context.
   */
  async activate(): Promise<void> {
    const params = {
      method: 'browsingContext.activate',
      params: {
        context: this._id,
      },
    }

    const result = await this.bidi.send(params)
    if ('error' in result) {
      throw Error(result['error'])
    }
  }

  /**
   * Handles a user prompt in the browsing context.
   * @param accept - Optional. Indicates whether to accept or dismiss the prompt.
   * @param userText - Optional. The text to enter.
   * @throws {Error} If an error occurs while handling the user prompt.
   */
  async handleUserPrompt(
    accept: boolean | undefined = undefined,
    userText: string | undefined = undefined,
  ): Promise<void> {
    const params = {
      method: 'browsingContext.handleUserPrompt',
      params: {
        context: this._id,
        accept: accept,
        userText: userText,
      },
    }

    const result = await this.bidi.send(params)
    if ('error' in result) {
      throw Error(result['error'])
    }
  }

  /**
   * Reloads the current browsing context.
   * @param ignoreCache - Whether to ignore the cache when reloading.
   * @param readinessState - The readiness state to wait for before returning.
   *        Valid readiness states are 'none', 'interactive', and 'complete'.
   * @returns A promise that resolves to the result of the reload operation.
   * @throws {Error} - If an invalid readiness state is provided.
   */
  async reload(
    ignoreCache: boolean | undefined = undefined,
    readinessState: string | undefined = undefined,
  ): Promise<NavigateResult> {
    if (readinessState !== undefined && !['none', 'interactive', 'complete'].includes(readinessState)) {
      throw Error(`Valid readiness states are 'none', 'interactive' & 'complete'. Received: ${readinessState}`)
    }

    const params = {
      method: 'browsingContext.reload',
      params: {
        context: this._id,
        ignoreCache: ignoreCache,
        wait: readinessState,
      },
    }
    const navigateResult = (await this.bidi.send<{ url: string; navigation: string }>(params))['result']

    return new NavigateResult(navigateResult['url'], navigateResult['navigation'])
  }

  /**
   * Sets the viewport size and device pixel ratio for the browsing context.
   * @param width - The width of the viewport.
   * @param height - The height of the viewport.
   * @param devicePixelRatio - The device pixel ratio (optional)
   * @throws {Error} If an error occurs while setting the viewport.
   */
  async setViewport(width: number, height: number, devicePixelRatio: number | undefined = undefined): Promise<void> {
    const params = {
      method: 'browsingContext.setViewport',
      params: {
        context: this._id,
        viewport: { width: width, height: height },
        devicePixelRatio: devicePixelRatio,
      },
    }

    const result = await this.bidi.send(params)
    if ('error' in result) {
      throw Error(result['error'])
    }
  }

  /**
   * Traverses the browsing context history by a given delta.
   * @param delta - The delta value to traverse the history. A positive value moves forward, while a negative value moves backward.
   * @returns A promise that resolves when the history traversal is complete.
   */
  async traverseHistory(delta: number): Promise<void> {
    const params = {
      method: 'browsingContext.traverseHistory',
      params: {
        context: this._id,
        delta: delta,
      },
    }

    await this.bidi.send(params)
  }

  /**
   * Moves the browsing context forward by one step in the history.
   * @returns A promise that resolves when the browsing context has moved forward.
   */
  async forward(): Promise<void> {
    await this.traverseHistory(1)
  }

  /**
   * Navigates the browsing context to the previous page in the history.
   * @returns A promise that resolves when the navigation is complete.
   */
  async back(): Promise<void> {
    await this.traverseHistory(-1)
  }

  /**
   * Locates nodes in the browsing context.
   * @param locator - The locator object used to locate the nodes.
   * @param maxNodeCount - The maximum number of nodes to locate (optional).
   * @param sandbox - The sandbox name for locating nodes (optional).
   * @param serializationOptions - The serialization options for locating nodes (optional).
   * @param startNodes - The array of start nodes for locating nodes (optional).
   * @returns A promise that resolves to the arrays of located nodes.
   * @throws {Error} - If the locator is not an instance of Locator.
   * @throws {Error} - If the serializationOptions is provided but not an instance of SerializationOptions.
   * @throws {Error} - If the startNodes is provided but not an array of ReferenceValue objects.
   * @throws {Error} - If any of the startNodes is not an instance of ReferenceValue.
   */
  async locateNodes(
    locator: Locator,
    maxNodeCount: number | undefined = undefined,
    sandbox: string | undefined = undefined,
    serializationOptions: SerializationOptions | undefined = undefined,
    startNodes: ReferenceValue[] | undefined = undefined,
  ): Promise<RemoteValue[]> {
    if (!(locator instanceof Locator)) {
      throw Error(`Pass in a Locator object. Received: ${locator}`)
    }

    if (serializationOptions !== undefined && !(serializationOptions instanceof SerializationOptions)) {
      throw Error(`Pass in SerializationOptions object. Received: ${serializationOptions} `)
    }

    if (startNodes !== undefined && !Array.isArray(startNodes)) {
      throw Error(`Pass in an array of ReferenceValue objects. Received: ${startNodes}`)
    }

    let startNodesSerialized: Record<string, string>[] | undefined = undefined
    if (startNodes !== undefined && Array.isArray(startNodes)) {
      startNodesSerialized = []
      startNodes.forEach((node) => {
        if (!(node instanceof ReferenceValue)) {
          throw Error(`Pass in a ReferenceValue object. Received: ${node}`)
        } else {
          startNodesSerialized?.push(node.asMap())
        }
      })
    }

    const params = {
      method: 'browsingContext.locateNodes',
      params: {
        context: this._id,
        locator: Object.fromEntries(locator.toMap()),
        maxNodeCount: maxNodeCount,
        sandbox: sandbox,
        serializationOptions: serializationOptions,
        startNodes: startNodesSerialized,
      },
    }

    const response = await this.bidi.send<{ nodes: RemoteValueJson[] }>(params)
    if ('error' in response) {
      throw Error(response['error'])
    }

    const nodes = response.result.nodes
    const remoteValues: RemoteValue[] = []

    nodes.forEach((node) => {
      remoteValues.push(new RemoteValue(node))
    })
    return remoteValues
  }

  /**
   * Locates a single node in the browsing context.
   * @param locator - The locator used to find the node.
   * @param sandbox - The sandbox of the node (optional).
   * @param serializationOptions - The serialization options for the node (optional).
   * @param startNodes - The starting nodes for the search (optional).
   * @returns A promise that resolves to the located node.
   */
  async locateNode(
    locator: Locator,
    sandbox: string | undefined = undefined,
    serializationOptions: SerializationOptions | undefined = undefined,
    startNodes: ReferenceValue[] | undefined = undefined,
  ): Promise<RemoteValue> {
    const elements = await this.locateNodes(locator, 1, sandbox, serializationOptions, startNodes)
    return elements[0]
  }

  async locateElement(locator: Locator): Promise<WebElement> {
    const elements = await this.locateNodes(locator, 1)
    return new WebElement(this._driver, sharedIdOf(elements[0]))
  }

  async locateElements(locator: Locator): Promise<WebElement[]> {
    const elements = await this.locateNodes(locator)

    const webElements: WebElement[] = []
    elements.forEach((element) => {
      webElements.push(new WebElement(this._driver, sharedIdOf(element)))
    })
    return webElements
  }
}

/** The sharedId a located node must carry to become a {@link WebElement}. */
function sharedIdOf(node: RemoteValue): string {
  if (node.sharedId === null) {
    throw new TypeError('Located node does not reference a DOM element (no sharedId)')
  }
  return node.sharedId
}

/**
 * Represents the result of a navigation operation.
 */
class NavigateResult {
  private readonly _url: string
  private readonly _navigationId: string

  constructor(url: string, navigationId: string) {
    this._url = url
    this._navigationId = navigationId
  }

  /**
   * Gets the URL of the navigated page.
   */
  get url(): string {
    return this._url
  }

  /**
   * Gets the ID of the navigation operation.
   */
  get navigationId(): string {
    return this._navigationId
  }
}

/**
 * Represents a print result.
 */
class PrintResult {
  private readonly _data: string

  constructor(data: string) {
    this._data = data
  }

  /**
   * Gets the data associated with the print result.
   */
  get data(): string {
    return this._data
  }
}

/**
 * initiate browsing context instance and return
 * @param driver
 * @param browsingContextId The browsing context of current window/tab
 * @param type "window" or "tab"
 * @param createParameters The parameters for creating a new browsing context
 */
async function getBrowsingContextInstance(
  driver: WebDriver,
  { browsingContextId = undefined, type = undefined, createParameters = undefined }: BrowsingContextOptions,
): Promise<BrowsingContext> {
  const instance = new BrowsingContext(driver)
  await instance.init({ browsingContextId, type, createParameters })
  return instance
}

getBrowsingContextInstance.Locator = Locator

export = getBrowsingContextInstance
