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

'use strict'

/**
 * Protocol for virtual authenticators
 */
enum Protocol {
  CTAP2 = 'ctap2',
  U2F = 'ctap1/u2f',
}

/**
 * AuthenticatorTransport values
 */
enum Transport {
  BLE = 'ble',
  USB = 'usb',
  NFC = 'nfc',
  INTERNAL = 'internal',
}

interface CredentialData {
  credentialId: string
  isResidentCredential: boolean
  rpId: string
  privateKey: string
  signCount: number
  userHandle?: string
}

/**
 * Options for the creation of virtual authenticators.
 * @see http://w3c.github.io/webauthn/#sctn-automation
 */
class VirtualAuthenticatorOptions {
  private _protocol: Protocol = Protocol.CTAP2
  private _transport: Transport = Transport.USB
  private _hasResidentKey: boolean = false
  private _hasUserVerification: boolean = false
  private _isUserConsenting: boolean = true
  private _isUserVerified: boolean = false

  /**
   * Constructor to initialise VirtualAuthenticatorOptions object.
   */
  constructor() {}

  getProtocol(): Protocol {
    return this._protocol
  }

  setProtocol(protocol: Protocol): void {
    this._protocol = protocol
  }

  getTransport(): Transport {
    return this._transport
  }

  setTransport(transport: Transport): void {
    this._transport = transport
  }

  getHasResidentKey(): boolean {
    return this._hasResidentKey
  }

  setHasResidentKey(value: boolean): void {
    this._hasResidentKey = value
  }

  getHasUserVerification(): boolean {
    return this._hasUserVerification
  }

  setHasUserVerification(value: boolean): void {
    this._hasUserVerification = value
  }

  getIsUserConsenting(): boolean {
    return this._isUserConsenting
  }

  setIsUserConsenting(value: boolean): void {
    this._isUserConsenting = value
  }

  getIsUserVerified(): boolean {
    return this._isUserVerified
  }

  setIsUserVerified(value: boolean): void {
    this._isUserVerified = value
  }

  toDict(): {
    protocol: Protocol
    transport: Transport
    hasResidentKey: boolean
    hasUserVerification: boolean
    isUserConsenting: boolean
    isUserVerified: boolean
  } {
    return {
      protocol: this.getProtocol(),
      transport: this.getTransport(),
      hasResidentKey: this.getHasResidentKey(),
      hasUserVerification: this.getHasUserVerification(),
      isUserConsenting: this.getIsUserConsenting(),
      isUserVerified: this.getIsUserVerified(),
    }
  }
}

/**
 * A credential stored in a virtual authenticator.
 * @see https://w3c.github.io/webauthn/#credential-parameters
 */
class Credential {
  private _id: Uint8Array
  private _isResidentCredential: boolean
  private _rpId: string
  private _userHandle: Uint8Array | null
  private _privateKey: string
  private _signCount: number

  constructor(
    credentialId: Uint8Array,
    isResidentCredential: boolean,
    rpId: string,
    userHandle: Uint8Array | null,
    privateKey: string,
    signCount: number,
  ) {
    this._id = credentialId
    this._isResidentCredential = isResidentCredential
    this._rpId = rpId
    this._userHandle = userHandle
    this._privateKey = privateKey
    this._signCount = signCount
  }

  static fromDict(data: CredentialData): Credential {
    const id = new Uint8Array(Buffer.from(data.credentialId, 'base64url'));
    const isResidentCredential = data.isResidentCredential;
    const rpId = data.rpId;
    const privateKey = Buffer.from(data.privateKey, 'base64url').toString('binary');
    const signCount = data.signCount;
    let userHandle: Uint8Array | null = null;

    if (data.userHandle) {
      userHandle = new Uint8Array(Buffer.from(data.userHandle, 'base64url'));
    }

    return new Credential(id, isResidentCredential, rpId, userHandle, privateKey, signCount);
  }

  static createResidentCredential(
    id: Uint8Array,
    rpId: string,
    userHandle: Uint8Array,
    privateKey: string,
    signCount: number,
  ): Credential {
    return new Credential(id, true, rpId, userHandle, privateKey, signCount)
  }

  static createNonResidentCredential(id: Uint8Array, rpId: string, privateKey: string, signCount: number): Credential {
    return new Credential(id, false, rpId, null, privateKey, signCount)
  }

  id(): Uint8Array {
    return this._id
  }

  isResidentCredential(): boolean {
    return this._isResidentCredential
  }

  rpId(): string {
    return this._rpId
  }

  userHandle(): Uint8Array | null {
    if (this._userHandle != null) {
      return this._userHandle
    }
    return null
  }

  privateKey(): string {
    return this._privateKey
  }

  signCount(): number {
    return this._signCount
  }

  /**
   * Creates a resident (i.e. stateless) credential.
   * @param id Unique base64 encoded string.
   * @param rpId Relying party identifier.
   * @param userHandle userHandle associated to the credential. Must be Base64 encoded string.
   * @param privateKey Base64 encoded PKCS
   * @param signCount initial value for a signature counter.
   * @deprecated This method has been made static. Call it with class name. Example, Credential.createResidentCredential()
   * @returns A resident credential
   */
  createResidentCredential(
    id: Uint8Array,
    rpId: string,
    userHandle: Uint8Array,
    privateKey: string,
    signCount: number,
  ): Credential {
    return new Credential(id, true, rpId, userHandle, privateKey, signCount)
  }

  /**
   * Creates a non-resident (i.e. stateless) credential.
   * @param id Unique base64 encoded string.
   * @param rpId Relying party identifier.
   * @param privateKey Base64 encoded PKCS
   * @param signCount initial value for a signature counter.
   * @deprecated This method has been made static. Call it with class name. Example, Credential.createNonResidentCredential()
   * @returns A non-resident credential
   */
  createNonResidentCredential(id: Uint8Array, rpId: string, privateKey: string, signCount: number): Credential {
    return new Credential(id, false, rpId, null, privateKey, signCount)
  }

  toDict(): CredentialData {
    const credentialData: CredentialData = {
      credentialId: Buffer.from(this._id).toString('base64url'),
      isResidentCredential: this._isResidentCredential,
      rpId: this._rpId,
      privateKey: Buffer.from(this._privateKey, 'binary').toString('base64url'),
      signCount: this._signCount,
    }

    if (this.userHandle() != null) {
      credentialData.userHandle = Buffer.from(this._userHandle as Uint8Array).toString('base64url')
    }

    return credentialData
  }
}

export { Credential, VirtualAuthenticatorOptions, Transport, Protocol }
