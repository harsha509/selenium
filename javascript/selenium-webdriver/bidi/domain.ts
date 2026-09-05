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

import type BiDi from './index'
import { BidiDriver, getBidiConnection } from '../lib/bidi_connection'

/** A BiDi command message, minus the connection-assigned `id`. */
export interface BidiCommand {
  method: string
  params?: unknown
}

/** A BiDi command response as received on the wire. */
export interface BidiResponse {
  id: number
  result?: unknown
  error?: string
  message?: string
}

/** A handle for one event subscription made through {@link BidiTransport#addCallback}. */
export interface Subscription {
  id: string
  unsubscribe(): Promise<void>
}

/** What a domain needs from a connection: command round-trips and event callbacks. */
export interface BidiTransport {
  send(command: BidiCommand): Promise<BidiResponse>
  addCallback(method: string, handler: (params: unknown) => void): Promise<Subscription>
}

/** Parses an inbound wire payload into its typed form. */
export interface WireParser<T> {
  fromWire(payload: unknown): T
}

// Gates Domain's constructor so `new Network(someRandomThing)` fails loudly
// instead of silently producing a broken instance. A Symbol can't be forged
// or guessed, so this is real runtime enforcement, not just a TS annotation —
// only a generated `Class.create(driver)` (and this package's own tests) may
// pass it. It's exported deliberately, not hidden: the point is to stop
// accidental misuse of the normal `new Network(x)` shape, not to defend
// against someone who deliberately imports and passes this.
export const DOMAIN_TOKEN: unique symbol = Symbol(
  'Domain internal construction token — obtained only via Class.create(driver)',
)

/** Describes one subscribable BiDi event, for use with Domain#addCallback(). */
export interface EventDescriptor<T> {
  readonly method: string
  readonly type?: WireParser<T>
}

/** An {@link EventDescriptor} whose params are delivered raw. */
export interface UntypedEventDescriptor extends EventDescriptor<unknown> {
  readonly type?: undefined
}

/** An {@link EventDescriptor} whose params are parsed through `type` first. */
export interface TypedEventDescriptor<T> extends EventDescriptor<T> {
  readonly type: WireParser<T>
}

/**
 * Describes one subscribable BiDi event, for use with Domain#addCallback().
 * @param method The event's wire method name, e.g. 'log.entryAdded'.
 * @param type Runtime record/union class for the event's params, if the schema
 *   declares one. When present, addCallback() parses each delivered payload
 *   through it before the caller's handler runs — inbound wire payloads are
 *   validated against their resolved type; an event's params is such a payload
 *   just as much as a command's result is.
 * @returns The event descriptor, ready to pass to Domain#addCallback().
 */
export function event(method: string): UntypedEventDescriptor
export function event<T>(method: string, type: WireParser<T>): TypedEventDescriptor<T>
export function event<T>(method: string, type?: WireParser<T>): EventDescriptor<T> {
  return { method, type }
}

/** Shared base for every generated BiDi domain class. */
export class Domain {
  #bidi: BidiTransport

  protected constructor(bidi: BidiTransport, token: typeof DOMAIN_TOKEN) {
    if (token !== DOMAIN_TOKEN) {
      throw new TypeError(`${new.target.name} must be constructed via ${new.target.name}.create(driver), not \`new\``)
    }
    this.#bidi = bidi
  }

  protected static async connect(driver: BidiDriver): Promise<BiDi> {
    return getBidiConnection(driver)
  }

  protected async send(method: string, params: unknown): Promise<unknown> {
    const response = await this.#bidi.send({ method, params })
    if (response?.error !== undefined) {
      throw new Error(`${response.error}: ${response.message}`)
    }
    return response?.result
  }

  /**
   * Subscribes `handler` to a BiDi event. All the actual subscription-lifecycle
   * work — remote subscribe/unsubscribe, per-subscription bookkeeping — lives on
   * the connection itself (see Index#addCallback in bidi/index.ts); Domain only
   * adds the one thing the connection can't do on its own: parsing a delivered
   * payload through the descriptor's type before the caller's handler runs.
   * @param descriptor An event descriptor from event().
   * @param handler Invoked with the event's params (parsed through
   *   descriptor.type first, if one was given) each time it fires.
   * @returns A handle for this subscription — call `unsubscribe()` to stop
   *   receiving the event.
   */
  async addCallback(descriptor: UntypedEventDescriptor, handler: (params: unknown) => void): Promise<Subscription>
  async addCallback<T>(descriptor: TypedEventDescriptor<T>, handler: (params: T) => void): Promise<Subscription>
  async addCallback(descriptor: EventDescriptor<unknown>, handler: (params: unknown) => void): Promise<Subscription> {
    const type = descriptor.type
    const dispatch = type === undefined ? handler : (params: unknown) => handler(type.fromWire(params))
    return this.#bidi.addCallback(descriptor.method, dispatch)
  }
}
