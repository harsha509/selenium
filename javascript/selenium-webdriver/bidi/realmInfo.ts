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

import * as self from './realmInfo'

/** Case-insensitive lookup of a realm type's value by name. */
function findByName(this: Record<string, unknown>, name: string): string | null {
  return (
    Object.values(this).find((type): type is string => {
      return typeof type === 'string' && name.toLowerCase() === type.toLowerCase()
    }) || null
  )
}

/**
 * Represents the types of realms.
 * Described in https://w3c.github.io/webdriver-bidi/#type-script-RealmType.
 */
export const RealmType = {
  AUDIO_WORKLET: 'audio-worklet',
  DEDICATED_WORKER: 'dedicated-worker',
  PAINT_WORKLET: 'paint-worklet',
  SERVICE_WORKED: 'service-worker',
  SHARED_WORKED: 'shared-worker',
  WINDOW: 'window',
  WORKER: 'worker',
  WORKLET: 'worklet',
  findByName,
} as const

/** A script.RealmInfo as received on the wire. */
export interface RealmInfoJson {
  type?: string
  realm?: string
  origin?: string
  context?: string
  sandbox?: string | null
}

/**
 * Represents information about a realm.
 * Described in https://w3c.github.io/webdriver-bidi/#type-script-RealmInfo.
 */
export class RealmInfo {
  realmId: string | null
  origin: string | null
  realmType: string | null

  /**
   * Constructs a new RealmInfo object.
   * @param realmId - The ID of the realm.
   * @param origin - The origin of the realm.
   * @param realmType - The type of the realm.
   */
  constructor(realmId: string | null, origin: string | null, realmType: string | null) {
    this.realmId = realmId
    this.origin = origin
    this.realmType = realmType
  }

  static fromJson(input: RealmInfoJson): RealmInfo {
    let realmId: string | null = null
    let origin: string | null = null
    let realmType: string | null = null
    let browsingContext: string | null = null
    let sandbox: string | null = null

    if (typeof input.type === 'string') {
      realmType = RealmType.findByName(input.type)
    }

    if ('realm' in input) {
      realmId = input.realm ?? null
    }

    if ('origin' in input) {
      origin = input.origin ?? null
    }

    if ('context' in input) {
      browsingContext = input.context ?? null
    }

    if ('sandbox' in input) {
      sandbox = input.sandbox ?? null
    }

    if (realmType === RealmType.WINDOW) {
      return new WindowRealmInfo(realmId, origin, realmType, browsingContext, sandbox)
    }
    return new RealmInfo(realmId, origin, realmType)
  }
}

/**
 * Represents information about a window realm.
 * @extends RealmInfo
 */
export class WindowRealmInfo extends RealmInfo {
  browsingContext: string | null
  sandbox: string | null

  /**
   * Constructs a new instance of the WindowRealmInfo class.
   * @param realmId - The ID of the realm.
   * @param origin - The origin of the realm.
   * @param realmType - The type of the realm.
   * @param browsingContext - The browsing context of the realm.
   * @param sandbox - The sandbox of the realm (optional).
   */
  constructor(
    realmId: string | null,
    origin: string | null,
    realmType: string | null,
    browsingContext: string | null,
    sandbox: string | null = null,
  ) {
    super(realmId, origin, realmType)
    this.browsingContext = browsingContext
    this.sandbox = sandbox
  }
}

/** Keeps `import x from '...'` working for esModuleInterop/Babel consumers; deliberate exception to the no-default-export rule. */
const defaultExport: typeof self = self
export default defaultExport
