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

import { register, resolve } from './registry'
import { ValidationError } from './record'
import * as self from './union'

/** One arm of a discriminated union: `data[by] === value` selects `ref`. */
export interface DiscriminatedVariant {
  value: unknown
  ref: string
}

/** One arm of a structural union: all `requires` keys present selects `ref`. */
export interface OrderedVariant {
  ref: string
  requires: string[]
}

/** The schema's `selector` node for a union; a correlated union has neither shape. */
export type UnionSelector =
  | { by: string; variants: DiscriminatedVariant[]; default?: string; ordered?: undefined }
  | { ordered: OrderedVariant[]; by?: undefined }
  | { by?: undefined; ordered?: undefined }

export interface UnionOptions {
  objectOnly?: boolean
}

/** The typed surface of a registered union; `T` is the caller's declared variant shape. */
export interface UnionClass<T> {
  build(data: unknown): Readonly<T>
  fromWire(payload: unknown): Readonly<T>
}

/** The untyped runtime shape of a registered union, as stored in the registry. */
export interface UnionEntry {
  kind: 'union'
  build(data: unknown): object
  fromWire(payload: unknown): object
}

/** Own-key test over any value; non-objects are boxed so primitives never throw. */
function hasKey(data: unknown, key: string): boolean {
  return data !== null && data !== undefined && Object.hasOwn(Object(data), key)
}

// Resolves the variant ref a value/payload matches, per the schema's selector shape:
//   { by, variants: [{value, ref}], default? } - discriminated: match `data[by]` against
//     each variant's value.
//   { ordered: [{ref, requires}] }              - structural: first variant whose `requires`
//     keys are all present in `data`, in spec order.
function selectVariant(selector: UnionSelector, data: unknown): string | undefined {
  if (selector.by) {
    const by = selector.by
    const tag: unknown = hasKey(data, by) ? Reflect.get(Object(data), by) : undefined
    const match = selector.variants.find((v) => v.value === tag)
    if (match) return match.ref
    return selector.default
  }
  if (selector.ordered) {
    for (const variant of selector.ordered) {
      if (variant.requires.every((key) => hasKey(data, key))) return variant.ref
    }
    return undefined
  }
  return undefined // correlated: resolved by request id elsewhere, not from the payload
}

/**
 * Registers a schema `union` — a value that may be any one of several variant
 * record types, resolved by a discriminator field or by structural shape.
 * @param name Schema type name, e.g. 'session.ProxyConfiguration'.
 * @param selector The schema's `selector` node for this union.
 * @param options
 * @returns The registered union — `build(data)` resolves and constructs the matching
 *   variant outbound, `fromWire(payload)` resolves and parses it inbound.
 */
export function defineUnion<T>(name: string, selector: UnionSelector, options: UnionOptions = {}): UnionClass<T> {
  const { objectOnly = false } = options

  const union: UnionEntry = {
    kind: 'union',

    // Outbound: resolve which variant `data` describes, then delegate to that
    // variant's own (strict) constructor. A discriminated selector's `default`
    // catch-all can itself resolve to another union — not just a record — e.g.
    // LocalValue's untyped RemoteReference arm (see unionSelector() in
    // project_bidi_schema.mjs) — so recurse through that union's own dispatch
    // rather than assuming every resolved ref is a record.
    build(data: unknown): object {
      if (objectOnly && (typeof data !== 'object' || data === null || Array.isArray(data))) {
        throw new ValidationError(`${name}: expected an object`)
      }
      const ref = selectVariant(selector, data)
      if (ref === undefined) {
        throw new ValidationError(`${name}: value does not match any known variant`)
      }
      const variant = resolve(ref)
      if (variant?.kind === 'union') {
        return variant.build(data)
      }
      if (variant?.kind === 'record') {
        return new variant.RecordClass(data)
      }
      throw new ValidationError(`${name}: variant "${ref}" is not a registered record or union`)
    },

    // Inbound: resolve which variant `payload` matches. An unresolvable payload is a
    // closed-vocabulary miss — always an error, never a warning, since there is no
    // valid typed object to fall back to. Same nested-union case as build() above.
    fromWire(payload: unknown): object {
      if (objectOnly && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
        throw new ValidationError(`${name}: expected an object on the wire, got ${typeof payload}`)
      }
      const ref = selectVariant(selector, payload)
      if (ref === undefined) {
        throw new ValidationError(`${name}: received a variant not in this binding's BiDi schema`)
      }
      const variant = resolve(ref)
      if (variant?.kind === 'union') {
        return variant.fromWire(payload)
      }
      if (variant?.kind === 'record') {
        return variant.RecordClass.fromWire(payload)
      }
      throw new ValidationError(`${name}: variant "${ref}" is not a registered record or union`)
    },
  }

  register(name, union)
  // The runtime union is untyped; T is the caller's declared variant shape, as in Closure's @template.
  return union as unknown as UnionClass<T>
}

/** Keeps `import x from '...'` working for esModuleInterop/Babel consumers; deliberate exception to the no-default-export rule. */
const defaultExport: typeof self = self
export default defaultExport
