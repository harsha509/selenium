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
 * @fileoverview Defines functions for configuring a webdriver proxy:
 *
 *     const proxy = require('selenium-webdriver/proxy')
 *     const {Capabilities} = require('selenium-webdriver')
 *
 *     let capabilities = new Capabilities()
 *     capabilities.setProxy(proxy.manual({http: 'host:1234'})
 */

'use strict'

/**
 * Supported {@linkplain Config proxy configuration} types.
 */
enum Type {
  AUTODETECT = 'autodetect',
  DIRECT = 'direct',
  MANUAL = 'manual',
  PAC = 'pac',
  SYSTEM = 'system',
}

/**
 * Describes how a proxy should be configured for a WebDriver session.
 */
interface Config {
  /**
   * The proxy type.
   */
  proxyType: Type
}

/**
 * Describes how to configure a PAC proxy.
 */
interface PacConfig extends Config {
  /**
   * URL for the PAC file to use.
   */
  proxyAutoconfigUrl: string
}

/**
 * Record object that defines a manual proxy configuration. Manual
 * configurations can be easily created using either the
 * {@link ./proxy.manual proxy.manual()} or {@link ./proxy.socks proxy.socks()}
 * factory method.
 */
interface ManualConfig extends Config {
  /**
   * The proxy host for FTP requests.
   */
  ftpProxy?: string

  /**
   * The proxy host for HTTP requests.
   */
  httpProxy?: string

  /**
   * An array of hosts which should bypass all proxies.
   */
  noProxy?: string[]

  /**
   * The proxy host for HTTPS requests.
   */
  sslProxy?: string

  /**
   * Defines the host and port for the SOCKS proxy to use.
   */
  socksProxy?: string

  /**
   * Defines the SOCKS proxy version. Must be a number in the range [0, 255].
   */
  socksVersion?: number
}

/**
 * Configures WebDriver to bypass all browser proxies.
 * @return A new proxy configuration object.
 */
function direct(): Config {
  return { proxyType: Type.DIRECT }
}

/**
 * Manually configures the browser proxy.  The following options are
 * supported:
 *
 * - `ftp`: Proxy host to use for FTP requests
 * - `http`: Proxy host to use for HTTP requests
 * - `https`: Proxy host to use for HTTPS requests
 * - `bypass`: A list of hosts requests should directly connect to,
 *     bypassing any other proxies for that request. May be specified as a
 *     comma separated string, or a list of strings.
 *
 * Behavior is undefined for FTP, HTTP, and HTTPS requests if the
 * corresponding key is omitted from the configuration options.
 *
 * @param options Proxy configuration options.
 * @return A new proxy configuration object.
 */
function manual({
  ftp,
  http,
  https,
  bypass,
}: {
  ftp?: string
  http?: string
  https?: string
  bypass?: string[]
}): ManualConfig {
  return {
    proxyType: Type.MANUAL,
    ftpProxy: ftp,
    httpProxy: http,
    sslProxy: https,
    noProxy: bypass,
  }
}

/**
 * Creates a proxy configuration for a socks proxy.
 *
 * __Example:__
 *
 *     const {Capabilities} = require('selenium-webdriver')
 *     const proxy = require('selenium-webdriver/lib/proxy')
 *
 *     let capabilities = new Capabilities()
 *     capabilities.setProxy(proxy.socks('localhost:1234'))
 *
 *     // Or, to include authentication.
 *     capabilities.setProxy(proxy.socks('bob:password@localhost:1234'))
 *
 *
 * @param socksProxy The proxy host, in the form `hostname:port`.
 * @param socksVersion The SOCKS proxy version.
 * @return A new proxy configuration object.
 * @see https://en.wikipedia.org/wiki/SOCKS
 */
function socks(socksProxy: string, socksVersion?: number): ManualConfig {
  return {
    proxyType: Type.MANUAL,
    socksProxy,
    socksVersion,
  }
}

/**
 * Configures WebDriver to configure the browser proxy using the PAC file at
 * the given URL.
 * @param proxyAutoconfigUrl URL for the PAC proxy to use.
 * @return A new proxy configuration object.
 */
function pac(proxyAutoconfigUrl: string): PacConfig {
  return { proxyType: Type.PAC, proxyAutoconfigUrl }
}

/**
 * Configures WebDriver to use the current system's proxy.
 * @return A new proxy configuration object.
 */
function system(): Config {
  return { proxyType: Type.SYSTEM }
}

export { Type, Config, ManualConfig, PacConfig, system, pac, socks, manual, direct }
