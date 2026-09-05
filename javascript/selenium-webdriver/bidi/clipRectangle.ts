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
 * Represents a clip rectangle.
 * Described in https://w3c.github.io/webdriver-bidi/#command-browsingContext-captureScreenshot.
 */
class ClipRectangle {
  clipType: string

  /**
   * Constructs a new ClipRectangle object.
   * @param type - The type of the clip rectangle.
   */
  constructor(type: string) {
    this.clipType = type
  }

  /**
   * Gets the type of the clip rectangle.
   */
  get type(): string {
    return this.clipType
  }

  asMap(): Map<string, unknown> | undefined {
    return undefined
  }
}

/**
 * Represents a clip rectangle for an element.
 * @extends ClipRectangle
 */
export class ElementClipRectangle extends ClipRectangle {
  #sharedId: string
  #handleId?: string

  /**
   * Constructs a new ElementClipRectangle instance.
   * @param sharedId - The shared ID of the element.
   * @param handleId - The handle ID of the element (optional).
   */
  constructor(sharedId: string, handleId: string | undefined = undefined) {
    super('element')
    this.#sharedId = sharedId
    if (handleId !== undefined) {
      this.#handleId = handleId
    }
  }

  /**
   * Converts the ElementClipRectangle instance to a map.
   */
  asMap(): Map<string, unknown> {
    const map = new Map<string, unknown>()
    map.set('type', this.type)

    const sharedReference = new Map<string, string>()
    sharedReference.set('sharedId', this.#sharedId)
    if (this.#handleId !== undefined) {
      sharedReference.set('handleId', this.#handleId)
    }

    map.set('element', Object.fromEntries(sharedReference))

    return map
  }
}

/**
 * Represents a box-shaped clip rectangle.
 * @extends ClipRectangle
 */
export class BoxClipRectangle extends ClipRectangle {
  #x: number
  #y: number
  #width: number
  #height: number

  /**
   * Constructs a new BoxClipRectangle object.
   * @param x - The x-coordinate of the top-left corner of the rectangle.
   * @param y - The y-coordinate of the top-left corner of the rectangle.
   * @param width - The width of the rectangle.
   * @param height - The height of the rectangle.
   */
  constructor(x: number, y: number, width: number, height: number) {
    super('box')
    this.#x = x
    this.#y = y
    this.#width = width
    this.#height = height
  }

  /**
   * Converts the BoxClipRectangle object to a Map.
   */
  asMap(): Map<string, unknown> {
    const map = new Map<string, unknown>()
    map.set('type', this.type)
    map.set('x', this.#x)
    map.set('y', this.#y)
    map.set('width', this.#width)
    map.set('height', this.#height)
    return map
  }
}
