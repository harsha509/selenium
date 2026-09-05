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

/**
 * @fileoverview The heart of the WebDriver JavaScript API.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import JSZip from 'jszip'
import WebSocket from 'ws'
import * as by from './by'
import { RelativeBy, Locator, LocatorFunction, ScriptSource } from './by'
import * as command from './command'
import * as error from './error'
import * as input from './input'
import * as logging from './logging'
import * as promise from './promise'
import * as Symbols from './symbols'
import * as cdp from '../devtools/CDPConnection'
import type { HttpResponse } from '../devtools/networkinterceptor'
import * as http from '../http/index'
import { Capabilities, Timeouts } from './capabilities'
import { NoSuchElementError } from './error'
import { Credential, CredentialDict, VirtualAuthenticatorOptions } from './virtual_authenticator'
import * as webElement from './webelement'
import { isObject } from './util'
import { getBidiConnection, closeBidiConnection } from './bidi_connection'
import type BiDi from '../bidi/index'
import { PinnedScript } from './pinnedScript'
import Script from './script'
import Network from './network'
import Dialog from './fedcm/dialog'
import type { Session } from './session'
import * as self from './webdriver'

const cdpTargets = ['page', 'browser']

// Capability names that are defined in the W3C spec.
const W3C_CAPABILITY_NAMES = new Set([
  'acceptInsecureCerts',
  'browserName',
  'browserVersion',
  'pageLoadStrategy',
  'platformName',
  'proxy',
  'setWindowRect',
  'strictFileInteractability',
  'timeouts',
  'unhandledPromptBehavior',
  'webSocketUrl',
])

/** A wait-condition body: evaluated on each poll until it yields a truthy value. */
export type ConditionFn<OUT> = (driver: WebDriver) => OUT | PromiseLike<OUT>

/** A wait timeout message, or a function producing one. */
export type WaitMessage = string | (() => string)

/** A search context a custom locator function may be evaluated against. */
export type SearchContext = by.SearchContext

/** A window or element rectangle. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** A record object describing a browser cookie. */
export interface Cookie {
  /** The name of the cookie. */
  name: string
  /** The cookie value. */
  value: string
  /** The cookie path. Defaults to "/" when adding a cookie. */
  path?: string
  /** The domain the cookie is visible to. Defaults to the current document's URL when adding a cookie. */
  domain?: string
  /** Whether the cookie is a secure cookie. Defaults to false when adding a new cookie. */
  secure?: boolean
  /** Whether the cookie is an HTTP only cookie. Defaults to false when adding a new cookie. */
  httpOnly?: boolean
  /**
   * When the cookie expires. When adding a cookie this may be a Date or seconds since
   * Unix epoch; it is always returned in seconds since epoch when retrieving cookies.
   */
  expiry?: Date | number
  /** The SameSite policy: one of 'Lax', 'Strict' or 'None'. */
  sameSite?: string
}

/** Options accepted by {@link WebDriver#printPage}. */
export interface PrintPageOptions {
  orientation?: string
  scale?: number
  background?: boolean
  width?: number
  height?: number
  top?: number
  bottom?: number
  left?: number
  right?: number
  shrinkToFit?: boolean
  pageRanges?: unknown[]
}

/** The wire form of {@link PrintPageOptions}. */
export interface PrintPageParams {
  orientation?: unknown
  scale?: unknown
  background?: unknown
  page?: { width?: unknown; height?: unknown }
  margin?: { top?: unknown; left?: unknown; bottom?: unknown; right?: unknown }
  shrinkToFit?: unknown
  pageRanges?: unknown
}

/** A CDP message as received on the debugger socket. */
interface CdpMessageJson {
  method?: string
  params?: CdpEventParams
  result?: {
    targetInfos?: { type: string; targetId: string }[]
    sessionId?: string
  }
}

/** The `params` of the CDP events this driver listens for. */
interface CdpEventParams {
  type?: string
  timestamp?: number
  args?: unknown
  entry?: { level?: string; timestamp?: number; text?: string }
  exceptionDetails?: unknown
  requestId?: string
  request?: { url?: string }
  payload?: string
}

/** A console.* call reported by CDP. */
export interface CdpConsoleEvent {
  type: string | undefined
  timestamp: Date
  args: unknown
}

/** A log entry reported by CDP. */
export interface CdpLogEvent {
  level: string | undefined
  timestamp: Date
  message: string | undefined
}

/** An uncaught exception reported by CDP. */
export interface CdpExceptionEvent {
  exceptionDetails: unknown
  timestamp: Date
}

/** A DOM mutation reported by the mutation-listener atom. */
export interface DomMutationEvent {
  element: WebElement
  attribute_name: unknown
  current_value: unknown
  old_value: unknown
}

/** A log entry as returned by the remote end. */
interface LogEntryJson {
  level: string | number
  message: string
  timestamp: number
  type: string
}

/**
 * Defines a condition for use with WebDriver's {@linkplain WebDriver#wait wait
 * command}.
 */
export class Condition<OUT> {
  private readonly description_: string
  /** The condition function to evaluate on each iteration of the wait loop. */
  fn: ConditionFn<OUT>

  /**
   * @param message A descriptive error message. Should complete the
   *     sentence "Waiting [...]"
   * @param fn The condition function to evaluate on each iteration of the
   *     wait loop.
   */
  constructor(message: string, fn: ConditionFn<OUT>) {
    this.description_ = 'Waiting ' + message
    this.fn = fn
  }

  /** @return A description of this condition. */
  description(): string {
    return this.description_
  }
}

/**
 * Defines a condition that will result in a {@link WebElement}.
 */
export class WebElementCondition extends Condition<WebElement | null | undefined> {
  /**
   * @param message A descriptive error message. Should complete the
   *     sentence "Waiting [...]"
   * @param fn The condition function to evaluate on each iteration of the wait
   *     loop.
   */
  constructor(message: string, fn: ConditionFn<WebElement | null | undefined>) {
    super(message, fn)
  }
}

//////////////////////////////////////////////////////////////////////////////
//
//  WebDriver
//
//////////////////////////////////////////////////////////////////////////////

/**
 * Translates a command to its wire-protocol representation before passing it
 * to the given `executor` for execution; `T` is the caller-asserted result type.
 * @param executor The executor to use.
 * @param command The command to execute.
 * @return A promise that will resolve with the command response.
 */
function executeCommand<T>(executor: command.Executor, command: command.Command): Promise<T> {
  return toWireValue(command.getParameters()).then(function (parameters) {
    command.setParameters(isObject(parameters) ? parameters : {})
    return executor.execute(command) as Promise<T>
  })
}

/** An object that defines its own wire form through {@link Symbols.serialize}. */
interface Serializable {
  [Symbols.serialize](): unknown
}

function isSerializable(value: object): value is Serializable {
  return typeof Reflect.get(value, Symbols.serialize) === 'function'
}

function hasToJSON(value: object): value is { toJSON(): unknown } {
  return typeof Reflect.get(value, 'toJSON') === 'function'
}

/**
 * Converts an object to its JSON representation in the WebDriver wire protocol.
 * When converting values of type object, the following steps will be taken:
 *
 * <ol>
 * <li>if the object is a WebElement, the return value will be the element's
 *     server ID
 * <li>if the object defines a {@link Symbols.serialize} method, this algorithm
 *     will be recursively applied to the object's serialized representation
 * <li>if the object provides a "toJSON" function, this algorithm will
 *     recursively be applied to the result of that function
 * <li>otherwise, the value of each key will be recursively converted according
 *     to the rules above.
 * </ol>
 *
 * @param obj The object to convert.
 * @return A promise that will resolve to the input value's JSON representation.
 */
async function toWireValue(obj: unknown): Promise<unknown> {
  const value = await Promise.resolve(obj)
  if (value === void 0 || value === null) {
    return value
  }

  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return convertKeys(value)
  }

  if (typeof value === 'function') {
    return '' + value
  }

  if (typeof value !== 'object') {
    return value
  }

  if (isSerializable(value)) {
    return toWireValue(value[Symbols.serialize]())
  } else if (hasToJSON(value)) {
    return toWireValue(value.toJSON())
  }
  return convertKeys(value)
}

async function convertKeys(obj: object): Promise<unknown> {
  if (Array.isArray(obj)) {
    const ret: unknown[] = new Array(obj.length)
    for (let i = 0, n = obj.length; i < n; i++) {
      ret[i] = await toWireValue(obj[i])
    }
    return ret
  }

  const ret: Record<string, unknown> = {}
  for (const key in obj) {
    ret[key] = await toWireValue(Reflect.get(obj, key))
  }
  return ret
}

/**
 * Converts a value from its JSON representation according to the WebDriver wire
 * protocol. Any JSON object that defines a WebElement ID will be decoded to a
 * {@link WebElement} object. All other values will be passed through as is.
 *
 * @param driver The driver to use as the parent of any unwrapped
 *     {@link WebElement} values.
 * @param value The value to convert.
 * @return The converted value.
 */
function fromWireValue(driver: WebDriver, value: unknown): unknown {
  if (Array.isArray(value)) {
    value = value.map((v) => fromWireValue(driver, v))
  } else if (WebElement.isId(value)) {
    const id = WebElement.extractId(value)
    value = new WebElement(driver, id)
  } else if (ShadowRoot.isId(value)) {
    const id = ShadowRoot.extractId(value)
    value = new ShadowRoot(driver, id)
  } else if (isObject(value)) {
    const result: Record<string, unknown> = {}
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        result[key] = fromWireValue(driver, value[key])
      }
    }
    value = result
  }
  return value
}

/**
 * Resolves a wait message from either a function or a string.
 * @param message An optional message to use if the wait times out.
 * @return The resolved message
 */
function resolveWaitMessage(message?: WaitMessage): string {
  return message ? `${typeof message === 'function' ? message() : message}\n` : ''
}

function isConditionFn(value: unknown): value is ConditionFn<unknown> {
  return typeof value === 'function'
}

/**
 * Structural interface for a WebDriver client.
 */
export abstract class IWebDriver {
  /**
   * Executes the provided {@link command.Command} using this driver's
   * {@link command.Executor}; `T` is the caller-asserted result type.
   *
   * @param command The command to schedule.
   * @return A promise that will be resolved with the command result.
   */
  abstract execute<T = unknown>(command: command.Command): Promise<T>

  /**
   * Sets the {@linkplain input.FileDetector file detector} that should be
   * used with this instance.
   * @param detector The detector to use or `null`.
   */
  abstract setFileDetector(detector: input.FileDetector | null): void

  /**
   * @return The command executor used by this instance.
   */
  abstract getExecutor(): command.Executor

  /**
   * @return A promise for this client's session.
   */
  abstract getSession(): Promise<Session>

  /**
   * @return A promise that will resolve with the instance's capabilities.
   */
  abstract getCapabilities(): Promise<Capabilities>

  /**
   * Terminates the browser session. After calling quit, this instance will be
   * invalidated and may no longer be used to issue commands against the
   * browser.
   *
   * @return A promise that will be resolved when the command has completed.
   */
  abstract quit(): Promise<unknown>

  /**
   * Creates a new action sequence using this driver. The sequence will not be
   * submitted for execution until
   * {@link ./input.Actions#perform Actions.perform()} is called.
   *
   * @param options Configuration options for the action sequence (see
   *     {@link ./input.Actions Actions} documentation for details).
   * @return A new action sequence for this instance.
   */
  abstract actions(options?: { async?: boolean; bridge?: boolean }): input.Actions

  /**
   * Executes a snippet of JavaScript in the context of the currently selected
   * frame or window. The script fragment will be executed as the body of an
   * anonymous function. If the script is provided as a function object, that
   * function will be converted to a string for injection into the target
   * window.
   *
   * Any arguments provided in addition to the script will be included as script
   * arguments and may be referenced using the `arguments` object. Arguments may
   * be a boolean, number, string, or {@linkplain WebElement}. Arrays and
   * objects may also be used as script arguments as long as each item adheres
   * to the types previously mentioned.
   *
   * The script may refer to any variables accessible from the current window.
   * Furthermore, the script will execute in the window's context, thus
   * `document` may be used to refer to the current document. Any local
   * variables will not be available once the script has finished executing,
   * though global variables will persist.
   *
   * If the script has a return value (i.e. if the script contains a return
   * statement), then the following steps will be taken for resolving this
   * functions return value:
   *
   * - For a HTML element, the value will resolve to a {@linkplain WebElement}
   * - Null and undefined return values will resolve to null</li>
   * - Booleans, numbers, and strings will resolve as is</li>
   * - Functions will resolve to their string representation</li>
   * - For arrays and objects, each member item will be converted according to
   *     the rules above
   *
   * @param script The script to execute.
   * @param args The arguments to pass to the script.
   * @return A promise that will resolve to the scripts return value.
   */
  abstract executeScript<T = unknown>(script: ScriptSource | PinnedScript, ...args: unknown[]): Promise<T>

  /**
   * Executes a snippet of asynchronous JavaScript in the context of the
   * currently selected frame or window. The script fragment will be executed as
   * the body of an anonymous function. If the script is provided as a function
   * object, that function will be converted to a string for injection into the
   * target window.
   *
   * Any arguments provided in addition to the script will be included as script
   * arguments and may be referenced using the `arguments` object. Arguments may
   * be a boolean, number, string, or {@linkplain WebElement}. Arrays and
   * objects may also be used as script arguments as long as each item adheres
   * to the types previously mentioned.
   *
   * Unlike executing synchronous JavaScript with {@link #executeScript},
   * scripts executed with this function must explicitly signal they are
   * finished by invoking the provided callback. This callback will always be
   * injected into the executed function as the last argument, and thus may be
   * referenced with  `arguments[arguments.length - 1]`. The following steps
   * will be taken for resolving this functions return value against the first
   * argument to the script's callback function:
   *
   * - For a HTML element, the value will resolve to a {@link WebElement}
   * - Null and undefined return values will resolve to null
   * - Booleans, numbers, and strings will resolve as is
   * - Functions will resolve to their string representation
   * - For arrays and objects, each member item will be converted according to
   *     the rules above
   *
   * __Example #1:__ Performing a sleep that is synchronized with the currently
   * selected window:
   *
   *     var start = new Date().getTime();
   *     driver.executeAsyncScript(
   *         'window.setTimeout(arguments[arguments.length - 1], 500);').
   *         then(function() {
   *           console.log(
   *               'Elapsed time: ' + (new Date().getTime() - start) + ' ms');
   *         });
   *
   * __Example #2:__ Synchronizing a test with an AJAX application:
   *
   *     var button = driver.findElement(By.id('compose-button'));
   *     button.click();
   *     driver.executeAsyncScript(
   *         'var callback = arguments[arguments.length - 1];' +
   *         'mailClient.getComposeWindowWidget().onload(callback);');
   *     driver.switchTo().frame('composeWidget');
   *     driver.findElement(By.id('to')).sendKeys('dog@example.com');
   *
   * __Example #3:__ Injecting a XMLHttpRequest and waiting for the result. In
   * this example, the inject script is specified with a function literal. When
   * using this format, the function is converted to a string for injection, so
   * it should not reference any symbols not defined in the scope of the page
   * under test.
   *
   *     driver.executeAsyncScript(function() {
   *       var callback = arguments[arguments.length - 1];
   *       var xhr = new XMLHttpRequest();
   *       xhr.open("GET", "/resource/data.json", true);
   *       xhr.onreadystatechange = function() {
   *         if (xhr.readyState == 4) {
   *           callback(xhr.responseText);
   *         }
   *       };
   *       xhr.send('');
   *     }).then(function(str) {
   *       console.log(JSON.parse(str)['food']);
   *     });
   *
   * @param script The script to execute.
   * @param args The arguments to pass to the script.
   * @return A promise that will resolve to the scripts return value.
   */
  abstract executeAsyncScript<T = unknown>(script: ScriptSource | PinnedScript, ...args: unknown[]): Promise<T>

  /**
   * Waits for a condition to evaluate to a "truthy" value. The condition may be
   * specified by a {@link Condition}, as a custom function, or as any
   * promise-like thenable.
   *
   * For a {@link Condition} or function, the wait will repeatedly
   * evaluate the condition until it returns a truthy value. If any errors occur
   * while evaluating the condition, they will be allowed to propagate. In the
   * event a condition returns a {@linkplain Promise}, the polling loop will
   * wait for it to be resolved and use the resolved value for whether the
   * condition has been satisfied. The resolution time for a promise is always
   * factored into whether a wait has timed out.
   *
   * If the provided condition is a {@link WebElementCondition}, then
   * the wait will return a {@link WebElementPromise} that will resolve to the
   * element that satisfied the condition.
   *
   * _Example:_ waiting up to 10 seconds for an element to be present on the
   * page.
   *
   *     async function example() {
   *       let button =
   *           await driver.wait(until.elementLocated(By.id('foo')), 10000);
   *       await button.click();
   *     }
   *
   * @param condition The condition to wait on, defined as a promise, condition
   *     object, or  a function to evaluate as a condition.
   * @param timeout The duration in milliseconds, how long to wait for the
   *     condition to be true.
   * @param message An optional message to use if the wait times out.
   * @param pollTimeout The duration in milliseconds, how long to wait between
   *     polling the condition.
   * @return A promise that will be resolved with the first truthy value
   *     returned by the condition function, or rejected if the condition times
   *     out. If the input condition is an instance of a
   *     {@link WebElementCondition}, the returned value will be a
   *     {@link WebElementPromise}.
   * @throws {TypeError} if the provided `condition` is not a valid type.
   */
  abstract wait<T>(
    condition: PromiseLike<T> | Condition<T> | ConditionFn<T>,
    timeout?: number,
    message?: WaitMessage,
    pollTimeout?: number,
  ): Promise<T>

  /**
   * Makes the driver sleep for the given amount of time.
   *
   * @param ms The amount of time, in milliseconds, to sleep.
   * @return A promise that will be resolved when the sleep has finished.
   */
  abstract sleep(ms: number): Promise<void>

  /**
   * Retrieves the current window handle.
   *
   * @return A promise that will be resolved with the current window handle.
   */
  abstract getWindowHandle(): Promise<string>

  /**
   * Retrieves a list of all available window handles.
   *
   * @return A promise that will be resolved with an array of window handles.
   */
  abstract getAllWindowHandles(): Promise<string[]>

  /**
   * Retrieves the current page's source. The returned source is a representation
   * of the underlying DOM: do not expect it to be formatted or escaped in the
   * same way as the raw response sent from the web server.
   *
   * @return A promise that will be resolved with the current page source.
   */
  abstract getPageSource(): Promise<string>

  /**
   * Closes the current window.
   *
   * @return A promise that will be resolved when this command has completed.
   */
  abstract close(): Promise<void>

  /**
   * Navigates to the given URL.
   *
   * @param url The fully qualified URL to open.
   * @return A promise that will be resolved when the document has finished
   *     loading.
   */
  abstract get(url: string): Promise<void>

  /**
   * Retrieves the URL for the current page.
   *
   * @return A promise that will be resolved with the current URL.
   */
  abstract getCurrentUrl(): Promise<string>

  /**
   * Retrieves the current page title.
   *
   * @return A promise that will be resolved with the current page's title.
   */
  abstract getTitle(): Promise<string>

  /**
   * Locates an element on the page. If the element cannot be found, a
   * {@link error.NoSuchElementError} will be returned by the driver.
   *
   * This function should not be used to test whether an element is present on
   * the page. Rather, you should use {@link #findElements}:
   *
   *     driver.findElements(By.id('foo'))
   *         .then(found => console.log('Element found? %s', !!found.length));
   *
   * The search criteria for an element may be defined using one of the
   * factories in the {@link webdriver.By} namespace, or as a short-hand
   * {@link webdriver.By.Hash} object. For example, the following two statements
   * are equivalent:
   *
   *     var e1 = driver.findElement(By.id('foo'));
   *     var e2 = driver.findElement({id:'foo'});
   *
   * You may also provide a custom locator function, which takes as input this
   * instance and returns a {@link WebElement}, or a promise that will resolve
   * to a WebElement. If the returned promise resolves to an array of
   * WebElements, WebDriver will use the first element. For example, to find the
   * first visible link on a page, you could write:
   *
   *     var link = driver.findElement(firstVisibleLink);
   *
   *     function firstVisibleLink(driver) {
   *       var links = driver.findElements(By.tagName('a'));
   *       return promise.filter(links, function(link) {
   *         return link.isDisplayed();
   *       });
   *     }
   *
   * @param locator The locator to use.
   * @return A WebElement that can be used to issue commands against the
   *     located element. If the element is not found, the element will be
   *     invalidated and all scheduled commands aborted.
   */
  abstract findElement(locator: Locator): WebElementPromise

  /**
   * Search for multiple elements on the page. Refer to the documentation on
   * {@link #findElement(by)} for information on element locator strategies.
   *
   * @param locator The locator to use.
   * @return A promise that will resolve to an array of WebElements.
   */
  abstract findElements(locator: Locator): Promise<WebElement[]>

  /**
   * Takes a screenshot of the current page. The driver makes the best effort to
   * return a screenshot of the following, in order of preference:
   *
   * 1. Entire page
   * 2. Current window
   * 3. Visible portion of the current frame
   * 4. The entire display containing the browser
   *
   * @return A promise that will be resolved to the screenshot as a base-64
   *     encoded PNG.
   */
  abstract takeScreenshot(): Promise<string>

  /**
   * @return The options interface for this instance.
   */
  abstract manage(): Options

  /**
   * @return The navigation interface for this instance.
   */
  abstract navigate(): Navigation

  /**
   * @return The target locator interface for this instance.
   */
  abstract switchTo(): TargetLocator

  /**
   * Takes a PDF of the current page. The driver makes a best effort to
   * return a PDF based on the provided parameters.
   *
   * @param options
   */
  abstract printPage(options?: PrintPageOptions): Promise<unknown>
}

/**
 * @param capabilities A capabilities object.
 * @return A copy of the parameter capabilities, omitting capability names
 *     that are not valid W3C names.
 */
function filterNonW3CCaps(capabilities: Capabilities): Capabilities {
  const newCaps = new Capabilities(capabilities)
  for (const k of newCaps.keys()) {
    // Any key containing a colon is a vendor-prefixed capability.
    if (!(W3C_CAPABILITY_NAMES.has(k) || k.indexOf(':') >= 0)) {
      newCaps.delete(k)
    }
  }
  return newCaps
}

/** A WebDriver (sub)class constructor, so static factories return the subclass type. */
export type WebDriverConstructor<T extends WebDriver> = new (
  session: Session | PromiseLike<Session>,
  executor: command.Executor,
  onQuit?: () => unknown,
) => T

/**
 * Each WebDriver instance provides automated control over a browser session.
 */
export class WebDriver extends IWebDriver {
  #script?: Script
  #network?: Network
  private session_: Promise<Session>
  private readonly executor_: command.Executor
  /** The file detector for {@link WebElement#sendKeys}; read by WebElement. */
  fileDetector_: input.FileDetector | null
  private readonly onQuit_: (() => unknown) | undefined
  private authenticatorId_: string | null
  private readonly pinnedScripts_: Record<string, PinnedScript>
  declare _cdpWsConnection?: WebSocket
  declare _cdpConnection?: cdp.CdpConnection
  declare _wsUrl?: string
  declare targetID?: string
  declare sessionId?: string
  /** Installed on the prototype below, so it stays non-enumerable. */
  declare getBidi: () => Promise<BiDi>

  /**
   * @param session Either a known session or a promise that will be resolved
   *     to a session.
   * @param executor The executor to use when sending commands to the browser.
   * @param onQuit A function to call, if any, when the session is terminated.
   */
  constructor(session: Session | PromiseLike<Session>, executor: command.Executor, onQuit?: () => unknown) {
    super()
    this.session_ = Promise.resolve(session)

    // If session is a rejected promise, add a no-op rejection handler.
    // This effectively hides setup errors until users attempt to interact
    // with the session.
    this.session_.catch(function () {})

    this.executor_ = executor
    this.fileDetector_ = null
    this.onQuit_ = onQuit
    this.authenticatorId_ = null
    this.pinnedScripts_ = {}
  }

  /**
   * The shared logger deprecation notices (e.g. {@link WebDriver#getBidi})
   * are emitted through — a class-level accessor since a deprecation can be
   * reported from a static/prototype context with no driver instance at hand.
   * @return the shared `selenium.webdriver.webdriver` logger.
   */
  static get logger(): logging.Logger {
    return logging.getLogger('selenium.webdriver.webdriver')
  }

  /**
   * Creates a new WebDriver session.
   *
   * This function will always return a WebDriver instance. If there is an error
   * creating the session, such as the aforementioned SessionNotCreatedError,
   * the driver will have a rejected {@linkplain #getSession session} promise.
   * This rejection will propagate through any subsequent commands scheduled
   * on the returned WebDriver instance.
   *
   *     let required = Capabilities.firefox();
   *     let driver = WebDriver.createSession(executor, {required});
   *
   *     // If the createSession operation failed, then this command will also
   *     // also fail, propagating the creation failure.
   *     driver.get('http://www.google.com').catch(e => console.log(e));
   *
   * @param executor The executor to create the new session with.
   * @param capabilities The desired capabilities for the new session.
   * @param onQuit A callback to invoke when the newly created session is
   *     terminated. This should be used to clean up any resources associated
   *     with the session.
   * @return The driver for the newly created session.
   */
  static createSession<T extends WebDriver>(
    this: WebDriverConstructor<T>,
    executor: command.Executor,
    capabilities: Capabilities,
    onQuit?: () => unknown,
  ): T {
    const cmd = new command.Command(command.Name.NEW_SESSION)

    // For W3C remote ends.
    cmd.setParameter('capabilities', {
      firstMatch: [{}],
      alwaysMatch: filterNonW3CCaps(capabilities),
    })

    let session = executeCommand<Session>(executor, cmd)
    if (typeof onQuit === 'function') {
      session = session.catch((err) => {
        return Promise.resolve(onQuit.call(void 0)).then(() => {
          throw err
        })
      })
    }
    return new this(session, executor, onQuit)
  }

  /** @override */
  async execute<T = unknown>(command: command.Command): Promise<T> {
    command.setParameter('sessionId', this.session_)
    const parameters = await toWireValue(command.getParameters())
    command.setParameters(isObject(parameters) ? parameters : {})
    const value = await this.executor_.execute(command)
    // T is the caller's assertion about the decoded result, as with Capabilities#get.
    return fromWireValue(this, value) as T
  }

  /** @override */
  setFileDetector(detector: input.FileDetector | null): void {
    this.fileDetector_ = detector
  }

  /** @override */
  getExecutor(): command.Executor {
    return this.executor_
  }

  /** @override */
  getSession(): Promise<Session> {
    return this.session_
  }

  /** @override */
  getCapabilities(): Promise<Capabilities> {
    return this.session_.then((s) => s.getCapabilities())
  }

  /** @override */
  quit(): Promise<unknown> {
    const result = this.execute(new command.Command(command.Name.QUIT))
    // Delete our session ID when the quit command finishes; this will allow us
    // to throw an error when attempting to use a driver post-quit.
    return promise.finally(result, () => {
      this.session_ = Promise.reject(
        new error.NoSuchSessionError(
          'This driver instance does not have a valid session ID ' +
            '(did you call WebDriver.quit()?) and may no longer be used.',
        ),
      )

      // Only want the session rejection to bubble if accessed.
      this.session_.catch(function () {})

      if (this.onQuit_) {
        return this.onQuit_.call(void 0)
      }

      // Close the websocket connection on quit
      // If the websocket connection is not closed,
      // and we are running CDP sessions against the Selenium Grid,
      // the node process never exits since the websocket connection is open until the Grid is shutdown.
      if (this._cdpWsConnection !== undefined) {
        this._cdpWsConnection.close()
      }

      // Not awaited: the session is already torn down by this point, so
      // closing our end of the socket doesn't need to gate quit() completing.
      closeBidiConnection(this)
      return undefined
    })
  }

  /** @override */
  actions(options?: { async?: boolean; bridge?: boolean }): input.Actions {
    return new input.Actions(this, options || undefined)
  }

  /** @override */
  executeScript<T = unknown>(script: ScriptSource | PinnedScript, ...args: unknown[]): Promise<T> {
    if (typeof script === 'function') {
      script = 'return (' + script + ').apply(null, arguments);'
    }

    if (script && script instanceof PinnedScript) {
      return this.execute<T>(
        new command.Command(command.Name.EXECUTE_SCRIPT)
          .setParameter('script', script.executionScript())
          .setParameter('args', args),
      )
    }

    return this.execute<T>(
      new command.Command(command.Name.EXECUTE_SCRIPT).setParameter('script', script).setParameter('args', args),
    )
  }

  /** @override */
  executeAsyncScript<T = unknown>(script: ScriptSource | PinnedScript, ...args: unknown[]): Promise<T> {
    if (typeof script === 'function') {
      script = 'return (' + script + ').apply(null, arguments);'
    }

    if (script && script instanceof PinnedScript) {
      return this.execute<T>(
        new command.Command(command.Name.EXECUTE_ASYNC_SCRIPT)
          .setParameter('script', script.executionScript())
          .setParameter('args', args),
      )
    }

    return this.execute<T>(
      new command.Command(command.Name.EXECUTE_ASYNC_SCRIPT).setParameter('script', script).setParameter('args', args),
    )
  }

  /** @override */
  wait(condition: WebElementCondition, timeout?: number, message?: WaitMessage, pollTimeout?: number): WebElementPromise
  wait<T>(
    condition: PromiseLike<T> | Condition<T> | ConditionFn<T>,
    timeout?: number,
    message?: WaitMessage,
    pollTimeout?: number,
  ): Promise<T>
  wait(
    condition: PromiseLike<unknown> | Condition<unknown> | ConditionFn<unknown>,
    timeout = 0,
    message: WaitMessage | undefined = undefined,
    pollTimeout = 200,
  ): Promise<unknown> | WebElementPromise {
    if (typeof timeout !== 'number' || timeout < 0) {
      throw TypeError('timeout must be a number >= 0: ' + timeout)
    }

    if (typeof pollTimeout !== 'number' || pollTimeout < 0) {
      throw TypeError('pollTimeout must be a number >= 0: ' + pollTimeout)
    }

    if (promise.isPromise(condition)) {
      const thenable = condition
      return new Promise((resolve, reject) => {
        if (!timeout) {
          resolve(thenable)
          return
        }

        const start = Date.now()
        let timer: NodeJS.Timeout | null = setTimeout(function () {
          timer = null
          try {
            const timeoutMessage = resolveWaitMessage(message)
            reject(
              new error.TimeoutError(
                `${timeoutMessage}Timed out waiting for promise to resolve after ${Date.now() - start}ms`,
              ),
            )
          } catch (ex) {
            reject(
              new error.TimeoutError(
                `${ex instanceof Error ? ex.message : String(ex)}\nTimed out waiting for promise to resolve after ${Date.now() - start}ms`,
              ),
            )
          }
        }, timeout)
        const clearTimer = () => timer && clearTimeout(timer)

        thenable.then(
          function (value) {
            clearTimer()
            resolve(value)
          },
          function (error) {
            clearTimer()
            reject(error)
          },
        )
      })
    }

    let fn: unknown = condition
    if (condition instanceof Condition) {
      message = message || condition.description()
      fn = condition.fn
    }

    if (!isConditionFn(fn)) {
      throw TypeError('Wait condition must be a promise-like object, function, or a ' + 'Condition object')
    }
    const evaluate = fn

    const evaluateCondition = (): Promise<unknown> => {
      return new Promise((resolve, reject) => {
        try {
          resolve(evaluate(this))
        } catch (ex) {
          reject(ex)
        }
      })
    }

    const result = new Promise<unknown>((resolve, reject) => {
      const startTime = Date.now()
      const pollCondition = async () => {
        evaluateCondition().then(function (value) {
          const elapsed = Date.now() - startTime
          if (value) {
            resolve(value)
          } else if (timeout && elapsed >= timeout) {
            try {
              const timeoutMessage = resolveWaitMessage(message)
              reject(new error.TimeoutError(`${timeoutMessage}Wait timed out after ${elapsed}ms`))
            } catch (ex) {
              reject(
                new error.TimeoutError(
                  `${ex instanceof Error ? ex.message : String(ex)}\nWait timed out after ${elapsed}ms`,
                ),
              )
            }
          } else {
            setTimeout(pollCondition, pollTimeout)
          }
        }, reject)
      }
      pollCondition()
    })

    if (condition instanceof WebElementCondition) {
      return new WebElementPromise(
        this,
        result.then(function (value) {
          if (!(value instanceof WebElement)) {
            throw TypeError(
              'WebElementCondition did not resolve to a WebElement: ' + Object.prototype.toString.call(value),
            )
          }
          return value
        }),
      )
    }
    return result
  }

  /** @override */
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /** @override */
  getWindowHandle(): Promise<string> {
    return this.execute<string>(new command.Command(command.Name.GET_CURRENT_WINDOW_HANDLE))
  }

  /** @override */
  getAllWindowHandles(): Promise<string[]> {
    return this.execute<string[]>(new command.Command(command.Name.GET_WINDOW_HANDLES))
  }

  /** @override */
  getPageSource(): Promise<string> {
    return this.execute<string>(new command.Command(command.Name.GET_PAGE_SOURCE))
  }

  /** @override */
  close(): Promise<void> {
    return this.execute<void>(new command.Command(command.Name.CLOSE))
  }

  /** @override */
  get(url: string): Promise<void> {
    return this.navigate().to(url)
  }

  /** @override */
  getCurrentUrl(): Promise<string> {
    return this.execute<string>(new command.Command(command.Name.GET_CURRENT_URL))
  }

  /** @override */
  getTitle(): Promise<string> {
    return this.execute<string>(new command.Command(command.Name.GET_TITLE))
  }

  /** @override */
  findElement(locator: Locator): WebElementPromise {
    if (locator instanceof RelativeBy) {
      const cmd = new command.Command(command.Name.FIND_ELEMENTS_RELATIVE).setParameter('args', locator.marshall())
      return new WebElementPromise(this, this.normalize_(this.execute<WebElement[]>(cmd)))
    }

    const checked = by.checkedLocator(locator)
    if (typeof checked === 'function') {
      return new WebElementPromise(this, this.findElementInternal_(checked, this))
    }
    if (checked instanceof RelativeBy) {
      const cmd = new command.Command(command.Name.FIND_ELEMENTS_RELATIVE).setParameter('args', checked.marshall())
      return new WebElementPromise(this, this.normalize_(this.execute<WebElement[]>(cmd)))
    }
    const cmd = new command.Command(command.Name.FIND_ELEMENT)
      .setParameter('using', checked.using)
      .setParameter('value', checked.value)
    return new WebElementPromise(this, this.execute<WebElement>(cmd))
  }

  /**
   * @param webElementPromise The webElement in unresolved state
   * @return First single WebElement from array of resolved promises
   */
  async normalize_(webElementPromise: Promise<WebElement[]>): Promise<WebElement> {
    const result = await webElementPromise
    if (result.length === 0) {
      throw new NoSuchElementError('Cannot locate an element with provided parameters')
    } else {
      return result[0]
    }
  }

  /**
   * @param locatorFn The locator function to use.
   * @param context The search context.
   * @return A promise that will resolve to a list of WebElements.
   */
  async findElementInternal_(locatorFn: LocatorFunction, context: SearchContext): Promise<WebElement> {
    let result = await locatorFn(context)
    if (Array.isArray(result)) {
      if (result.length === 0) {
        throw new NoSuchElementError('Cannot locate an element with provided parameters')
      }
      result = result[0]
    }
    if (!(result instanceof WebElement)) {
      throw new TypeError('Custom locator did not return a WebElement')
    }
    return result
  }

  /** @override */
  async findElements(locator: Locator): Promise<WebElement[]> {
    let cmd: command.Command
    if (locator instanceof RelativeBy) {
      cmd = new command.Command(command.Name.FIND_ELEMENTS_RELATIVE).setParameter('args', locator.marshall())
    } else {
      const checked = by.checkedLocator(locator)
      if (typeof checked === 'function') {
        return this.findElementsInternal_(checked, this)
      } else if (checked instanceof RelativeBy) {
        cmd = new command.Command(command.Name.FIND_ELEMENTS_RELATIVE).setParameter('args', checked.marshall())
      } else {
        cmd = new command.Command(command.Name.FIND_ELEMENTS)
          .setParameter('using', checked.using)
          .setParameter('value', checked.value)
      }
    }

    try {
      const res = await this.execute<unknown>(cmd)
      return Array.isArray(res) ? res : []
    } catch (ex) {
      if (ex instanceof error.NoSuchElementError) {
        return []
      }
      throw ex
    }
  }

  /**
   * @param locatorFn The locator function to use.
   * @param context The search context.
   * @return A promise that will resolve to an array of WebElements.
   */
  async findElementsInternal_(locatorFn: LocatorFunction, context: SearchContext): Promise<WebElement[]> {
    let result: unknown
    try {
      result = await locatorFn(context)
    } catch (ex) {
      if (ex instanceof NoSuchElementError) {
        return []
      }
      throw ex
    }
    if (result instanceof WebElement) {
      return [result]
    }
    if (!Array.isArray(result)) {
      return []
    }
    return result.filter(function (item): item is WebElement {
      return item instanceof WebElement
    })
  }

  /** @override */
  takeScreenshot(): Promise<string> {
    return this.execute<string>(new command.Command(command.Name.SCREENSHOT))
  }

  setDelayEnabled(enabled: boolean): Promise<unknown> {
    return this.execute(new command.Command(command.Name.SET_DELAY_ENABLED).setParameter('enabled', enabled))
  }

  resetCooldown(): Promise<unknown> {
    return this.execute(new command.Command(command.Name.RESET_COOLDOWN))
  }

  getFederalCredentialManagementDialog(): Dialog {
    return new Dialog(this)
  }

  /** @override */
  manage(): Options {
    return new Options(this)
  }

  /** @override */
  navigate(): Navigation {
    return new Navigation(this)
  }

  /** @override */
  switchTo(): TargetLocator {
    return new TargetLocator(this)
  }

  script(): Script {
    // The Script calls the LogInspector which maintains state of the callbacks.
    // Returning a new instance of the same driver will not work while removing callbacks.
    if (this.#script === undefined) {
      this.#script = new Script(this)
    }

    return this.#script
  }

  network(): Network {
    // The Network maintains state of the callbacks.
    // Returning a new instance of the same driver will not work while removing callbacks.
    if (this.#network === undefined) {
      this.#network = new Network(this)
    }
    return this.#network
  }

  validatePrintPageParams<T extends PrintPageParams>(keys: PrintPageOptions, object: T): T {
    const page: { width?: unknown; height?: unknown } = {}
    const margin: { top?: unknown; left?: unknown; bottom?: unknown; right?: unknown } = {}
    for (const [key, data] of Object.entries(keys)) {
      const obj: Record<string, () => void> = {
        orientation: function () {
          object.orientation = data
        },

        scale: function () {
          object.scale = data
        },

        background: function () {
          object.background = data
        },

        width: function () {
          page.width = data
          object.page = page
        },

        height: function () {
          page.height = data
          object.page = page
        },

        top: function () {
          margin.top = data
          object.margin = margin
        },

        left: function () {
          margin.left = data
          object.margin = margin
        },

        bottom: function () {
          margin.bottom = data
          object.margin = margin
        },

        right: function () {
          margin.right = data
          object.margin = margin
        },

        shrinkToFit: function () {
          object.shrinkToFit = data
        },

        pageRanges: function () {
          object.pageRanges = data
        },
      }

      if (!Object.prototype.hasOwnProperty.call(obj, key)) {
        throw new error.InvalidArgumentError(`Invalid Argument '${key}'`)
      } else {
        obj[key]()
      }
    }
    return object
  }

  /** @override */
  printPage(options: PrintPageOptions = {}): Promise<unknown> {
    const keys = options
    const params: PrintPageParams = {}
    const resultObj = this.validatePrintPageParams(keys, params)

    return this.execute(new command.Command(command.Name.PRINT_PAGE).setParameters({ ...resultObj }))
  }

  /**
   * Creates a new WebSocket connection.
   * @return A new CDP instance.
   */
  async createCDPConnection(target: string): Promise<cdp.CdpConnection> {
    let debuggerUrl: unknown
    const caps = await this.getCapabilities()
    if (caps['map_'].get('browserName') === 'firefox') {
      throw new Error('CDP support for Firefox is removed. Please switch to WebDriver BiDi.')
    }
    if (process.env.SELENIUM_REMOTE_URL) {
      const host = new URL(process.env.SELENIUM_REMOTE_URL).host
      const sessionId = await this.getSession().then((session) => session.getId())
      debuggerUrl = `ws://${host}/session/${sessionId}/se/cdp`
    } else {
      const seCdp = caps['map_'].get('se:cdp')
      const vendorInfo = caps['map_'].get('goog:chromeOptions') || caps['map_'].get('ms:edgeOptions') || new Map()
      debuggerUrl = seCdp || (isObject(vendorInfo) ? vendorInfo['debuggerAddress'] : undefined) || vendorInfo
    }
    if (typeof debuggerUrl !== 'string') {
      throw new error.InvalidArgumentError(`Unable to determine the debugger address from ${String(debuggerUrl)}`)
    }
    this._wsUrl = await this.getWsUrl(debuggerUrl, target, caps)
    const wsUrl = this._wsUrl
    return new Promise((resolve, reject) => {
      let ws: WebSocket
      let connection: cdp.CdpConnection
      try {
        ws = new WebSocket(wsUrl.replace('localhost', '127.0.0.1'))
        connection = new cdp.CdpConnection(ws)
        this._cdpWsConnection = ws
        this._cdpConnection = connection
      } catch (err) {
        reject(err)
        return
      }

      ws.on('open', async () => {
        await this.getCdpTargets()
      })

      ws.on('message', async (message) => {
        const params: CdpMessageJson = JSON.parse(message.toString())
        if (params.result) {
          if (params.result.targetInfos) {
            const targets = params.result.targetInfos
            const page = targets.find((info) => info.type === 'page')
            if (page) {
              this.targetID = page.targetId
              connection.execute('Target.attachToTarget', { targetId: this.targetID, flatten: true }, undefined)
            } else {
              reject('Unable to find Page target.')
            }
          }
          if (params.result.sessionId) {
            this.sessionId = params.result.sessionId
            connection.sessionId = this.sessionId
            resolve(connection)
          }
        }
      })

      ws.on('error', (error) => {
        reject(error)
      })
    })
  }

  async getCdpTargets(): Promise<void> {
    this._cdpConnection?.execute('Target.getTargets')
  }

  /**
   * Retrieves 'webSocketDebuggerUrl' by sending a http request using debugger address
   * @param debuggerAddress
   * @param target
   * @param caps
   * @return Returns parsed webSocketDebuggerUrl obtained from the http request
   */
  async getWsUrl(debuggerAddress: string, target: string, caps: Capabilities): Promise<string> {
    if (target && cdpTargets.indexOf(target.toLowerCase()) === -1) {
      throw new error.InvalidArgumentError('invalid target value')
    }

    if (debuggerAddress.match(/\/se\/cdp/)) {
      return debuggerAddress
    }

    let path
    if (target === 'page' && caps['map_'].get('browserName') !== 'firefox') {
      path = '/json'
    } else if (target === 'page' && caps['map_'].get('browserName') === 'firefox') {
      path = '/json/list'
    } else {
      path = '/json/version'
    }

    const request = new http.Request('GET', path)
    const client = new http.HttpClient('http://' + debuggerAddress)
    const response = await client.send(request)

    if (target.toLowerCase() === 'page') {
      const pages: { webSocketDebuggerUrl: string }[] = JSON.parse(response.body)
      return pages[0]['webSocketDebuggerUrl']
    } else {
      const version: { webSocketDebuggerUrl: string } = JSON.parse(response.body)
      return version['webSocketDebuggerUrl']
    }
  }

  /** The debugger socket opened by {@link createCDPConnection}. */
  private cdpSocket_(): WebSocket {
    if (this._cdpWsConnection === undefined) {
      throw new Error('No CDP connection; call createCDPConnection() first')
    }
    return this._cdpWsConnection
  }

  /**
   * Sets a listener for Fetch.authRequired event from CDP
   * If event is triggered, it enters username and password
   * and allows the test to move forward
   * @param username
   * @param password
   * @param connection CDP Connection
   */
  async register(username: string, password: string, connection: cdp.CdpConnection): Promise<void> {
    this.cdpSocket_().on('message', (message) => {
      const params: CdpMessageJson = JSON.parse(message.toString())

      if (params.method === 'Fetch.authRequired') {
        const requestParams = params['params']
        connection.execute('Fetch.continueWithAuth', {
          requestId: requestParams?.['requestId'],
          authChallengeResponse: {
            response: 'ProvideCredentials',
            username: username,
            password: password,
          },
        })
      } else if (params.method === 'Fetch.requestPaused') {
        const requestPausedParams = params['params']
        connection.execute('Fetch.continueRequest', {
          requestId: requestPausedParams?.['requestId'],
        })
      }
    })

    await connection.send('Fetch.enable', {
      handleAuthRequests: true,
    })
    await connection.send('Network.setCacheDisabled', {
      cacheDisabled: true,
    })
  }

  /**
   * Handle Network interception requests
   * @param connection WebSocket connection to the browser
   * @param httpResponse Object representing what we are intercepting
   *                     as well as what should be returned.
   * @param callback callback called when we intercept requests.
   */
  async onIntercept(connection: cdp.CdpConnection, httpResponse: HttpResponse, callback: () => void): Promise<void> {
    this.cdpSocket_().on('message', (message) => {
      const params: CdpMessageJson = JSON.parse(message.toString())

      if (params.method === 'Fetch.requestPaused') {
        const requestPausedParams = params['params']
        if (requestPausedParams?.request?.url == httpResponse.urlToIntercept) {
          connection.execute('Fetch.fulfillRequest', {
            requestId: requestPausedParams['requestId'],
            responseCode: httpResponse.status,
            responseHeaders: httpResponse.headers,
            body: httpResponse.body,
          })
          callback()
        } else {
          connection.execute('Fetch.continueRequest', {
            requestId: requestPausedParams?.['requestId'],
          })
        }
      }
    })

    await connection.execute('Fetch.enable', {}, undefined)
    await connection.execute(
      'Network.setCacheDisabled',
      {
        cacheDisabled: true,
      },
      undefined,
    )
  }

  /**
   * @param connection
   * @param callback
   */
  async onLogEvent(
    connection: cdp.CdpConnection,
    callback: (event: CdpConsoleEvent | CdpLogEvent) => void,
  ): Promise<void> {
    this.cdpSocket_().on('message', (message) => {
      const params: CdpMessageJson = JSON.parse(message.toString())

      if (params.method === 'Runtime.consoleAPICalled') {
        const consoleEventParams = params['params']
        const event: CdpConsoleEvent = {
          type: consoleEventParams?.['type'],
          timestamp: new Date(consoleEventParams?.['timestamp'] ?? NaN),
          args: consoleEventParams?.['args'],
        }

        callback(event)
      }

      if (params.method === 'Log.entryAdded') {
        const logEventParams = params['params']
        const logEntry = logEventParams?.['entry']
        const event: CdpLogEvent = {
          level: logEntry?.['level'],
          timestamp: new Date(logEntry?.['timestamp'] ?? NaN),
          message: logEntry?.['text'],
        }

        callback(event)
      }
    })
    await connection.execute('Runtime.enable', {}, undefined)
  }

  /**
   * @param connection
   * @param callback
   */
  async onLogException(connection: cdp.CdpConnection, callback: (event: CdpExceptionEvent) => void): Promise<void> {
    await connection.execute('Runtime.enable', {}, undefined)

    this.cdpSocket_().on('message', (message) => {
      const params: CdpMessageJson = JSON.parse(message.toString())

      if (params.method === 'Runtime.exceptionThrown') {
        const exceptionEventParams = params['params']
        const event: CdpExceptionEvent = {
          exceptionDetails: exceptionEventParams?.['exceptionDetails'],
          timestamp: new Date(exceptionEventParams?.['timestamp'] ?? NaN),
        }

        callback(event)
      }
    })
  }

  /**
   * @param connection
   * @param callback
   */
  async logMutationEvents(connection: cdp.CdpConnection, callback: (event: DomMutationEvent) => void): Promise<void> {
    await connection.execute('Runtime.enable', {}, undefined)
    await connection.execute('Page.enable', {}, undefined)

    await connection.execute(
      'Runtime.addBinding',
      {
        name: '__webdriver_attribute',
      },
      undefined,
    )

    let mutationListener
    try {
      // Depending on what is running the code it could appear in 2 different places which is why we try
      // here and then the other location
      mutationListener = fs
        .readFileSync('./javascript/selenium-webdriver/lib/atoms/mutation-listener.js', 'utf-8')
        .toString()
    } catch {
      mutationListener = fs.readFileSync(path.resolve(__dirname, './atoms/mutation-listener.js'), 'utf-8').toString()
    }

    this.executeScript(mutationListener)

    await connection.execute(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: mutationListener,
      },
      undefined,
    )

    this.cdpSocket_().on('message', async (message) => {
      const params: CdpMessageJson = JSON.parse(message.toString())
      if (params.method === 'Runtime.bindingCalled') {
        const payload: { target: string; name: unknown; value: unknown; oldValue: unknown } = JSON.parse(
          params['params']?.['payload'] ?? '',
        )
        const elements = await this.findElements({
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
      }
    })
  }

  async pinScript(script: string): Promise<PinnedScript> {
    const pinnedScript = new PinnedScript(script)
    let connection
    if (this._cdpConnection === undefined) {
      connection = await this.createCDPConnection('page')
    } else {
      connection = this._cdpConnection
    }
    await connection.send('Page.enable', {})
    await connection.send('Runtime.evaluate', {
      expression: pinnedScript.creationScript(),
    })
    const result = await connection.send('Page.addScriptToEvaluateOnNewDocument', {
      source: pinnedScript.creationScript(),
    })
    const identifier = isObject(result.result) ? result.result['identifier'] : undefined
    pinnedScript.scriptId = typeof identifier === 'string' ? identifier : undefined
    this.pinnedScripts_[pinnedScript.handle] = pinnedScript
    return pinnedScript
  }

  async unpinScript(script: PinnedScript): Promise<void> {
    if (script && !(script instanceof PinnedScript)) {
      throw Error(`Pass valid PinnedScript object. Received: ${script}`)
    }
    if (script.handle in this.pinnedScripts_) {
      let connection
      if (this._cdpConnection === undefined) {
        connection = await this.createCDPConnection('page')
      } else {
        connection = this._cdpConnection
      }
      await connection.send('Page.enable', {})
      await connection.send('Runtime.evaluate', {
        expression: script.removalScript(),
      })
      await connection.send('Page.removeScriptToEvaluateOnLoad', {
        identifier: script.scriptId,
      })
      delete this.pinnedScripts_[script.handle]
    }
  }

  /**
   * @returns The value of authenticator ID added
   */
  virtualAuthenticatorId(): string | null {
    return this.authenticatorId_
  }

  /**
   * Adds a virtual authenticator with the given options.
   * @param options VirtualAuthenticatorOptions object to set authenticator options.
   */
  async addVirtualAuthenticator(options: VirtualAuthenticatorOptions): Promise<void> {
    this.authenticatorId_ = await this.execute<string>(
      new command.Command(command.Name.ADD_VIRTUAL_AUTHENTICATOR).setParameters({ ...options.toDict() }),
    )
  }

  /**
   * Removes a previously added virtual authenticator. The authenticator is no
   * longer valid after removal, so no methods may be called.
   */
  async removeVirtualAuthenticator(): Promise<void> {
    await this.execute(
      new command.Command(command.Name.REMOVE_VIRTUAL_AUTHENTICATOR).setParameter(
        'authenticatorId',
        this.authenticatorId_,
      ),
    )
    this.authenticatorId_ = null
  }

  /**
   * Injects a credential into the authenticator.
   * @param credential Credential to be added
   */
  async addCredential(credential: Credential): Promise<void> {
    const parameters: Record<string, unknown> = { ...credential.toDict(), authenticatorId: this.authenticatorId_ }
    await this.execute(new command.Command(command.Name.ADD_CREDENTIAL).setParameters(parameters))
  }

  /**
   * @returns The list of credentials owned by the authenticator.
   */
  async getCredentials(): Promise<Credential[]> {
    const credential_data = await this.execute<CredentialDict[]>(
      new command.Command(command.Name.GET_CREDENTIALS).setParameter('authenticatorId', this.virtualAuthenticatorId()),
    )
    const credential_list: Credential[] = []
    for (let i = 0; i < credential_data.length; i++) {
      credential_list.push(new Credential().fromDict(credential_data[i]))
    }
    return credential_list
  }

  /**
   * Removes a credential from the authenticator.
   * @param credential_id The ID of the credential to be removed.
   */
  async removeCredential(credential_id: string | ArrayLike<number>): Promise<void> {
    // If credential_id is not a base64url, then convert it to base64url.
    if (Array.isArray(credential_id)) {
      credential_id = Buffer.from(credential_id).toString('base64url')
    }

    await this.execute(
      new command.Command(command.Name.REMOVE_CREDENTIAL)
        .setParameter('credentialId', credential_id)
        .setParameter('authenticatorId', this.authenticatorId_),
    )
  }

  /**
   * Removes all the credentials from the authenticator.
   */
  async removeAllCredentials(): Promise<void> {
    await this.execute(
      new command.Command(command.Name.REMOVE_ALL_CREDENTIALS).setParameter('authenticatorId', this.authenticatorId_),
    )
  }

  /**
   * Sets whether the authenticator will simulate success or fail on user verification.
   * @param verified true if the authenticator will pass user verification, false otherwise.
   */
  async setUserVerified(verified: boolean): Promise<void> {
    await this.execute(
      new command.Command(command.Name.SET_USER_VERIFIED)
        .setParameter('authenticatorId', this.authenticatorId_)
        .setParameter('isUserVerified', verified),
    )
  }

  async getDownloadableFiles(): Promise<string[]> {
    const caps = await this.getCapabilities()
    if (!caps['map_'].get('se:downloadsEnabled')) {
      throw new error.WebDriverError('Downloads must be enabled in options')
    }

    return (await this.execute<{ names: string[] }>(new command.Command(command.Name.GET_DOWNLOADABLE_FILES))).names
  }

  async downloadFile(fileName: string, targetDirectory: string): Promise<void> {
    const caps = await this.getCapabilities()
    if (!caps['map_'].get('se:downloadsEnabled')) {
      throw new Error('Downloads must be enabled in options')
    }

    const response = await this.execute<{ contents: string }>(
      new command.Command(command.Name.DOWNLOAD_FILE).setParameter('name', fileName),
    )

    const base64Content = response.contents

    if (!targetDirectory.endsWith('/')) {
      targetDirectory += '/'
    }

    fs.mkdirSync(targetDirectory, { recursive: true })
    const zipFilePath = path.join(targetDirectory, `${fileName}.zip`)
    fs.writeFileSync(zipFilePath, Buffer.from(base64Content, 'base64'))

    const zipData = fs.readFileSync(zipFilePath)
    await JSZip.loadAsync(zipData)
      .then((zip) => {
        // Iterate through each file in the zip archive
        Object.keys(zip.files).forEach(async (fileName) => {
          const fileData = await zip.files[fileName].async('nodebuffer')
          fs.writeFileSync(`${targetDirectory}/${fileName}`, fileData)
          console.log(`File extracted: ${fileName}`)
        })
      })
      .catch((error) => {
        console.error('Error unzipping file:', error)
      })
  }

  async deleteDownloadableFiles(): Promise<unknown> {
    const caps = await this.getCapabilities()
    if (!caps['map_'].get('se:downloadsEnabled')) {
      throw new error.WebDriverError('Downloads must be enabled in options')
    }

    return await this.execute(new command.Command(command.Name.DELETE_DOWNLOADABLE_FILES))
  }

  /**
   * Fires a custom session event to the remote server event bus.
   * This allows test code to trigger server-side utilities that subscribe to the event bus.
   *
   * @param eventType The type of event (e.g., "test:failed", "log:collect").
   * @param payload Optional data to include with the event.
   * @return A promise that resolves to the response containing
   *     success status, event type, and timestamp.
   *
   * @example
   * // Fire a simple event
   * await driver.fireSessionEvent('test:started');
   *
   * @example
   * // Fire an event with payload
   * await driver.fireSessionEvent('test:failed', {
   *   testName: 'LoginTest',
   *   error: 'Element not found'
   * });
   */
  async fireSessionEvent(eventType: string, payload: object | null = null): Promise<unknown> {
    if (!eventType || typeof eventType !== 'string') {
      throw new error.InvalidArgumentError('eventType must be a non-empty string')
    }

    const cmd = new command.Command(command.Name.FIRE_SESSION_EVENT).setParameter('eventType', eventType)

    if (payload) {
      cmd.setParameter('payload', payload)
    }

    return await this.execute(cmd)
  }
}

/**
 * Returns the WebDriver BiDi connection for this session.
 * @deprecated BiDi is an internal implementation detail — this accessor hands
 * back the raw transport directly, which is no longer supported public API.
 * Use a composed BiDi module instead, e.g. `Network.create(driver)` or
 * `require('selenium-webdriver/bidi/network')`.
 * @function
 * @name WebDriver#getBidi
 * @returns A promise resolving to this session's raw BiDi connection, opened
 *     on first access and reused afterward.
 */
// Object.defineProperty, not `WebDriver.prototype.getBidi = function () {...}`:
// a plain assignment creates an enumerable property, but a method declared in
// the class body (like every other method here) is non-enumerable — so BiDi
// would become more discoverable off the driver than it was before.
Object.defineProperty(WebDriver.prototype, 'getBidi', {
  value: function (this: WebDriver): Promise<BiDi> {
    WebDriver.logger.deprecate(
      'webdriver-getBidi',
      'WebDriver#getBidi() is deprecated. Use a composed BiDi module instead, e.g. Network.create(driver) or ' +
        "require('selenium-webdriver/bidi/network').",
    )
    return getBidiConnection(this)
  },
  writable: true,
  enumerable: false,
  configurable: true,
})

/**
 * Interface for navigating back and forth in the browser history.
 *
 * This class should never be instantiated directly. Instead, obtain an instance
 * with
 *
 *    webdriver.navigate()
 *
 * @see WebDriver#navigate()
 */
export class Navigation {
  private readonly driver_: WebDriver

  /**
   * @param driver The parent driver.
   */
  constructor(driver: WebDriver) {
    this.driver_ = driver
  }

  /**
   * Navigates to a new URL.
   *
   * @param url The URL to navigate to.
   * @return A promise that will be resolved when the URL has been loaded.
   */
  to(url: string): Promise<void> {
    return this.driver_.execute<void>(new command.Command(command.Name.GET).setParameter('url', url))
  }

  /**
   * Moves backwards in the browser history.
   *
   * @return A promise that will be resolved when the navigation event has
   *     completed.
   */
  back(): Promise<void> {
    return this.driver_.execute<void>(new command.Command(command.Name.GO_BACK))
  }

  /**
   * Moves forwards in the browser history.
   *
   * @return A promise that will be resolved when the navigation event has
   *     completed.
   */
  forward(): Promise<void> {
    return this.driver_.execute<void>(new command.Command(command.Name.GO_FORWARD))
  }

  /**
   * Refreshes the current page.
   *
   * @return A promise that will be resolved when the navigation event has
   *     completed.
   */
  refresh(): Promise<void> {
    return this.driver_.execute<void>(new command.Command(command.Name.REFRESH))
  }
}

/** Session timeout durations, in milliseconds; `null` makes a timeout indefinite. */
export interface TimeoutsConfig {
  script?: number | null
  pageLoad?: number | null
  implicit?: number | null
}

/**
 * Provides methods for managing browser and driver state.
 *
 * This class should never be instantiated directly. Instead, obtain an instance
 * with {@linkplain WebDriver#manage() webdriver.manage()}.
 */
export class Options {
  private readonly driver_: WebDriver

  /** Runtime placeholder for the cookie record; the shape is the {@link Cookie} interface. */
  static Cookie = function (): void {}

  /**
   * @param driver The parent driver.
   */
  constructor(driver: WebDriver) {
    this.driver_ = driver
  }

  /**
   * Adds a cookie.
   *
   * __Sample Usage:__
   *
   *     // Set a basic cookie.
   *     driver.manage().addCookie({name: 'foo', value: 'bar'});
   *
   *     // Set a cookie that expires in 10 minutes.
   *     let expiry = new Date(Date.now() + (10 * 60 * 1000));
   *     driver.manage().addCookie({name: 'foo', value: 'bar', expiry});
   *
   *     // The cookie expiration may also be specified in seconds since epoch.
   *     driver.manage().addCookie({
   *       name: 'foo',
   *       value: 'bar',
   *       expiry: Math.floor(Date.now() / 1000)
   *     });
   *
   * @param spec Defines the cookie to add.
   * @return A promise that will be resolved when the cookie has been added to
   *     the page.
   * @throws {error.InvalidArgumentError} if any of the cookie parameters are
   *     invalid.
   * @throws {TypeError} if `spec` is not a cookie object.
   */
  addCookie({ name, value, path, domain, secure, httpOnly, expiry, sameSite }: Cookie): Promise<void> {
    // We do not allow '=' or ';' in the name.
    if (/[;=]/.test(name)) {
      throw new error.InvalidArgumentError('Invalid cookie name "' + name + '"')
    }

    // We do not allow ';' in value.
    if (/;/.test(value)) {
      throw new error.InvalidArgumentError('Invalid cookie value "' + value + '"')
    }

    let expirySeconds: number | undefined
    if (typeof expiry === 'number') {
      expirySeconds = Math.floor(expiry)
    } else if (expiry instanceof Date) {
      const date = expiry
      expirySeconds = Math.floor(date.getTime() / 1000)
    }

    if (sameSite && !['Strict', 'Lax', 'None'].includes(sameSite)) {
      throw new error.InvalidArgumentError(
        `Invalid sameSite cookie value '${sameSite}'. It should be one of "Lax", "Strict" or "None"`,
      )
    }

    if (sameSite === 'None' && !secure) {
      throw new error.InvalidArgumentError('Invalid cookie configuration: SameSite=None must be Secure')
    }

    return this.driver_.execute<void>(
      new command.Command(command.Name.ADD_COOKIE).setParameter('cookie', {
        name: name,
        value: value,
        path: path,
        domain: domain,
        secure: !!secure,
        httpOnly: !!httpOnly,
        expiry: expirySeconds,
        sameSite: sameSite,
      }),
    )
  }

  /**
   * Deletes all cookies visible to the current page.
   *
   * @return A promise that will be resolved when all cookies have been deleted.
   */
  deleteAllCookies(): Promise<void> {
    return this.driver_.execute<void>(new command.Command(command.Name.DELETE_ALL_COOKIES))
  }

  /**
   * Deletes the cookie with the given name. This command is a no-op if there is
   * no cookie with the given name visible to the current page.
   *
   * @param name The name of the cookie to delete.
   * @return A promise that will be resolved when the cookie has been deleted.
   */
  deleteCookie(name: string): Promise<void> {
    // Validate the cookie name is non-empty and properly trimmed.
    if (!name?.trim()) {
      throw new error.InvalidArgumentError('Cookie name cannot be empty')
    }
    return this.driver_.execute<void>(new command.Command(command.Name.DELETE_COOKIE).setParameter('name', name))
  }

  /**
   * Retrieves all cookies visible to the current page. Each cookie will be
   * returned as a JSON object as described by the WebDriver wire protocol.
   *
   * @return A promise that will be resolved with the cookies visible to the
   *     current browsing context.
   */
  getCookies(): Promise<Cookie[]> {
    return this.driver_.execute<Cookie[]>(new command.Command(command.Name.GET_ALL_COOKIES))
  }

  /**
   * Retrieves the cookie with the given name. Returns null if there is no such
   * cookie. The cookie will be returned as a JSON object as described by the
   * WebDriver wire protocol.
   *
   * @param name The name of the cookie to retrieve.
   * @throws {InvalidArgumentError} - If the cookie name is empty or invalid.
   * @return A promise that will be resolved with the named cookie
   * @throws {error.NoSuchCookieError} if there is no such cookie.
   */
  async getCookie(name: string): Promise<Cookie | null> {
    // Validate the cookie name is non-empty and properly trimmed.
    if (!name?.trim()) {
      throw new error.InvalidArgumentError('Cookie name cannot be empty')
    }

    try {
      const cookie = await this.driver_.execute<Cookie>(
        new command.Command(command.Name.GET_COOKIE).setParameter('name', name),
      )
      return cookie
    } catch (err) {
      if (!(err instanceof error.UnknownCommandError) && !(err instanceof error.UnsupportedOperationError)) {
        throw err
      }

      return null
    }
  }

  /**
   * Fetches the timeouts currently configured for the current session.
   *
   * @return A promise that will be resolved with the timeouts currently
   *     configured for the current session.
   * @see #setTimeouts()
   */
  getTimeouts(): Promise<Timeouts> {
    return this.driver_.execute<Timeouts>(new command.Command(command.Name.GET_TIMEOUT))
  }

  /**
   * Sets the timeout durations associated with the current session.
   *
   * The following timeouts are supported (all timeouts are specified in
   * milliseconds):
   *
   * -  `implicit` specifies the maximum amount of time to wait for an element
   *    locator to succeed when {@linkplain WebDriver#findElement locating}
   *    {@linkplain WebDriver#findElements elements} on the page.
   *    Defaults to 0 milliseconds.
   *
   * -  `pageLoad` specifies the maximum amount of time to wait for a page to
   *    finishing loading. Defaults to 300000 milliseconds.
   *
   * -  `script` specifies the maximum amount of time to wait for an
   *    {@linkplain WebDriver#executeScript evaluated script} to run. If set to
   *    `null`, the script timeout will be indefinite.
   *    Defaults to 30000 milliseconds.
   *
   * @param conf The desired timeout configuration.
   * @return A promise that will be resolved when the timeouts have been set.
   * @throws {!TypeError} if an invalid options object is provided.
   * @see #getTimeouts()
   * @see <https://w3c.github.io/webdriver/webdriver-spec.html#dfn-set-timeouts>
   */
  setTimeouts({ script, pageLoad, implicit }: TimeoutsConfig = {}): Promise<unknown> {
    const cmd = new command.Command(command.Name.SET_TIMEOUT)

    let valid = false
    function setParam(key: string, value: number | null | undefined) {
      if (value === null || typeof value === 'number') {
        valid = true
        cmd.setParameter(key, value)
      } else if (typeof value !== 'undefined') {
        throw TypeError('invalid timeouts configuration:' + ` expected "${key}" to be a number, got ${typeof value}`)
      }
    }
    setParam('implicit', implicit)
    setParam('pageLoad', pageLoad)
    setParam('script', script)

    if (valid) {
      return this.driver_.execute(cmd).catch(() => {
        // Fallback to the legacy method.
        const cmds: Promise<void>[] = []
        if (typeof script === 'number') {
          cmds.push(legacyTimeout(this.driver_, 'script', script))
        }
        if (typeof implicit === 'number') {
          cmds.push(legacyTimeout(this.driver_, 'implicit', implicit))
        }
        if (typeof pageLoad === 'number') {
          cmds.push(legacyTimeout(this.driver_, 'page load', pageLoad))
        }
        return Promise.all(cmds)
      })
    }
    throw TypeError('no timeouts specified')
  }

  /**
   * @return The interface for managing driver logs.
   */
  logs(): Logs {
    return new Logs(this.driver_)
  }

  /**
   * @return The interface for managing the current window.
   */
  window(): Window {
    return new Window(this.driver_)
  }
}

/**
 * @param driver
 * @param type
 * @param ms
 */
function legacyTimeout(driver: WebDriver, type: string, ms: number): Promise<void> {
  return driver.execute<void>(
    new command.Command(command.Name.SET_TIMEOUT).setParameter('type', type).setParameter('ms', ms),
  )
}

/**
 * An interface for managing the current window.
 *
 * This class should never be instantiated directly. Instead, obtain an instance
 * with
 *
 *    webdriver.manage().window()
 *
 * @see WebDriver#manage()
 * @see Options#window()
 */
export class Window {
  private readonly driver_: WebDriver
  private readonly log_: logging.Logger

  /**
   * @param driver The parent driver.
   */
  constructor(driver: WebDriver) {
    this.driver_ = driver
    this.log_ = logging.getLogger(logging.Type.DRIVER)
  }

  /**
   * Retrieves a rect describing the current top-level window's size and
   * position.
   *
   * @return A promise that will resolve to the window rect of the current
   *     window.
   */
  getRect(): Promise<Rect> {
    return this.driver_.execute<Rect>(new command.Command(command.Name.GET_WINDOW_RECT))
  }

  /**
   * Sets the current top-level window's size and position. You may update just
   * the size by omitting `x` & `y`, or just the position by omitting
   * `width` & `height` options.
   *
   * @param options The desired window size and position.
   * @return A promise that will resolve to the current window's updated window
   *     rect.
   */
  setRect({ x, y, width, height }: Partial<Rect>): Promise<Rect> {
    return this.driver_.execute<Rect>(
      new command.Command(command.Name.SET_WINDOW_RECT).setParameters({
        x,
        y,
        width,
        height,
      }),
    )
  }

  /**
   * Maximizes the current window. The exact behavior of this command is
   * specific to individual window managers, but typically involves increasing
   * the window to the maximum available size without going full-screen.
   *
   * @return A promise that will be resolved when the command has completed.
   */
  maximize(): Promise<void> {
    return this.driver_.execute<void>(
      new command.Command(command.Name.MAXIMIZE_WINDOW).setParameter('windowHandle', 'current'),
    )
  }

  /**
   * Minimizes the current window. The exact behavior of this command is
   * specific to individual window managers, but typically involves hiding
   * the window in the system tray.
   *
   * @return A promise that will be resolved when the command has completed.
   */
  minimize(): Promise<void> {
    return this.driver_.execute<void>(new command.Command(command.Name.MINIMIZE_WINDOW))
  }

  /**
   * Invokes the "full screen" operation on the current window. The exact
   * behavior of this command is specific to individual window managers, but
   * this will typically increase the window size to the size of the physical
   * display and hide the browser chrome.
   *
   * @return A promise that will be resolved when the command has completed.
   * @see <https://fullscreen.spec.whatwg.org/#fullscreen-an-element>
   */
  fullscreen(): Promise<void> {
    return this.driver_.execute<void>(new command.Command(command.Name.FULLSCREEN_WINDOW))
  }

  /**
   * Gets the width and height of the current window
   * @param windowHandle
   */
  async getSize(windowHandle = 'current'): Promise<{ width: number; height: number }> {
    if (windowHandle !== 'current') {
      this.log_.warning(`Only 'current' window is supported for W3C compatible browsers.`)
    }

    const rect = await this.getRect()
    return { height: rect.height, width: rect.width }
  }

  /**
   * Sets the width and height of the current window. (window.resizeTo)
   * @param x
   * @param y
   * @param width
   * @param height
   * @param windowHandle
   */
  async setSize({ x = 0, y = 0, width = 0, height = 0 }: Partial<Rect>, windowHandle = 'current'): Promise<void> {
    if (windowHandle !== 'current') {
      this.log_.warning(`Only 'current' window is supported for W3C compatible browsers.`)
    }

    await this.setRect({ x, y, width, height })
  }
}

/**
 * Interface for managing WebDriver log records.
 *
 * This class should never be instantiated directly. Instead, obtain an
 * instance with
 *
 *     webdriver.manage().logs()
 *
 * @see WebDriver#manage()
 * @see Options#logs()
 */
export class Logs {
  private readonly driver_: WebDriver

  /**
   * @param driver The parent driver.
   */
  constructor(driver: WebDriver) {
    this.driver_ = driver
  }

  /**
   * Fetches available log entries for the given type.
   *
   * Note that log buffers are reset after each call, meaning that available
   * log entries correspond to those entries not yet returned for a given log
   * type. In practice, this means that this call will return the available log
   * entries since the last call, or from the start of the session.
   *
   * @param type The desired log type.
   * @return A promise that will resolve to a list of log entries for the
   *     specified type.
   */
  get(type: string): Promise<logging.Entry[]> {
    const cmd = new command.Command(command.Name.GET_LOG).setParameter('type', type)
    return this.driver_.execute<(logging.Entry | LogEntryJson)[]>(cmd).then(function (entries) {
      return entries.map(function (entry) {
        if (!(entry instanceof logging.Entry)) {
          return new logging.Entry(entry['level'], entry['message'], entry['timestamp'], entry['type'])
        }
        return entry
      })
    })
  }

  /**
   * Retrieves the log types available to this driver.
   *
   * @return A promise that will resolve to a list of available log types.
   */
  getAvailableLogTypes(): Promise<string[]> {
    return this.driver_.execute<string[]>(new command.Command(command.Name.GET_AVAILABLE_LOG_TYPES))
  }
}

/**
 * An interface for changing the focus of the driver to another frame or window.
 *
 * This class should never be instantiated directly. Instead, obtain an
 * instance with
 *
 *     webdriver.switchTo()
 *
 * @see WebDriver#switchTo()
 */
export class TargetLocator {
  private readonly driver_: WebDriver

  /**
   * @param driver The parent driver.
   */
  constructor(driver: WebDriver) {
    this.driver_ = driver
  }

  /**
   * Locates the DOM element on the current page that corresponds to
   * `document.activeElement` or `document.body` if the active element is not
   * available.
   *
   * @return The active element.
   */
  activeElement(): WebElementPromise {
    const id = this.driver_.execute<WebElement>(new command.Command(command.Name.GET_ACTIVE_ELEMENT))
    return new WebElementPromise(this.driver_, id)
  }

  /**
   * Switches focus of all future commands to the topmost frame in the current
   * window.
   *
   * @return A promise that will be resolved when the driver has changed focus
   *     to the default content.
   */
  defaultContent(): Promise<void> {
    return this.driver_.execute<void>(new command.Command(command.Name.SWITCH_TO_FRAME).setParameter('id', null))
  }

  /**
   * Changes the focus of all future commands to another frame on the page. The
   * target frame may be specified as one of the following:
   *
   * - A number that specifies a (zero-based) index into [window.frames](
   *   https://developer.mozilla.org/en-US/docs/Web/API/Window.frames).
   * - A {@link WebElement} reference, which correspond to a `frame` or `iframe`
   *   DOM element.
   * - The `null` value, to select the topmost frame on the page. Passing `null`
   *   is the same as calling {@link #defaultContent defaultContent()}.
   *
   * If the specified frame can not be found, the returned promise will be
   * rejected with a {@linkplain error.NoSuchFrameError}.
   *
   * @param id The frame locator.
   * @return A promise that will be resolved when the driver has changed focus
   *     to the specified frame.
   */
  frame(id: number | string | WebElement | null): Promise<void> {
    let frameReference: number | string | WebElement | null | Promise<WebElement> = id
    if (typeof id === 'string') {
      frameReference = this.driver_.findElement({ id }).catch(() => this.driver_.findElement({ name: id }))
    }

    return this.driver_.execute<void>(
      new command.Command(command.Name.SWITCH_TO_FRAME).setParameter('id', frameReference),
    )
  }

  /**
   * Changes the focus of all future commands to the parent frame of the
   * currently selected frame. This command has no effect if the driver is
   * already focused on the top-level browsing context.
   *
   * @return A promise that will be resolved when the command has completed.
   */
  parentFrame(): Promise<void> {
    return this.driver_.execute<void>(new command.Command(command.Name.SWITCH_TO_FRAME_PARENT))
  }

  /**
   * Changes the focus of all future commands to another window. Windows may be
   * specified by their {@code window.name} attribute or by its handle
   * (as returned by {@link WebDriver#getWindowHandles}).
   *
   * If the specified window cannot be found, the returned promise will be
   * rejected with a {@linkplain error.NoSuchWindowError}.
   *
   * @param nameOrHandle The name or window handle of the window to switch
   *     focus to.
   * @return A promise that will be resolved when the driver has changed focus
   *     to the specified window.
   */
  window(nameOrHandle: string): Promise<void> {
    return this.driver_.execute<void>(
      new command.Command(command.Name.SWITCH_TO_WINDOW)
        // "name" supports the legacy drivers. "handle" is the W3C
        // compliant parameter.
        .setParameter('name', nameOrHandle)
        .setParameter('handle', nameOrHandle),
    )
  }

  /**
   * Creates a new browser window and switches the focus for future
   * commands of this driver to the new window.
   *
   * @param typeHint 'window' or 'tab'. The created window is not guaranteed to
   *     be of the requested type; if the driver does not support the requested
   *     type, a new browser window will be created of whatever type the driver
   *     does support.
   * @return A promise that will be resolved when the driver has changed focus
   *     to the new window.
   */
  newWindow(typeHint: string): Promise<void> {
    const driver = this.driver_
    return this.driver_
      .execute<{ handle: string }>(
        new command.Command(command.Name.SWITCH_TO_NEW_WINDOW).setParameter('type', typeHint),
      )
      .then(function (response) {
        return driver.switchTo().window(response.handle)
      })
  }

  /**
   * Changes focus to the active modal dialog, such as those opened by
   * `window.alert()`, `window.confirm()`, and `window.prompt()`. The returned
   * promise will be rejected with a
   * {@linkplain error.NoSuchAlertError} if there are no open alerts.
   *
   * @return The open alert.
   */
  alert(): AlertPromise {
    const text = this.driver_.execute<string>(new command.Command(command.Name.GET_ALERT_TEXT))
    const driver = this.driver_
    return new AlertPromise(
      driver,
      text.then(function (text) {
        return new Alert(driver, text)
      }),
    )
  }
}

//////////////////////////////////////////////////////////////////////////////
//
//  WebElement
//
//////////////////////////////////////////////////////////////////////////////

const LEGACY_ELEMENT_ID_KEY = 'ELEMENT'
const ELEMENT_ID_KEY = 'element-6066-11e4-a52e-4f735466cecf'
const SHADOW_ROOT_ID_KEY = 'shadow-6066-11e4-a52e-4f735466cecf'

/**
 * Represents a DOM element. WebElements can be found by searching from the
 * document root using a {@link WebDriver} instance, or by searching
 * under another WebElement:
 *
 *     driver.get('http://www.google.com');
 *     var searchForm = driver.findElement(By.tagName('form'));
 *     var searchBox = searchForm.findElement(By.name('q'));
 *     searchBox.sendKeys('webdriver');
 */
export class WebElement {
  private readonly driver_: WebDriver
  private readonly id_: Promise<string>
  private readonly log_: logging.Logger

  /**
   * @param driver the parent WebDriver instance for this element.
   * @param id The server-assigned opaque ID for the underlying DOM element.
   */
  constructor(driver: WebDriver, id: PromiseLike<string> | string) {
    this.driver_ = driver
    this.id_ = Promise.resolve(id)
    this.log_ = logging.getLogger(logging.Type.DRIVER)
  }

  /**
   * @param id The raw ID.
   * @param noLegacy Whether to exclude the legacy element key.
   * @return The element ID for use with WebDriver's wire protocol.
   */
  static buildId(id: string, noLegacy = false): Record<string, string> {
    return noLegacy ? { [ELEMENT_ID_KEY]: id } : { [ELEMENT_ID_KEY]: id, [LEGACY_ELEMENT_ID_KEY]: id }
  }

  /**
   * Extracts the encoded WebElement ID from the object.
   *
   * @param obj The object to extract the ID from.
   * @return the extracted ID.
   * @throws {TypeError} if the object is not a valid encoded ID.
   */
  static extractId(obj: unknown): string {
    return webElement.extractId(obj)
  }

  /**
   * @param obj the object to test.
   * @return whether the object is a valid encoded WebElement ID.
   */
  static isId(obj: unknown): boolean {
    return webElement.isId(obj)
  }

  /**
   * Compares two WebElements for equality.
   *
   * @param a A WebElement.
   * @param b A WebElement.
   * @return A promise that will be resolved to whether the two WebElements are
   *     equal.
   */
  static async equals(a: WebElement, b: WebElement): Promise<boolean> {
    if (a === b) {
      return true
    }
    return a.driver_.executeScript<boolean>('return arguments[0] === arguments[1]', a, b)
  }

  /** @return The parent driver for this instance. */
  getDriver(): WebDriver {
    return this.driver_
  }

  /**
   * @return A promise that resolves to the server-assigned opaque ID assigned
   *     to this element.
   */
  getId(): Promise<string> {
    return this.id_
  }

  /**
   * @return Returns the serialized representation of this WebElement.
   */
  [Symbols.serialize](): Promise<Record<string, string>> {
    return this.getId().then((id) => WebElement.buildId(id))
  }

  /**
   * Schedules a command that targets this element with the parent WebDriver
   * instance. Will ensure this element's ID is included in the command
   * parameters under the "id" key.
   *
   * @param command The command to schedule.
   * @return A promise that will be resolved with the result.
   * @see WebDriver#schedule
   */
  private execute_<T = unknown>(command: command.Command): Promise<T> {
    command.setParameter('id', this)
    return this.driver_.execute<T>(command)
  }

  /**
   * Schedule a command to find a descendant of this element. If the element
   * cannot be found, the returned promise will be rejected with a
   * {@linkplain error.NoSuchElementError NoSuchElementError}.
   *
   * The search criteria for an element may be defined using one of the static
   * factories on the {@link by.By} class, or as a short-hand
   * {@link ./by.ByHash} object. For example, the following two statements
   * are equivalent:
   *
   *     var e1 = element.findElement(By.id('foo'));
   *     var e2 = element.findElement({id:'foo'});
   *
   * You may also provide a custom locator function, which takes as input this
   * instance and returns a {@link WebElement}, or a promise that will resolve
   * to a WebElement. If the returned promise resolves to an array of
   * WebElements, WebDriver will use the first element. For example, to find the
   * first visible link on a page, you could write:
   *
   *     var link = element.findElement(firstVisibleLink);
   *
   *     function firstVisibleLink(element) {
   *       var links = element.findElements(By.tagName('a'));
   *       return promise.filter(links, function(link) {
   *         return link.isDisplayed();
   *       });
   *     }
   *
   * @param locator The locator strategy to use when searching for the element.
   * @return A WebElement that can be used to issue commands against the
   *     located element. If the element is not found, the element will be
   *     invalidated and all scheduled commands aborted.
   */
  findElement(locator: Locator): WebElementPromise {
    const checked = by.checkedLocator(locator)
    let id: Promise<WebElement>
    if (typeof checked === 'function') {
      id = this.driver_.findElementInternal_(checked, this)
    } else if (checked instanceof RelativeBy) {
      id = Promise.resolve(this.driver_.findElement(checked))
    } else {
      const cmd = new command.Command(command.Name.FIND_CHILD_ELEMENT)
        .setParameter('using', checked.using)
        .setParameter('value', checked.value)
      id = this.execute_<WebElement>(cmd)
    }
    return new WebElementPromise(this.driver_, id)
  }

  /**
   * Locates all the descendants of this element that match the given search
   * criteria.
   *
   * @param locator The locator strategy to use when searching for the element.
   * @return A promise that will resolve to an array of WebElements.
   */
  async findElements(locator: Locator): Promise<WebElement[]> {
    const checked = by.checkedLocator(locator)
    if (typeof checked === 'function') {
      return this.driver_.findElementsInternal_(checked, this)
    } else if (checked instanceof RelativeBy) {
      return this.driver_.findElements(checked)
    } else {
      const cmd = new command.Command(command.Name.FIND_CHILD_ELEMENTS)
        .setParameter('using', checked.using)
        .setParameter('value', checked.value)
      const result = await this.execute_<unknown>(cmd)
      return Array.isArray(result) ? result : []
    }
  }

  /**
   * Clicks on this element.
   *
   * @return A promise that will be resolved when the click command has
   *     completed.
   */
  click(): Promise<void> {
    return this.execute_<void>(new command.Command(command.Name.CLICK_ELEMENT))
  }

  /**
   * Types a key sequence on the DOM element represented by this instance.
   *
   * Modifier keys (SHIFT, CONTROL, ALT, META) are stateful; once a modifier is
   * processed in the key sequence, that key state is toggled until one of the
   * following occurs:
   *
   * - The modifier key is encountered again in the sequence. At this point the
   *   state of the key is toggled (along with the appropriate keyup/down
   *   events).
   * - The {@link input.Key.NULL} key is encountered in the sequence. When
   *   this key is encountered, all modifier keys current in the down state are
   *   released (with accompanying keyup events). The NULL key can be used to
   *   simulate common keyboard shortcuts:
   *
   *         element.sendKeys("text was",
   *                          Key.CONTROL, "a", Key.NULL,
   *                          "now text is");
   *         // Alternatively:
   *         element.sendKeys("text was",
   *                          Key.chord(Key.CONTROL, "a"),
   *                          "now text is");
   *
   * - The end of the key sequence is encountered. When there are no more keys
   *   to type, all depressed modifier keys are released (with accompanying
   *   keyup events).
   *
   * If this element is a file input ({@code <input type="file">}), the
   * specified key sequence should specify the path to the file to attach to
   * the element. This is analogous to the user clicking "Browse..." and entering
   * the path into the file select dialog.
   *
   *     var form = driver.findElement(By.css('form'));
   *     var element = form.findElement(By.css('input[type=file]'));
   *     element.sendKeys('/path/to/file.txt');
   *     form.submit();
   *
   * For uploads to function correctly, the entered path must reference a file
   * on the _browser's_ machine, not the local machine running this script. When
   * running against a remote Selenium server, a {@link input.FileDetector}
   * may be used to transparently copy files to the remote machine before
   * attempting to upload them in the browser.
   *
   * __Note:__ On browsers where native keyboard events are not supported
   * (e.g. Firefox on OS X), key events will be synthesized. Special
   * punctuation keys will be synthesized according to a standard QWERTY en-us
   * keyboard layout.
   *
   * @param args The sequence of keys to type. Number keys may be referenced
   *     numerically or by string (1 or '1'). All arguments will be joined into
   *     a single sequence.
   * @return A promise that will be resolved when all keys have been typed.
   */
  async sendKeys(...args: (number | string | PromiseLike<number | string>)[]): Promise<void> {
    const keys: string[] = []
    ;(await Promise.all(args)).forEach((key) => {
      const type = typeof key
      if (typeof key === 'number') {
        key = String(key)
      } else if (type !== 'string') {
        throw TypeError('each key must be a number or string; got ' + type)
      }

      // The W3C protocol requires keys to be specified as an array where
      // each element is a single key.
      keys.push(...key)
    })

    if (!this.driver_.fileDetector_) {
      return this.execute_<void>(
        new command.Command(command.Name.SEND_KEYS_TO_ELEMENT)
          .setParameter('text', keys.join(''))
          .setParameter('value', keys),
      )
    }

    let text: string
    try {
      text = await this.driver_.fileDetector_.handleFile(this.driver_, keys.join(''))
    } catch (ex) {
      this.log_.severe('Error trying parse string as a file with file detector; sending keys instead' + ex)
      text = keys.join('')
    }

    return this.execute_<void>(
      new command.Command(command.Name.SEND_KEYS_TO_ELEMENT)
        .setParameter('text', text)
        .setParameter('value', text.split('')),
    )
  }

  /**
   * Retrieves the element's tag name.
   *
   * @return A promise that will be resolved with the element's tag name.
   */
  getTagName(): Promise<string> {
    return this.execute_<string>(new command.Command(command.Name.GET_ELEMENT_TAG_NAME))
  }

  /**
   * Retrieves the value of a computed style property for this instance. If
   * the element inherits the named style from its parent, the parent will be
   * queried for its value.  Where possible, color values will be converted to
   * their hex representation (e.g. #00ff00 instead of rgb(0, 255, 0)).
   *
   * _Warning:_ the value returned will be as the browser interprets it, so
   * it may be tricky to form a proper assertion.
   *
   * @param cssStyleProperty The name of the CSS style property to look up.
   * @return A promise that will be resolved with the requested CSS value.
   */
  getCssValue(cssStyleProperty: string): Promise<string> {
    const name = command.Name.GET_ELEMENT_VALUE_OF_CSS_PROPERTY
    return this.execute_<string>(new command.Command(name).setParameter('propertyName', cssStyleProperty))
  }

  /**
   * Retrieves the current value of the given attribute of this element.
   * Will return the current value, even if it has been modified after the page
   * has been loaded. More exactly, this method will return the value
   * of the given attribute, unless that attribute is not present, in which case
   * the value of the property with the same name is returned. If neither value
   * is set, null is returned (for example, the "value" property of a textarea
   * element). The "style" attribute is converted as best can be to a
   * text representation with a trailing semicolon. The following are deemed to
   * be "boolean" attributes and will return either "true" or null:
   *
   * async, autofocus, autoplay, checked, compact, complete, controls, declare,
   * defaultchecked, defaultselected, defer, disabled, draggable, ended,
   * formnovalidate, hidden, indeterminate, iscontenteditable, ismap, itemscope,
   * loop, multiple, muted, nohref, noresize, noshade, novalidate, nowrap, open,
   * paused, pubdate, readonly, required, reversed, scoped, seamless, seeking,
   * selected, spellcheck, truespeed, willvalidate
   *
   * Finally, the following commonly mis-capitalized attribute/property names
   * are evaluated as expected:
   *
   * - "class"
   * - "readonly"
   *
   * @param attributeName The name of the attribute to query.
   * @return A promise that will be resolved with the attribute's value. The
   *     returned value will always be either a string or null.
   */
  getAttribute(attributeName: string): Promise<string | null> {
    return this.execute_<string | null>(
      new command.Command(command.Name.GET_ELEMENT_ATTRIBUTE).setParameter('name', attributeName),
    )
  }

  /**
   * Get the value of the given attribute of the element.
   * <p>
   * This method, unlike {@link #getAttribute(String)}, returns the value of the attribute with the
   * given name but not the property with the same name.
   * <p>
   * The following are deemed to be "boolean" attributes, and will return either "true" or null:
   * <p>
   * async, autofocus, autoplay, checked, compact, complete, controls, declare, defaultchecked,
   * defaultselected, defer, disabled, draggable, ended, formnovalidate, hidden, indeterminate,
   * iscontenteditable, ismap, itemscope, loop, multiple, muted, nohref, noresize, noshade,
   * novalidate, nowrap, open, paused, pubdate, readonly, required, reversed, scoped, seamless,
   * seeking, selected, truespeed, willvalidate
   * <p>
   * See <a href="https://w3c.github.io/webdriver/#get-element-attribute">W3C WebDriver specification</a>
   * for more details.
   *
   * @param attributeName The name of the attribute.
   * @return The attribute's value or null if the value is not set.
   */
  getDomAttribute(attributeName: string): Promise<string | null> {
    return this.execute_<string | null>(
      new command.Command(command.Name.GET_DOM_ATTRIBUTE).setParameter('name', attributeName),
    )
  }

  /**
   * Get the given property of the referenced web element
   * @param propertyName The name of the attribute to query.
   * @return A promise that will be resolved with the element's property value
   */
  getProperty(propertyName: string): Promise<unknown> {
    return this.execute_(new command.Command(command.Name.GET_ELEMENT_PROPERTY).setParameter('name', propertyName))
  }

  /**
   * Get the shadow root of the current web element.
   * @returns A promise that will be resolved with the elements shadow root or
   *     rejected with {@link NoSuchShadowRootError}
   */
  getShadowRoot(): Promise<ShadowRoot> {
    return this.execute_<ShadowRoot>(new command.Command(command.Name.GET_SHADOW_ROOT))
  }

  /**
   * Get the visible (i.e. not hidden by CSS) innerText of this element,
   * including sub-elements, without any leading or trailing whitespace.
   *
   * @return A promise that will be resolved with the element's visible text.
   */
  getText(): Promise<string> {
    return this.execute_<string>(new command.Command(command.Name.GET_ELEMENT_TEXT))
  }

  /**
   * Get the computed WAI-ARIA role of element.
   *
   * @return A promise that will be resolved with the element's computed role.
   */
  getAriaRole(): Promise<string> {
    return this.execute_<string>(new command.Command(command.Name.GET_COMPUTED_ROLE))
  }

  /**
   * Get the computed WAI-ARIA label of element.
   *
   * @return A promise that will be resolved with the element's computed label.
   */
  getAccessibleName(): Promise<string> {
    return this.execute_<string>(new command.Command(command.Name.GET_COMPUTED_LABEL))
  }

  /**
   * Returns an object describing an element's location, in pixels relative to
   * the document element, and the element's size in pixels.
   *
   * @return A promise that will resolve with the element's rect.
   */
  getRect(): Promise<Rect> {
    return this.execute_<Rect>(new command.Command(command.Name.GET_ELEMENT_RECT))
  }

  /**
   * Tests whether this element is enabled, as dictated by the `disabled`
   * attribute.
   *
   * @return A promise that will be resolved with whether this element is
   *     currently enabled.
   */
  isEnabled(): Promise<boolean> {
    return this.execute_<boolean>(new command.Command(command.Name.IS_ELEMENT_ENABLED))
  }

  /**
   * Tests whether this element is selected.
   *
   * @return A promise that will be resolved with whether this element is
   *     currently selected.
   */
  isSelected(): Promise<boolean> {
    return this.execute_<boolean>(new command.Command(command.Name.IS_ELEMENT_SELECTED))
  }

  /**
   * Submits the form containing this element (or this element if it is itself
   * a FORM element). his command is a no-op if the element is not contained in
   * a form.
   *
   * @return A promise that will be resolved when the form has been submitted.
   */
  submit(): Promise<void> {
    const script =
      '/* submitForm */var form = arguments[0];\n' +
      'while (form.nodeName != "FORM" && form.parentNode) {\n' +
      '  form = form.parentNode;\n' +
      '}\n' +
      "if (!form) { throw Error('Unable to find containing form element'); }\n" +
      "if (!form.ownerDocument) { throw Error('Unable to find owning document'); }\n" +
      "var e = form.ownerDocument.createEvent('Event');\n" +
      "e.initEvent('submit', true, true);\n" +
      'if (form.dispatchEvent(e)) { HTMLFormElement.prototype.submit.call(form) }\n'

    return this.driver_.executeScript<void>(script, this)
  }

  /**
   * Clear the `value` of this element. This command has no effect if the
   * underlying DOM element is neither a text INPUT element nor a TEXTAREA
   * element.
   *
   * @return A promise that will be resolved when the element has been cleared.
   */
  clear(): Promise<void> {
    return this.execute_<void>(new command.Command(command.Name.CLEAR_ELEMENT))
  }

  /**
   * Test whether this element is currently displayed.
   *
   * @return A promise that will be resolved with whether this element is
   *     currently visible on the page.
   */
  isDisplayed(): Promise<boolean> {
    return this.execute_<boolean>(new command.Command(command.Name.IS_ELEMENT_DISPLAYED))
  }

  /**
   * Take a screenshot of the visible region encompassed by this element's
   * bounding rectangle.
   *
   * @return A promise that will be resolved to the screenshot as a base-64
   *     encoded PNG.
   */
  takeScreenshot(): Promise<string> {
    return this.execute_<string>(new command.Command(command.Name.TAKE_ELEMENT_SCREENSHOT))
  }
}

/**
 * WebElementPromise is a promise that will be fulfilled with a WebElement.
 * This serves as a forward proxy on WebElement, allowing calls to be
 * scheduled without directly on this instance before the underlying
 * WebElement has been fulfilled. In other words, the following two statements
 * are equivalent:
 *
 *     driver.findElement({id: 'my-button'}).click();
 *     driver.findElement({id: 'my-button'}).then(function(el) {
 *       return el.click();
 *     });
 */
export class WebElementPromise extends WebElement implements PromiseLike<WebElement> {
  declare then: Promise<WebElement>['then']
  declare catch: Promise<WebElement>['catch']

  /**
   * @param driver The parent WebDriver instance for this element.
   * @param el A promise that will resolve to the promised element.
   */
  constructor(driver: WebDriver, el: Promise<WebElement>) {
    super(driver, 'unused')

    this.then = el.then.bind(el)

    this.catch = el.catch.bind(el)

    /**
     * Defers returning the element ID until the wrapped WebElement has been
     * resolved.
     */
    this.getId = function () {
      return el.then(function (el) {
        return el.getId()
      })
    }
  }
}

//////////////////////////////////////////////////////////////////////////////
//
//  ShadowRoot
//
//////////////////////////////////////////////////////////////////////////////

/**
 * Represents a ShadowRoot of a {@link WebElement}. Provides functions to
 * retrieve elements that live in the DOM below the ShadowRoot.
 */
export class ShadowRoot {
  private readonly driver_: WebDriver
  private readonly id_: string

  constructor(driver: WebDriver, id: string) {
    this.driver_ = driver
    this.id_ = id
  }

  /**
   * Extracts the encoded ShadowRoot ID from the object.
   *
   * @param obj The object to extract the ID from.
   * @return the extracted ID.
   * @throws {TypeError} if the object is not a valid encoded ID.
   */
  static extractId(obj: unknown): string {
    if (obj && typeof obj === 'object') {
      const id = Reflect.get(obj, SHADOW_ROOT_ID_KEY)
      if (typeof id === 'string') {
        return id
      }
    }
    throw new TypeError('object is not a ShadowRoot ID')
  }

  /**
   * @param obj the object to test.
   * @return whether the object is a valid encoded WebElement ID.
   */
  static isId(obj: unknown): boolean {
    return Boolean(obj && typeof obj === 'object' && typeof Reflect.get(obj, SHADOW_ROOT_ID_KEY) === 'string')
  }

  /**
   * @return Returns the serialized representation of this ShadowRoot.
   */
  [Symbols.serialize](): string | Promise<string> {
    return this.getId()
  }

  /**
   * Schedules a command that targets this element with the parent WebDriver
   * instance. Will ensure this element's ID is included in the command
   * parameters under the "id" key.
   *
   * @param command The command to schedule.
   * @return A promise that will be resolved with the result.
   * @see WebDriver#schedule
   */
  private execute_<T = unknown>(command: command.Command): Promise<T> {
    command.setParameter('id', this)
    return this.driver_.execute<T>(command)
  }

  /**
   * Schedule a command to find a descendant of this ShadowROot. If the element
   * cannot be found, the returned promise will be rejected with a
   * {@linkplain error.NoSuchElementError NoSuchElementError}.
   *
   * The search criteria for an element may be defined using one of the static
   * factories on the {@link by.By} class, or as a short-hand
   * {@link ./by.ByHash} object. For example, the following two statements
   * are equivalent:
   *
   *     var e1 = shadowroot.findElement(By.id('foo'));
   *     var e2 = shadowroot.findElement({id:'foo'});
   *
   * You may also provide a custom locator function, which takes as input this
   * instance and returns a {@link WebElement}, or a promise that will resolve
   * to a WebElement. If the returned promise resolves to an array of
   * WebElements, WebDriver will use the first element. For example, to find the
   * first visible link on a page, you could write:
   *
   *     var link = element.findElement(firstVisibleLink);
   *
   *     function firstVisibleLink(shadowRoot) {
   *       var links = shadowRoot.findElements(By.tagName('a'));
   *       return promise.filter(links, function(link) {
   *         return link.isDisplayed();
   *       });
   *     }
   *
   * @param locator The locator strategy to use when searching for the element.
   * @return A WebElement that can be used to issue commands against the
   *     located element. If the element is not found, the element will be
   *     invalidated and all scheduled commands aborted.
   */
  findElement(locator: Locator): ShadowRootPromise {
    const checked = by.checkedLocator(locator)
    let id: Promise<WebElement>
    if (typeof checked === 'function') {
      id = this.driver_.findElementInternal_(checked, this)
    } else if (checked instanceof RelativeBy) {
      id = Promise.resolve(this.driver_.findElement(checked))
    } else {
      const cmd = new command.Command(command.Name.FIND_ELEMENT_FROM_SHADOWROOT)
        .setParameter('using', checked.using)
        .setParameter('value', checked.value)
      id = this.execute_<WebElement>(cmd)
    }
    return new ShadowRootPromise(this.driver_, id)
  }

  /**
   * Locates all the descendants of this element that match the given search
   * criteria.
   *
   * @param locator The locator strategy to use when searching for the element.
   * @return A promise that will resolve to an array of WebElements.
   */
  async findElements(locator: Locator): Promise<WebElement[]> {
    const checked = by.checkedLocator(locator)
    if (typeof checked === 'function') {
      return this.driver_.findElementsInternal_(checked, this)
    } else if (checked instanceof RelativeBy) {
      return this.driver_.findElements(checked)
    } else {
      const cmd = new command.Command(command.Name.FIND_ELEMENTS_FROM_SHADOWROOT)
        .setParameter('using', checked.using)
        .setParameter('value', checked.value)
      const result = await this.execute_<unknown>(cmd)
      return Array.isArray(result) ? result : []
    }
  }

  getId(): string | Promise<string> {
    return this.id_
  }
}

/**
 * ShadowRootPromise is a promise that will be fulfilled with a WebElement.
 * This serves as a forward proxy on ShadowRoot, allowing calls to be
 * scheduled without directly on this instance before the underlying
 * ShadowRoot has been fulfilled.
 */
class ShadowRootPromise extends ShadowRoot implements PromiseLike<WebElement> {
  declare then: Promise<WebElement>['then']
  declare catch: Promise<WebElement>['catch']

  /**
   * @param driver The parent WebDriver instance for this element.
   * @param shadow A promise that will resolve to the promised element.
   */
  constructor(driver: WebDriver, shadow: Promise<WebElement>) {
    super(driver, 'unused')

    this.then = shadow.then.bind(shadow)

    this.catch = shadow.catch.bind(shadow)

    /**
     * Defers returning the ShadowRoot ID until the wrapped WebElement has been
     * resolved.
     */
    this.getId = function () {
      return shadow.then(function (shadow) {
        return shadow.getId()
      })
    }
  }
}

//////////////////////////////////////////////////////////////////////////////
//
//  Alert
//
//////////////////////////////////////////////////////////////////////////////

/**
 * Represents a modal dialog such as {@code alert}, {@code confirm}, or
 * {@code prompt}. Provides functions to retrieve the message displayed with
 * the alert, accept or dismiss the alert, and set the response text (in the
 * case of {@code prompt}).
 */
export class Alert {
  private readonly driver_: WebDriver
  private readonly text_: Promise<string>

  /**
   * @param driver The driver controlling the browser this alert is attached
   *     to.
   * @param text The message text displayed with this alert.
   */
  constructor(driver: WebDriver, text: string) {
    this.driver_ = driver
    this.text_ = Promise.resolve(text)
  }

  /**
   * Retrieves the message text displayed with this alert. For instance, if the
   * alert were opened with alert("hello"), then this would return "hello".
   *
   * @return A promise that will be resolved to the text displayed with this
   *     alert.
   */
  getText(): Promise<string> {
    return this.text_
  }

  /**
   * Accepts this alert.
   *
   * @return A promise that will be resolved when this command has completed.
   */
  accept(): Promise<void> {
    return this.driver_.execute<void>(new command.Command(command.Name.ACCEPT_ALERT))
  }

  /**
   * Dismisses this alert.
   *
   * @return A promise that will be resolved when this command has completed.
   */
  dismiss(): Promise<void> {
    return this.driver_.execute<void>(new command.Command(command.Name.DISMISS_ALERT))
  }

  /**
   * Sets the response text on this alert. This command will return an error if
   * the underlying alert does not support response text (e.g. window.alert and
   * window.confirm).
   *
   * @param text The text to set.
   * @return A promise that will be resolved when this command has completed.
   */
  sendKeys(text: string): Promise<void> {
    return this.driver_.execute<void>(new command.Command(command.Name.SET_ALERT_TEXT).setParameter('text', text))
  }
}

/**
 * AlertPromise is a promise that will be fulfilled with an Alert. This promise
 * serves as a forward proxy on an Alert, allowing calls to be scheduled
 * directly on this instance before the underlying Alert has been fulfilled. In
 * other words, the following two statements are equivalent:
 *
 *     driver.switchTo().alert().dismiss();
 *     driver.switchTo().alert().then(function(alert) {
 *       return alert.dismiss();
 *     });
 */
export class AlertPromise extends Alert implements PromiseLike<Alert> {
  declare then: Promise<Alert>['then']
  declare catch: Promise<Alert>['catch']

  /**
   * @param driver The driver controlling the browser this alert is attached
   *     to.
   * @param alert A thenable that will be fulfilled with the promised alert.
   */
  constructor(driver: WebDriver, alert: Promise<Alert>) {
    super(driver, 'unused')

    this.then = alert.then.bind(alert)

    this.catch = alert.catch.bind(alert)

    /**
     * Defer returning text until the promised alert has been resolved.
     */
    this.getText = function () {
      return alert.then(function (alert) {
        return alert.getText()
      })
    }

    /**
     * Defers action until the alert has been located.
     */
    this.accept = function () {
      return alert.then(function (alert) {
        return alert.accept()
      })
    }

    /**
     * Defers action until the alert has been located.
     */
    this.dismiss = function () {
      return alert.then(function (alert) {
        return alert.dismiss()
      })
    }

    /**
     * Defers action until the alert has been located.
     */
    this.sendKeys = function (text) {
      return alert.then(function (alert) {
        return alert.sendKeys(text)
      })
    }
  }
}

/** Keeps `import x from '...'` working for esModuleInterop/Babel consumers; deliberate exception to the no-default-export rule. */
const defaultExport: typeof self = self
export default defaultExport
