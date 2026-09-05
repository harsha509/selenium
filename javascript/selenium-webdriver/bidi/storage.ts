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
import type { Capabilities } from '../lib/capabilities'
import { CookieFilter } from './cookieFilter'
import { BrowsingContextPartitionDescriptor, StorageKeyPartitionDescriptor } from './partitionDescriptor'
import { PartitionKey } from './partitionKey'
import { PartialCookie } from './partialCookie'
import { Cookie, BytesValue, BytesValueJson } from './networkTypes'

/** The subset of a WebDriver needed to reach its BiDi connection. */
interface BidiDriver {
  getCapabilities(): Promise<Capabilities>
  getBidi(): Promise<BiDi>
}

/** Either partition descriptor accepted by the storage commands. */
type PartitionDescriptor = BrowsingContextPartitionDescriptor | StorageKeyPartitionDescriptor

/** A storage cookie as received on the wire. */
interface StorageCookieJson {
  name: string
  value: BytesValueJson
  domain: string
  path: string
  size: number
  httpOnly: boolean
  secure: boolean
  sameSite: string
  expiry?: number
}

/** A storage.PartitionKey as received on the wire. */
interface PartitionKeyJson {
  userContext?: string
  sourceOrigin?: string
}

/** Result of storage.getCookies. */
interface GetCookiesResult {
  cookies: StorageCookieJson[]
  partitionKey?: PartitionKeyJson
}

/** Result of storage.setCookie and storage.deleteCookies. */
interface PartitionKeyResult {
  partitionKey?: PartitionKeyJson
}

/** Builds a {@link PartitionKey} when the result carries a complete one, as trunk's own-property checks did. */
function toPartitionKey(result: PartitionKeyResult): PartitionKey | undefined {
  if (Object.prototype.hasOwnProperty.call(result, 'partitionKey')) {
    const partitionKey = result.partitionKey
    if (
      Object.prototype.hasOwnProperty.call(partitionKey, 'userContext') &&
      Object.prototype.hasOwnProperty.call(partitionKey, 'sourceOrigin') &&
      typeof partitionKey?.userContext === 'string' &&
      typeof partitionKey.sourceOrigin === 'string'
    ) {
      return new PartitionKey(partitionKey.userContext, partitionKey.sourceOrigin)
    }
  }
  return undefined
}

/**
 * Represents commands of Storage module.
 * Described in https://w3c.github.io/webdriver-bidi/#module-storage.
 */
class Storage {
  private readonly _driver: BidiDriver
  bidi!: BiDi

  constructor(driver: BidiDriver) {
    this._driver = driver
  }

  async init(): Promise<void> {
    if (!(await this._driver.getCapabilities()).get('webSocketUrl')) {
      throw Error('WebDriver instance must support BiDi protocol')
    }
    this.bidi = await this._driver.getBidi()
  }

  /**
   * Retrieves cookies based on the provided filter and partition.
   * @param filter - The filter to apply to the cookies.
   * @param partition - The partition to retrieve cookies from.
   * @returns A promise that resolves to an object containing the retrieved cookies and an optional partition key.
   * @throws {Error} If the filter parameter is provided but is not an instance of CookieFilter.
   * @throws {Error} If the partition parameter is provided but is not an instance of BrowsingContextPartitionDescriptor or StorageKeyPartitionDescriptor.
   */
  async getCookies(
    filter: CookieFilter | undefined = undefined,
    partition: PartitionDescriptor | undefined = undefined,
  ): Promise<{ cookies: Cookie[]; partitionKey?: PartitionKey } | undefined> {
    if (filter !== undefined && !(filter instanceof CookieFilter)) {
      throw new Error(`Params must be an instance of CookieFilter. Received:'${filter}'`)
    }

    if (
      partition !== undefined &&
      !(partition instanceof BrowsingContextPartitionDescriptor || partition instanceof StorageKeyPartitionDescriptor)
    ) {
      throw new Error(
        `Params must be an instance of BrowsingContextPartitionDescriptor or StorageKeyPartitionDescriptor. Received:'${partition}'`,
      )
    }

    const command = {
      method: 'storage.getCookies',
      params: {
        filter: filter ? Object.fromEntries(filter.asMap()) : undefined,
        partition: partition ? Object.fromEntries(partition.asMap()) : undefined,
      },
    }

    const response = await this.bidi.send<GetCookiesResult>(command)

    const cookies: Cookie[] = []

    response.result.cookies.forEach((cookie) => {
      cookies.push(
        new Cookie(
          cookie.name,
          new BytesValue(cookie.value.type, cookie.value.value),
          cookie.domain,
          cookie.path,
          cookie.size,
          cookie.httpOnly,
          cookie.secure,
          cookie.sameSite,
          cookie.expiry,
        ),
      )
    })

    if (Object.prototype.hasOwnProperty.call(response.result, 'partitionKey')) {
      const partitionKey = toPartitionKey(response.result)
      if (partitionKey !== undefined) {
        return { cookies, partitionKey }
      }
      return { cookies }
    }
    return undefined
  }

  /**
   * Sets a cookie using the provided cookie object and partition.
   * @param cookie - The cookie object to set.
   * @param partition - The partition to use for the cookie.
   * @returns The partition key of the set cookie.
   * @throws {Error} If the cookie parameter is not an instance of PartialCookie or if the partition parameter is not an instance of PartitionDescriptor.
   */
  async setCookie(
    cookie: PartialCookie,
    partition: PartitionDescriptor | undefined = undefined,
  ): Promise<PartitionKey | undefined> {
    if (!(cookie instanceof PartialCookie)) {
      throw new Error(`Params must be an instance of PartialCookie. Received:'${cookie}'`)
    }

    if (
      partition !== undefined &&
      !(partition instanceof BrowsingContextPartitionDescriptor || partition instanceof StorageKeyPartitionDescriptor)
    ) {
      throw new Error(
        `Params must be an instance of BrowsingContextPartitionDescriptor or StorageKeyPartitionDescriptor. Received:'${partition}'`,
      )
    }

    const command = {
      method: 'storage.setCookie',
      params: {
        cookie: cookie ? Object.fromEntries(cookie.asMap()) : undefined,
        partition: partition ? Object.fromEntries(partition.asMap()) : undefined,
      },
    }

    const response = await this.bidi.send<PartitionKeyResult>(command)

    return toPartitionKey(response.result)
  }

  /**
   * Deletes cookies based on the provided filter and partition.
   * @param cookieFilter - The filter to apply to the cookies. Must be an instance of CookieFilter.
   * @param partition - The partition to delete cookies from. Must be an instance of either BrowsingContextPartitionDescriptor or StorageKeyPartitionDescriptor.
   * @returns The partition key of the deleted cookies, if available.
   * @throws {Error} - If the provided parameters are not of the correct type.
   */
  async deleteCookies(
    cookieFilter: CookieFilter | undefined = undefined,
    partition: PartitionDescriptor | undefined = undefined,
  ): Promise<PartitionKey | undefined> {
    if (cookieFilter !== undefined && !(cookieFilter instanceof CookieFilter)) {
      throw new Error(`Params must be an instance of CookieFilter. Received:'${cookieFilter}'`)
    }

    if (
      partition !== undefined &&
      !(partition instanceof BrowsingContextPartitionDescriptor || partition instanceof StorageKeyPartitionDescriptor)
    ) {
      throw new Error(
        `Params must be an instance of BrowsingContextPartitionDescriptor or StorageKeyPartitionDescriptor. Received:'${partition}'`,
      )
    }

    const command = {
      method: 'storage.deleteCookies',
      params: {
        filter: cookieFilter ? Object.fromEntries(cookieFilter.asMap()) : undefined,
        partition: partition ? Object.fromEntries(partition.asMap()) : undefined,
      },
    }

    const response = await this.bidi.send<PartitionKeyResult>(command)

    return toPartitionKey(response.result)
  }
}

async function getStorageInstance(driver: BidiDriver): Promise<Storage> {
  const instance = new Storage(driver)
  await instance.init()
  return instance
}

export = getStorageInstance
