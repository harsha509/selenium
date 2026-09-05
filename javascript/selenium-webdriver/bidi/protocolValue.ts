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

import { PrimitiveType, NonPrimitiveType, RemoteType, SpecialNumberType } from './protocolType'
import { isObject } from '../lib/util'

const TYPE_CONSTANT = 'type'
const VALUE_CONSTANT = 'value'

/**
 * Represents the types of remote reference.
 */
export const RemoteReferenceType = {
  HANDLE: 'handle',
  SHARED_ID: 'sharedId',
} as const

export type RemoteReferenceType = (typeof RemoteReferenceType)[keyof typeof RemoteReferenceType]

/** A regular expression's serialised form. */
export interface RegExpJson {
  pattern: string
  flags: string
}

/** A script.RemoteValue as received on the wire. */
export interface RemoteValueJson {
  type?: string
  handle?: string
  internalId?: string
  value?: unknown
  sharedId?: string
}

/**
 * Represents a local value with a specified type and optional value.
 * Described in https://w3c.github.io/webdriver-bidi/#type-script-LocalValue
 */
export class LocalValue {
  type: string
  declare value?: unknown

  constructor(type: string, value: unknown = null) {
    if (type === PrimitiveType.UNDEFINED || type === PrimitiveType.NULL) {
      this.type = type
    } else {
      this.type = type
      this.value = value
    }
  }

  /**
   * Creates a new LocalValue object with a string value.
   * @param value - The string value to be stored in the LocalValue object.
   */
  static createStringValue(value: string): LocalValue {
    return new LocalValue(PrimitiveType.STRING, value)
  }

  /**
   * Creates a new LocalValue object with a number value.
   * @param value - The number value.
   */
  static createNumberValue(value: number): LocalValue {
    return new LocalValue(PrimitiveType.NUMBER, value)
  }

  /**
   * Creates a new LocalValue object with a special number value.
   * @param value - The value of the special number.
   */
  static createSpecialNumberValue(value: SpecialNumberType): LocalValue {
    return new LocalValue(PrimitiveType.SPECIAL_NUMBER, value)
  }

  /**
   * Creates a new LocalValue object with an undefined value.
   */
  static createUndefinedValue(): LocalValue {
    return new LocalValue(PrimitiveType.UNDEFINED)
  }

  /**
   * Creates a new LocalValue object with a null value.
   */
  static createNullValue(): LocalValue {
    return new LocalValue(PrimitiveType.NULL)
  }

  /**
   * Creates a new LocalValue object with a boolean value.
   * @param value - The boolean value.
   */
  static createBooleanValue(value: boolean): LocalValue {
    return new LocalValue(PrimitiveType.BOOLEAN, value)
  }

  /**
   * Creates a new LocalValue object with a BigInt value.
   * @param value - The BigInt value.
   */
  static createBigIntValue(value: bigint | string): LocalValue {
    return new LocalValue(PrimitiveType.BIGINT, value)
  }

  /**
   * Creates a new LocalValue object with an array.
   * @param value - The array.
   */
  static createArrayValue(value: unknown[]): LocalValue {
    return new LocalValue(NonPrimitiveType.ARRAY, value)
  }

  /**
   * Creates a new LocalValue object with date value.
   * @param value - The date.
   */
  static createDateValue(value: Date | string): LocalValue {
    return new LocalValue(NonPrimitiveType.DATE, value)
  }

  /**
   * Creates a new LocalValue object of map value.
   * @param map - The map.
   */
  static createMapValue(map: object): LocalValue {
    const value: [string, unknown][] = []
    Object.entries(map).forEach((entry) => {
      value.push(entry)
    })
    return new LocalValue(NonPrimitiveType.MAP, value)
  }

  /**
   * Creates a new LocalValue object from the passed object.
   * @param object - The object.
   */
  static createObjectValue(object: object): LocalValue {
    const value: [string, unknown][] = []
    Object.entries(object).forEach((entry) => {
      value.push(entry)
    })
    return new LocalValue(NonPrimitiveType.OBJECT, value)
  }

  /**
   * Creates a new LocalValue object of regular expression value.
   * @param value - The value of the regular expression.
   */
  static createRegularExpressionValue(value: RegExpJson): LocalValue {
    return new LocalValue(NonPrimitiveType.REGULAR_EXPRESSION, value)
  }

  /**
   * Creates a new LocalValue object with the specified value.
   * @param value - The value to be set.
   */
  static createSetValue(value: unknown[]): LocalValue {
    return new LocalValue(NonPrimitiveType.SET, value)
  }

  /**
   * Creates a new LocalValue object with the given channel value
   * @param value - The channel value.
   */
  static createChannelValue(value: ChannelValue): LocalValue {
    return new LocalValue(NonPrimitiveType.CHANNEL, value)
  }

  static createReferenceValue(handle: string, sharedId: string): ReferenceValue {
    return new ReferenceValue(handle, sharedId)
  }

  static getArgument(argument: unknown): LocalValue | null {
    let localValue: LocalValue | null = null
    if (
      argument === SpecialNumberType.NAN ||
      argument === SpecialNumberType.MINUS_ZERO ||
      argument === SpecialNumberType.INFINITY ||
      argument === SpecialNumberType.MINUS_INFINITY
    ) {
      localValue = LocalValue.createSpecialNumberValue(argument)
      return localValue
    }

    switch (typeof argument) {
      case 'string':
        localValue = LocalValue.createStringValue(argument)
        break
      case 'number':
        localValue = LocalValue.createNumberValue(argument)
        break
      case 'boolean':
        localValue = LocalValue.createBooleanValue(argument)
        break
      case 'bigint':
        localValue = LocalValue.createBigIntValue(argument.toString())
        break
      case 'undefined':
        localValue = LocalValue.createUndefinedValue()
        break
      case 'object':
        if (argument === null) {
          localValue = LocalValue.createNullValue()
          break
        }
        if (argument instanceof Date) {
          localValue = LocalValue.createDateValue(argument)
        } else if (argument instanceof Map) {
          const map: [unknown, LocalValue | null][] = []
          argument.forEach((value, key) => {
            let objectKey
            if (typeof key === 'string') {
              objectKey = key
            } else {
              objectKey = LocalValue.getArgument(key)
            }
            const objectValue = LocalValue.getArgument(value)
            map.push([objectKey, objectValue])
          })
          localValue = new LocalValue(NonPrimitiveType.MAP, map)
        } else if (argument instanceof Set) {
          const set: (LocalValue | null)[] = []
          argument.forEach((value) => {
            set.push(LocalValue.getArgument(value))
          })
          localValue = LocalValue.createSetValue(set)
        } else if (argument instanceof Array) {
          const arr: (LocalValue | null)[] = []
          argument.forEach((value) => {
            arr.push(LocalValue.getArgument(value))
          })
          localValue = LocalValue.createArrayValue(arr)
        } else if (argument instanceof RegExp) {
          localValue = LocalValue.createRegularExpressionValue({
            pattern: argument.source,
            flags: argument.flags,
          })
        } else {
          const value: [LocalValue | null, LocalValue | null][] = []
          Object.entries(argument).forEach((entry) => {
            value.push([LocalValue.getArgument(entry[0]), LocalValue.getArgument(entry[1])])
          })
          localValue = new LocalValue(NonPrimitiveType.OBJECT, value)
        }
        break
    }

    return localValue
  }

  asMap(): Record<string, unknown> {
    const toReturn: Record<string, unknown> = {}
    toReturn[TYPE_CONSTANT] = this.type

    if (!(this.type === PrimitiveType.NULL || this.type === PrimitiveType.UNDEFINED)) {
      toReturn[VALUE_CONSTANT] = this.value
    }
    return toReturn
  }
}

/**
 * Represents a remote value.
 * Described in https://w3c.github.io/webdriver-bidi/#type-script-RemoteValue.
 */
export class RemoteValue {
  type: string | null
  handle: string | null
  internalId: string | null
  value: unknown
  sharedId: string | null

  constructor(remoteValue: RemoteValueJson) {
    this.type = null
    this.handle = null
    this.internalId = null
    this.value = null
    this.sharedId = null

    if (typeof remoteValue.type === 'string') {
      const typeString = remoteValue.type
      if (PrimitiveType.findByName(typeString) != null) {
        this.type = PrimitiveType.findByName(typeString)
      } else if (NonPrimitiveType.findByName(typeString) != null) {
        this.type = NonPrimitiveType.findByName(typeString)
      } else {
        this.type = RemoteType.findByName(typeString)
      }
    }

    if ('handle' in remoteValue) {
      this.handle = remoteValue.handle ?? null
    }

    if ('internalId' in remoteValue) {
      this.internalId = remoteValue.internalId ?? null
    }

    if ('value' in remoteValue) {
      this.value = remoteValue.value
    }

    if ('sharedId' in remoteValue) {
      this.sharedId = remoteValue.sharedId ?? null
    }

    if (this.value != null) {
      this.value = this.deserializeValue(this.value, this.type)
    }
  }

  deserializeValue(value: unknown, type: string | null): unknown {
    if (type === NonPrimitiveType.OBJECT && Array.isArray(value)) {
      return Object.fromEntries(value)
    } else if (type === NonPrimitiveType.REGULAR_EXPRESSION && isObject(value) && typeof value.pattern === 'string') {
      return new RegExpValue(value.pattern, typeof value.flags === 'string' ? value.flags : null)
    }
    return value
  }
}

/**
 * Represents a reference value in the protocol.
 * Described in https://w3c.github.io/webdriver-bidi/#type-script-RemoteReference.
 */
export class ReferenceValue {
  #handle?: string
  #sharedId?: string

  /**
   * Constructs a new ReferenceValue object.
   * @param handle - The handle value.
   * @param sharedId - The shared ID value.
   */
  constructor(handle: string, sharedId: string) {
    if (handle === RemoteReferenceType.HANDLE) {
      this.#handle = sharedId
    } else if (handle === RemoteReferenceType.SHARED_ID) {
      this.#sharedId = sharedId
    } else {
      this.#handle = handle
      this.#sharedId = sharedId
    }
  }

  asMap(): Record<string, string> {
    const toReturn: Record<string, string> = {}
    if (this.#handle != null) {
      toReturn[RemoteReferenceType.HANDLE] = this.#handle
    }
    if (this.#sharedId != null) {
      toReturn[RemoteReferenceType.SHARED_ID] = this.#sharedId
    }

    return toReturn
  }
}

/**
 * Represents a regular expression value.
 * Described in https://w3c.github.io/webdriver-bidi/#type-script-LocalValue.
 */
export class RegExpValue {
  pattern: string
  flags: string | null

  /**
   * Constructs a new RegExpValue object.
   * @param pattern - The pattern of the regular expression.
   * @param flags - The flags of the regular expression.
   */
  constructor(pattern: string, flags: string | null = null) {
    this.pattern = pattern
    this.flags = flags
  }
}

/**
 * Represents serialization options.
 * Described in https://w3c.github.io/webdriver-bidi/#type-script-SerializationOptions.
 */
export class SerializationOptions {
  private readonly _maxDomDepth: number
  private readonly _maxObjectDepth: number | null
  private readonly _includeShadowTree: 'none' | 'open' | 'all'

  /**
   * Constructs a new instance of SerializationOptions.
   * @param maxDomDepth - The maximum depth to serialize the DOM.
   * @param maxObjectDepth - The maximum depth to serialize objects.
   * @param includeShadowTree - The inclusion level of the shadow tree.
   * @throws {Error} If the `includeShadowTree` value is not one of 'none', 'open', or 'all'.
   */
  constructor(
    maxDomDepth = 0,
    maxObjectDepth: number | null = null,
    includeShadowTree: 'none' | 'open' | 'all' = 'none',
  ) {
    this._maxDomDepth = maxDomDepth
    this._maxObjectDepth = maxObjectDepth

    if (['none', 'open', 'all'].includes(includeShadowTree)) {
      throw Error(`Valid types are 'none', 'open', and 'all'. Received: ${includeShadowTree}`)
    }
    this._includeShadowTree = includeShadowTree
  }
}

/**
 * Represents a channel value.
 * Described in https://w3c.github.io/webdriver-bidi/#type-script-ChannelValue.
 */
export class ChannelValue {
  channel: string
  declare options?: SerializationOptions
  declare resultOwnership?: 'root' | 'none'

  constructor(
    channel: string,
    options: SerializationOptions | undefined = undefined,
    resultOwnership: 'root' | 'none' | undefined = undefined,
  ) {
    this.channel = channel
    if (options !== undefined) {
      if (options instanceof SerializationOptions) {
        this.options = options
      } else {
        throw Error(`Pass in SerializationOptions object. Received: ${options} `)
      }
    }

    if (resultOwnership !== undefined) {
      if (['root', 'none'].includes(resultOwnership)) {
        this.resultOwnership = resultOwnership
      } else {
        throw Error(`Valid types are 'root' and 'none. Received: ${resultOwnership}`)
      }
    }
  }
}
