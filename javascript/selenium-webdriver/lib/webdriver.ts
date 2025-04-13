import * as by from './by'
import * as command from './command'
import * as error from './error'
import { NoSuchElementError } from './error'
import * as input from './input'
import * as logging from './logging'
import promise from './promise'
import * as Symbols from './symbols'
import cdp from '../devtools/CDPConnection'
import WebSocket from 'ws'
import * as http from '../http/index'
import * as fs from 'node:fs'
import { Capabilities } from './capabilities'
import * as path from 'node:path'
import { Credential } from './virtual_authenticator'
import * as webElement from './webelement'
import { isObject, isPromise } from './util'
import BIDI from '../bidi'
import { PinnedScript } from './pinnedScript'
import JSZip from 'jszip'
import Script from './script'
import Network from './network'
import Dialog from './fedcm/dialog'
import { RelativeBy } from './by'
import { Entry, LogType } from './logging'

const cdpTargets = ["page", "browser"];

const W3C_CAPABILITY_NAMES = new Set([
  "acceptInsecureCerts",
  "browserName",
  "browserVersion",
  "pageLoadStrategy",
  "platformName",
  "proxy",
  "setWindowRect",
  "strictFileInteractability",
  "timeouts",
  "unhandledPromptBehavior",
  "webSocketUrl",
]);

async function executeCommand (
  executor: command.Executor,
  cmd: command.Command
): Promise<any> {
  const parameters = await toWireValue(cmd.getParameters())
  await cmd.setParameters(parameters)
  return executor.execute(cmd)
}

async function toWireValue(obj: any): Promise<any> {
  let value = await Promise.resolve(obj);
  if (value === undefined || value === null) {
    return value;
  }
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return convertKeys(value);
  }
  if (typeof value === "function") {
    return "" + value;
  }
  if (typeof value[Symbols.serialize] === "function") {
    return toWireValue(value[Symbols.serialize]());
  } else if (typeof value.toJSON === "function") {
    return toWireValue(value.toJSON());
  }
  return convertKeys(value);
}

async function convertKeys(obj: any): Promise<any> {
  const isArray = Array.isArray(obj);
  const numKeys = isArray ? obj.length : Object.keys(obj).length;
  const ret = isArray ? new Array(numKeys) : {};
  if (!numKeys) {
    return ret;
  }
  async function forEachKey(
    obj: any,
    fn: (value: any, key: string | number) => Promise<void>
  ) {
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        await fn(obj[i], i);
      }
    } else {
      for (let key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          await fn(obj[key], key);
        }
      }
    }
  }
  await forEachKey(obj, async (value, key) => {
    ret[key] = await toWireValue(value);
  });
  return ret;
}

function fromWireValue(driver: IWebDriver, value: any): any {
  if (Array.isArray(value)) {
    value = value.map((v) => fromWireValue(driver, v));
  } else if (WebElement.isId(value)) {
    const id = WebElement.extractId(value);
    value = new WebElement(driver, id);
  } else if (ShadowRoot.isId(value)) {
    const id = ShadowRoot.extractId(value);
    value = new ShadowRoot(driver, id);
  } else if (isObject(value)) {
    const result: any = {};
    for (let key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        result[key] = fromWireValue(driver, value[key]);
      }
    }
    value = result;
  }
  return value;
}

function resolveWaitMessage(message?: string | (() => string)): string {
  return message ? `${typeof message === "function" ? message() : message}\n` : "";
}

function filterNonW3CCaps(capabilities: Capabilities): Capabilities {
  let newCaps = new Capabilities(capabilities);
  for (let k of newCaps.keys()) {
    if (!(W3C_CAPABILITY_NAMES.has(k) || k.indexOf(":") >= 0)) {
      newCaps.delete(k);
    }
  }
  return newCaps;
}

function legacyTimeout(
  driver: IWebDriver,
  type: string,
  ms: number
): Promise<void> {
  return driver.execute(
    new command.Command(command.Name.SET_TIMEOUT)
      .setParameter("type", type)
      .setParameter("ms", ms)
  );
}

// Type guard for PinnedScript
function isPinnedScript(x: any): x is PinnedScript {
  return (
    x &&
    typeof x === "object" &&
    "executionScript" in x &&
    typeof x.executionScript === "function" &&
    "removalScript" in x &&
    typeof x.removalScript === "function"
  );
}

///////////////////////
// IWebDriver interface
///////////////////////

interface IWebDriver {
  execute(cmd: command.Command): Promise<any>;
  setFileDetector(detector: input.FileDetector | null): void;
  getExecutor(): command.Executor;
  getSession(): Promise<any>;
  getCapabilities(): Promise<any>;
  quit(): Promise<void>;
  actions(options?: { async?: boolean; bridge?: boolean }): input.Actions;
  executeScript<T>(script: string | Function | PinnedScript, ...args: any[]): Promise<T>;
  executeAsyncScript<T>(script: string | Function | PinnedScript, ...args: any[]): Promise<T>;
  wait<T>(
    condition: Promise<T> | Condition<T> | ((driver: IWebDriver) => T),
    timeout?: number,
    message?: string | (() => string),
    pollTimeout?: number
  ): Promise<T>;
  sleep(ms: number): Promise<void>;
  getWindowHandle(): Promise<string>;
  getAllWindowHandles(): Promise<string[]>;
  getPageSource(): Promise<string>;
  close(): Promise<void>;
  get(url: string): Promise<void>;
  getCurrentUrl(): Promise<string>;
  getTitle(): Promise<string>;
  findElement(locator: any): WebElementPromise;
  findElements(locator: any): Promise<WebElement[]>;
  takeScreenshot(): Promise<string>;
  manage(): Options;
  navigate(): Navigation;
  switchTo(): TargetLocator;
  printPage(options?: any): Promise<any>;
}

///////////////////////
// Condition classes
///////////////////////

class Condition<T> {
  description_: string;
  fn: (driver: IWebDriver) => T;
  constructor(message: string, fn: (driver: IWebDriver) => T) {
    this.description_ = "Waiting " + message;
    this.fn = fn;
  }
  description(): string {
    return this.description_;
  }
}

class WebElementCondition extends Condition<WebElement | Promise<WebElement>> {
  constructor(message: string, fn: (driver: IWebDriver) => WebElement | Promise<WebElement>) {
    super(message, fn);
  }
}

///////////////////////
// WebDriver class
///////////////////////

class WebDriver implements IWebDriver {
  private session_: Promise<any>;
  private executor_: command.Executor;
  // fileDetector_ is not in the interface; add it as private member.
  fileDetector_?: input.FileDetector | null = null;
  private onQuit_?: () => any;
  private authenticatorId_: any = null;
  private pinnedScripts_: { [handle: string]: PinnedScript } = {};
  private _cdpWsConnection?: WebSocket;
  private _cdpConnection: any;
  private _bidiConnection: any;
  public targetID: any;
  public sessionId: any;
  private _wsUrl: string = "";
  #script?: Script;
  #network?: Network;

  constructor(session: any, executor: command.Executor, onQuit?: () => any) {
    this.session_ = Promise.resolve(session);
    this.session_.catch(() => {});
    this.executor_ = executor;
    this.onQuit_ = onQuit;
  }

  static createSession(
    executor: command.Executor,
    capabilities: Capabilities,
    onQuit?: () => any
  ): WebDriver {
    let cmd = new command.Command(command.Name.NEW_SESSION);
    cmd.setParameter("capabilities", {
      firstMatch: [{}],
      alwaysMatch: filterNonW3CCaps(capabilities),
    });
    let session = executeCommand(executor, cmd);
    if (typeof onQuit === "function") {
      session = session.catch((err: any) => {
        return Promise.resolve(onQuit.call(undefined)).then(() => {
          throw err;
        });
      });
    }
    return new WebDriver(session, executor, onQuit);
  }

  async execute(cmd: command.Command): Promise<any> {
    cmd.setParameter("sessionId", this.session_);
    let parameters = await toWireValue(cmd.getParameters());
    cmd.setParameters(parameters);
    let value = await this.executor_.execute(cmd);
    return fromWireValue(this, value);
  }

  setFileDetector(detector: input.FileDetector | null): void {
    this.fileDetector_ = detector;
  }

  getExecutor(): command.Executor {
    return this.executor_;
  }

  getSession(): Promise<any> {
    return this.session_;
  }

  getCapabilities(): Promise<any> {
    return this.session_.then((s: any) => s.getCapabilities());
  }

  quit(): Promise<void> {
    let result = this.execute(new command.Command(command.Name.QUIT));
    return promise.finally(result, () => {
      this.session_ = Promise.reject(
        new error.NoSuchSessionError(
          "This driver instance does not have a valid session ID (did you call WebDriver.quit()?) and may no longer be used."
        )
      );
      this.session_.catch(() => {});
      if (this.onQuit_) {
        return this.onQuit_.call(undefined);
      }
      if (this._cdpWsConnection !== undefined) {
        this._cdpWsConnection.close();
      }
      if (this._bidiConnection !== undefined) {
        this._bidiConnection.close();
      }
    });
  }

  actions(options?: { async?: boolean; bridge?: boolean }): input.Actions {
    return new input.Actions(this, options || undefined);
  }

  executeScript<T>(script: string | Function | PinnedScript, ...args: any[]): Promise<T> {
    if (typeof script === "function") {
      script = "return (" + script + ").apply(null, arguments);";
    }
    if (isPinnedScript(script)) {
      return this.execute(
        new command.Command(command.Name.EXECUTE_SCRIPT)
          .setParameter("script", script.executionScript())
          .setParameter("args", args)
      );
    }
    return this.execute(
      new command.Command(command.Name.EXECUTE_SCRIPT)
        .setParameter("script", script)
        .setParameter("args", args)
    );
  }

  executeAsyncScript<T>(script: string | Function | PinnedScript, ...args: any[]): Promise<T> {
    if (typeof script === "function") {
      script = "return (" + script + ").apply(null, arguments);";
    }
    if (isPinnedScript(script)) {
      return this.execute(
        new command.Command(command.Name.EXECUTE_ASYNC_SCRIPT)
          .setParameter("script", script.executionScript())
          .setParameter("args", args)
      );
    }
    return this.execute(
      new command.Command(command.Name.EXECUTE_ASYNC_SCRIPT)
        .setParameter("script", script)
        .setParameter("args", args)
    );
  }

  wait<T>(
    condition: Promise<T> | Condition<T> | ((driver: IWebDriver) => T),
    timeout: number = 0,
    message?: string | (() => string),
    pollTimeout: number = 200
  ): Promise<T> {
    if (typeof timeout !== "number" || timeout < 0) {
      throw TypeError("timeout must be a number >= 0: " + timeout);
    }
    if (typeof pollTimeout !== "number" || pollTimeout < 0) {
      throw TypeError("pollTimeout must be a number >= 0: " + pollTimeout);
    }
    if (isPromise(condition)) {
      return new Promise((resolve, reject) => {
        if (!timeout) {
          resolve((condition as Promise<T>));
          return;
        }
        let start = Date.now();
        let timer: NodeJS.Timeout | null = setTimeout(() => {
          timer = null;
          try {
            let timeoutMessage = resolveWaitMessage(message);
            reject(
              new error.TimeoutError(
                `${timeoutMessage}Timed out waiting for promise to resolve after ${Date.now() - start}ms`
              )
            );
          } catch (ex: any) {
            reject(
              new error.TimeoutError(
                `${ex.message}\nTimed out waiting for promise to resolve after ${Date.now() - start}ms`
              )
            );
          }
        }, timeout);
        const clearTimer = () => {
          if (timer) clearTimeout(timer);
        };
        (condition as Promise<T>).then(
          (value) => {
            clearTimer();
            resolve(value);
          },
          (err) => {
            clearTimer();
            reject(err);
          }
        );
      });
    }
    let fn: (driver: IWebDriver) => T = condition as (driver: IWebDriver) => T;
    if (condition instanceof Condition) {
      message = message || condition.description();
      fn = condition.fn;
    }
    if (typeof fn !== "function") {
      throw TypeError(
        "Wait condition must be a promise-like object, function, or a Condition object"
      );
    }
    const driver = this;
    function evaluateCondition(): Promise<T> {
      return new Promise((resolve, reject) => {
        try {
          resolve(fn(driver));
        } catch (ex) {
          reject(ex);
        }
      });
    }
    let result: Promise<T> = new Promise((resolve, reject) => {
      const startTime = Date.now();
      const pollCondition = async () => {
        evaluateCondition().then((value) => {
          const elapsed = Date.now() - startTime;
          if (value) {
            resolve(value);
          } else if (timeout && elapsed >= timeout) {
            try {
              let timeoutMessage = resolveWaitMessage(message);
              reject(new error.TimeoutError(`${timeoutMessage}Wait timed out after ${elapsed}ms`));
            } catch (ex: any) {
              reject(new error.TimeoutError(`${ex.message}\nWait timed out after ${elapsed}ms`));
            }
          } else {
            setTimeout(pollCondition, pollTimeout);
          }
        }, reject);
      };
      pollCondition();
    });
    if (condition instanceof WebElementCondition) {
      result = result.then((value) => {
        if (!(value instanceof WebElement)) {
          throw TypeError(
            "WebElementCondition did not resolve to a WebElement: " +
            Object.prototype.toString.call(value)
          );
        }
        return value;
      }) as Promise<T>;
      return new WebElementPromise(this, result as Promise<WebElement>) as unknown as Promise<T>;
    }
    return result;
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getWindowHandle(): Promise<string> {
    return this.execute(new command.Command(command.Name.GET_CURRENT_WINDOW_HANDLE));
  }

  getAllWindowHandles(): Promise<string[]> {
    return this.execute(new command.Command(command.Name.GET_WINDOW_HANDLES));
  }

  getPageSource(): Promise<string> {
    return this.execute(new command.Command(command.Name.GET_PAGE_SOURCE));
  }

  close(): Promise<void> {
    return this.execute(new command.Command(command.Name.CLOSE));
  }

  get(url: string): Promise<void> {
    return this.navigate().to(url);
  }

  getCurrentUrl(): Promise<string> {
    return this.execute(new command.Command(command.Name.GET_CURRENT_URL));
  }

  getTitle(): Promise<string> {
    return this.execute(new command.Command(command.Name.GET_TITLE));
  }

  findElement(locator: any): WebElementPromise {
    let id: any;
    let cmd: command.Command | null = null;
    if (locator instanceof RelativeBy) {
      cmd = new command.Command(command.Name.FIND_ELEMENTS_RELATIVE).setParameter("args", locator.marshall());
    } else {
      locator = by.getLocator(locator);
    }
    if (typeof locator === "function") {
      id = this.findElementInternal_(locator, this);
      return new WebElementPromise(this, id);
    } else if (cmd === null) {
      cmd = new command.Command(command.Name.FIND_ELEMENT)
        .setParameter("using", locator.using)
        .setParameter("value", locator.value);
    }
    id = this.execute(cmd);
    if (locator instanceof RelativeBy) {
      return new WebElementPromise(this, this.normalize_(id));
    } else {
      return new WebElementPromise(this, id);
    }
  }

  async normalize_(webElementPromise: Promise<WebElement[]>): Promise<WebElement> {
    let result = await webElementPromise;
    if (result.length === 0) {
      throw new NoSuchElementError("Cannot locate an element with provided parameters");
    } else {
      return result[0];
    }
  }

  async findElementInternal_(
    locatorFn: (context: any) => any,
    context: any
  ): Promise<WebElement> {
    let result = await locatorFn(context);
    if (Array.isArray(result)) {
      result = result[0];
    }
    if (!(result instanceof WebElement)) {
      throw new TypeError("Custom locator did not return a WebElement");
    }
    return result;
  }

  async findElements(locator: any): Promise<WebElement[]> {
    let cmd: command.Command | null = null;
    if (locator instanceof RelativeBy) {
      cmd = new command.Command(command.Name.FIND_ELEMENTS_RELATIVE).setParameter("args", locator.marshall());
    } else {
      locator = by.getLocator(locator);
    }
    if (typeof locator === "function") {
      return this.findElementsInternal_(locator, this);
    } else if (cmd === null) {
      cmd = new command.Command(command.Name.FIND_ELEMENTS)
        .setParameter("using", locator.using)
        .setParameter("value", locator.value);
    }
    try {
      let res = await this.execute(cmd);
      return Array.isArray(res) ? res : [];
    } catch (ex: any) {
      if (ex instanceof error.NoSuchElementError) {
        return [];
      }
      throw ex;
    }
  }

  async findElementsInternal_(
    locatorFn: (context: any) => any,
    context: any
  ): Promise<WebElement[]> {
    const result = await locatorFn(context);
    if (result instanceof WebElement) {
      return [result];
    }
    if (!Array.isArray(result)) {
      return [];
    }
    return result.filter((item: any) => item instanceof WebElement);
  }

  takeScreenshot(): Promise<string> {
    return this.execute(new command.Command(command.Name.SCREENSHOT));
  }

  setDelayEnabled(enabled: boolean): Promise<any> {
    return this.execute(
      new command.Command(command.Name.SET_DELAY_ENABLED).setParameter("enabled", enabled)
    );
  }

  resetCooldown(): Promise<any> {
    return this.execute(new command.Command(command.Name.RESET_COOLDOWN));
  }

  getFederalCredentialManagementDialog(): Dialog {
    return new Dialog(this);
  }

  manage(): Options {
    return new Options(this);
  }

  navigate(): Navigation {
    return new Navigation(this);
  }

  switchTo(): TargetLocator {
    return new TargetLocator(this);
  }

  script(): Script {
    if (this.#script === undefined) {
      this.#script = new Script(this);
    }
    return this.#script;
  }

  network(): Network {
    if (this.#network === undefined) {
      this.#network = new Network(this);
    }
    return this.#network;
  }

  validatePrintPageParams(keys: any, object: any): any {
    let page: any = {};
    let margin: any = {};
    let data: any;
    Object.keys(keys).forEach((key) => {
      data = keys[key];
      const obj: { [k: string]: () => void } = {
        orientation: () => {
          object.orientation = data;
        },
        scale: () => {
          object.scale = data;
        },
        background: () => {
          object.background = data;
        },
        width: () => {
          page.width = data;
          object.page = page;
        },
        height: () => {
          page.height = data;
          object.page = page;
        },
        top: () => {
          margin.top = data;
          object.margin = margin;
        },
        left: () => {
          margin.left = data;
          object.margin = margin;
        },
        bottom: () => {
          margin.bottom = data;
          object.margin = margin;
        },
        right: () => {
          margin.right = data;
          object.margin = margin;
        },
        shrinkToFit: () => {
          object.shrinkToFit = data;
        },
        pageRanges: () => {
          object.pageRanges = data;
        },
      };
      if (!Object.prototype.hasOwnProperty.call(obj, key)) {
        throw new error.InvalidArgumentError(`Invalid Argument '${key}'`);
      } else {
        obj[key]();
      }
    });
    return object;
  }

  printPage(options: any = {}): Promise<any> {
    let keys = options;
    let params: any = {};
    this.validatePrintPageParams(keys, params);
    return this.execute(
      new command.Command(command.Name.PRINT_PAGE).setParameters(params)
    );
  }

  async createCDPConnection(target: string): Promise<any> {
    let debuggerUrl: string | null = null;
    const caps = await this.getCapabilities();
    if (caps["map_"].get("browserName") === "firefox") {
      throw new Error("CDP support for Firefox is removed. Please switch to WebDriver BiDi.");
    }
    if (process.env.SELENIUM_REMOTE_URL) {
      const host = new URL(process.env.SELENIUM_REMOTE_URL).host;
      const sessionId = await this.getSession().then((session: any) => session.getId());
      debuggerUrl = `ws://${host}/session/${sessionId}/se/cdp`;
    } else {
      const seCdp = caps["map_"].get("se:cdp");
      const vendorInfo =
        caps["map_"].get("goog:chromeOptions") ||
        caps["map_"].get("ms:edgeOptions") ||
        new Map();
      debuggerUrl = seCdp || vendorInfo["debuggerAddress"] || vendorInfo;
    }
    this._wsUrl = await this.getWsUrl(debuggerUrl!, target, caps);
    return new Promise((resolve, reject) => {
      try {
        this._cdpWsConnection = new WebSocket(this._wsUrl.replace("localhost", "127.0.0.1"));
        this._cdpConnection = new cdp.CdpConnection(this._cdpWsConnection);
      } catch (err) {
        reject(err);
        return;
      }
      this._cdpWsConnection.on("open", async () => {
        await this.getCdpTargets();
      });
      this._cdpWsConnection.on("message", async (message: string) => {
        const params = JSON.parse(message);
        if (params.result) {
          if (params.result.targetInfos) {
            const targets = params.result.targetInfos;
            const page = targets.find((info: any) => info.type === "page");
            if (page) {
              this.targetID = page.targetId;
              this._cdpConnection.execute(
                "Target.attachToTarget",
                { targetId: this.targetID, flatten: true },
                null
              );
            } else {
              reject("Unable to find Page target.");
            }
          }
          if (params.result.sessionId) {
            this.sessionId = params.result.sessionId;
            this._cdpConnection.sessionId = this.sessionId;
            resolve(this._cdpConnection);
          }
        }
      });
      this._cdpWsConnection.on("error", (error: any) => {
        reject(error);
      });
    });
  }

  async getCdpTargets(): Promise<void> {
    this._cdpConnection.execute("Target.getTargets");
  }

  async getBidi(): Promise<any> {
    if (this._bidiConnection === undefined) {
      const caps = await this.getCapabilities();
      let WebSocketUrl = caps["map_"].get("webSocketUrl");
      this._bidiConnection = new BIDI(WebSocketUrl.replace("localhost", "127.0.0.1"));
    }
    return this._bidiConnection;
  }

  async getWsUrl(debuggerAddress: string, target: string, caps: any): Promise<string> {
    if (target && cdpTargets.indexOf(target.toLowerCase()) === -1) {
      throw new error.InvalidArgumentError("invalid target value");
    }
    if (debuggerAddress.match(/\/se\/cdp/)) {
      return debuggerAddress;
    }
    let p: string;
    if (target === "page" && caps["map_"].get("browserName") !== "firefox") {
      p = "/json";
    } else if (target === "page" && caps["map_"].get("browserName") === "firefox") {
      p = "/json/list";
    } else {
      p = "/json/version";
    }
    let request = new http.Request("GET", p);
    let client = new http.HttpClient("http://" + debuggerAddress);
    let response = await client.send(request);
    if (target.toLowerCase() === "page") {
      return JSON.parse(response.body)[0]["webSocketDebuggerUrl"];
    } else {
      return JSON.parse(response.body)["webSocketDebuggerUrl"];
    }
  }

  async register(username: string, password: string, connection: any): Promise<void> {
    this._cdpWsConnection?.on("message", (message: string) => {
      const params = JSON.parse(message);
      if (params.method === "Fetch.authRequired") {
        const requestParams = params["params"];
        connection.execute("Fetch.continueWithAuth", {
          requestId: requestParams["requestId"],
          authChallengeResponse: {
            response: "ProvideCredentials",
            username: username,
            password: password,
          },
        });
      } else if (params.method === "Fetch.requestPaused") {
        const requestPausedParams = params["params"];
        connection.execute("Fetch.continueRequest", {
          requestId: requestPausedParams["requestId"],
        });
      }
    });
    await connection.execute("Fetch.enable", { handleAuthRequests: true }, null);
    await connection.execute("Network.setCacheDisabled", { cacheDisabled: true }, null);
  }

  async onIntercept(connection: any, httpResponse: any, callback: () => void): Promise<void> {
    this._cdpWsConnection?.on("message", (message: string) => {
      const params = JSON.parse(message);
      if (params.method === "Fetch.requestPaused") {
        const requestPausedParams = params["params"];
        if (requestPausedParams.request.url == httpResponse.urlToIntercept) {
          connection.execute("Fetch.fulfillRequest", {
            requestId: requestPausedParams["requestId"],
            responseCode: httpResponse.status,
            responseHeaders: httpResponse.headers,
            body: httpResponse.body,
          });
          callback();
        } else {
          connection.execute("Fetch.continueRequest", {
            requestId: requestPausedParams["requestId"],
          });
        }
      }
    });
    await connection.execute("Fetch.enable", {}, null);
    await connection.execute("Network.setCacheDisabled", { cacheDisabled: true }, null);
  }

  async onLogEvent(connection: any, callback: (event: any) => void): Promise<void> {
    this._cdpWsConnection?.on("message", (message: string) => {
      const params = JSON.parse(message);
      if (params.method === "Runtime.consoleAPICalled") {
        const consoleEventParams = params["params"];
        let event = {
          type: consoleEventParams["type"],
          timestamp: new Date(consoleEventParams["timestamp"]),
          args: consoleEventParams["args"],
        };
        callback(event);
      }
      if (params.method === "Log.entryAdded") {
        const logEventParams = params["params"];
        const logEntry = logEventParams["entry"];
        let event = {
          level: logEntry["level"],
          timestamp: new Date(logEntry["timestamp"]),
          message: logEntry["text"],
        };
        callback(event);
      }
    });
    await connection.execute("Runtime.enable", {}, null);
  }

  async onLogException(connection: any, callback: (event: any) => void): Promise<void> {
    await connection.execute("Runtime.enable", {}, null);
    this._cdpWsConnection?.on("message", (message: string) => {
      const params = JSON.parse(message);
      if (params.method === "Runtime.exceptionThrown") {
        const exceptionEventParams = params["params"];
        let event = {
          exceptionDetails: exceptionEventParams["exceptionDetails"],
          timestamp: new Date(exceptionEventParams["timestamp"]),
        };
        callback(event);
      }
    });
  }

  async logMutationEvents(connection: any, callback: (event: any) => void): Promise<void> {
    await connection.execute("Runtime.enable", {}, null);
    await connection.execute("Page.enable", {}, null);
    await connection.execute("Runtime.addBinding", { name: "__webdriver_attribute" }, null);
    let mutationListener = "";
    try {
      mutationListener = fs
        .readFileSync("./javascript/selenium-webdriver/lib/atoms/mutation-listener.js", "utf-8")
        .toString();
    } catch {
      mutationListener = fs.readFileSync(path.resolve(__dirname, "./atoms/mutation-listener.js"), "utf-8").toString();
    }
    this.executeScript(mutationListener);
    await connection.execute(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: mutationListener },
      null
    );
    this._cdpWsConnection?.on("message", async (message: string) => {
      const params = JSON.parse(message);
      if (params.method === "Runtime.bindingCalled") {
        let payload = JSON.parse(params["params"]["payload"]);
        let elements = await this.findElements({
          css: "*[data-__webdriver_id=" + by.escapeCss(payload["target"]) + "]",
        });
        if (elements.length === 0) {
          return;
        }
        let event = {
          element: elements[0],
          attribute_name: payload["name"],
          current_value: payload["value"],
          old_value: payload["oldValue"],
        };
        callback(event);
      }
    });
  }

  async pinScript(script: string): Promise<PinnedScript> {
    let pinnedScript = new PinnedScript(script);
    let connection: any;
    if (this._cdpConnection === undefined) {
      connection = await this.createCDPConnection("page");
    } else {
      connection = this._cdpConnection;
    }
    await connection.execute("Page.enable", {}, null);
    await connection.execute("Runtime.evaluate", { expression: pinnedScript.creationScript() }, null);
    let result = await connection.send("Page.addScriptToEvaluateOnNewDocument", {
      source: pinnedScript.creationScript(),
    });
    pinnedScript.scriptId = result["result"]["identifier"];
    this.pinnedScripts_[pinnedScript.handle] = pinnedScript;
    return pinnedScript;
  }

  async unpinScript(script: PinnedScript): Promise<void> {
    if (!(script instanceof PinnedScript)) {
      throw Error(`Pass valid PinnedScript object. Received: ${script}`);
    }
    if (script.handle in this.pinnedScripts_) {
      let connection: any;
      if (this._cdpConnection === undefined) {
        connection = await this.createCDPConnection("page");
      } else {
        connection = this._cdpConnection;
      }
      await connection.execute("Page.enable", {}, null);
      await connection.execute("Runtime.evaluate", { expression: script.removalScript() }, null);
      await connection.execute("Page.removeScriptToEvaluateOnLoad", { identifier: script.scriptId }, null);
      delete this.pinnedScripts_[script.handle];
    }
  }

  virtualAuthenticatorId(): any {
    return this.authenticatorId_;
  }

  async addVirtualAuthenticator(options: { toDict: () => { [key: string]: any } }): Promise<void> {
    const data = options.toDict();
    data["authenticatorId"] = this.authenticatorId_;
    // Ensure credentialId is defined if required by command parameters.
    if (data["credentialId"] === undefined) {
      data["credentialId"] = "";
    }
    this.authenticatorId_ = await this.execute(
      new command.Command(command.Name.ADD_VIRTUAL_AUTHENTICATOR).setParameters(data)
    );
  }

  async removeVirtualAuthenticator(): Promise<void> {
    await this.execute(
      new command.Command(command.Name.REMOVE_VIRTUAL_AUTHENTICATOR).setParameter(
        "authenticatorId",
        this.authenticatorId_
      )
    );
    this.authenticatorId_ = null;
  }

  async addCredential(credential: { toDict: () => { [key: string]: any } }): Promise<void> {
    const data = credential.toDict();
    data["authenticatorId"] = this.authenticatorId_;
    if (data["credentialId"] === undefined) {
      data["credentialId"] = "";
    }
    await this.execute(new command.Command(command.Name.ADD_CREDENTIAL).setParameters(data));
  }

  async getCredentials(): Promise<any[]> {
    let credential_data = await this.execute(
      new command.Command(command.Name.GET_CREDENTIALS).setParameter("authenticatorId", this.virtualAuthenticatorId())
    );
    const credential_list: any[] = [];
    for (let i = 0; i < credential_data.length; i++) {
      credential_list.push(Credential.fromDict(credential_data[i]));
    }
    return credential_list;
  }

  async removeCredential(credential_id: any): Promise<void> {
    if (Array.isArray(credential_id)) {
      credential_id = Buffer.from(credential_id).toString("base64url");
    }
    const cmd = new command.Command(command.Name.REMOVE_CREDENTIAL);
    cmd.setParameter("credentialId", credential_id);
    cmd.setParameter("authenticatorId", this.authenticatorId_);
    await this.execute(cmd);
  }

  async removeAllCredentials(): Promise<void> {

    const cmd = new command.Command(command.Name.REMOVE_ALL_CREDENTIALS);
    cmd.setParameter("authenticatorId", this.authenticatorId_)
    await this.execute(cmd)
  }

  async setUserVerified(verified: boolean): Promise<void> {
    await this.execute(
      new command.Command(command.Name.SET_USER_VERIFIED)
        .setParameter("authenticatorId", this.authenticatorId_)
        .setParameter("isUserVerified", verified)
    );
  }

  async getDownloadableFiles(): Promise<any> {
    const caps = await this.getCapabilities();
    if (!caps["map_"].get("se:downloadsEnabled")) {
      throw new error.WebDriverError("Downloads must be enabled in options");
    }
    return (await this.execute(new command.Command(command.Name.GET_DOWNLOADABLE_FILES))).names;
  }

  async downloadFile(fileName: string, targetDirectory: string): Promise<void> {
    const caps = await this.getCapabilities();
    if (!caps["map_"].get("se:downloadsEnabled")) {
      throw new Error("Downloads must be enabled in options");
    }
    const response = await this.execute(
      new command.Command(command.Name.DOWNLOAD_FILE).setParameter("name", fileName)
    );
    const base64Content = response.contents;
    if (!targetDirectory.endsWith("/")) {
      targetDirectory += "/";
    }
    fs.mkdirSync(targetDirectory, { recursive: true });
    const zipFilePath = path.join(targetDirectory, `${fileName}.zip`);
    fs.writeFileSync(zipFilePath, Buffer.from(base64Content, "base64"));
    const zipData = fs.readFileSync(zipFilePath);
    await JSZip.loadAsync(zipData)
      .then((zip) => {
        Object.keys(zip.files).forEach(async (fileName) => {
          const fileData = await zip.files[fileName].async("nodebuffer");
          fs.writeFileSync(`${targetDirectory}/${fileName}`, fileData);
          console.log(`File extracted: ${fileName}`);
        });
      })
      .catch((error) => {
        console.error("Error unzipping file:", error);
      });
  }

  async deleteDownloadableFiles(): Promise<any> {
    const caps = await this.getCapabilities();
    if (!caps["map_"].get("se:downloadsEnabled")) {
      throw new error.WebDriverError("Downloads must be enabled in options");
    }
    return await this.execute(new command.Command(command.Name.DELETE_DOWNLOADABLE_FILES));
  }
}

///////////////////////
// Navigation class
///////////////////////

class Navigation {
  private driver_: IWebDriver;
  constructor(driver: IWebDriver) {
    this.driver_ = driver;
  }
  to(url: string): Promise<void> {
    return this.driver_.execute(new command.Command(command.Name.GET).setParameter("url", url));
  }
  back(): Promise<void> {
    return this.driver_.execute(new command.Command(command.Name.GO_BACK));
  }
  forward(): Promise<void> {
    return this.driver_.execute(new command.Command(command.Name.GO_FORWARD));
  }
  refresh(): Promise<void> {
    return this.driver_.execute(new command.Command(command.Name.REFRESH));
  }
}

///////////////////////
// Options class
///////////////////////

class Options {
  private driver_: IWebDriver;
  constructor(driver: IWebDriver) {
    this.driver_ = driver;
  }
  addCookie({
    name,
    value,
    path,
    domain,
    secure,
    httpOnly,
    expiry,
    sameSite,
  }: {
    name: string;
    value: string;
    path?: string;
    domain?: string;
    secure?: boolean;
    httpOnly?: boolean;
    expiry?: number | Date;
    sameSite?: string;
  }): Promise<void> {
    if (/[;=]/.test(name)) {
      throw new error.InvalidArgumentError('Invalid cookie name "' + name + '"');
    }
    if (/;/.test(value)) {
      throw new error.InvalidArgumentError('Invalid cookie value "' + value + '"');
    }
    if (typeof expiry === "number") {
      expiry = Math.floor(expiry);
    } else if (expiry instanceof Date) {
      expiry = Math.floor(expiry.getTime() / 1000);
    }
    if (sameSite && !["Strict", "Lax", "None"].includes(sameSite)) {
      throw new error.InvalidArgumentError(
        `Invalid sameSite cookie value '${sameSite}'. It should be one of "Lax", "Strict" or "None"`
      );
    }
    if (sameSite === "None" && !secure) {
      throw new error.InvalidArgumentError("Invalid cookie configuration: SameSite=None must be Secure");
    }
    return this.driver_.execute(
      new command.Command(command.Name.ADD_COOKIE).setParameter("cookie", {
        name: name,
        value: value,
        path: path,
        domain: domain,
        secure: !!secure,
        httpOnly: !!httpOnly,
        expiry: expiry,
        sameSite: sameSite,
      })
    );
  }
  deleteAllCookies(): Promise<void> {
    return this.driver_.execute(new command.Command(command.Name.DELETE_ALL_COOKIES));
  }
  deleteCookie(name: string): Promise<void> {
    if (!name?.trim()) {
      throw new error.InvalidArgumentError("Cookie name cannot be empty");
    }
    return this.driver_.execute(
      new command.Command(command.Name.DELETE_COOKIE).setParameter("name", name)
    );
  }
  getCookies(): Promise<any[]> {
    return this.driver_.execute(new command.Command(command.Name.GET_ALL_COOKIES));
  }
  async getCookie(name: string): Promise<any | null> {
    if (!name?.trim()) {
      throw new error.InvalidArgumentError("Cookie name cannot be empty");
    }
    try {
      const cookie = await this.driver_.execute(
        new command.Command(command.Name.GET_COOKIE).setParameter("name", name)
      );
      return cookie;
    } catch (err: any) {
      if (!(err instanceof error.UnknownCommandError) && !(err instanceof error.UnsupportedOperationError)) {
        throw err;
      }
      return null;
    }
  }
  getTimeouts(): Promise<{ script: number; pageLoad: number; implicit: number }> {
    return this.driver_.execute(new command.Command(command.Name.GET_TIMEOUT));
  }
  setTimeouts({
    script,
    pageLoad,
    implicit,
  }: { script?: number | null; pageLoad?: number | null; implicit?: number | null } = {}): Promise<void> {
    let cmd = new command.Command(command.Name.SET_TIMEOUT);
    let valid = false;
    function setParam(key: string, value: number | null | undefined) {
      if (value === null || typeof value === "number") {
        valid = true;
        cmd.setParameter(key, value);
      } else if (typeof value !== "undefined") {
        throw TypeError(
          'invalid timeouts configuration: expected "' + key + '" to be a number, got ' + typeof value
        );
      }
    }
    setParam("implicit", implicit);
    setParam("pageLoad", pageLoad);
    setParam("script", script);
    if (valid) {
      return this.driver_.execute(cmd).catch(() => {
        const cmds: Promise<void>[] = [];
        if (typeof script === "number") {
          cmds.push(legacyTimeout(this.driver_, "script", script));
        }
        if (typeof implicit === "number") {
          cmds.push(legacyTimeout(this.driver_, "implicit", implicit));
        }
        if (typeof pageLoad === "number") {
          cmds.push(legacyTimeout(this.driver_, "page load", pageLoad));
        }
        return Promise.all(cmds).then(() => {});
      });
    }
    throw TypeError("no timeouts specified");
  }
  logs(): Logs {
    return new Logs(this.driver_);
  }
  window(): Window {
    return new Window(this.driver_);
  }
}

///////////////////////
// Window class
///////////////////////

class Window {
  private driver_: IWebDriver;
  private log_ = logging.getLogger(logging.Type.DRIVER);
  constructor(driver: IWebDriver) {
    this.driver_ = driver;
  }
  getRect(): Promise<{ x: number; y: number; width: number; height: number }> {
    return this.driver_.execute(new command.Command(command.Name.GET_WINDOW_RECT));
  }
  setRect({
    x,
    y,
    width,
    height,
  }: { x?: number; y?: number; width?: number; height?: number }): Promise<{ x: number; y: number; width: number; height: number }> {
    return this.driver_.execute(
      new command.Command(command.Name.SET_WINDOW_RECT).setParameters({
        x,
        y,
        width,
        height,
      })
    );
  }
  maximize(): Promise<void> {
    return this.driver_.execute(
      new command.Command(command.Name.MAXIMIZE_WINDOW).setParameter("windowHandle", "current")
    );
  }
  minimize(): Promise<void> {
    return this.driver_.execute(new command.Command(command.Name.MINIMIZE_WINDOW));
  }
  fullscreen(): Promise<void> {
    return this.driver_.execute(new command.Command(command.Name.FULLSCREEN_WINDOW));
  }
  async getSize(windowHandle: string = "current"): Promise<{ width: number; height: number }> {
    if (windowHandle !== "current") {
      this.log_.warning(`Only 'current' window is supported for W3C compatible browsers.`);
    }
    const rect = await this.getRect();
    return { width: rect.width, height: rect.height };
  }
  async setSize(
    { x = 0, y = 0, width = 0, height = 0 }: { x?: number; y?: number; width?: number; height?: number },
    windowHandle: string = "current"
  ): Promise<void> {
    if (windowHandle !== "current") {
      this.log_.warning(`Only 'current' window is supported for W3C compatible browsers.`);
    }
    await this.setRect({ x, y, width, height });
  }
}

///////////////////////
// Logs class
///////////////////////

class Logs {
  private driver_: IWebDriver;
  constructor(driver: IWebDriver) {
    this.driver_ = driver;
  }
  get(type: LogType): Promise<Entry[]> {
    const cmd = new command.Command(command.Name.GET_LOG).setParameter("type", type);
    return this.driver_.execute(cmd).then((entries: any[]) => {
      return entries.map((entry) => {
        if (!(entry instanceof Entry)) {
          return new Entry(entry["level"], entry["message"], entry["timestamp"], entry["type"]);
        }
        return entry;
      });
    });
  }
  getAvailableLogTypes(): Promise<LogType[]> {
    return this.driver_.execute(new command.Command(command.Name.GET_AVAILABLE_LOG_TYPES));
  }
}

///////////////////////
// TargetLocator class
///////////////////////

class TargetLocator {
  private driver_: IWebDriver;
  constructor(driver: IWebDriver) {
    this.driver_ = driver;
  }
  activeElement(): WebElementPromise {
    const id = this.driver_.execute(new command.Command(command.Name.GET_ACTIVE_ELEMENT));
    return new WebElementPromise(this.driver_, id);
  }
  defaultContent(): Promise<void> {
    return this.driver_.execute(new command.Command(command.Name.SWITCH_TO_FRAME).setParameter("id", null));
  }
  frame(id: number | string | WebElement | null): Promise<void> {
    let frameReference: any = id;
    if (typeof id === "string") {
      frameReference = this.driver_.findElement({ id }).catch((_) => this.driver_.findElement({ name: id }));
    }
    return this.driver_.execute(new command.Command(command.Name.SWITCH_TO_FRAME).setParameter("id", frameReference));
  }
  parentFrame(): Promise<void> {
    return this.driver_.execute(new command.Command(command.Name.SWITCH_TO_FRAME_PARENT));
  }
  window(nameOrHandle: string): Promise<void> {
    return this.driver_.execute(
      new command.Command(command.Name.SWITCH_TO_WINDOW)
        .setParameter("name", nameOrHandle)
        .setParameter("handle", nameOrHandle)
    );
  }
  newWindow(typeHint: string): Promise<void> {
    const driver = this.driver_;
    return this.driver_
      .execute(new command.Command(command.Name.SWITCH_TO_NEW_WINDOW).setParameter("type", typeHint))
      .then((response: any) => driver.switchTo().window(response.handle));
  }
  alert(): AlertPromise {
    const text = this.driver_.execute(new command.Command(command.Name.GET_ALERT_TEXT));
    const driver = this.driver_;
    return new AlertPromise(driver, text.then((text: string) => new Alert(driver, text)));
  }
}

///////////////////////
// WebElement class
///////////////////////

const LEGACY_ELEMENT_ID_KEY = "ELEMENT";
const ELEMENT_ID_KEY = "element-6066-11e4-a52e-4f735466cecf";
const SHADOW_ROOT_ID_KEY = "shadow-6066-11e4-a52e-4f735466cecf";

class WebElement {
  private driver_: IWebDriver;
  private id_: Promise<string>;
  private log_ = logging.getLogger(logging.Type.DRIVER);
  constructor(driver: IWebDriver, id: Promise<string> | string) {
    this.driver_ = driver;
    this.id_ = Promise.resolve(id);
  }
  static buildId(id: string, noLegacy: boolean = false): any {
    return noLegacy
      ? { [ELEMENT_ID_KEY]: id }
      : { [ELEMENT_ID_KEY]: id, [LEGACY_ELEMENT_ID_KEY]: id };
  }
  static extractId(obj: any): string {
    return webElement.extractId(obj);
  }
  static isId(obj: any): boolean {
    return webElement.isId(obj);
  }
  static async equals(a: WebElement, b: WebElement): Promise<boolean> {
    if (a === b) {
      return true;
    }
    return a.driver_.executeScript("return arguments[0] === arguments[1]", a, b);
  }
  getDriver(): IWebDriver {
    return this.driver_;
  }
  getId(): Promise<string> {
    return this.id_;
  }
  [Symbols.serialize](): Promise<any> {
    return this.getId().then(WebElement.buildId);
  }
  execute_(cmd: command.Command): Promise<any> {
    cmd.setParameter("id", this);
    return this.driver_.execute(cmd);
  }
  findElement(locator: any): WebElementPromise {
    locator = by.getLocator(locator);
    let id: any;
    if (typeof locator === "function") {
      id = (this.driver_ as WebDriver).findElementInternal_(locator, this);
    } else {
      let cmd = new command.Command(command.Name.FIND_CHILD_ELEMENT)
        .setParameter("using", locator.using)
        .setParameter("value", locator.value);
      id = this.execute_(cmd);
    }
    return new WebElementPromise(this.driver_, id);
  }
  async findElements(locator: any): Promise<WebElement[]> {
    locator = by.getLocator(locator);
    if (typeof locator === "function") {
      return (this.driver_ as WebDriver).findElementsInternal_(locator, this);
    } else {
      let cmd = new command.Command(command.Name.FIND_CHILD_ELEMENTS)
        .setParameter("using", locator.using)
        .setParameter("value", locator.value);
      let result = await this.execute_(cmd);
      return Array.isArray(result) ? result : [];
    }
  }
  click(): Promise<void> {
    return this.execute_(new command.Command(command.Name.CLICK_ELEMENT));
  }
  async sendKeys(...args: any[]): Promise<void> {
    // Build an array of individual key characters.
    const keysArray: string[] = [];
    const resolvedArgs = await Promise.all(args);
    resolvedArgs.forEach((key: any) => {
      if (typeof key === "number") {
        key = String(key);
      } else if (typeof key !== "string") {
        throw new TypeError("each key must be a number or string; got " + typeof key);
      }
      // Spread the string into individual characters.
      keysArray.push(...key);
    });

    const driverImpl = this.driver_ as WebDriver;
    // If no file detector is set, send the keys directly.
    if (!driverImpl.fileDetector_) {
      return this.execute_(
        new command.Command(command.Name.SEND_KEYS_TO_ELEMENT)
          .setParameter("text", keysArray.join(""))
          .setParameter("value", keysArray)
      );
    }

    // Join the keys array into a string.
    let keysText: string = keysArray.join("");
    try {
      // Use fileDetector_ to possibly transform the input.
      keysText = await driverImpl.fileDetector_.handleFile(driverImpl,
        keysText);
    } catch (ex: any) {
      this.log_.severe("Error trying parse string as a file with file detector; sending keys instead" + ex);
      // Fall back to the original joined string.
    }

    return this.execute_(
      new command.Command(command.Name.SEND_KEYS_TO_ELEMENT)
        .setParameter("text", keysText)
        .setParameter("value", keysText.split(""))
    );
  }
  getTagName(): Promise<string> {
    return this.execute_(new command.Command(command.Name.GET_ELEMENT_TAG_NAME));
  }
  getCssValue(cssStyleProperty: string): Promise<string> {
    const name = command.Name.GET_ELEMENT_VALUE_OF_CSS_PROPERTY;
    return this.execute_(new command.Command(name).setParameter("propertyName", cssStyleProperty));
  }
  getAttribute(attributeName: string): Promise<string | null> {
    return this.execute_(new command.Command(command.Name.GET_ELEMENT_ATTRIBUTE).setParameter("name", attributeName));
  }
  getDomAttribute(attributeName: string): Promise<string | null> {
    return this.execute_(new command.Command(command.Name.GET_DOM_ATTRIBUTE).setParameter("name", attributeName));
  }
  getProperty(propertyName: string): Promise<string> {
    return this.execute_(new command.Command(command.Name.GET_ELEMENT_PROPERTY).setParameter("name", propertyName));
  }
  getShadowRoot(): Promise<ShadowRoot> {
    return this.execute_(new command.Command(command.Name.GET_SHADOW_ROOT));
  }
  getText(): Promise<string> {
    return this.execute_(new command.Command(command.Name.GET_ELEMENT_TEXT));
  }
  getAriaRole(): Promise<string> {
    return this.execute_(new command.Command(command.Name.GET_COMPUTED_ROLE));
  }
  getAccessibleName(): Promise<string> {
    return this.execute_(new command.Command(command.Name.GET_COMPUTED_LABEL));
  }
  getRect(): Promise<{ width: number; height: number; x: number; y: number }> {
    return this.execute_(new command.Command(command.Name.GET_ELEMENT_RECT));
  }
  isEnabled(): Promise<boolean> {
    return this.execute_(new command.Command(command.Name.IS_ELEMENT_ENABLED));
  }
  isSelected(): Promise<boolean> {
    return this.execute_(new command.Command(command.Name.IS_ELEMENT_SELECTED));
  }
  submit(): Promise<void> {
    const script =
      "/* submitForm */var form = arguments[0];\n" +
      'while (form.nodeName != "FORM" && form.parentNode) {\n' +
      "  form = form.parentNode;\n" +
      "}\n" +
      "if (!form) { throw Error('Unable to find containing form element'); }\n" +
      "if (!form.ownerDocument) { throw Error('Unable to find owning document'); }\n" +
      "var e = form.ownerDocument.createEvent('Event');\n" +
      "e.initEvent('submit', true, true);\n" +
      "if (form.dispatchEvent(e)) { HTMLFormElement.prototype.submit.call(form) }\n";
    return this.driver_.executeScript(script, this);
  }
  clear(): Promise<void> {
    return this.execute_(new command.Command(command.Name.CLEAR_ELEMENT));
  }
  isDisplayed(): Promise<boolean> {
    return this.execute_(new command.Command(command.Name.IS_ELEMENT_DISPLAYED));
  }
  takeScreenshot(): Promise<string> {
    return this.execute_(new command.Command(command.Name.TAKE_ELEMENT_SCREENSHOT));
  }
}

///////////////////////
// WebElementPromise class
///////////////////////

class WebElementPromise extends WebElement implements Promise<WebElement> {
  then: <TResult1 = WebElement, TResult2 = never>(
    onfulfilled?: ((value: WebElement) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ) => Promise<TResult1 | TResult2>;
  catch: <TResult = never>(
    onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ) => Promise<WebElement | TResult>;
  [Symbol.toStringTag]: string;
  constructor(driver: IWebDriver, el: Promise<WebElement>) {
    super(driver, "unused");
    this.then = el.then.bind(el);
    this.catch = el.catch.bind(el);
    this.getId = async function () {
      const resolved = await el
      return await resolved.getId()
    };
  }

  finally (onfinally?: (() => void) | undefined | null): Promise<WebElement> {
    return Promise.resolve(undefined)
  }
}

///////////////////////
// ShadowRoot class
///////////////////////

class ShadowRoot {
  private driver_: IWebDriver;
  private id_: string;
  constructor(driver: IWebDriver, id: string) {
    this.driver_ = driver;
    this.id_ = id;
  }
  static extractId(obj: any): string {
    if (obj && typeof obj === "object") {
      if (typeof obj[SHADOW_ROOT_ID_KEY] === "string") {
        return obj[SHADOW_ROOT_ID_KEY];
      }
    }
    throw new TypeError("object is not a ShadowRoot ID");
  }
  static isId(obj: any): boolean {
    return obj && typeof obj === "object" && typeof obj[SHADOW_ROOT_ID_KEY] === "string";
  }
  [Symbols.serialize](): string | Promise<string> {
    return this.getId();
  }
  execute_(cmd: command.Command): Promise<any> {
    cmd.setParameter("id", this);
    return this.driver_.execute(cmd);
  }
  findElement(locator: any): ShadowRootPromise {
    locator = by.getLocator(locator);
    let id: any;
    if (typeof locator === "function") {
      id = (this.driver_ as WebDriver).findElementInternal_(locator, this);
    } else {
      let cmd = new command.Command(command.Name.FIND_ELEMENT_FROM_SHADOWROOT)
        .setParameter("using", locator.using)
        .setParameter("value", locator.value);
      id = this.execute_(cmd);
    }
    return new ShadowRootPromise(this.driver_, id);
  }
  async findElements(locator: any): Promise<WebElement[]> {
    locator = by.getLocator(locator);
    if (typeof locator === "function") {
      return (this.driver_ as WebDriver).findElementsInternal_(locator, this);
    } else {
      let cmd = new command.Command(command.Name.FIND_ELEMENTS_FROM_SHADOWROOT)
        .setParameter("using", locator.using)
        .setParameter("value", locator.value);
      let result = await this.execute_(cmd);
      return Array.isArray(result) ? result : [];
    }
  }
  getId(): string | Promise<string> {
    return this.id_;
  }
}

///////////////////////
// ShadowRootPromise class
///////////////////////

class ShadowRootPromise extends ShadowRoot implements Promise<ShadowRoot> {
  then: <TResult1 = ShadowRoot, TResult2 = never>(
    onfulfilled?: ((value: ShadowRoot) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ) => Promise<TResult1 | TResult2>;
  catch: <TResult = never>(
    onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ) => Promise<ShadowRoot | TResult>;
  [Symbol.toStringTag]: string;
  constructor(driver: IWebDriver, shadow: Promise<ShadowRoot>) {
    super(driver, "unused");
    this.then = shadow.then.bind(shadow);
    this.catch = shadow.catch.bind(shadow);
    this.getId = async function () {
      const resolved = await shadow
      return resolved.getId()
    };
  }

  finally (onfinally?: (() => void) | undefined | null): Promise<ShadowRoot> {
    return Promise.resolve(undefined)
  }
}

///////////////////////
// Alert class
///////////////////////

class Alert {
  private driver_: IWebDriver;
  private text_: Promise<string>;
  constructor(driver: IWebDriver, text: string) {
    this.driver_ = driver;
    this.text_ = Promise.resolve(text);
  }
  getText(): Promise<string> {
    return this.text_;
  }
  accept(): Promise<void> {
    return this.driver_.execute(new command.Command(command.Name.ACCEPT_ALERT));
  }
  dismiss(): Promise<void> {
    return this.driver_.execute(new command.Command(command.Name.DISMISS_ALERT));
  }
  sendKeys(text: string): Promise<void> {
    return this.driver_.execute(
      new command.Command(command.Name.SET_ALERT_TEXT).setParameter("text", text)
    );
  }
}

///////////////////////
// AlertPromise class
///////////////////////

class AlertPromise extends Alert implements Promise<Alert> {
  then: <TResult1 = Alert, TResult2 = never>(
    onfulfilled?: ((value: Alert) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ) => Promise<TResult1 | TResult2>;
  catch: <TResult = never>(
    onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ) => Promise<Alert | TResult>;
  [Symbol.toStringTag]: string;
  constructor(driver: IWebDriver, alert: Promise<Alert>) {
    super(driver, "unused");
    this.then = alert.then.bind(alert);
    this.catch = alert.catch.bind(alert);
    this.getText = async function () {
      const resolved = await alert
      return await resolved.getText()
    };
    this.accept = async function () {
      const resolved = await alert
      return await resolved.accept()
    };
    this.dismiss = async function () {
      const resolved = await alert
      return await resolved.dismiss()
    };
    this.sendKeys = async function (text: string) {
      const resolved = await alert
      return await resolved.sendKeys(text)
    };
  }

  finally (onfinally?: (() => void) | undefined | null): Promise<Alert> {
    return Promise.resolve(undefined)
  }
}

export {
  Alert,
  AlertPromise,
  Condition,
  Logs,
  Navigation,
  Options,
  ShadowRoot,
  TargetLocator,
  IWebDriver,
  WebDriver,
  WebElement,
  WebElementCondition,
  WebElementPromise,
  Window,
};
