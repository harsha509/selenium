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

class Account {
  constructor(
    private readonly _accountId: string,
    private readonly _email: string,
    private readonly _name: string,
    private readonly _givenName: string,
    private readonly _pictureUrl: string,
    private readonly _idpConfigUrl: string,
    private readonly _loginState: string,
    private readonly _termsOfServiceUrl: string,
    private readonly _privacyPolicyUrl: string,
  ) {}

  get accountId(): string {
    return this._accountId
  }

  get email(): string {
    return this._email
  }

  get name(): string {
    return this._name
  }

  get givenName(): string {
    return this._givenName
  }

  get pictureUrl(): string {
    return this._pictureUrl
  }

  get idpConfigUrl(): string {
    return this._idpConfigUrl
  }

  get loginState(): string {
    return this._loginState
  }

  get termsOfServiceUrl(): string {
    return this._termsOfServiceUrl
  }

  get privacyPolicyUrl(): string {
    return this._privacyPolicyUrl
  }
}

export = Account
