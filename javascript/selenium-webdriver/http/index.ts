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
 * @fileoverview Defines an {@linkplain cmd.Executor command executor} that
 * communicates with a remote end using HTTP + JSON.
 */

import * as http from 'node:http'
import * as https from 'node:https'
import { createRequire } from 'node:module'
import * as url from 'node:url'

import * as httpLib from '../lib/http'
import * as self from './index'

/** Parsed request target, as produced by the legacy `url.parse`. */
type RequestOptions = url.UrlWithStringQuery

/** Everything `sendRequest` needs to issue one request. */
interface SendOptions {
  agent?: http.Agent | null
  method?: string
  auth?: string | null
  host?: string | null
  hostname?: string | null
  port?: string | null
  protocol?: string | null
  path?: string | null
  pathname?: string | null
  search?: string | null
  hash?: string | null
  headers: http.OutgoingHttpHeaders
}

/** `http.Agent` exposes the keep-alive flag at runtime; the typings omit it. */
interface KeepAliveAgent extends http.Agent {
  keepAlive?: boolean
}

/**
 * @param aUrl The request URL to parse.
 * @return The request options.
 * @throws {Error} if the URL does not include a hostname.
 */
function getRequestOptions(aUrl: string): RequestOptions {
  // eslint-disable-next-line n/no-deprecated-api
  const options = url.parse(aUrl)
  if (!options.hostname) {
    throw new Error('Invalid URL: ' + aUrl)
  }
  // Delete the search and has portions as they are not used.
  options.search = null
  options.hash = null
  options.path = options.pathname
  options.hostname = options.hostname === 'localhost' ? '127.0.0.1' : options.hostname // To support Node 17 and above. Refer https://github.com/nodejs/node/issues/40702 for details.
  return options
}

const USER_AGENT = (function () {
  const version: string = createRequire(__filename)('../package.json').version
  const platforms: Record<string, string> = { darwin: 'mac', win32: 'windows' }
  const platform = platforms[process.platform] || 'linux'
  return `selenium/${version} (js ${platform})`
})()

/**
 * A basic HTTP client used to send messages to a remote end.
 */
export class HttpClient implements httpLib.Client {
  private readonly agent_: KeepAliveAgent | null
  /** Base options for each request. */
  private readonly options_: RequestOptions
  /** client options, header overrides */
  client_options: Record<string, unknown>
  private readonly proxyOptions_: RequestOptions | null

  /**
   * @param serverUrl URL for the WebDriver server to send commands to.
   * @param opt_agent The agent to use for each request.
   *     Defaults to `http.globalAgent`.
   * @param opt_proxy The proxy to use for the connection to the
   *     server. Default is to use no proxy.
   * @param client_options
   */
  constructor(
    serverUrl: string,
    opt_agent?: http.Agent | null,
    opt_proxy?: string | null,
    client_options: Record<string, unknown> = {},
  ) {
    this.agent_ = opt_agent || null
    this.options_ = getRequestOptions(serverUrl)
    this.client_options = client_options

    /**
     * sets keep-alive for the agent
     * see https://stackoverflow.com/a/58332910
     */
    this.keepAlive = this.client_options['keep-alive']

    this.proxyOptions_ = opt_proxy ? getRequestOptions(opt_proxy) : null
  }

  get keepAlive(): boolean | undefined {
    return this.agent_?.keepAlive
  }

  set keepAlive(value: unknown) {
    if (this.agent_ && (value === 'true' || value === true)) {
      this.agent_.keepAlive = true
    }
  }

  /** @override */
  send(httpRequest: httpLib.Request): Promise<httpLib.Response> {
    let data: string | undefined

    const headers: http.OutgoingHttpHeaders = {}

    if (httpRequest.headers) {
      httpRequest.headers.forEach(function (value, name) {
        headers[name] = value
      })
    }

    const userAgent = this.client_options['user-agent']
    headers['User-Agent'] = typeof userAgent === 'string' && userAgent ? userAgent : USER_AGENT
    headers['Content-Length'] = 0
    if (httpRequest.method == 'POST' || httpRequest.method == 'PUT') {
      data = JSON.stringify(httpRequest.data)
      headers['Content-Length'] = Buffer.byteLength(data, 'utf8')
      headers['Content-Type'] = 'application/json;charset=UTF-8'
    }

    let path = this.options_.path ?? ''
    if (path.endsWith('/') && httpRequest.path.startsWith('/')) {
      path += httpRequest.path.substring(1)
    } else {
      path += httpRequest.path
    }
    // eslint-disable-next-line n/no-deprecated-api
    const parsedPath = url.parse(path)

    const options: SendOptions = {
      agent: this.agent_ || null,
      method: httpRequest.method,

      auth: this.options_.auth,
      hostname: this.options_.hostname,
      port: this.options_.port,
      protocol: this.options_.protocol,

      path: parsedPath.path,
      pathname: parsedPath.pathname,
      search: parsedPath.search,
      hash: parsedPath.hash,

      headers,
    }

    return new Promise((fulfill, reject) => {
      sendRequest(options, fulfill, reject, data, this.proxyOptions_)
    })
  }
}

/**
 * Sends a single HTTP request.
 * @param options The request options.
 * @param onOk The function to call if the request succeeds.
 * @param onError The function to call if the request fails.
 * @param opt_data The data to send with the request.
 * @param opt_proxy The proxy server to use for the request.
 * @param opt_retries The current number of retries.
 */
function sendRequest(
  options: SendOptions,
  onOk: (response: httpLib.Response) => void,
  onError: (error: Error) => void,
  opt_data?: string,
  opt_proxy?: RequestOptions | null,
  opt_retries?: number,
): void {
  const hostname = options.hostname
  const port = options.port

  if (opt_proxy) {
    const proxy = opt_proxy

    // RFC 2616, section 5.1.2:
    // The absoluteURI form is REQUIRED when the request is being made to a
    // proxy.
    const absoluteUri = url.format(options)

    // RFC 2616, section 14.23:
    // An HTTP/1.1 proxy MUST ensure that any request message it forwards does
    // contain an appropriate Host header field that identifies the service
    // being requested by the proxy.
    let targetHost = options.hostname ?? ''
    if (options.port) {
      targetHost += ':' + options.port
    }

    // Update the request options with our proxy info.
    options.headers['Host'] = targetHost
    options.path = absoluteUri
    options.host = proxy.host
    options.hostname = proxy.hostname
    options.port = proxy.port

    // Update the protocol to avoid EPROTO errors when the webdriver proxy
    // uses a different protocol from the remote selenium server.
    options.protocol = opt_proxy.protocol

    if (proxy.auth) {
      options.headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(proxy.auth).toString('base64')
    }
  }

  const requestFn = options.protocol === 'https:' ? https.request : http.request
  const request = requestFn({ ...options, agent: options.agent || undefined }, function onResponse(response) {
    if (response.statusCode == 302 || response.statusCode == 303) {
      let location
      try {
        const locationHeader = response.headers['location']
        if (typeof locationHeader !== 'string') {
          throw new TypeError(`expected a string "Location" header, but got ${typeof locationHeader}`)
        }
        // eslint-disable-next-line n/no-deprecated-api
        location = url.parse(locationHeader)
      } catch (ex) {
        onError(
          Error(
            'Failed to parse "Location" header for server redirect: ' +
              (ex instanceof Error ? ex.message : String(ex)) +
              '\nResponse was: \n' +
              new httpLib.Response(response.statusCode, response.headers, ''),
          ),
        )
        return
      }

      if (!location.hostname) {
        location.hostname = hostname ?? null
        location.port = port ?? null
        location.auth = options.auth ?? null
      }

      request.destroy()
      sendRequest(
        {
          method: 'GET',
          protocol: location.protocol || options.protocol,
          hostname: location.hostname,
          port: location.port,
          path: location.path,
          auth: location.auth,
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
          headers: {
            Accept: 'application/json; charset=utf-8',
            'User-Agent': options.headers['User-Agent'] || USER_AGENT,
          },
        },
        onOk,
        onError,
        undefined,
        opt_proxy,
      )
      return
    }

    const body: Buffer[] = []
    response.on('data', body.push.bind(body))
    response.on('end', function () {
      const resp = new httpLib.Response(
        response.statusCode ?? 0,
        response.headers,
        Buffer.concat(body).toString('utf8').replace(/\0/g, ''),
      )
      onOk(resp)
    })
  })

  request.on('error', function (e: NodeJS.ErrnoException) {
    if (typeof opt_retries === 'undefined') {
      opt_retries = 0
    }

    if (shouldRetryRequest(opt_retries, e)) {
      opt_retries += 1
      setTimeout(function () {
        sendRequest(options, onOk, onError, opt_data, opt_proxy, opt_retries)
      }, 15)
    } else {
      let message = e.message
      if (e.code) {
        message = e.code + ' ' + message
      }
      onError(new Error(message))
    }
  })

  if (opt_data) {
    request.write(opt_data)
  }

  request.end()
}

const MAX_RETRIES = 3

/**
 * A retry is sometimes needed on Windows where we may quickly run out of
 * ephemeral ports. A more robust solution is bumping the MaxUserPort setting
 * as described here: http://msdn.microsoft.com/en-us/library/aa560610%28v=bts.20%29.aspx
 *
 * @param retries
 * @param err
 */
function shouldRetryRequest(retries: number, err: NodeJS.ErrnoException): boolean {
  return retries < MAX_RETRIES && isRetryableNetworkError(err)
}

/**
 * @param err
 */
function isRetryableNetworkError(err: NodeJS.ErrnoException): boolean {
  if (err && err.code) {
    return (
      err.code === 'ECONNABORTED' ||
      err.code === 'ECONNRESET' ||
      err.code === 'ECONNREFUSED' ||
      err.code === 'EADDRINUSE' ||
      err.code === 'EPIPE' ||
      err.code === 'ETIMEDOUT'
    )
  }

  return false
}

// PUBLIC API

export const Agent = http.Agent
export type Agent = http.Agent
export { Executor, Request, Response } from '../lib/http'

/** Keeps `import x from '...'` working for esModuleInterop/Babel consumers; deliberate exception to the no-default-export rule. */
const defaultExport: typeof self = self
export default defaultExport
