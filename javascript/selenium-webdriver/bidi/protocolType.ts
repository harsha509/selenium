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

import * as self from './protocolType'

/** Case-insensitive lookup of a type constant's value by name. */
function findByName(this: Record<string, unknown>, name: string): string | null {
  return (
    Object.values(this).find((type): type is string => {
      return typeof type === 'string' && name.toLowerCase() === type.toLowerCase()
    }) || null
  )
}

/**
 * Represents a primitive type.
 * Described in https://w3c.github.io/webdriver-bidi/#type-script-PrimitiveProtocolValue.
 */
export const PrimitiveType = {
  UNDEFINED: 'undefined',
  NULL: 'null',
  STRING: 'string',
  NUMBER: 'number',
  SPECIAL_NUMBER: 'number',
  BOOLEAN: 'boolean',
  BIGINT: 'bigint',
  findByName,
} as const

/**
 * Represents a non-primitive type.
 * Described inhttps://w3c.github.io/webdriver-bidi/#type-script-RemoteValue.
 */
export const NonPrimitiveType = {
  ARRAY: 'array',
  DATE: 'date',
  MAP: 'map',
  OBJECT: 'object',
  REGULAR_EXPRESSION: 'regexp',
  SET: 'set',
  CHANNEL: 'channel',
  findByName,
} as const

/**
 * Represents a remote value type.
 * Described inhttps://w3c.github.io/webdriver-bidi/#type-script-RemoteValue.
 */
export const RemoteType = {
  SYMBOL: 'symbol',
  FUNCTION: 'function',
  WEAK_MAP: 'weakmap',
  WEAK_SET: 'weakset',
  ITERATOR: 'iterator',
  GENERATOR: 'generator',
  ERROR: 'error',
  PROXY: 'proxy',
  PROMISE: 'promise',
  TYPED_ARRAY: 'typedarray',
  ARRAY_BUFFER: 'arraybuffer',
  NODE_LIST: 'nodelist',
  HTML_COLLECTION: 'htmlcollection',
  NODE: 'node',
  WINDOW: 'window',
  findByName,
} as const

/**
 * Represents a special number type.
 * Described in https://w3c.github.io/webdriver-bidi/#type-script-PrimitiveProtocolValue.
 */
export const SpecialNumberType = {
  NAN: 'NaN',
  MINUS_ZERO: '-0',
  INFINITY: 'Infinity',
  MINUS_INFINITY: '-Infinity',
} as const

export type SpecialNumberType = (typeof SpecialNumberType)[keyof typeof SpecialNumberType]

/** Keeps `import x from '...'` working for esModuleInterop/Babel consumers; deliberate exception to the no-default-export rule. */
const defaultExport: typeof self = self
export default defaultExport
