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
import * as self from './record'

// Mirrors bidi_schema.json's type-ref vocabulary (see project_bidi_schema.mjs).
export interface TypeNode {
  primitive?: string
  const?: unknown
  ref?: string
  enum?: string[]
  list?: TypeNode
  map?: TypeNode
  union?: TypeNode[]
  // An inline (unnamed) record — project_bidi_schema.mjs's projectEntry() emits this
  // for an anonymous CDDL group instead of hoisting it to a named, ref'able type.
  record?: FieldSpec[]
  nullable?: boolean
  // Present on an inline union with a bare-scalar arm — the primitive(s) that
  // arm accepts (see unionNode() in project_bidi_schema.mjs). Not consumed by
  // validateValue yet; declared so embedding a real schema node type-checks.
  scalar?: string | string[]
  // The exact `const` literals a bare-scalar union arm admits (e.g.
  // input.Origin's "viewport"/"pointer") — see unionNode(). Same status as
  // `scalar`: not yet consumed by validateValue, declared for the embed.
  scalarValues?: unknown[]
}

export interface FieldSpec {
  name: string
  wire: string
  required: boolean
  type: TypeNode
}

export interface RecordOptions {
  extensible?: boolean
}

/** The typed surface of a generated record class; `T` is the caller's declared field shape. */
export interface RecordClass<T> {
  new (data: T): Readonly<T>
  fromWire(payload: unknown): Readonly<T>
}

/** The untyped runtime shape of a generated record class, as stored in the registry. */
export interface WireRecordConstructor {
  new (data: unknown): object
  fromWire(payload: unknown): object
}

export interface RecordEntry {
  kind: 'record'
  RecordClass: WireRecordConstructor
}

export interface AliasEntry {
  kind: 'alias'
  type: TypeNode
}

/** Which way a value is crossing the wire. */
export type Direction = 'inbound' | 'outbound'

export class ValidationError extends Error {}

/** A non-null, non-array object: the only shape a record or map may take. */
function isWireObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Validates a *present* value against a resolved type node, and returns the value to
// assign for it — usually the same value, but for a nested ref-to-record/union parsed
// inbound (fromWire()/build() results, not the raw wire object) and for list/map/inline
// record values (a fresh, deeply-frozen copy, so validity can't be corrupted after the
// fact by mutating an array or object a caller still holds a reference to).
// Outbound nested refs deliberately keep the caller's own value instead of the
// newly-constructed instance — the nested `new referenced.RecordClass(value)` /
// `referenced.build(value)` call below exists only to validate, matching the
// constructor's existing outbound behavior of trusting the caller's own object shape.
// `direction` only affects how a nested ref-to-record/union is itself validated/parsed.
function validateValue(typeNode: TypeNode, value: unknown, path: string, direction: Direction): unknown {
  if (value === null) {
    // `primitive: 'null'` (project_bidi_schema.mjs's projectRef(), for a type whose
    // every alternative was null) means null itself is the valid value — accept it
    // even though `nullable` (a *different* value also being permitted alongside a
    // non-null base type) wasn't separately set.
    if (typeNode.nullable || typeNode.primitive === 'null') return null
    throw new ValidationError(`${path}: null is not allowed`)
  }

  if (typeNode.primitive !== undefined) {
    // A present, non-null value never satisfies a `primitive: 'null'` node — value
    // being null is the only thing the branch above would have already returned for.
    if (typeNode.primitive === 'null') {
      throw new ValidationError(`${path}: expected null, got ${typeof value}`)
    }
    const typeofByPrimitive: Record<string, string> = {
      string: 'string',
      integer: 'number',
      number: 'number',
      boolean: 'boolean',
    }
    const expected = typeofByPrimitive[typeNode.primitive]
    if (expected && typeof value !== expected) {
      throw new ValidationError(`${path}: expected ${typeNode.primitive}, got ${typeof value}`)
    }
    // JSON has no representation for NaN/±Infinity — reject them for both numeric
    // primitives before the integer-specific check narrows further. (Number.isInteger
    // already excludes them too, so this is only load-bearing for a bare `number`.)
    if ((typeNode.primitive === 'integer' || typeNode.primitive === 'number') && !Number.isFinite(value)) {
      throw new ValidationError(`${path}: expected a finite ${typeNode.primitive}, got ${value}`)
    }
    // `number` admits any JSON number; `integer` rejects a fractional value
    // (5.7) while still accepting one written 5.0 (Number.isInteger(5.0) is true).
    if (typeNode.primitive === 'integer' && !Number.isInteger(value)) {
      throw new ValidationError(`${path}: expected an integer, got ${value}`)
    }
    // An inline literal choice (project_bidi_schema.mjs's enumNode()) carries both
    // `primitive` and `enum` — the primitive check above narrows the type, but the
    // closed vocabulary below still needs to run, so only return early when there
    // is no `enum` to fall through to.
    if (typeNode.enum === undefined) return value
  }

  if (typeNode.const !== undefined) {
    if (value !== typeNode.const) {
      throw new ValidationError(
        `${path}: expected constant ${JSON.stringify(typeNode.const)}, got ${JSON.stringify(value)}`,
      )
    }
    return value
  }

  if (typeNode.enum !== undefined) {
    if (!typeNode.enum.some((allowed) => allowed === value)) {
      throw new ValidationError(
        `${path}: "${value}" is not a valid value; expected one of: ${typeNode.enum.join(', ')}`,
      )
    }
    return value
  }

  if (typeNode.list !== undefined) {
    if (!Array.isArray(value)) {
      throw new ValidationError(`${path}: expected a list, got ${typeof value}`)
    }
    const list = typeNode.list
    return Object.freeze(value.map((item, i) => validateValue(list, item, `${path}[${i}]`, direction)))
  }

  if (typeNode.map !== undefined) {
    if (!isWireObject(value)) {
      throw new ValidationError(`${path}: expected an object, got ${typeof value}`)
    }
    // Object.create(null), not `{}`: `key` is wire-controlled and a literal "__proto__"
    // entry assigned via bracket notation would hijack result's prototype instead of
    // becoming a data property (CWE-1321) — a null-prototype object has no such trap.
    const result: Record<string, unknown> = Object.create(null)
    for (const [key, entry] of Object.entries(value)) {
      result[key] = validateValue(typeNode.map, entry, `${path}.${key}`, direction)
    }
    return Object.freeze(result)
  }

  if (typeNode.ref !== undefined) {
    const referenced = resolve(typeNode.ref)
    if (referenced === undefined) return value // not yet registered — best-effort, skip deep validation

    if (referenced.kind === 'enum') {
      if (!referenced.includes(value)) {
        throw new ValidationError(
          `${path}: "${value}" is not a valid ${typeNode.ref} value; expected one of: ${referenced.values.join(', ')}`,
        )
      }
      return value
    }

    if (referenced.kind === 'record') {
      if (value instanceof referenced.RecordClass) return value // already validated
      if (!isWireObject(value)) {
        throw new ValidationError(`${path}: expected an object, got ${typeof value}`)
      }
      // Recurse through the same-direction path so a nested field gets the same
      // tolerance (inbound) or strictness (outbound) as its parent. Inbound returns
      // the parsed instance itself, so a typed parent record ends up with a typed
      // nested value instead of the raw wire object; outbound only validates this
      // way (the caller's own value is what gets kept, see the note above).
      if (direction === 'inbound') {
        return referenced.RecordClass.fromWire(value)
      }
      new referenced.RecordClass(value)
      return value
    }

    if (referenced.kind === 'union') {
      if (direction === 'inbound') {
        return referenced.fromWire(value)
      }
      referenced.build(value)
      return value
    }

    if (referenced.kind === 'alias') {
      return validateValue(referenced.type, value, path, direction)
    }

    return value
  }

  if (typeNode.union !== undefined) {
    const errors: string[] = []
    for (const variant of typeNode.union) {
      try {
        return validateValue(variant, value, path, direction)
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }
    throw new ValidationError(`${path}: value did not match any variant (${errors.join('; ')})`)
  }

  // An inline (unnamed) record type node — project_bidi_schema.mjs's projectEntry()
  // emits this for an anonymous CDDL group (e.g. a field typed as an inline `{ ... }`
  // rather than a ref to a named, defineRecord()'d type) — same FieldSpec shape as a
  // named record's `fields`, just with nowhere to register a class. Gets the same
  // directional required/extra/nested-value handling a named record's constructor/
  // fromWire gives its fields, just built inline instead of through a Record class.
  if (typeNode.record !== undefined) {
    if (!isWireObject(value)) {
      throw new ValidationError(`${path}: expected an object, got ${typeof value}`)
    }
    const byWire = new Map<string, FieldSpec>(typeNode.record.map((f): [string, FieldSpec] => [f.wire, f]))
    const result: Record<string, unknown> = {}
    for (const field of typeNode.record) {
      if (!Object.hasOwn(value, field.wire)) {
        if (field.required) {
          throw new ValidationError(`${path}.${field.wire}: required field is missing`)
        }
        continue
      }
      result[field.name] = validateValue(field.type, value[field.wire], `${path}.${field.wire}`, direction)
    }
    for (const wireKey of Object.keys(value)) {
      if (byWire.has(wireKey)) continue
      // No `extensible` concept exists for an inline record (project_bidi_schema.mjs
      // never sets it there) — undeclared keys get exactly the non-extensible named-
      // record treatment: rejected outbound, dropped-with-a-warning inbound.
      if (direction === 'inbound') {
        process.emitWarning(`${path}: undeclared property "${wireKey}"`, 'BiDiSchemaWarning')
      } else {
        throw new ValidationError(`${path}: unknown property "${wireKey}"`)
      }
    }
    return Object.freeze(result)
  }

  return value
}

/**
 * Registers a schema `record` — a fixed set of named fields, each independently
 * validated on the way out (constructor) and in (fromWire()).
 * @param name Schema type name, e.g. 'network.AddInterceptParameters'.
 * @param fields The record's field specs.
 * @param options
 * @returns The generated Record class — `new Record(data)` validates and constructs
 *   outbound, `Record.fromWire(payload)` validates and parses inbound.
 */
export function defineRecord<T>(name: string, fields: FieldSpec[], options: RecordOptions = {}): RecordClass<T> {
  const { extensible = false } = options
  const byWire = new Map<string, FieldSpec>(fields.map((f): [string, FieldSpec] => [f.wire, f]))
  // JS property name -> wire key, the inverse of byWire — lets toJSON() below map an
  // outbound instance's own (JS-facing) properties back to the wire's declared names.
  const byName = new Map<string, string>(fields.map((f): [string, string] => [f.name, f.wire]))

  class WireRecord {
    [key: string]: unknown

    // Outbound: strict. Any value that doesn't match its declared shape is an error here.
    constructor(data: unknown) {
      if (!isWireObject(data)) {
        throw new ValidationError(`${name}: expected an object`)
      }

      for (const field of fields) {
        if (!Object.hasOwn(data, field.wire)) {
          if (field.required) {
            throw new ValidationError(`${name}.${field.wire}: required field is missing`)
          }
          continue
        }
        const value = data[field.wire]
        this[field.name] = validateValue(field.type, value, `${name}.${field.wire}`, 'outbound')
      }

      for (const wireKey of Object.keys(data)) {
        if (byWire.has(wireKey)) continue
        if (!extensible) {
          throw new ValidationError(`${name}: unknown property "${wireKey}"`)
        }
        // Object.defineProperty, not `this[wireKey] = ...`: wireKey is caller-supplied
        // and a literal "__proto__" key assigned via bracket notation hijacks this
        // instance's actual prototype instead of becoming a field (CWE-1321).
        // defineProperty always creates a genuine own data property, regardless of name.
        Object.defineProperty(this, wireKey, {
          value: data[wireKey], // vendor extras reach the wire on an extensible type
          enumerable: true,
          writable: true,
          configurable: true,
        })
      }

      Object.freeze(this)
    }

    // Inbound: tolerant of undeclared properties, but a missing required field
    // is rejected just like a structurally invalid value — omission used to be
    // tolerated here, but that's no longer required.
    // Bypasses the constructor above entirely — a single constructor enforcing
    // both directions symmetrically would make tolerated undeclared-property
    // retention impossible.
    static fromWire(payload: unknown): WireRecord {
      if (!isWireObject(payload)) {
        throw new ValidationError(`${name}: expected an object on the wire, got ${typeof payload}`)
      }

      const instance: WireRecord = Object.create(WireRecord.prototype)

      for (const field of fields) {
        if (!Object.hasOwn(payload, field.wire)) {
          if (field.required) {
            throw new ValidationError(`${name}.${field.wire}: required field is missing`)
          }
          continue // left genuinely absent, optional field
        }
        const value = payload[field.wire]
        // A present value's shape is never tolerated, inbound or outbound.
        instance[field.name] = validateValue(field.type, value, `${name}.${field.wire}`, 'inbound')
      }

      for (const wireKey of Object.keys(payload)) {
        if (byWire.has(wireKey)) continue
        // An extensible type preserves an undeclared field silently — no narrower
        // criterion than "extensible" itself (not, say, only fields that happen to be
        // sendable back on some other type). A non-extensible type warns and drops it
        // instead — the warning belongs only to the drop, not the retention.
        if (extensible) {
          // Object.defineProperty, not `instance[wireKey] = ...` — see the matching
          // comment in the constructor above: a literal "__proto__" key from an
          // untrusted wire payload must become a field, not swap the prototype (CWE-1321).
          Object.defineProperty(instance, wireKey, {
            value: payload[wireKey],
            enumerable: true,
            writable: true,
            configurable: true,
          })
        } else {
          process.emitWarning(`${name}: undeclared property "${wireKey}"`, 'BiDiSchemaWarning')
        }
      }

      Object.freeze(instance)
      return instance
    }

    // The JSON.stringify hook: an instance stores its fields under their JS-facing
    // property names (this[field.name]), but the wire needs the spec's own key
    // (field.wire) — the two differ whenever a generator picks an idiomatic JS name
    // distinct from the raw spec key. Runs automatically wherever this instance is
    // serialized (directly, or nested inside another value being stringified), so a
    // caller never has to remember to call it.
    toJSON(): Record<string, unknown> {
      // Object.create(null), not `{}`: an extra's key is wire-controlled (extensible
      // types preserve undeclared properties verbatim, see the constructor above), and
      // a literal "__proto__" key assigned via bracket notation would hijack wire's
      // prototype instead of becoming a data property (CWE-1321) — same hazard the
      // constructor/fromWire already guard against for the instance itself.
      const wire: Record<string, unknown> = Object.create(null)
      for (const key of Object.keys(this)) {
        wire[byName.get(key) ?? key] = this[key] // extras have no JS-name mapping — already wire-keyed
      }
      return wire
    }
  }

  Object.defineProperty(WireRecord, 'name', { value: name })
  register(name, { kind: 'record', RecordClass: WireRecord })
  // The runtime class is untyped; T is the caller's declared field shape, as in Closure's @template.
  return WireRecord as unknown as RecordClass<T>
}

/**
 * Registers a schema `alias` — a name with no fields of its own, just a
 * pointer to another type node (e.g. `network.Intercept` aliasing a plain
 * string). A ref to an alias validates through the aliased type node.
 * @param name
 * @param type The schema's `type` node this name aliases.
 */
export function defineAlias(name: string, type: TypeNode): void {
  register(name, { kind: 'alias', type })
}

/** Keeps `import x from '...'` working for esModuleInterop/Babel consumers; deliberate exception to the no-default-export rule. */
const defaultExport: typeof self = self
export default defaultExport
