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

export default class Account {
  private _accountId: string;
  private _email: string;
  private _name: string;
  private _givenName: string;
  private _pictureUrl: string;
  private _idpConfigUrl: string;
  private _loginState: string;
  private _termsOfServiceUrl: string;
  private _privacyPolicyUrl: string;

  constructor(
    accountId: string,
    email: string,
    name: string,
    givenName: string,
    pictureUrl: string,
    idpConfigUrl: string,
    loginState: string,
    termsOfServiceUrl: string,
    privacyPolicyUrl: string,
  ) {
    this._accountId = accountId;
    this._email = email;
    this._name = name;
    this._givenName = givenName;
    this._pictureUrl = pictureUrl;
    this._idpConfigUrl = idpConfigUrl;
    this._loginState = loginState;
    this._termsOfServiceUrl = termsOfServiceUrl;
    this._privacyPolicyUrl = privacyPolicyUrl;
  }

  get accountId(): string {
    return this._accountId;
  }

  get email(): string {
    return this._email;
  }

  get name(): string {
    return this._name;
  }

  get givenName(): string {
    return this._givenName;
  }

  get pictureUrl(): string {
    return this._pictureUrl;
  }

  get idpConfigUrl(): string {
    return this._idpConfigUrl;
  }

  get loginState(): string {
    return this._loginState;
  }

  get termsOfServiceUrl(): string {
    return this._termsOfServiceUrl;
  }

  get privacyPolicyUrl(): string {
    return this._privacyPolicyUrl;
  }
}
