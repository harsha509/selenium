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

import * as http from 'node:http';
import * as https from 'node:https';
import * as url from 'node:url';
import { Agent as HttpAgent } from 'node:http';

import * as httpLib from '../lib/http';

/**
 * Request options for HTTP requests.
 */
interface RequestOptions {
  protocol?: string;
  auth?: string;
  hostname?: string;
  host?: string;
  port?: string;
  path?: string;
  pathname?: string;
  search?: string | null;
  hash?: string | null;
  method?: string;
  headers?: Record<string, string>;
  agent?: http.Agent | null;
}

/**
 * @param aUrl The request URL to parse.
 * @return The request options.
 * @throws {Error} if the URL does not include a hostname.
 */
function getRequestOptions(aUrl: string): RequestOptions {
  // eslint-disable-next-line n/no-deprecated-api
  let options = url.parse(aUrl) as RequestOptions;
  if (!options.hostname) {
    throw new Error('Invalid URL: ' + aUrl);
  }
  // Delete the search and has portions as they are not used.
  options.search = null;
  options.hash = null;
  options.path = options.pathname;
  options.hostname = options.hostname === 'localhost' ? '127.0.0.1' : options.hostname; // To support Node 17 and above. Refer https://github.com/nodejs/node/issues/40702 for details.
  return options;
}

/** @const {string} */
const USER_AGENT = (function() {
  const version = require('../package.json').version;
  const platform = { darwin: 'mac', win32: 'windows' }[process.platform] || 'linux';
  return `selenium/${version} (js ${platform})`;
})();

/**
 * A basic HTTP client used to send messages to a remote end.
 */
export class HttpClient implements httpLib.Client {
  /** @private */
  private agent_: http.Agent | null;

  /**
   * Base options for each request.
   * @private
   */
  private options_: RequestOptions;

  /**
   * client options, header overrides
   */
  private client_options: Record<string, any>;

  /**
   * @private
   */
  private proxyOptions_: RequestOptions | null;

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
    opt_agent?: http.Agent,
    opt_proxy?: string,
    client_options: Record<string, any> = {}
  ) {
    this.agent_ = opt_agent || null;
    this.options_ = getRequestOptions(serverUrl);
    this.client_options = client_options;
    this.proxyOptions_ = opt_proxy ? getRequestOptions(opt_proxy) : null;
  }

  get keepAlive(): boolean {
    return (this.agent_ as any)?.keepAlive || false;
  }

  set keepAlive(value: boolean | string) {
    if (this.agent_ && (value === 'true' || value === true)) {
      (this.agent_ as any).keepAlive = true;
    }
  }

  /**
   * Sends a request to the server.
   * @param httpRequest The request to send.
   * @return A promise that will be resolved with the server's response.
   */
  send(httpRequest: httpLib.Request): Promise<httpLib.Response> {
    let data: string | undefined;
    let headers: Record<string, string> = {};

    if (httpRequest.headers) {
      httpRequest.headers.forEach(function(value, name) {
        headers[name] = value;
      });
    }

    headers['User-Agent'] = this.client_options['user-agent'] || USER_AGENT;
    headers['Content-Length'] = '0';
    if (httpRequest.method == 'POST' || httpRequest.method == 'PUT') {
      data = JSON.stringify(httpRequest.data);
      headers['Content-Length'] = Buffer.byteLength(data, 'utf8').toString();
      headers['Content-Type'] = 'application/json;charset=UTF-8';
    }

    let path = this.options_.path || '';
    if (path.endsWith('/') && httpRequest.path.startsWith('/')) {
      path += httpRequest.path.substring(1);
    } else {
      path += httpRequest.path;
    }
    // eslint-disable-next-line n/no-deprecated-api
    let parsedPath = url.parse(path);

    let options: RequestOptions = {
      agent: this.agent_,
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
    };

    return new Promise((fulfill, reject) => {
      sendRequest(options, fulfill, reject, data, this.proxyOptions_);
    });
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
  options: RequestOptions,
  onOk: (response: httpLib.Response) => void,
  onError: (error: Error) => void,
  opt_data?: string,
  opt_proxy?: RequestOptions | null,
  opt_retries?: number
): void {
  var hostname = options.hostname;
  var port = options.port;

  if (opt_proxy) {
    let proxy = opt_proxy;

    // RFC 2616, section 5.1.2:
    // The absoluteURI form is REQUIRED when the request is being made to a
    // proxy.
    let absoluteUri = url.format(options);

    // RFC 2616, section 14.23:
    // An HTTP/1.1 proxy MUST ensure that any request message it forwards does
    // contain an appropriate Host header field that identifies the service
    // being requested by the proxy.
    let targetHost = options.hostname || '';
    if (options.port) {
      targetHost += ':' + options.port;
    }

    // Update the request options with our proxy info.
    if (!options.headers) {
      options.headers = {};
    }
    options.headers['Host'] = targetHost;
    options.path = absoluteUri;
    options.host = proxy.host;
    options.hostname = proxy.hostname;
    options.port = proxy.port;

    // Update the protocol to avoid EPROTO errors when the webdriver proxy
    // uses a different protocol from the remote selenium server.
    options.protocol = opt_proxy.protocol;

    if (proxy.auth) {
      options.headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(proxy.auth).toString('base64');
    }
  }

  let requestFn = options.protocol === 'https:' ? https.request : http.request;
  var request = requestFn(options, function onResponse(response) {
    if (response.statusCode == 302 || response.statusCode == 303) {
      let location;
      try {
        // eslint-disable-next-line n/no-deprecated-api
        location = url.parse(response.headers['location'] || '');
      } catch (ex) {
        // Convert IncomingHttpHeaders to Record<string, string>
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) {
            headers[key] = value.join(', ');
          } else if (value !== undefined) {
            headers[key] = value;
          }
        }
        
        onError(
          Error(
            'Failed to parse "Location" header for server redirect: ' +
              (ex as Error).message +
              '\nResponse was: \n' +
              new httpLib.Response(response.statusCode || 0, headers, ''),
          ),
        );
        return;
      }

      if (!location.hostname) {
        location.hostname = hostname;
        location.port = port;
        location.auth = options.auth;
      }

      request.destroy();
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
            'User-Agent': (options.headers && options.headers['User-Agent']) || USER_AGENT,
          },
        },
        onOk,
        onError,
        undefined,
        opt_proxy,
      );
      return;
    }

    const body: Buffer[] = [];
    response.on('data', body.push.bind(body));
    response.on('end', function() {
      // Convert IncomingHttpHeaders to Record<string, string>
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) {
          headers[key] = value.join(', ');
        } else if (value !== undefined) {
          headers[key] = value;
        }
      }
      
      const resp = new httpLib.Response(
        response.statusCode || 0,
        headers,
        Buffer.concat(body).toString('utf8').replace(/\0/g, ''),
      );
      onOk(resp);
    });
  });

  request.on('error', function(e) {
    if (typeof opt_retries === 'undefined') {
      opt_retries = 0;
    }

    if (shouldRetryRequest(opt_retries, e)) {
      opt_retries += 1;
      setTimeout(function() {
        sendRequest(options, onOk, onError, opt_data, opt_proxy, opt_retries);
      }, 15);
    } else {
      let message = e.message;
      if ('code' in e && e.code) {
        message = e.code + ' ' + message;
      }
      onError(new Error(message));
    }
  });

  if (opt_data) {
    request.write(opt_data);
  }

  request.end();
}

const MAX_RETRIES = 3;

/**
 * A retry is sometimes needed on Windows where we may quickly run out of
 * ephemeral ports. A more robust solution is bumping the MaxUserPort setting
 * as described here: http://msdn.microsoft.com/en-us/library/aa560610%28v=bts.20%29.aspx
 *
 * @param retries
 * @param err
 * @return
 */
function shouldRetryRequest(retries: number, err: Error & { code?: string }): boolean {
  return retries < MAX_RETRIES && isRetryableNetworkError(err);
}

/**
 * @param err
 * @return
 */
function isRetryableNetworkError(err: Error & { code?: string }): boolean {
  if (err && err.code) {
    return (
      err.code === 'ECONNABORTED' ||
      err.code === 'ECONNRESET' ||
      err.code === 'ECONNREFUSED' ||
      err.code === 'EADDRINUSE' ||
      err.code === 'EPIPE' ||
      err.code === 'ETIMEDOUT'
    );
  }

  return false;
}

// PUBLIC API

export const Agent = http.Agent;
export const Executor = httpLib.Executor;
export const Request = httpLib.Request;
export const Response = httpLib.Response;
