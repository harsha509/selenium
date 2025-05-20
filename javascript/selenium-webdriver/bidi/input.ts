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

// type: module added to package.json
import { WebElement } from '../lib/webdriver';
import { RemoteReferenceType, ReferenceValue } from './protocolValue';

interface WebDriver {
  getCapabilities(): Promise<Map<string, any>>;
  getBidi(): Promise<any>;
}

interface BiDiCommand {
  method: string;
  params: Record<string, any>;
}

interface ActionSequence {
  type: string;
  origin?: WebElement | any;
  [key: string]: any;
}

interface Action {
  type: string;
  actions: ActionSequence[];
  [key: string]: any;
}

/**
 * Represents commands and events related to the Input module (simulated user input).
 * Described in https://w3c.github.io/webdriver-bidi/#module-input.
 */
class Input {
  private _driver: WebDriver;
  bidi: any;

  constructor(driver: WebDriver) {
    this._driver = driver
  }

  async init(): Promise<void> {
    if (!(await this._driver.getCapabilities()).get('webSocketUrl')) {
      throw Error('WebDriver instance must support BiDi protocol')
    }

    this.bidi = await this._driver.getBidi()
  }

  /**
   * Performs the specified actions on the given browsing context.
   *
   * @param {string} browsingContextId - The ID of the browsing context.
   * @param {Array} actions - The actions to be performed.
   * @returns {Promise} A promise that resolves with the response from the server.
   */
  async perform(browsingContextId: string, actions: Action[]): Promise<any> {
    const _actions = await updateActions(actions)

    const command: BiDiCommand = {
      method: 'input.performActions',
      params: {
        context: browsingContextId,
        actions: _actions,
      },
    }

    return await this.bidi.send(command)
  }

  /**
   * Resets the input state in the specified browsing context.
   *
   * @param {string} browsingContextId - The ID of the browsing context.
   * @returns {Promise} A promise that resolves when the release actions are sent.
   */
  async release(browsingContextId: string): Promise<any> {
    const command: BiDiCommand = {
      method: 'input.releaseActions',
      params: {
        context: browsingContextId,
      },
    }
    return await this.bidi.send(command)
  }

  /**
   * Sets the files property of a given input element.
   *
   * @param {string} browsingContextId - The ID of the browsing context.
   * @param {string | ReferenceValue} element - The ID of the element or a ReferenceValue object representing the element.
   * @param {string | string[]} files - The file path or an array of file paths to be set.
   * @throws {Error} If the element is not a string or a ReferenceValue.
   * @returns {Promise<void>} A promise that resolves when the files are set.
   */
  async setFiles(browsingContextId: string, element: string | ReferenceValue, files: string | string[]): Promise<void> {
    if (typeof element !== 'string' && !(element instanceof ReferenceValue)) {
      throw Error(`Pass in a WebElement id as a string or a ReferenceValue. Received: ${element}`)
    }

    const command: BiDiCommand = {
      method: 'input.setFiles',
      params: {
        context: browsingContextId,
        element:
          typeof element === 'string'
            ? new ReferenceValue(RemoteReferenceType.SHARED_ID, element).asMap()
            : element.asMap(),
        files: typeof files === 'string' ? [files] : files,
      },
    }
    await this.bidi.send(command)
  }
}

async function updateActions(actions: Action[]): Promise<Action[]> {
  const _actions: Action[] = []
  for (const action of actions) {
    const sequenceList = action.actions
    let updatedSequenceList: ActionSequence[] = []

    if (action.type === 'pointer' || action.type === 'wheel') {
      for (const sequence of sequenceList) {
        if ((sequence.type === 'pointerMove' || sequence.type === 'scroll') && sequence.origin instanceof WebElement) {
          const element = sequence.origin
          const elementId = await element.getId()
          sequence.origin = {
            type: 'element',
            element: { sharedId: elementId },
          }
        }
        updatedSequenceList.push(sequence)
      }

      const updatedAction = { ...action, actions: updatedSequenceList }
      _actions.push(updatedAction)
    } else {
      _actions.push(action)
    }
  }

  return _actions
}

async function getInputInstance(driver: WebDriver): Promise<Input> {
  let instance = new Input(driver)
  await instance.init()
  return instance
}

export default getInputInstance;
