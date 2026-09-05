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

import { Command, Name } from '../command'
import Account from './account'

/** The wire representation of one FedCM account. */
interface AccountData {
  accountId: string
  email: string
  name: string
  givenName: string
  pictureUrl: string
  idpConfigUrl: string
  loginState: string
  termsOfServiceUrl: string
  privacyPolicyUrl: string
}

/** The subset of a WebDriver that the dialog issues commands through. */
interface DialogDriver {
  execute<T = unknown>(command: Command): Promise<T>
}

class Dialog {
  private readonly _driver: DialogDriver

  constructor(driver: DialogDriver) {
    this._driver = driver
  }

  async title(): Promise<string> {
    const result = await this._driver.execute<{ title: string }>(new Command(Name.GET_FEDCM_TITLE))

    return result.title
  }

  subtitle(): Promise<unknown> {
    return this._driver.execute(new Command(Name.GET_FEDCM_TITLE))
  }

  type(): Promise<string> {
    return this._driver.execute<string>(new Command(Name.GET_FEDCM_DIALOG_TYPE))
  }

  async accounts(): Promise<Account[]> {
    const result = await this._driver.execute<AccountData[]>(new Command(Name.GET_ACCOUNTS))

    const accountArray: Account[] = []

    result.forEach((account) => {
      const acc = new Account(
        account.accountId,
        account.email,
        account.name,
        account.givenName,
        account.pictureUrl,
        account.idpConfigUrl,
        account.loginState,
        account.termsOfServiceUrl,
        account.privacyPolicyUrl,
      )
      accountArray.push(acc)
    })

    return accountArray
  }

  selectAccount(index: number): Promise<unknown> {
    return this._driver.execute(new Command(Name.SELECT_ACCOUNT).setParameter('accountIndex', index))
  }

  accept(): Promise<unknown> {
    return this._driver.execute(new Command(Name.CLICK_DIALOG_BUTTON))
  }

  dismiss(): Promise<unknown> {
    return this._driver.execute(new Command(Name.CANCEL_DIALOG))
  }
}

export = Dialog
