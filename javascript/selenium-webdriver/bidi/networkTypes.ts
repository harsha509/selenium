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

import { NavigationInfo } from './browsingContextTypes'

/** Case-insensitive lookup of a SameSite value by name. */
function findByName(this: Record<string, unknown>, name: string): string | null {
  return (
    Object.values(this).find((type): type is string => {
      return typeof type === 'string' && name.toLowerCase() === type.toLowerCase()
    }) || null
  )
}

/**
 * Represents the possible values for the SameSite attribute of a cookie.
 */
export const SameSite = {
  STRICT: 'strict',
  LAX: 'lax',
  NONE: 'none',
  DEFAULT: 'default',
  findByName,
} as const

/** One of the string values in {@link SameSite}. */
export type SameSiteValue = 'strict' | 'lax' | 'none' | 'default'

/** A network.BytesValue as received on the wire. */
export interface BytesValueJson {
  type: string
  value: string
}

/** A network.Header as received on the wire. */
export interface HeaderJson {
  name: string
  value: BytesValueJson
}

/** A network.Cookie as received on the wire. */
export interface CookieJson {
  name: string
  value?: BytesValueJson
  domain: string
  path: string
  size: number
  httpOnly: boolean
  secure: boolean
  sameSite: string
  expires?: number
}

/** A network.FetchTimingInfo as received on the wire. */
export interface FetchTimingInfoJson {
  originTime: number
  requestTime: number
  redirectStart: number
  redirectEnd: number
  fetchStart: number
  dnsStart: number
  dnsEnd: number
  connectStart: number
  connectEnd: number
  tlsStart: number
  requestStart: number
  responseStart: number
  responseEnd: number
}

/** A network.RequestData as received on the wire. */
export interface RequestDataJson {
  request: string
  url: string
  method: string
  headers: HeaderJson[]
  cookies: CookieJson[]
  headersSize: number
  bodySize: number
  timings: FetchTimingInfoJson
}

/** A browsingContext.NavigationInfo as received on the wire. */
export interface NavigationJson {
  context: string
  navigation: string
  timestamp: number
  url: string
}

/** A network.Initiator as received on the wire. */
export interface InitiatorJson {
  type: string
  columnNumber: number
  lineNumber: number
  stackTrace: unknown
  request: string
}

/** A network.ResponseData as received on the wire. `headerSize` mirrors the key this module reads. */
export interface ResponseDataJson {
  url: string
  protocol: string
  status: number
  statusText: string
  fromCache: boolean
  headers: unknown
  mimeType: string
  bytesReceived: number
  headerSize?: number
  bodySize: number
  content: unknown
}

/**
 * Represents a BytesValue object.
 * Described in https://w3c.github.io/webdriver-bidi/#type-network-BytesValue.
 */
export class BytesValue {
  static readonly Type = {
    STRING: 'string',
    BASE64: 'base64',
  } as const

  private readonly _type: string
  private readonly _value: string

  /**
   * Creates a new BytesValue instance.
   * @param type - The type of the BytesValue.
   * @param value - The value of the BytesValue.
   */
  constructor(type: string, value: string) {
    this._type = type
    this._value = value
  }

  /**
   * Gets the type of the BytesValue.
   */
  get type(): string {
    return this._type
  }

  /**
   * Gets the value of the BytesValue.
   */
  get value(): string {
    return this._value
  }

  /**
   * Converts the BytesValue to a map.
   */
  asMap(): Map<string, string> {
    const map = new Map<string, string>()
    map.set('type', this._type)
    map.set('value', this._value)
    return map
  }
}

/**
 * Represents a header with a name and value.
 * Described in https://w3c.github.io/webdriver-bidi/#type-network-Header.
 */
export class Header {
  private readonly _name: string
  private readonly _value: BytesValue

  /**
   * Creates a new Header instance.
   * @param name - The name of the header.
   * @param value - The value of the header.
   * @throws {Error} If the value is not an instance of BytesValue.
   */
  constructor(name: string, value: BytesValue) {
    this._name = name
    if (!(value instanceof BytesValue)) {
      throw new Error(`Value must be an instance of BytesValue. Received: '${value}'`)
    }
    this._value = value
  }

  /**
   * Gets the name of the header.
   */
  get name(): string {
    return this._name
  }

  /**
   * Gets the value of the header.
   */
  get value(): BytesValue {
    return this._value
  }

  /**
   * Converts the Header to a map.
   */
  asMap(): Map<string, unknown> {
    return new Map<string, unknown>([
      ['name', this.name],
      ['value', Object.fromEntries(this.value.asMap())],
    ])
  }
}

/**
 * Represents a cookie.
 * Described in https://w3c.github.io/webdriver-bidi/#type-network-Cookie.
 */
export class Cookie {
  private readonly _name: string
  private readonly _value: BytesValueJson | null
  private readonly _domain: string
  private readonly _path: string
  private readonly _expires: number | null
  private readonly _size: number
  private readonly _httpOnly: boolean
  private readonly _secure: boolean
  private readonly _sameSite: string

  constructor(
    name: string,
    value: BytesValueJson | null,
    domain: string,
    path: string,
    size: number,
    httpOnly: boolean,
    secure: boolean,
    sameSite: string,
    expires: number | null,
  ) {
    this._name = name
    this._value = value
    this._domain = domain
    this._path = path
    this._expires = expires
    this._size = size
    this._httpOnly = httpOnly
    this._secure = secure
    this._sameSite = sameSite
  }

  /**
   * Gets the name of the cookie.
   */
  get name(): string {
    return this._name
  }

  /**
   * Gets the value of the cookie.
   */
  get value(): BytesValueJson | null {
    return this._value
  }

  /**
   * Gets the domain of the cookie.
   */
  get domain(): string {
    return this._domain
  }

  /**
   * Gets the path of the cookie.
   */
  get path(): string {
    return this._path
  }

  /**
   * Gets the expiration date of the cookie.
   */
  get expires(): number | null {
    return this._expires
  }

  /**
   * Gets the size of the cookie.
   */
  get size(): number {
    return this._size
  }

  /**
   * Checks if the cookie is HTTP-only.
   */
  get httpOnly(): boolean {
    return this._httpOnly
  }

  /**
   * Checks if the cookie is secure.
   */
  get secure(): boolean {
    return this._secure
  }

  /**
   * Gets the same-site attribute of the cookie.
   */
  get sameSite(): string {
    return this._sameSite
  }
}

// No tests written for FetchTimingInfo. Must be updated after browsers implement it and corresponding WPT test are written.
/**
 * Represents the time of each part of the request.
 * Described in https://w3c.github.io/webdriver-bidi/#type-network-FetchTimingInfo.
 */
class FetchTimingInfo {
  private readonly _originTime: number
  private readonly _requestTime: number
  private readonly _redirectStart: number
  private readonly _redirectEnd: number
  private readonly _fetchStart: number
  private readonly _dnsStart: number
  private readonly _dnsEnd: number
  private readonly _connectStart: number
  private readonly _connectEnd: number
  private readonly _tlsStart: number
  private readonly _requestStart: number
  private readonly _responseStart: number
  private readonly _responseEnd: number

  constructor(
    originTime: number,
    requestTime: number,
    redirectStart: number,
    redirectEnd: number,
    fetchStart: number,
    dnsStart: number,
    dnsEnd: number,
    connectStart: number,
    connectEnd: number,
    tlsStart: number,
    requestStart: number,
    responseStart: number,
    responseEnd: number,
  ) {
    this._originTime = originTime
    this._requestTime = requestTime
    this._redirectStart = redirectStart
    this._redirectEnd = redirectEnd
    this._fetchStart = fetchStart
    this._dnsStart = dnsStart
    this._dnsEnd = dnsEnd
    this._connectStart = connectStart
    this._connectEnd = connectEnd
    this._tlsStart = tlsStart
    this._requestStart = requestStart
    this._responseStart = responseStart
    this._responseEnd = responseEnd
  }

  /** Gets the origin time. */
  get originTime(): number {
    return this._originTime
  }

  /** Get the request time. */
  get requestTime(): number {
    return this._requestTime
  }

  /** Gets the timestamp when the redirect started. */
  get redirectStart(): number {
    return this._redirectStart
  }

  /** Gets the timestamp when the redirect ended. */
  get redirectEnd(): number {
    return this._redirectEnd
  }

  /** Gets the timestamp when the fetch started. */
  get fetchStart(): number {
    return this._fetchStart
  }

  /** Gets the timestamp when the domain lookup started. */
  get dnsStart(): number {
    return this._dnsStart
  }

  /** Gets the timestamp when the domain lookup ended. */
  get dnsEnd(): number {
    return this._dnsEnd
  }

  /** Gets the timestamp when the connection started. */
  get connectStart(): number {
    return this._connectStart
  }

  /** Gets the timestamp when the connection ended. */
  get connectEnd(): number {
    return this._connectEnd
  }

  /** Gets the timestamp when the secure connection started. */
  get tlsStart(): number {
    return this._tlsStart
  }

  /** Gets the timestamp when the request started. */
  get requestStart(): number {
    return this._requestStart
  }

  /** Gets the timestamp when the response started. */
  get responseStart(): number {
    return this._responseStart
  }

  /** Gets the timestamp when the response ended. */
  get responseEnd(): number {
    return this._responseEnd
  }
}

/**
 * Represents the data of a network request.
 * Described in https://w3c.github.io/webdriver-bidi/#type-network-RequestData.
 */
class RequestData {
  private readonly _request: string
  private readonly _url: string
  private readonly _method: string
  private readonly _headers: Header[]
  private readonly _cookies: Cookie[]
  private readonly _headersSize: number
  private readonly _bodySize: number
  private readonly _timings: FetchTimingInfo

  constructor(
    request: string,
    url: string,
    method: string,
    headers: HeaderJson[],
    cookies: CookieJson[],
    headersSize: number,
    bodySize: number,
    timings: FetchTimingInfoJson,
  ) {
    this._request = request
    this._url = url
    this._method = method
    this._headers = []
    headers.forEach((header) => {
      const name = header.name
      const value = header.value
      this._headers.push(new Header(name, new BytesValue(value.type, value.value)))
    })
    this._cookies = []
    cookies.forEach((cookie) => {
      const name = cookie.name
      const domain = cookie.domain
      const path = cookie.path
      const size = cookie.size
      const httpOnly = cookie.httpOnly
      const secure = cookie.secure
      const sameSite = cookie.sameSite
      const value = 'value' in cookie ? (cookie.value ?? null) : null
      const expires = 'expires' in cookie ? (cookie.expires ?? null) : null
      this._cookies.push(new Cookie(name, value, domain, path, size, httpOnly, secure, sameSite, expires))
    })
    this._headersSize = headersSize
    this._bodySize = bodySize
    this._timings = new FetchTimingInfo(
      timings.originTime,
      timings.requestTime,
      timings.redirectStart,
      timings.redirectEnd,
      timings.fetchStart,
      timings.dnsStart,
      timings.dnsEnd,
      timings.connectStart,
      timings.connectEnd,
      timings.tlsStart,
      timings.requestStart,
      timings.responseStart,
      timings.responseEnd,
    )
  }

  /** Get the request id. */
  get request(): string {
    return this._request
  }

  /** Get the URL of the request. */
  get url(): string {
    return this._url
  }

  /** Get the HTTP method of the request. */
  get method(): string {
    return this._method
  }

  /** Get the headers of the request. */
  get headers(): Header[] {
    return this._headers
  }

  /** Get the cookies of the request. */
  get cookies(): Cookie[] {
    return this._cookies
  }

  /** Get the size of the headers in bytes. */
  get headersSize(): number {
    return this._headersSize
  }

  /** Get the size of the request body in bytes. */
  get bodySize(): number {
    return this._bodySize
  }

  /** Get the timing information of the request. */
  get timings(): FetchTimingInfo {
    return this._timings
  }
}

/**
 * Represents the base parameters for a network request.
 * Described in https://w3c.github.io/webdriver-bidi/#type-network-BaseParameters.
 */
class BaseParameters {
  private readonly _id: string
  private readonly _navigation: NavigationInfo | null
  private readonly _redirectCount: number
  private readonly _request: RequestData
  private readonly _timestamp: number

  constructor(
    id: string,
    navigation: NavigationJson | null,
    redirectCount: number,
    request: RequestDataJson,
    timestamp: number,
  ) {
    this._id = id
    this._navigation =
      navigation != null
        ? new NavigationInfo(navigation.context, navigation.navigation, navigation.timestamp, navigation.url)
        : null
    this._redirectCount = redirectCount
    this._request = new RequestData(
      request.request,
      request.url,
      request.method,
      request.headers,
      request.cookies,
      request.headersSize,
      request.bodySize,
      request.timings,
    )
    this._timestamp = timestamp
  }

  /** Gets the browsing context ID of the network request. */
  get id(): string {
    return this._id
  }

  /** Gets the navigation information associated with the network request, or null if not available. */
  get navigation(): NavigationInfo | null {
    return this._navigation
  }

  /** Gets the number of redirects that occurred during the network request. */
  get redirectCount(): number {
    return this._redirectCount
  }

  /** Gets the request data for the network request. */
  get request(): RequestData {
    return this._request
  }

  /** Gets the timestamp of the network request. */
  get timestamp(): number {
    return this._timestamp
  }
}

/**
 * Represents source in the network.
 * Described in https://w3c.github.io/webdriver-bidi/#type-network-Initiator.
 */
class Initiator {
  private readonly _type: string
  private readonly _columnNumber: number
  private readonly _lineNumber: number
  private readonly _stackTrace: unknown
  private readonly _request: string

  /**
   * Constructs a new Initiator instance.
   * @param type - The type of the initiator.
   * @param columnNumber - The column number.
   * @param lineNumber - The line number.
   * @param stackTrace - The stack trace.
   * @param request - The request id.
   */
  constructor(type: string, columnNumber: number, lineNumber: number, stackTrace: unknown, request: string) {
    this._type = type
    this._columnNumber = columnNumber
    this._lineNumber = lineNumber
    this._stackTrace = stackTrace
    this._request = request
  }

  /** Gets the type of the initiator. */
  get type(): string {
    return this._type
  }

  /** Gets the column number. */
  get columnNumber(): number {
    return this._columnNumber
  }

  /** Gets the line number. */
  get lineNumber(): number {
    return this._lineNumber
  }

  /** Gets the stack trace. */
  get stackTrace(): unknown {
    return this._stackTrace
  }

  /** Gets the request ID. */
  get request(): string {
    return this._request
  }
}

/**
 * Represents the BeforeRequestSent event parameters.
 * @extends BaseParameters
 * Described in https://w3c.github.io/webdriver-bidi/#event-network-beforeSendRequest.
 */
export class BeforeRequestSent extends BaseParameters {
  private readonly _initiator: Initiator

  constructor(
    id: string,
    navigation: NavigationJson | null,
    redirectCount: number,
    request: RequestDataJson,
    timestamp: number,
    initiator: InitiatorJson,
  ) {
    super(id, navigation, redirectCount, request, timestamp)
    this._initiator = new Initiator(
      initiator.type,
      initiator.columnNumber,
      initiator.lineNumber,
      initiator.stackTrace,
      initiator.request,
    )
  }

  /** Get the initiator of the request. */
  get initiator(): Initiator {
    return this._initiator
  }
}

/**
 * Represents the FetchError event parameters.
 * Described https://w3c.github.io/webdriver-bidi/#event-network-fetchError
 * @extends BaseParameters
 */
export class FetchError extends BaseParameters {
  private readonly _errorText: string

  /**
   * Creates a new FetchError instance.
   * @param id - The ID of the error.
   * @param navigation - The navigation information.
   * @param redirectCount - The number of redirects.
   * @param request - The request object.
   * @param timestamp - The timestamp of the error.
   * @param errorText - The error text.
   */
  constructor(
    id: string,
    navigation: NavigationJson | null,
    redirectCount: number,
    request: RequestDataJson,
    timestamp: number,
    errorText: string,
  ) {
    super(id, navigation, redirectCount, request, timestamp)
    this._errorText = errorText
  }

  /** Gets the error text. */
  get errorText(): string {
    return this._errorText
  }
}

/**
 * Represents the response data received from a network request.
 * Described in https://w3c.github.io/webdriver-bidi/#type-network-ResponseData.
 */
class ResponseData {
  private readonly _url: string
  private readonly _protocol: string
  private readonly _status: number
  private readonly _statusText: string
  private readonly _fromCache: boolean
  private readonly _headers: unknown
  private readonly _mimeType: string
  private readonly _bytesReceived: number
  private readonly _headersSize: number | undefined
  private readonly _bodySize: number
  private readonly _content: unknown

  constructor(
    url: string,
    protocol: string,
    status: number,
    statusText: string,
    fromCache: boolean,
    headers: unknown,
    mimeType: string,
    bytesReceived: number,
    headersSize: number | undefined,
    bodySize: number,
    content: unknown,
  ) {
    this._url = url
    this._protocol = protocol
    this._status = status
    this._statusText = statusText
    this._fromCache = fromCache
    this._headers = headers
    this._mimeType = mimeType
    this._bytesReceived = bytesReceived
    this._headersSize = headersSize
    this._bodySize = bodySize
    this._content = content
  }

  /** Get the URL. */
  get url(): string {
    return this._url
  }

  /** Get the protocol. */
  get protocol(): string {
    return this._protocol
  }

  /** Get the HTTP status. */
  get status(): number {
    return this._status
  }

  /** Gets the status text. */
  get statusText(): string {
    return this._statusText
  }

  /** Gets the value indicating whether the data is retrieved from cache. */
  get fromCache(): boolean {
    return this._fromCache
  }

  /** Get the headers. */
  get headers(): unknown {
    return this._headers
  }

  /** The MIME type of the network resource. */
  get mimeType(): string {
    return this._mimeType
  }

  /** Gets the number of bytes received. */
  get bytesReceived(): number {
    return this._bytesReceived
  }

  /** Get the size of the headers. */
  get headerSize(): number | undefined {
    return this._headersSize
  }

  /** Get the size of the body. */
  get bodySize(): number {
    return this._bodySize
  }

  /** Gets the content. */
  get content(): unknown {
    return this._content
  }
}

/**
 * Represents the ResponseStarted event parameters.
 * Described in https://w3c.github.io/webdriver-bidi/#event-network-responseStarted.
 * @extends BaseParameters
 */
export class ResponseStarted extends BaseParameters {
  private readonly _response: ResponseData

  constructor(
    id: string,
    navigation: NavigationJson | null,
    redirectCount: number,
    request: RequestDataJson,
    timestamp: number,
    response: ResponseDataJson,
  ) {
    super(id, navigation, redirectCount, request, timestamp)
    this._response = new ResponseData(
      response.url,
      response.protocol,
      response.status,
      response.statusText,
      response.fromCache,
      response.headers,
      response.mimeType,
      response.bytesReceived,
      response.headerSize,
      response.bodySize,
      response.content,
    )
  }

  /** Get the response data. */
  get response(): ResponseData {
    return this._response
  }
}
