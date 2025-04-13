/*******************************************************************************
 * Licensed to the Software Freedom Conservancy (SFC) under one or more
 * contributor license agreements.  See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership.
 * The SFC licenses this file to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  See the
 * License for the specific language governing permissions and limitations
 * under the License.
 ******************************************************************************/

'use strict';

// Imports from other modules. Ensure these modules have proper TypeScript declarations.
import { Command, Name } from './command';
import { InvalidArgumentError } from './error';
import { WebElement, WebDriver } from './webdriver';

// Minimal Executor interface needed for Actions.
export interface Executor {
  execute(command: Command): Promise<unknown>;
}

/* --------------------------------------------------------------------------
 * Button
 * ----------------------------------------------------------------------- */
// Using an enum to represent the advanced interaction API buttons.
enum Button {
  LEFT = 0,
  MIDDLE = 1,
  RIGHT = 2,
  BACK = 3,
  FORWARD = 4,
}

/* --------------------------------------------------------------------------
 * Key
 * ----------------------------------------------------------------------- */
export interface KeyInterface {
  NULL: string;
  CANCEL: string;
  HELP: string;
  BACK_SPACE: string;
  TAB: string;
  CLEAR: string;
  RETURN: string;
  ENTER: string;
  SHIFT: string;
  CONTROL: string;
  ALT: string;
  PAUSE: string;
  ESCAPE: string;
  SPACE: string;
  PAGE_UP: string;
  PAGE_DOWN: string;
  END: string;
  HOME: string;
  ARROW_LEFT: string;
  LEFT: string;
  ARROW_UP: string;
  UP: string;
  ARROW_RIGHT: string;
  RIGHT: string;
  ARROW_DOWN: string;
  DOWN: string;
  INSERT: string;
  DELETE: string;
  SEMICOLON: string;
  EQUALS: string;
  NUMPAD0: string;
  NUMPAD1: string;
  NUMPAD2: string;
  NUMPAD3: string;
  NUMPAD4: string;
  NUMPAD5: string;
  NUMPAD6: string;
  NUMPAD7: string;
  NUMPAD8: string;
  NUMPAD9: string;
  MULTIPLY: string;
  ADD: string;
  SEPARATOR: string;
  SUBTRACT: string;
  DECIMAL: string;
  DIVIDE: string;
  F1: string;
  F2: string;
  F3: string;
  F4: string;
  F5: string;
  F6: string;
  F7: string;
  F8: string;
  F9: string;
  F10: string;
  F11: string;
  F12: string;
  COMMAND: string;
  META: string;
  ZENKAKU_HANKAKU: string;
  chord(...keys: string[]): string;
}

const Key: KeyInterface = {
  NULL: '\uE000',
  CANCEL: '\uE001', // ^break
  HELP: '\uE002',
  BACK_SPACE: '\uE003',
  TAB: '\uE004',
  CLEAR: '\uE005',
  RETURN: '\uE006',
  ENTER: '\uE007',
  SHIFT: '\uE008',
  CONTROL: '\uE009',
  ALT: '\uE00A',
  PAUSE: '\uE00B',
  ESCAPE: '\uE00C',
  SPACE: '\uE00D',
  PAGE_UP: '\uE00E',
  PAGE_DOWN: '\uE00F',
  END: '\uE010',
  HOME: '\uE011',
  ARROW_LEFT: '\uE012',
  LEFT: '\uE012',
  ARROW_UP: '\uE013',
  UP: '\uE013',
  ARROW_RIGHT: '\uE014',
  RIGHT: '\uE014',
  ARROW_DOWN: '\uE015',
  DOWN: '\uE015',
  INSERT: '\uE016',
  DELETE: '\uE017',
  SEMICOLON: '\uE018',
  EQUALS: '\uE019',
  NUMPAD0: '\uE01A',
  NUMPAD1: '\uE01B',
  NUMPAD2: '\uE01C',
  NUMPAD3: '\uE01D',
  NUMPAD4: '\uE01E',
  NUMPAD5: '\uE01F',
  NUMPAD6: '\uE020',
  NUMPAD7: '\uE021',
  NUMPAD8: '\uE022',
  NUMPAD9: '\uE023',
  MULTIPLY: '\uE024',
  ADD: '\uE025',
  SEPARATOR: '\uE026',
  SUBTRACT: '\uE027',
  DECIMAL: '\uE028',
  DIVIDE: '\uE029',
  F1: '\uE031',
  F2: '\uE032',
  F3: '\uE033',
  F4: '\uE034',
  F5: '\uE035',
  F6: '\uE036',
  F7: '\uE037',
  F8: '\uE038',
  F9: '\uE039',
  F10: '\uE03A',
  F11: '\uE03B',
  F12: '\uE03C',
  COMMAND: '\uE03D',
  META: '\uE03D', // alias for Windows key
  ZENKAKU_HANKAKU: '\uE040',
  chord(...keys: string[]): string {
    return keys.join('') + Key.NULL;
  },
};

/* --------------------------------------------------------------------------
 * FileDetector
 * ----------------------------------------------------------------------- */
class FileDetector {
  /**
   * Handles the file specified by the given path, preparing it for use with
   * the current browser.
   *
   * @param driver The driver for the current browser.
   * @param path The path to process.
   * @return A promise for the processed file path.
   */
  handleFile(driver: WebDriver, path: string): Promise<string> {
    return Promise.resolve(path);
  }
}

/* --------------------------------------------------------------------------
 * Action
 * ----------------------------------------------------------------------- */
class Action {
  type!: Action.Type;
  duration?: number;
  value?: string;
  button?: Button;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  pressure?: number;
  tangentialPressure?: number;
  tiltX?: number;
  tiltY?: number;
  twist?: number;
  altitudeAngle?: number;
  azimuthAngle?: number;
  // For pointer move and wheel scroll
  origin?: Origin | WebElement;
  deltaX?: number;
  deltaY?: number;
}

namespace Action {
  export enum Type {
    KEY_DOWN = 'keyDown',
    KEY_UP = 'keyUp',
    PAUSE = 'pause',
    POINTER_DOWN = 'pointerDown',
    POINTER_UP = 'pointerUp',
    POINTER_MOVE = 'pointerMove',
    POINTER_CANCEL = 'pointerCancel',
    SCROLL = 'scroll',
  }
}

/* --------------------------------------------------------------------------
 * Device
 * ----------------------------------------------------------------------- */
abstract class Device {
  private readonly type_: Device.Type;
  private readonly id_: string;

  constructor(type: Device.Type, id: string) {
    this.type_ = type;
    this.id_ = id;
  }

  toJSON(): { type: Device.Type; id: string } {
    return {
      type: this.type_,
      id: this.id_,
    };
  }
}

namespace Device {
  export enum Type {
    KEY = 'key',
    NONE = 'none',
    POINTER = 'pointer',
    WHEEL = 'wheel',
  }
}

/* --------------------------------------------------------------------------
 * Keyboard
 * ----------------------------------------------------------------------- */
class Keyboard extends Device {
  constructor(id: string) {
    super(Device.Type.KEY, id);
  }

  keyDown(key: string | number): Action {
    return { type: Action.Type.KEY_DOWN, value: checkCodePoint(key) };
  }

  keyUp(key: string | number): Action {
    return { type: Action.Type.KEY_UP, value: checkCodePoint(key) };
  }
}

/* --------------------------------------------------------------------------
 * checkCodePoint
 * ----------------------------------------------------------------------- */
/**
 * Checks and converts a given key to a single code point.
 *
 * @param key A string (with a single code point) or a number.
 * @return The string representation of the key.
 * @throws {InvalidArgumentError|RangeError}
 */
export function checkCodePoint(key: string | number): string {
  if (typeof key === 'number') {
    return String.fromCodePoint(key);
  }
  if (typeof key !== 'string') {
    throw new InvalidArgumentError(`key is not a string: ${key}`);
  }
  key = key.normalize();
  if ([...key].length !== 1) {
    throw new InvalidArgumentError(`key input is not a single code point: ${key}`);
  }
  return key;
}

/* --------------------------------------------------------------------------
 * Origin
 * ----------------------------------------------------------------------- */
// Defines the reference point from which pointer offset is computed.
enum Origin {
  POINTER = 'pointer',
  VIEWPORT = 'viewport',
}

/* --------------------------------------------------------------------------
 * Pointer
 * ----------------------------------------------------------------------- */
export interface MoveOptions {
  x?: number;
  y?: number;
  duration?: number;
  origin?: Origin | WebElement;
  width?: number;
  height?: number;
  pressure?: number;
  tangentialPressure?: number;
  tiltX?: number;
  tiltY?: number;
  twist?: number;
  altitudeAngle?: number;
  azimuthAngle?: number;
}

// @ts-ignore
class Pointer extends Device {
  private readonly pointerType_: Pointer.Type;

  constructor(id: string, type: Pointer.Type) {
    super(Device.Type.POINTER, id);
    this.pointerType_ = type;
  }

  toJSON(): { type: Device.Type; id: string; parameters: { pointerType: Pointer.Type } } {
    return Object.assign({ parameters: { pointerType: this.pointerType_ } }, super.toJSON());
  }

  cancel(): Action {
    return { type: Action.Type.POINTER_CANCEL };
  }

  press(
    button: Button = Button.LEFT,
    width: number = 0,
    height: number = 0,
    pressure: number = 0,
    tangentialPressure: number = 0,
    tiltX: number = 0,
    tiltY: number = 0,
    twist: number = 0,
    altitudeAngle: number = 0,
    azimuthAngle: number = 0
  ): Action {
    return {
      type: Action.Type.POINTER_DOWN,
      button,
      width,
      height,
      pressure,
      tangentialPressure,
      tiltX,
      tiltY,
      twist,
      altitudeAngle,
      azimuthAngle,
    };
  }

  release(button: Button = Button.LEFT): Action {
    return { type: Action.Type.POINTER_UP, button };
  }

  move(options: MoveOptions = {}): Action {
    const {
      x = 0,
      y = 0,
      duration = 100,
      origin = Origin.VIEWPORT,
      width = 0,
      height = 0,
      pressure = 0,
      tangentialPressure = 0,
      tiltX = 0,
      tiltY = 0,
      twist = 0,
      altitudeAngle = 0,
      azimuthAngle = 0,
    } = options;
    return {
      type: Action.Type.POINTER_MOVE,
      origin,
      duration,
      x,
      y,
      width,
      height,
      pressure,
      tangentialPressure,
      tiltX,
      tiltY,
      twist,
      altitudeAngle,
      azimuthAngle,
    };
  }
}

namespace Pointer {
  export enum Type {
    MOUSE = 'mouse',
    PEN = 'pen',
    TOUCH = 'touch',
  }
}

/* --------------------------------------------------------------------------
 * Wheel
 * ----------------------------------------------------------------------- */
class Wheel extends Device {
  constructor(id: string) {
    super(Device.Type.WHEEL, id);
  }

  scroll(
    x: number,
    y: number,
    deltaX: number,
    deltaY: number,
    origin: WebElement,
    duration: number
  ): Action {
    return {
      type: Action.Type.SCROLL,
      duration,
      x,
      y,
      deltaX,
      deltaY,
      origin,
    };
  }
}

/* --------------------------------------------------------------------------
 * Actions
 * ----------------------------------------------------------------------- */
class Actions {
  private executor_: Executor;
  private sync_: boolean;
  private keyboard_: Keyboard;
  private mouse_: Pointer;
  private wheel_: Wheel;
  private sequences_: Map<Device, Action[]>;

  constructor(executor: Executor, { async = false }: { async?: boolean } = {}) {
    this.executor_ = executor;
    this.sync_ = !async;
    this.keyboard_ = new Keyboard('default keyboard');
    // @ts-ignore
    this.mouse_ = new Pointer('default mouse', Pointer.Type.MOUSE);
    this.wheel_ = new Wheel('default wheel');
    this.sequences_ = new Map<Device, Action[]>([
      [this.keyboard_, []],
      [this.mouse_, []],
      [this.wheel_, []],
    ]);
  }

  keyboard(): Keyboard {
    return this.keyboard_;
  }

  mouse(): Pointer {
    return this.mouse_;
  }

  wheel(): Wheel {
    return this.wheel_;
  }

  private sequence_(device: Device): Action[] {
    let sequence = this.sequences_.get(device);
    if (sequence === undefined) {
      sequence = [];
      this.sequences_.set(device, sequence);
    }
    return sequence;
  }

  insert(device: Device, ...actions: Action[]): Actions {
    this.sequence_(device).push(...actions);
    return this.sync_ ? this.synchronize() : this;
  }

  synchronize(...devices: Device[]): Actions {
    let sequences: Action[][] = [];
    let max = 0;
    if (devices.length === 0) {
      for (const s of this.sequences_.values()) {
        max = Math.max(max, s.length);
      }
      sequences = Array.from(this.sequences_.values());
    } else {
      for (const device of devices) {
        const seq = this.sequence_(device);
        max = Math.max(max, seq.length);
        sequences.push(seq);
      }
    }
    const pause: Action = { type: Action.Type.PAUSE, duration: 0 };
    for (const seq of sequences) {
      while (seq.length < max) {
        seq.push(pause);
      }
    }
    return this;
  }

  pause(durationOrDevice: number | Device = 0, ...devices: Device[]): Actions {
    let duration: number;
    if (durationOrDevice instanceof Device) {
      devices.unshift(durationOrDevice);
      duration = 0;
    } else {
      duration = durationOrDevice;
    }
    const action: Action = { type: Action.Type.PAUSE, duration };
    const iterable = devices.length === 0 ? Array.from(this.sequences_.keys()) : devices;
    for (const device of iterable) {
      this.sequence_(device).push(action);
    }
    return this.sync_ ? this.synchronize() : this;
  }

  keyDown(key: string | number): Actions {
    return this.insert(this.keyboard_, this.keyboard_.keyDown(key));
  }

  keyUp(key: string | number): Actions {
    return this.insert(this.keyboard_, this.keyboard_.keyUp(key));
  }

  sendKeys(...keys: Array<string | number | WebElement>): Actions {
    const actions: Action[] = [];
    // If the first key is a WebElement, assume it is the target element for clicking.
    if (keys.length > 1 && keys[0] instanceof WebElement) {
      this.click(keys[0] as WebElement);
      keys.shift();
    }
    for (const key of keys) {
      if (typeof key === 'string') {
        for (const symbol of key) {
          actions.push(this.keyboard_.keyDown(symbol), this.keyboard_.keyUp(symbol));
        }
      } else if (typeof key === 'number') {
        actions.push(this.keyboard_.keyDown(key), this.keyboard_.keyUp(key));
      } else {
        // If a WebElement appears (other than as the first element),
        // the original logic does not define a behavior.
      }
    }
    return this.insert(this.keyboard_, ...actions);
  }

  press(button: Button = Button.LEFT): Actions {
    return this.insert(this.mouse_, this.mouse_.press(button));
  }

  release(button: Button = Button.LEFT): Actions {
    return this.insert(this.mouse_, this.mouse_.release(button));
  }

  scroll(
    x: number,
    y: number,
    targetDeltaX: number,
    targetDeltaY: number,
    origin: WebElement,
    duration: number
  ): Actions {
    return this.insert(this.wheel_, this.wheel_.scroll(x, y, targetDeltaX, targetDeltaY, origin, duration));
  }

  move(options: { x?: number; y?: number; duration?: number; origin?: Origin | WebElement } = {}): Actions {
    const { x = 0, y = 0, duration = 100, origin = Origin.VIEWPORT } = options;
    return this.insert(this.mouse_, this.mouse_.move({ x, y, duration, origin }));
  }

  click(element?: WebElement): Actions {
    if (element !== undefined) {
      this.move({ origin: element });
    }
    return this.press().release();
  }

  contextClick(element?: WebElement): Actions {
    if (element !== undefined) {
      this.move({ origin: element });
    }
    return this.press(Button.RIGHT).release(Button.RIGHT);
  }

  doubleClick(element?: WebElement): Actions {
    return this.click(element).press().release();
  }

  dragAndDrop(from: WebElement, to: WebElement | { x: number; y: number }): Actions {
    if (!(to instanceof WebElement) && (typeof to !== 'object' || typeof to.x !== 'number' || typeof to.y !== 'number')) {
      throw new InvalidArgumentError('Invalid drag target; must specify a WebElement or {x, y} offset');
    }
    this.move({ origin: from }).press();
    if (to instanceof WebElement) {
      this.move({ origin: to });
    } else {
      this.move({ x: to.x, y: to.y, origin: Origin.POINTER });
    }
    return this.release();
  }

  clear(): Promise<void> {
    for (const s of this.sequences_.values()) {
      s.length = 0;
    }
    return this.executor_.execute(new Command(Name.CLEAR_ACTIONS)) as Promise<void>;
  }

  async perform(): Promise<void> {
    const _actions: Array<{ actions: Action[] } & ReturnType<Device['toJSON']>> = [];
    this.sequences_.forEach((actions, device) => {
      if (!isIdle(actions)) {
        const actionsCopy = actions.concat();
        _actions.push(Object.assign({ actions: actionsCopy }, device.toJSON()));
      }
    });
    if (_actions.length === 0) {
      return Promise.resolve();
    }
    await this.executor_.execute(new Command(Name.ACTIONS).setParameter('actions', _actions));
  }

  getSequences(): Array<{ actions: Action[] } & ReturnType<Device['toJSON']>> {
    const _actions: Array<{ actions: Action[] } & ReturnType<Device['toJSON']>> = [];
    this.sequences_.forEach((actions, device) => {
      if (!isIdle(actions)) {
        const actionsCopy = actions.concat();
        _actions.push(Object.assign({ actions: actionsCopy }, device.toJSON()));
      }
    });
    return _actions;
  }
}

/**
 * Returns true if the sequence contains no actionable steps or only pauses with no duration.
 *
 * @param actions The action sequence.
 * @return True if idle.
 */
export function isIdle(actions: Action[]): boolean {
  return actions.length === 0 || actions.every((a) => a.type === Action.Type.PAUSE && !a.duration);
}

/* --------------------------------------------------------------------------
 * INTERNAL_COMPUTE_OFFSET_SCRIPT
 * ----------------------------------------------------------------------- */
const INTERNAL_COMPUTE_OFFSET_SCRIPT: string = `
function computeOffset(el) {
  var rect = el.getClientRects()[0];
  var left = Math.max(0, Math.min(rect.x, rect.x + rect.width));
  var right = Math.min(window.innerWidth, Math.max(rect.x, rect.x + rect.width));
  var top = Math.max(0, Math.min(rect.y, rect.y + rect.height));
  var bot = Math.min(window.innerHeight, Math.max(rect.y, rect.y + rect.height));
  var x = Math.floor(0.5 * (left + right));
  var y = Math.floor(0.5 * (top + bot));
  var bbox = el.getBoundingClientRect();
  return [x - bbox.left, y - bbox.top];
}
return computeOffset(arguments[0]);
`;

/* --------------------------------------------------------------------------
 * Public API Export
 * ----------------------------------------------------------------------- */
export {
  Action, // For documentation only.
  Actions,
  Button,
  Device,
  Key,
  Keyboard,
  FileDetector,
  Origin,
  Pointer,
  INTERNAL_COMPUTE_OFFSET_SCRIPT,
};
