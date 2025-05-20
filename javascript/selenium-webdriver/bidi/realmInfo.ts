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
 * Represents the types of realms.
 * Described in https://w3c.github.io/webdriver-bidi/#type-script-RealmType.
 * @enum
 */
const RealmType = {
  AUDIO_WORKLET: 'audio-worklet',
  DEDICATED_WORKER: 'dedicated-worker',
  PAINT_WORKLET: 'paint-worklet',
  SERVICE_WORKED: 'service-worker',
  SHARED_WORKED: 'shared-worker',
  WINDOW: 'window',
  WORKER: 'worker',
  WORKLET: 'worklet',

  findByName(name: string): string | null {
    return (
      Object.values(this).find((type) => {
        return typeof type === 'string' && name.toLowerCase() === type.toLowerCase()
      }) || null
    )
  },
} as const;

type RealmTypeValue = typeof RealmType[keyof typeof RealmType];

interface RealmJsonInput {
  type?: string;
  realm?: string;
  origin?: string;
  context?: string;
  sandbox?: string;
}

/**
 * Represents information about a realm.
 * Described in https://w3c.github.io/webdriver-bidi/#type-script-RealmInfo.
 */
class RealmInfo {
  realmId: string;
  origin: string;
  realmType: string | null;

  /**
   * Constructs a new RealmInfo object.
   * @param {string} realmId - The ID of the realm.
   * @param {string} origin - The origin of the realm.
   * @param {string} realmType - The type of the realm.
   */
  constructor(realmId: string, origin: string, realmType: string | null) {
    this.realmId = realmId
    this.origin = origin
    this.realmType = realmType
  }

  static fromJson(input: RealmJsonInput): RealmInfo {
    let realmId: string | null = null
    let origin: string | null = null
    let realmType: string | null = null
    let browsingContext: string | null = null
    let sandbox: string | null = null

    if ('type' in input) {
      let typeString = input['type']
      realmType = RealmType.findByName(typeString as string)
    }

    if ('realm' in input) {
      realmId = input['realm'] as string
    }

    if ('origin' in input) {
      origin = input['origin'] as string
    }

    if ('context' in input) {
      browsingContext = input['context'] as string
    }

    if ('sandbox' in input) {
      sandbox = input['sandbox'] as string
    }

    if (realmType === RealmType.WINDOW) {
      return new WindowRealmInfo(
        realmId as string,
        origin as string,
        realmType,
        browsingContext as string,
        sandbox
    )
    }

    return new RealmInfo(realmId as string, origin as string, realmType)
  }
}

/**
 * Represents information about a window realm.
 * @extends RealmInfo
 */
class WindowRealmInfo extends RealmInfo {
  browsingContext: string;
  sandbox: string | null;

  /**
   * Constructs a new instance of the WindowRealmInfo class.
   * @param {string} realmId - The ID of the realm.
   * @param {string} origin - The origin of the realm.
   * @param {string} realmType - The type of the realm.
   * @param {string} browsingContext - The browsing context of the realm.
   * @param {string|null} sandbox - The sandbox of the realm (optional).
   */
  constructor(realmId: string, origin: string, realmType: string | null, browsingContext: string, sandbox: string | null = null) {
    super(realmId, origin, realmType)
    this.browsingContext = browsingContext
    this.sandbox = sandbox
  }
}

export {
  RealmInfo,
  RealmType,
  RealmTypeValue,
  WindowRealmInfo,
};
