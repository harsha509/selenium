import logInspector from '../bidi/logInspector';
import scriptManager from '../bidi/scriptManager';
import { LocalValue, ChannelValue } from '../bidi/protocolValue';
import fs from 'node:fs';
import path from 'node:path';
import * as by from './by';

/** Minimal interface representing a WebDriver (or similar) driver. */
interface Driver {
  getWindowHandle(): Promise<string>;
  findElements(options: { css: string }): Promise<WebElement[]>;
}

/** Minimal marker interface for a web element. */
interface WebElement {}

/** Represents the inspector object returned by logInspector. */
interface LogInspector {
  onJavascriptException(callback: (error: unknown) => void): Promise<number>;
  removeCallback(id: number): Promise<void>;
  onConsoleEntry(callback: (entry: unknown) => void): Promise<number>;
}

/** Represents the object returned by scriptManager. */
interface ScriptManager {
  addPreloadScript(script: string, argumentValues: unknown[]): Promise<number>;
  onMessage(callback: (message: Message) => Promise<void>): Promise<number>;
  removeCallback(id: number): Promise<void>;
  removePreloadScript(id: number): Promise<void>;
  callFunctionInBrowsingContext(
    browsingContextId: string,
    script: string,
    requireUserActivation: boolean,
    argumentList: unknown[]
  ): Promise<{ result: unknown }>;
}

/** Represents a message sent by the preload script. */
interface Message {
  data: { value: string };
}

/** Defines the event signature for DOM mutations. */
interface DomMutationEvent {
  element: WebElement;
  attribute_name: string;
  current_value: string;
  old_value: string;
}

/**
 * The Script class provides methods for:
 * - Adding/removing JavaScript error and console message handlers,
 * - Setting up DOM mutation listeners,
 * - Pinning/unpinning preload scripts, and
 * - Executing JavaScript in a browsing context.
 *
 * Since certain initialization steps require asynchronous calls,
 * private async methods (#init and #initScript) ensure the inspector and script
 * manager are properly set up on first use.
 */
class Script {
  #driver: Driver;
  #logInspector: LogInspector | undefined;
  #script: ScriptManager | undefined;

  constructor(driver: Driver) {
    this.#driver = driver;
  }

  /**
   * Ensures that the log inspector is initialized.
   */
  async #init(): Promise<void> {
    if (this.#logInspector !== undefined) {
      return;
    }
    this.#logInspector = await logInspector(this.#driver);
  }

  /**
   * Ensures that the script manager is initialized.
   */
  async #initScript(): Promise<void> {
    if (this.#script !== undefined) {
      return;
    }
    this.#script = await scriptManager([], this.#driver);
  }

  /**
   * Adds a JavaScript error handler by registering a callback.
   * @param callback A function invoked when a JavaScript exception occurs.
   * @returns A promise that resolves to the callback identifier.
   */
  async addJavaScriptErrorHandler(callback: (error: unknown) => void): Promise<number> {
    await this.#init();
    return await this.#logInspector!.onJavascriptException(callback);
  }

  /**
   * Removes a previously registered JavaScript error handler.
   * @param id The identifier returned when adding the handler.
   */
  async removeJavaScriptErrorHandler(id: number): Promise<void> {
    await this.#init();
    await this.#logInspector!.removeCallback(id);
  }

  /**
   * Adds a handler for console messages.
   * @param callback A function to be invoked when a console message is received.
   * @returns A promise that resolves to the callback identifier.
   */
  async addConsoleMessageHandler(callback: (entry: unknown) => void): Promise<number> {
    await this.#init();
    return await this.#logInspector!.onConsoleEntry(callback);
  }

  /**
   * Removes a previously registered console message handler.
   * @param id The identifier returned when adding the handler.
   */
  async removeConsoleMessageHandler(id: number): Promise<void> {
    await this.#init();
    await this.#logInspector!.removeCallback(id);
  }

  /**
   * Adds a handler for DOM mutation events.
   * The method reads a preload script from the local "atoms" directory
   * and then registers a message handler that, upon receiving a mutation event,
   * locates the affected element and triggers the supplied callback.
   *
   * @param callback A function invoked when a DOM mutation is detected.
   * @returns A promise that resolves to the identifier for the mutation handler.
   */
  async addDomMutationHandler(callback: (event: DomMutationEvent) => void): Promise<number> {
    await this.#initScript();

    const argumentValues: unknown[] = [];
    const value = LocalValue.createChannelValue(new ChannelValue('channel_name'));
    argumentValues.push(value);

    const filePath = path.join(__dirname, 'atoms', 'bidi-mutation-listener.js');
    const mutationListener = fs.readFileSync(filePath, 'utf-8').toString();
    await this.#script!.addPreloadScript(mutationListener, argumentValues);

    const id = await this.#script!.onMessage(async (message: Message) => {
      const payload = JSON.parse(message.data.value) as {
        target: string;
        name: string;
        value: string;
        oldValue: string;
      };

      const elements = await this.#driver.findElements({
        css: '*[data-__webdriver_id=' + by.escapeCss(payload.target) + ']',
      });

      if (elements.length === 0) {
        return;
      }

      const event: DomMutationEvent = {
        element: elements[0],
        attribute_name: payload.name,
        current_value: payload.value,
        old_value: payload.oldValue,
      };
      callback(event);
    });

    return id;
  }

  /**
   * Removes a previously added DOM mutation handler.
   * @param id The identifier returned when adding the handler.
   */
  async removeDomMutationHandler(id: number): Promise<void> {
    await this.#initScript();
    await this.#script!.removeCallback(id);
  }

  /**
   * Adds a preload script (pins a script) for later use.
   * @param script The JavaScript source to preload.
   * @returns A promise that resolves to the script identifier.
   */
  async pin(script: string): Promise<number> {
    await this.#initScript();
    return await this.#script!.addPreloadScript(script, []);
  }

  /**
   * Removes a previously pinned script.
   * @param id The identifier of the preload script to remove.
   */
  async unpin(id: number): Promise<void> {
    await this.#initScript();
    await this.#script!.removePreloadScript(id);
  }

  /**
   * Executes a function in the current browsing context.
   * @param script The JavaScript function to call (as a string).
   * @param args Additional arguments to pass to the script.
   * @returns A promise that resolves with the result of the script execution.
   */
  async execute(script: string, ...args: unknown[]): Promise<unknown> {
    await this.#initScript();
    const browsingContextId = await this.#driver.getWindowHandle();

    const argumentList: unknown[] = [];
    args.forEach((arg) => {
      argumentList.push(LocalValue.getArgument(arg));
    });

    const response = await this.#script!.callFunctionInBrowsingContext(
      browsingContextId,
      script,
      true,
      argumentList
    );

    return response.result;
  }
}

export default Script;
