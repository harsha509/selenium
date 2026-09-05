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
 * @fileoverview Defines types related to user input with the WebDriver API.
 */

import { Command, Name } from './command'
import { InvalidArgumentError } from './error'
import { WebDriver, WebElement } from './webdriver'

/**
 * Enumeration of the buttons used in the advanced interactions API.
 */
export const Button = {
  LEFT: 0,
  MIDDLE: 1,
  RIGHT: 2,
  BACK: 3,
  FORWARD: 4,
} as const

export type Button = (typeof Button)[keyof typeof Button]

/**
 * Representations of pressable keys that aren't text.  These are stored in
 * the Unicode PUA (Private Use Area) code points, 0xE000-0xF8FF.  Refer to
 * http://www.google.com.au/search?&q=unicode+pua&btnK=Search
 *
 * @see <https://www.w3.org/TR/webdriver/#keyboard-actions>
 */
export const Key = {
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

  NUMPAD0: '\uE01A', // number pad keys
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

  F1: '\uE031', // function keys
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

  COMMAND: '\uE03D', // Apple command key
  META: '\uE03D', // alias for Windows key

  /**
   * Japanese modifier key for switching between full- and half-width
   * characters.
   * @see <https://en.wikipedia.org/wiki/Language_input_keys>
   */
  ZENKAKU_HANKAKU: '\uE040',

  /**
   * Simulate pressing many keys at once in a "chord". Takes a sequence of
   * {@linkplain Key keys} or strings, appends each of the values to a string,
   * adds the chord termination key ({@link Key.NULL}) and returns the resulting
   * string.
   *
   * Note: when the low-level webdriver key handlers see Keys.NULL, active
   * modifier keys (CTRL/ALT/SHIFT/etc) release via a keyup event.
   *
   * @param keys The key sequence to concatenate.
   * @return The null-terminated key sequence.
   */
  chord(...keys: string[]): string {
    return keys.join('') + Key.NULL
  },
} as const

/**
 * Used with {@link ./webelement.WebElement#sendKeys WebElement#sendKeys} on
 * file input elements (`<input type="file">`) to detect when the entered key
 * sequence defines the path to a file.
 *
 * By default, {@linkplain ./webelement.WebElement WebElement's} will enter all
 * key sequences exactly as entered. You may set a
 * {@linkplain ./webdriver.WebDriver#setFileDetector file detector} on the
 * parent WebDriver instance to define custom behavior for handling file
 * elements. Of particular note is the
 * {@link selenium-webdriver/remote.FileDetector}, which should be used when
 * running against a remote
 * [Selenium Server](https://selenium.dev/downloads/).
 */
export class FileDetector {
  /**
   * Handles the file specified by the given path, preparing it for use with
   * the current browser. If the path does not refer to a valid file, it will
   * be returned unchanged, otherwise a path suitable for use with the current
   * browser will be returned.
   *
   * This default implementation is a no-op. Subtypes may override this function
   * for custom tailored file handling.
   *
   * @param _driver The driver for the current browser.
   * @param path The path to process.
   * @return A promise for the processed file path.
   */
  handleFile(_driver: WebDriver, path: string): Promise<string> {
    return Promise.resolve(path)
  }
}

/**
 * Generic description of a single action to send to the remote end.
 */
export class Action {
  declare type: ActionType
  declare duration?: number
  declare value?: string
  declare button?: Button
  declare x?: number
  declare y?: number
  declare origin?: Origin | WebElement
  declare width?: number
  declare height?: number
  declare pressure?: number
  declare tangentialPressure?: number
  declare tiltX?: number
  declare tiltY?: number
  declare twist?: number
  declare altitudeAngle?: number
  declare azimuthAngle?: number
  declare deltaX?: number
  declare deltaY?: number

  /**
   * @see <https://w3c.github.io/webdriver/webdriver-spec.html#terminology-0>
   */
  static readonly Type = {
    KEY_DOWN: 'keyDown',
    KEY_UP: 'keyUp',
    PAUSE: 'pause',
    POINTER_DOWN: 'pointerDown',
    POINTER_UP: 'pointerUp',
    POINTER_MOVE: 'pointerMove',
    POINTER_CANCEL: 'pointerCancel',
    SCROLL: 'scroll',
  } as const
}

export type ActionType = (typeof Action.Type)[keyof typeof Action.Type]

/**
 * Device types supported by the WebDriver protocol.
 *
 * @see <https://w3c.github.io/webdriver/webdriver-spec.html#input-source-state>
 */
const DEVICE_TYPES = {
  KEY: 'key',
  NONE: 'none',
  POINTER: 'pointer',
  WHEEL: 'wheel',
} as const

export type DeviceType = (typeof DEVICE_TYPES)[keyof typeof DEVICE_TYPES]

/**
 * The supported types of pointers.
 */
const POINTER_TYPES = {
  MOUSE: 'mouse',
  PEN: 'pen',
  TOUCH: 'touch',
} as const

export type PointerType = (typeof POINTER_TYPES)[keyof typeof POINTER_TYPES]

/**
 * Represents a user input device.
 */
export class Device {
  private readonly type_: string
  private readonly id_: string

  /**
   * @param type the input type.
   * @param id a unique ID for this device.
   */
  constructor(type: string, id: string) {
    this.type_ = type
    this.id_ = id
  }

  /** @return the JSON encoding for this device. */
  toJSON(): { type: string; id: string } {
    return { type: this.type_, id: this.id_ }
  }

  /** Device types supported by the WebDriver protocol; subclasses expose their own maps. */
  static readonly Type: Readonly<Record<string, string>> = DEVICE_TYPES
}

/**
 * @param key
 * @throws {!(InvalidArgumentError|RangeError)}
 */
function checkCodePoint(key: string | number): string {
  if (typeof key === 'number') {
    return String.fromCodePoint(key)
  }

  if (typeof key !== 'string') {
    throw new InvalidArgumentError(`key is not a string: ${key}`)
  }

  key = key.normalize()
  if (Array.from(key).length !== 1) {
    throw new InvalidArgumentError(`key input is not a single code point: ${key}`)
  }
  return key
}

/**
 * Keyboard input device.
 *
 * @see <https://www.w3.org/TR/webdriver/#dfn-key-input-source>
 */
export class Keyboard extends Device {
  /** @param id the device ID. */
  constructor(id: string) {
    super(DEVICE_TYPES.KEY, id)
  }

  /**
   * Generates a key down action.
   *
   * @param key the key to press. This key may be specified as a {@link Key}
   *     value, a specific unicode code point, or a string containing a single
   *     unicode code point.
   * @return a new key down action.
   */
  keyDown(key: string | number): Action {
    return { type: Action.Type.KEY_DOWN, value: checkCodePoint(key) }
  }

  /**
   * Generates a key up action.
   *
   * @param key the key to press. This key may be specified as a {@link Key}
   *     value, a specific unicode code point, or a string containing a single
   *     unicode code point.
   * @return a new key up action.
   */
  keyUp(key: string | number): Action {
    return { type: Action.Type.KEY_UP, value: checkCodePoint(key) }
  }
}

/**
 * Defines the reference point from which to compute offsets for
 * {@linkplain ./input.Pointer#move pointer move} actions.
 */
export const Origin = {
  /** Compute offsets relative to the pointer's current position. */
  POINTER: 'pointer',
  /** Compute offsets relative to the viewport. */
  VIEWPORT: 'viewport',
} as const

export type Origin = (typeof Origin)[keyof typeof Origin]

/** Options for a {@link Pointer#move pointer move} action. */
export interface PointerMoveOptions {
  x?: number
  y?: number
  duration?: number
  origin?: Origin | WebElement
  width?: number
  height?: number
  pressure?: number
  tangentialPressure?: number
  tiltX?: number
  tiltY?: number
  twist?: number
  altitudeAngle?: number
  azimuthAngle?: number
}

/**
 * Pointer input device.
 *
 * @see <https://www.w3.org/TR/webdriver/#dfn-pointer-input-source>
 */
export class Pointer extends Device {
  private readonly pointerType_: string

  /**
   * @param id the device ID.
   * @param type the pointer type.
   */
  constructor(id: string, type: string) {
    super(DEVICE_TYPES.POINTER, id)
    this.pointerType_ = type
  }

  /** @override */
  toJSON(): { parameters: { pointerType: string }; type: string; id: string } {
    return Object.assign({ parameters: { pointerType: this.pointerType_ } }, super.toJSON())
  }

  /**
   * @return An action that cancels this pointer's current input.
   */
  cancel(): Action {
    return { type: Action.Type.POINTER_CANCEL }
  }

  /**
   * @param button The button to press.
   * @param width
   * @param height
   * @param pressure
   * @param tangentialPressure
   * @param tiltX
   * @param tiltY
   * @param twist
   * @param altitudeAngle
   * @param azimuthAngle
   * @return An action to press the specified button with this device.
   */
  press(
    button: Button = Button.LEFT,
    width = 0,
    height = 0,
    pressure = 0,
    tangentialPressure = 0,
    tiltX = 0,
    tiltY = 0,
    twist = 0,
    altitudeAngle = 0,
    azimuthAngle = 0,
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
    }
  }

  /**
   * @param button The button to release.
   * @return An action to release the specified button with this device.
   */
  release(button: Button = Button.LEFT): Action {
    return { type: Action.Type.POINTER_UP, button }
  }

  /**
   * Creates an action for moving the pointer `x` and `y` pixels from the
   * specified `origin`. The `origin` may be defined as the pointer's
   * {@linkplain Origin.POINTER current position}, the
   * {@linkplain Origin.VIEWPORT viewport}, or the center of a specific
   * {@linkplain ./webdriver.WebElement WebElement}.
   *
   * @param options the move options.
   * @return The new action.
   */
  move({
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
  }: PointerMoveOptions): Action {
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
    }
  }

  /** The supported types of pointers. */
  static readonly Type: Readonly<Record<string, string>> = POINTER_TYPES
}

class Wheel extends Device {
  /**
   * @param id the device ID..
   */
  constructor(id: string) {
    super(DEVICE_TYPES.WHEEL, id)
  }

  /**
   * Scrolls a page via the coordinates given
   * @param x starting x coordinate
   * @param y starting y coordinate
   * @param deltaX Delta X to scroll to target
   * @param deltaY Delta Y to scroll to target
   * @param origin element origin
   * @param duration duration ratio be the ratio of time delta and duration
   * @returns An action to scroll with this device.
   */
  scroll(
    x: number,
    y: number,
    deltaX: number,
    deltaY: number,
    origin: Origin | WebElement | undefined,
    duration: number,
  ): Action {
    return {
      type: Action.Type.SCROLL,
      duration: duration,
      x: x,
      y: y,
      deltaX: deltaX,
      deltaY: deltaY,
      origin: origin,
    }
  }
}

/** What {@link Actions} needs to send its sequences to the remote end. */
export interface ActionExecutor {
  execute(command: Command): Promise<unknown>
}

/** One device's action sequence in wire form. */
export type DeviceSequence = { actions: Action[] } & ReturnType<Device['toJSON']>

/**
 * User facing API for generating complex user gestures. This class should not
 * be instantiated directly. Instead, users should create new instances by
 * calling {@link ./webdriver.WebDriver#actions WebDriver.actions()}.
 *
 * ### Action Ticks
 *
 * Action sequences are divided into a series of "ticks". At each tick, the
 * WebDriver remote end will perform a single action for each device included
 * in the action sequence. At tick 0, the driver will perform the first action
 * defined for each device, at tick 1 the second action for each device, and
 * so on until all actions have been executed. If an individual device does
 * not have an action defined at a particular tick, it will automatically
 * pause.
 *
 * By default, action sequences will be synchronized so only one device has a
 * define action in each tick. Consider the following code sample:
 *
 *     const actions = driver.actions();
 *
 *     await actions
 *         .keyDown(SHIFT)
 *         .move({origin: el})
 *         .press()
 *         .release()
 *         .keyUp(SHIFT)
 *         .perform();
 *
 * This sample produces the following sequence of ticks:
 *
 * | Device   | Tick 1         | Tick 2             | Tick 3  | Tick 4    | Tick 5       |
 * | -------- | -------------- | ------------------ | ------- | --------- | ------------ |
 * | Keyboard | keyDown(SHIFT) | pause()            | pause() | pause()   | keyUp(SHIFT) |
 * | Mouse    | pause()        | move({origin: el}) | press() | release() | pause()      |
 *
 * If you'd like the remote end to execute actions with multiple devices
 * simultaneously, you may pass `{async: true}` when creating the actions
 * builder. With synchronization disabled (`{async: true}`), the ticks from our
 * previous example become:
 *
 * | Device   | Tick 1             | Tick 2       | Tick 3    |
 * | -------- | ------------------ | ------------ | --------- |
 * | Keyboard | keyDown(SHIFT)     | keyUp(SHIFT) |           |
 * | Mouse    | move({origin: el}) | press()      | release() |
 *
 * When synchronization is disabled, it is your responsibility to insert
 * {@linkplain #pause() pauses} for each device, as needed:
 *
 *     const actions = driver.actions({async: true});
 *     const kb = actions.keyboard();
 *     const mouse = actions.mouse();
 *
 *     actions.keyDown(SHIFT).pause(kb).pause(kb).key(SHIFT);
 *     actions.pause(mouse).move({origin: el}).press().release();
 *     actions.perform();
 *
 * With pauses insert for individual devices, we're back to:
 *
 * | Device   | Tick 1         | Tick 2             | Tick 3  | Tick 4       |
 * | -------- | -------------- | ------------------ | ------- | ------------ |
 * | Keyboard | keyDown(SHIFT) | pause()            | pause() | keyUp(SHIFT) |
 * | Mouse    | pause()        | move({origin: el}) | press() | release()    |
 *
 * #### Tick Durations
 *
 * The length of each action tick is however long it takes the remote end to
 * execute the actions for every device in that tick. Most actions are
 * "instantaneous", however, {@linkplain #pause pause} and
 * {@linkplain #move pointer move} actions allow you to specify a duration for
 * how long that action should take. The remote end will always wait for all
 * actions within a tick to finish before starting the next tick, so a device
 * may implicitly pause while waiting for other devices to finish.
 *
 * | Device    | Tick 1                | Tick 2  |
 * | --------- | --------------------- | ------- |
 * | Pointer 1 | move({duration: 200}) | press() |
 * | Pointer 2 | move({duration: 300}) | press() |
 *
 * In table above, the move for Pointer 1 should only take 200 ms, but the
 * remote end will wait for the move for Pointer 2 to finish
 * (an additional 100 ms) before proceeding to Tick 2.
 *
 * This implicit waiting also applies to pauses. In the table below, even though
 * the keyboard only defines a pause of 100 ms, the remote end will wait an
 * additional 200 ms for the mouse move to finish before moving to Tick 2.
 *
 * | Device   | Tick 1                | Tick 2         |
 * | -------- | --------------------- | -------------- |
 * | Keyboard | pause(100)            | keyDown(SHIFT) |
 * | Mouse    | move({duration: 300}) |                |
 *
 * [client rect]: https://developer.mozilla.org/en-US/docs/Web/API/Element/getClientRects
 * [bounding client rect]: https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
 *
 * @see <https://www.w3.org/TR/webdriver/#actions>
 */
export class Actions {
  private readonly executor_: ActionExecutor
  private readonly sync_: boolean
  private readonly keyboard_: Keyboard
  private readonly mouse_: Pointer
  private readonly wheel_: Wheel
  private readonly sequences_: Map<Device, Action[]>

  /**
   * @param executor The object to execute the configured actions with.
   * @param options Options for this action sequence (see class description
   *     for details).
   */
  constructor(executor: ActionExecutor, { async = false }: { async?: boolean } = {}) {
    this.executor_ = executor
    this.sync_ = !async
    this.keyboard_ = new Keyboard('default keyboard')
    this.mouse_ = new Pointer('default mouse', POINTER_TYPES.MOUSE)
    this.wheel_ = new Wheel('default wheel')
    this.sequences_ = new Map<Device, Action[]>([
      [this.keyboard_, []],
      [this.mouse_, []],
      [this.wheel_, []],
    ])
  }

  /** @return the keyboard device handle. */
  keyboard(): Keyboard {
    return this.keyboard_
  }

  /** @return the mouse pointer device handle. */
  mouse(): Pointer {
    return this.mouse_
  }

  /** @return the wheel device handle. */
  wheel(): Wheel {
    return this.wheel_
  }

  /**
   * @param device
   */
  private sequence_(device: Device): Action[] {
    let sequence = this.sequences_.get(device)
    if (!sequence) {
      sequence = []
      this.sequences_.set(device, sequence)
    }
    return sequence
  }

  /**
   * Appends `actions` to the end of the current sequence for the given
   * `device`. If device synchronization is enabled, after inserting the
   * actions, pauses will be inserted for all other devices to ensure all action
   * sequences are the same length.
   *
   * @param device the device to update.
   * @param actions the actions to insert.
   * @return a self reference.
   */
  insert(device: Device, ...actions: Action[]): this {
    this.sequence_(device).push(...actions)
    return this.sync_ ? this.synchronize() : this
  }

  /**
   * Ensures the action sequence for every device referenced in this action
   * sequence is the same length. For devices whose sequence is too short,
   * this will insert {@linkplain #pause pauses} so that every device has an
   * explicit action defined at each tick.
   *
   * @param devices The specific devices to synchronize. If unspecified, the
   *     action sequences for every device will be synchronized.
   * @return a self reference.
   */
  synchronize(...devices: Device[]): this {
    let sequences: Iterable<Action[]>
    let max = 0
    if (devices.length === 0) {
      for (const s of this.sequences_.values()) {
        max = Math.max(max, s.length)
      }
      sequences = this.sequences_.values()
    } else {
      const selected: Action[][] = []
      for (const device of devices) {
        const seq = this.sequence_(device)
        max = Math.max(max, seq.length)
        selected.push(seq)
      }
      sequences = selected
    }

    const pause: Action = { type: Action.Type.PAUSE, duration: 0 }
    for (const seq of sequences) {
      while (seq.length < max) {
        seq.push(pause)
      }
    }

    return this
  }

  /**
   * Inserts a pause action for the specified devices, ensuring each device is
   * idle for a tick. The length of the pause (in milliseconds) may be specified
   * as the first parameter to this method (defaults to 0). Otherwise, you may
   * just specify the individual devices that should pause.
   *
   * If no devices are specified, a pause action will be created (using the same
   * duration) for every device.
   *
   * When device synchronization is enabled (the default for new {@link Actions}
   * objects), there is no need to specify devices as pausing one automatically
   * pauses the others for the same duration. In other words, the following are
   * all equivalent:
   *
   *     let a1 = driver.actions();
   *     a1.pause(100).perform();
   *
   *     let a2 = driver.actions();
   *     a2.pause(100, a2.keyboard()).perform();
   *     // Synchronization ensures a2.mouse() is automatically paused too.
   *
   *     let a3 = driver.actions();
   *     a3.pause(100, a3.keyboard(), a3.mouse()).perform();
   *
   * When device synchronization is _disabled_, you can cause individual devices
   * to pause during a tick. For example, to hold the SHIFT key down while
   * moving the mouse:
   *
   *     let actions = driver.actions({async: true});
   *
   *     actions.keyDown(Key.SHIFT);
   *     actions.pause(actions.mouse())  // Pause for shift down
   *         .press(Button.LEFT)
   *         .move({x: 10, y: 10})
   *         .release(Button.LEFT);
   *     actions
   *         .pause(
   *             actions.keyboard(),  // Pause for press left
   *             actions.keyboard(),  // Pause for move
   *             actions.keyboard())  // Pause for release left
   *        .keyUp(Key.SHIFT);
   *     await actions.perform();
   *
   * @param duration The length of the pause to insert, in milliseconds.
   *     Alternatively, the duration may be omitted (yielding a default 0 ms
   *     pause), and the first device to pause may be specified.
   * @param devices The devices to insert the pause for. If no devices are
   *     specified, the pause will be inserted for _all_ devices.
   * @return a self reference.
   */
  pause(duration?: number | Device, ...devices: Device[]): this {
    let pauseDuration = 0
    if (duration instanceof Device) {
      devices.push(duration)
    } else if (duration) {
      pauseDuration = duration
    }

    const action: Action = { type: Action.Type.PAUSE, duration: pauseDuration }

    const iterable: Iterable<Device> = devices.length === 0 ? this.sequences_.keys() : devices
    for (const device of iterable) {
      this.sequence_(device).push(action)
    }
    return this.sync_ ? this.synchronize() : this
  }

  /**
   * Inserts an action to press a single key.
   *
   * @param key the key to press. This key may be specified as a {@link Key}
   *     value, a specific unicode code point, or a string containing a single
   *     unicode code point.
   * @return a self reference.
   */
  keyDown(key: string | number): this {
    return this.insert(this.keyboard_, this.keyboard_.keyDown(key))
  }

  /**
   * Inserts an action to release a single key.
   *
   * @param key the key to release. This key may be specified as a {@link Key}
   *     value, a specific unicode code point, or a string containing a single
   *     unicode code point.
   * @return a self reference.
   */
  keyUp(key: string | number): this {
    return this.insert(this.keyboard_, this.keyboard_.keyUp(key))
  }

  /**
   * Inserts a sequence of actions to type the provided key sequence.
   * For each key, this will record a pair of {@linkplain #keyDown keyDown}
   * and {@linkplain #keyUp keyUp} actions. An implication of this pairing
   * is that modifier keys (e.g. {@link ./input.Key.SHIFT Key.SHIFT}) will
   * always be immediately released. In other words, `sendKeys(Key.SHIFT, 'a')`
   * is the same as typing `sendKeys('a')`, _not_ `sendKeys('A')`.
   *
   * @param keys the keys to type.
   * @return a self reference.
   */
  sendKeys(...keys: (string | number | WebElement)[]): this {
    const actions: Action[] = []

    if (keys.length > 1 && keys[0] instanceof WebElement) {
      this.click(keys[0])
      keys.shift()
    }

    for (const key of keys) {
      if (typeof key === 'string') {
        for (const symbol of key) {
          actions.push(this.keyboard_.keyDown(symbol), this.keyboard_.keyUp(symbol))
        }
      } else if (typeof key === 'number') {
        actions.push(this.keyboard_.keyDown(key), this.keyboard_.keyUp(key))
      } else {
        throw new InvalidArgumentError(`key is not a string: ${key}`)
      }
    }
    return this.insert(this.keyboard_, ...actions)
  }

  /**
   * Inserts an action to press a mouse button at the mouse's current location.
   *
   * @param button The button to press; defaults to `LEFT`.
   * @return a self reference.
   */
  press(button: Button = Button.LEFT): this {
    return this.insert(this.mouse_, this.mouse_.press(button))
  }

  /**
   * Inserts an action to release a mouse button at the mouse's current
   * location.
   *
   * @param button The button to release; defaults to `LEFT`.
   * @return a self reference.
   */
  release(button: Button = Button.LEFT): this {
    return this.insert(this.mouse_, this.mouse_.release(button))
  }

  /**
   * scrolls a page via the coordinates given
   * @param x starting x coordinate
   * @param y starting y coordinate
   * @param targetDeltaX delta x to scroll to target
   * @param targetDeltaY delta y to scroll to target
   * @param origin element origin
   * @param duration duration ratio be the ratio of time delta and duration
   * @returns An action to scroll with this device.
   */
  scroll(
    x: number,
    y: number,
    targetDeltaX: number,
    targetDeltaY: number,
    origin: Origin | WebElement | undefined,
    duration: number,
  ): this {
    return this.insert(this.wheel_, this.wheel_.scroll(x, y, targetDeltaX, targetDeltaY, origin, duration))
  }

  /**
   * Inserts an action for moving the mouse `x` and `y` pixels relative to the
   * specified `origin`. The `origin` may be defined as the mouse's
   * {@linkplain ./input.Origin.POINTER current position}, the top-left corner of the
   * {@linkplain ./input.Origin.VIEWPORT viewport}, or the center of a specific
   * {@linkplain ./webdriver.WebElement WebElement}. Default is top left corner of the view-port if origin is not specified
   *
   * You may adjust how long the remote end should take, in milliseconds, to
   * perform the move using the `duration` parameter (defaults to 100 ms).
   * The number of incremental move events generated over this duration is an
   * implementation detail for the remote end.
   *
   * @param options The move options. Defaults to moving the mouse to the
   *     top-left corner of the viewport over 100ms.
   * @return a self reference.
   */
  move({ x = 0, y = 0, duration = 100, origin = Origin.VIEWPORT }: PointerMoveOptions = {}): this {
    return this.insert(this.mouse_, this.mouse_.move({ x, y, duration, origin }))
  }

  /**
   * Short-hand for performing a simple left-click (down/up) with the mouse.
   *
   * @param element If specified, the mouse will first be moved to the center
   *     of the element before performing the click.
   * @return a self reference.
   */
  click(element?: WebElement): this {
    if (element) {
      this.move({ origin: element })
    }
    return this.press().release()
  }

  /**
   * Short-hand for performing a simple right-click (down/up) with the mouse.
   *
   * @param element If specified, the mouse will first be moved to the center
   *     of the element before performing the click.
   * @return a self reference.
   */
  contextClick(element?: WebElement): this {
    if (element) {
      this.move({ origin: element })
    }
    return this.press(Button.RIGHT).release(Button.RIGHT)
  }

  /**
   * Short-hand for performing a double left-click with the mouse.
   *
   * @param element If specified, the mouse will first be moved to the center
   *     of the element before performing the click.
   * @return a self reference.
   */
  doubleClick(element?: WebElement): this {
    return this.click(element).press().release()
  }

  /**
   * Configures a drag-and-drop action consisting of the following steps:
   *
   * 1.  Move to the center of the `from` element (element to be dragged).
   * 2.  Press the left mouse button.
   * 3.  If the `to` target is a {@linkplain ./webdriver.WebElement WebElement},
   *     move the mouse to its center. Otherwise, move the mouse by the
   *     specified offset.
   * 4.  Release the left mouse button.
   *
   * @param from The element to press the left mouse button on to start the
   *     drag.
   * @param to Either another element to drag to (will drag to the center of
   *     the element), or an object specifying the offset to drag by, in
   *     pixels.
   * @return a self reference.
   */
  dragAndDrop(from: WebElement, to: WebElement | { x: number; y: number }): this {
    if (!(to instanceof WebElement) && (!to || typeof to.x !== 'number' || typeof to.y !== 'number')) {
      throw new InvalidArgumentError('Invalid drag target; must specify a WebElement or {x, y} offset')
    }

    this.move({ origin: from }).press()
    if (to instanceof WebElement) {
      this.move({ origin: to })
    } else {
      this.move({ x: to.x, y: to.y, origin: Origin.POINTER })
    }
    return this.release()
  }

  /**
   * Releases all keys, pointers, and clears internal state.
   *
   * @return a promise that will resolve when finished clearing all action
   *     state.
   */
  clear(): Promise<unknown> {
    for (const s of this.sequences_.values()) {
      s.length = 0
    }
    return this.executor_.execute(new Command(Name.CLEAR_ACTIONS))
  }

  /**
   * Performs the configured action sequence.
   *
   * @return a promise that will resolve when all actions have been completed.
   */
  async perform(): Promise<void> {
    const _actions: DeviceSequence[] = []
    this.sequences_.forEach((actions, device) => {
      if (!isIdle(actions)) {
        actions = actions.concat() // Defensive copy.
        _actions.push(Object.assign({ actions }, device.toJSON()))
      }
    })

    if (_actions.length === 0) {
      return Promise.resolve()
    }

    await this.executor_.execute(new Command(Name.ACTIONS).setParameter('actions', _actions))
  }

  getSequences(): DeviceSequence[] {
    const _actions: DeviceSequence[] = []
    this.sequences_.forEach((actions, device) => {
      if (!isIdle(actions)) {
        actions = actions.concat()
        _actions.push(Object.assign({ actions }, device.toJSON()))
      }
    })

    return _actions
  }
}

/**
 * @param actions
 */
function isIdle(actions: Action[]): boolean {
  return actions.length === 0 || actions.every((a) => a.type === Action.Type.PAUSE && !a.duration)
}

/**
 * Script used to compute the offset from the center of a DOM element's first
 * client rect from the top-left corner of the element's bounding client rect.
 * The element's center point is computed using the algorithm defined here:
 * <https://w3c.github.io/webdriver/webdriver-spec.html#dfn-center-point>.
 *
 * __This is only exported for use in internal unit tests. DO NOT USE.__
 */
export const INTERNAL_COMPUTE_OFFSET_SCRIPT = `
function computeOffset(el) {
  var rect = el.getClientRects()[0];
  var left = Math.max(0, Math.min(rect.x, rect.x + rect.width));
  var right =
      Math.min(window.innerWidth, Math.max(rect.x, rect.x + rect.width));
  var top = Math.max(0, Math.min(rect.y, rect.y + rect.height));
  var bot =
      Math.min(window.innerHeight, Math.max(rect.y, rect.y + rect.height));
  var x = Math.floor(0.5 * (left + right));
  var y = Math.floor(0.5 * (top + bot));
  var bbox = el.getBoundingClientRect();
  return [x - bbox.left, y - bbox.top];
}
return computeOffset(arguments[0]);`
