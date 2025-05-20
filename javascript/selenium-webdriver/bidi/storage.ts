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

import { CookieFilter } from './cookieFilter';
import { BrowsingContextPartitionDescriptor, StorageKeyPartitionDescriptor } from './partitionDescriptor';
import { PartitionKey } from './partitionKey';
import { PartialCookie } from './partialCookie';
import { Cookie, BytesValue } from './networkTypes';

interface WebDriver {
  getCapabilities(): Promise<Map<string, any>>;
  getBidi(): Promise<any>;
}

interface ResponseResult {
  cookies: Array<{
    name: string;
    value: { type: string; value: string };
    domain: string;
    path: string;
    size: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: string;
    expiry: number;
  }>;
  partitionKey?: {
    userContext: string;
    sourceOrigin: string;
  };
}

interface CommandResponse {
  result: ResponseResult;
}

/**
 * Represents commands of Storage module.
 * Described in https://w3c.github.io/webdriver-bidi/#module-storage.
 * @class
 */
class Storage {
  private _driver: WebDriver;
  bidi: any;

  constructor(driver: WebDriver) {
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
   *
   * @param {CookieFilter} [filter] - The filter to apply to the cookies.
   * @param {(BrowsingContextPartitionDescriptor|StorageKeyPartitionDescriptor)} [partition] - The partition to retrieve cookies from.
   * @returns {Promise<{ cookies: Cookie[], partitionKey?: PartitionKey }>} - A promise that resolves to an object containing the retrieved cookies and an optional partition key.
   * @throws {Error} If the filter parameter is provided but is not an instance of CookieFilter.
   * @throws {Error} If the partition parameter is provided but is not an instance of BrowsingContextPartitionDescriptor or StorageKeyPartitionDescriptor.
   */
  async getCookies(
    filter?: CookieFilter,
  partition?: BrowsingContextPartitionDescriptor | StorageKeyPartitionDescriptor
): Promise<{ cookies: Cookie[], partitionKey?: PartitionKey }> {
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

  let response = await this.bidi.send(command) as CommandResponse

  let cookies: Cookie[] = []
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
    if (
      Object.prototype.hasOwnProperty.call(response.result.partitionKey, 'userContext') &&
      Object.prototype.hasOwnProperty.call(response.result.partitionKey, 'sourceOrigin')
    ) {
      let partitionKey = new PartitionKey(
        response.result.partitionKey.userContext,
        response.result.partitionKey.sourceOrigin,
      )
      return { cookies, partitionKey }
    }

    return { cookies }
  }

  return { cookies }
}

/**
 * Sets a cookie using the provided cookie object and partition.
 *
 * @param {PartialCookie} cookie - The cookie object to set.
 * @param {(BrowsingContextPartitionDescriptor|StorageKeyPartitionDescriptor)} [partition] - The partition to use for the cookie.
 * @returns {PartitionKey} The partition key of the set cookie.
 * @throws {Error} If the cookie parameter is not an instance of PartialCookie or if the partition parameter is not an instance of PartitionDescriptor.
 */
async setCookie(
  cookie: PartialCookie,
  partition?: BrowsingContextPartitionDescriptor | StorageKeyPartitionDescriptor
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

let response = await this.bidi.send(command) as CommandResponse

if (Object.prototype.hasOwnProperty.call(response.result, 'partitionKey')) {
  if (
    Object.prototype.hasOwnProperty.call(response.result.partitionKey, 'userContext') &&
    Object.prototype.hasOwnProperty.call(response.result.partitionKey, 'sourceOrigin')
  ) {
    return new PartitionKey(response.result.partitionKey.userContext, response.result.partitionKey.sourceOrigin)
  }
}

return undefined
}

/**
 * Deletes cookies based on the provided filter and partition.
 *
 * @param {CookieFilter} [cookieFilter] - The filter to apply to the cookies. Must be an instance of CookieFilter.
 * @param {(BrowsingContextPartitionDescriptor|StorageKeyPartitionDescriptor)} [partition] - The partition to delete cookies from. Must be an instance of either BrowsingContextPartitionDescriptor or StorageKeyPartitionDescriptor.
 * @returns {PartitionKey} - The partition key of the deleted cookies, if available.
 * @throws {Error} - If the provided parameters are not of the correct type.
 */
async deleteCookies(
  cookieFilter?: CookieFilter,
  partition?: BrowsingContextPartitionDescriptor | StorageKeyPartitionDescriptor
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

let response = await this.bidi.send(command) as CommandResponse

if (Object.prototype.hasOwnProperty.call(response.result, 'partitionKey')) {
  if (
    Object.prototype.hasOwnProperty.call(response.result.partitionKey, 'userContext') &&
    Object.prototype.hasOwnProperty.call(response.result.partitionKey, 'sourceOrigin')
  ) {
    return new PartitionKey(response.result.partitionKey.userContext, response.result.partitionKey.sourceOrigin)
  }
}

return undefined
}
}

async function getStorageInstance(driver: WebDriver): Promise<Storage> {
  let instance = new Storage(driver)
  await instance.init()
  return instance
}

export default getStorageInstance;
