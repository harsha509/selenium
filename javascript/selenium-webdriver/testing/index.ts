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
 * @fileoverview Provides extensions for
 * [Jasmine](https://jasmine.github.io) and [Mocha](https://mochajs.org).
 *
 * You may conditionally suppress a test function using the exported
 * "ignore" function. If the provided predicate returns true, the attached
 * test case will be skipped:
 *
 *     test.ignore(maybe()).it('is flaky', function() {
 *       if (Math.random() < 0.5) throw Error();
 *     });
 *
 *     function maybe() { return Math.random() < 0.5; }
 */

import * as fs from 'node:fs'
import { createRequire } from 'node:module'
import * as path from 'node:path'
import type { Runfiles } from '@bazel/runfiles'
import * as chrome from '../chrome'
import * as edge from '../edge'
import * as firefox from '../firefox'
import * as ie from '../ie'
import * as remote from '../remote/index'
import * as safari from '../safari'
import { Browser } from '../lib/capabilities'
import type { CapabilitiesLike } from '../lib/capabilities'
import type { BinaryPaths } from '../common/seleniumManager'
import { Builder } from '../index'
import { getBinaryPaths } from '../common/driverFinder'

/** Test-runner globals (mocha or jasmine) this module relies on at runtime. */
declare function describe(title: string, fn: () => void): void
declare function after(fn: () => unknown): void

let runfiles: Runfiles | undefined
try {
  // Attempt to require @bazel/runfiles
  const bazelRunfiles: { runfiles: Runfiles } = createRequire(__filename)('@bazel/runfiles')
  runfiles = bazelRunfiles.runfiles
} catch {
  // Fall through
}

/**
 * Describes a browser targeted by a {@linkplain suite test suite}.
 */
export interface TargetBrowser {
  /** The {@linkplain Browser name} of the targeted browser. */
  name: string
  /** The specific version of the targeted browser, if any. */
  version?: string
  /** The specific {@linkplain ../lib/capabilities.Platform platform} for the targeted browser, if any. */
  platform?: string
  /** Extra capabilities to merge into every session for this browser. */
  capabilities?: CapabilitiesLike
}

/** A `describe`/`it`-style test function, optionally carrying an `.only` variant. */
type TestHook = ((...args: unknown[]) => unknown) & { only?: TestHook }

function isTestHook(fn: unknown): fn is TestHook {
  return typeof fn === 'function'
}

function color(c: number, s: string): string {
  return process.stdout.isTTY ? `\u001b[${c}m${s}\u001b[0m` : s
}

function green(s: string): string {
  return color(32, s)
}

function cyan(s: string): string {
  return color(36, s)
}

function info(msg: string): void {
  console.info(`${green('[INFO]')} ${msg}`)
}

function warn(msg: string): void {
  console.warn(`${cyan('[WARNING]')} ${msg}`)
}

/**
 * Extracts the browsers for a test suite to target from the `SELENIUM_BROWSER`
 * environment variable.
 *
 * @return the browsers to target.
 */
function getBrowsersToTestFromEnv(): TargetBrowser[] {
  const browsers = process.env['SELENIUM_BROWSER']
  if (!browsers) {
    return []
  }
  return browsers.split(',').map((spec) => {
    const parts = spec.split(/:/, 3)
    let name = parts[0]
    if (name === 'ie') {
      name = Browser.INTERNET_EXPLORER
    } else if (name === 'edge') {
      name = Browser.EDGE
    }
    const version = parts[1]
    const platform = parts[2]
    return { name, version, platform }
  })
}

/**
 * @return the browsers available for testing on this system.
 */
function getAvailableBrowsers(): TargetBrowser[] {
  info(`Searching for WebDriver executables installed on the current system...`)

  const targets: [BinaryPaths, string][] = [
    [getBinaryPaths(new chrome.Options()), Browser.CHROME],
    [getBinaryPaths(new edge.Options()), Browser.EDGE],
    [getBinaryPaths(new firefox.Options()), Browser.FIREFOX],
  ]
  if (process.platform === 'win32') {
    targets.push([getBinaryPaths(new ie.Options()), Browser.INTERNET_EXPLORER])
  }
  if (process.platform === 'darwin') {
    targets.push([getBinaryPaths(new safari.Options()), Browser.SAFARI])
  }

  const availableBrowsers: TargetBrowser[] = []
  for (const pair of targets) {
    const driverPath = pair[0].driverPath
    const browserPath = pair[0].browserPath
    const name = pair[1]
    if (driverPath.length > 0 && browserPath && browserPath.length > 0) {
      info(`... located ${name}`)
      availableBrowsers.push({ name })
    }
  }

  if (availableBrowsers.length === 0) {
    warn(`Unable to locate any WebDriver executables for testing`)
  }

  return availableBrowsers
}

let wasInit = false
let targetBrowsers: TargetBrowser[] = []
let seleniumJar: string | undefined
let seleniumUrl: string | undefined
let seleniumServer: remote.SeleniumServer | null = null

/**
 * Initializes this module by determining which browsers a
 * {@linkplain ./index.suite test suite} should run against. The default
 * behavior is to run tests against every browser with a WebDriver executables
 * (chromedriver, firefoxdriver, etc.) are installed on the system by `PATH`.
 *
 * Specific browsers can be selected at runtime by setting the
 * `SELENIUM_BROWSER` environment variable. This environment variable has the
 * same semantics as  with the WebDriver {@link ../index.Builder Builder},
 * except you may use a comma-delimited list to run against multiple browsers:
 *
 *     SELENIUM_BROWSER=chrome,firefox mocha --recursive tests/
 *
 * The `SELENIUM_REMOTE_URL` environment variable may be set to configure tests
 * to run against an externally managed (usually remote) Selenium server. When
 * set, the WebDriver builder provided by each
 * {@linkplain TestEnvironment#builder TestEnvironment} will automatically be
 * configured to use this server instead of starting a browser driver locally.
 *
 * The `SELENIUM_SERVER_JAR` environment variable may be set to the path of a
 * standalone Selenium server on the local machine that should be used for
 * WebDriver sessions. When set, the WebDriver builder provided by each
 * {@linkplain TestEnvironment} will automatically be configured to use the
 * started server instead of using a browser driver directly. It should only be
 * necessary to set the `SELENIUM_SERVER_JAR` when testing locally against
 * browsers not natively supported by the WebDriver
 * {@link ../index.Builder Builder}.
 *
 * When either of the `SELENIUM_REMOTE_URL` or `SELENIUM_SERVER_JAR` environment
 * variables are set, the `SELENIUM_BROWSER` variable must also be set.
 *
 * @param force whether to force this module to re-initialize and
 *     scan `process.env` again to determine which browsers to run tests
 *     against.
 */
function init(force = false): void {
  if (wasInit && !force) {
    return
  }
  wasInit = true

  // If force re-init, kill the current server if there is one.
  if (seleniumServer) {
    seleniumServer.kill()
    seleniumServer = null
  }

  seleniumJar = process.env['SELENIUM_SERVER_JAR']
  seleniumUrl = process.env['SELENIUM_REMOTE_URL']
  if (seleniumJar) {
    info(`Using Selenium server jar: ${seleniumJar}`)
  }

  if (seleniumUrl) {
    info(`Using Selenium remote end: ${seleniumUrl}`)
  }

  if (seleniumJar && seleniumUrl) {
    throw Error(
      'Ambiguous test configuration: both SELENIUM_REMOTE_URL' +
        ' && SELENIUM_SERVER_JAR environment variables are set',
    )
  }

  const envBrowsers = getBrowsersToTestFromEnv()
  if ((seleniumJar || seleniumUrl) && envBrowsers.length === 0) {
    throw Error(
      'Ambiguous test configuration: when either the SELENIUM_REMOTE_URL or' +
        ' SELENIUM_SERVER_JAR environment variable is set, the' +
        ' SELENIUM_BROWSER variable must also be set.',
    )
  }

  targetBrowsers = envBrowsers.length > 0 ? envBrowsers : getAvailableBrowsers()
  info(`Running tests against [${targetBrowsers.map((b) => b.name).join(', ')}]`)

  after(function () {
    if (seleniumServer) {
      return seleniumServer.kill()
    }
  })
}

/**
 * Defines the environment a {@linkplain suite test suite} is running against.
 * @final
 */
class Environment {
  readonly #browser: TargetBrowser
  readonly #url: string | remote.SeleniumServer | null

  /**
   * @param browser the browser targeted in this environment.
   * @param url remote URL of an existing Selenium server to test against.
   */
  constructor(browser: TargetBrowser, url: string | remote.SeleniumServer | null | undefined = undefined) {
    this.#browser = Object.seal(Object.assign({}, browser))
    this.#url = url || null
  }

  /** @return the target browser for this test environment. */
  get browser(): TargetBrowser {
    return this.#browser
  }

  /**
   * Returns a predicate function that will suppress tests in this environment
   * if the {@linkplain #browser current browser} is in the list of
   * `browsersToIgnore`.
   *
   * @param browsersToIgnore the browsers that should be ignored.
   * @return a new predicate function.
   */
  browsers(...browsersToIgnore: string[]): () => boolean {
    return () => browsersToIgnore.indexOf(this.browser.name) !== -1
  }

  /**
   * @return a new WebDriver builder configured to target this
   *     environment's {@linkplain #browser browser}.
   */
  builder(): Builder {
    const browser = this.browser
    const urlOrServer = this.#url

    const builder = new Builder()

    // Sniff the environment variables for paths to use for the common browsers
    // Chrome
    const chromedriver = process.env.SE_CHROMEDRIVER
    if (chromedriver !== undefined) {
      const found = locate(chromedriver)
      const service = new chrome.ServiceBuilder(found)
      builder.setChromeService(service)
    }
    const chromeBinary = process.env.SE_CHROME
    if (chromeBinary !== undefined) {
      const binary = locate(chromeBinary)
      const options = new chrome.Options()
      options.setChromeBinaryPath(binary)
      options.setAcceptInsecureCerts(true)
      options.addArguments('disable-infobars', 'disable-breakpad', 'disable-dev-shm-usage', 'no-sandbox')
      builder.setChromeOptions(options)
    }
    // Edge
    // Firefox
    const geckodriver = process.env.SE_GECKODRIVER
    if (geckodriver !== undefined) {
      const found = locate(geckodriver)
      const service = new firefox.ServiceBuilder(found)
      builder.setFirefoxService(service)
    }
    const firefoxBinary = process.env.SE_FIREFOX
    if (firefoxBinary !== undefined) {
      const binary = locate(firefoxBinary)
      const options = new firefox.Options()
      options.enableBidi()
      options.setBinary(binary)
      builder.setFirefoxOptions(options)
    }

    builder.disableEnvironmentOverrides()

    const realBuild = builder.build
    builder.build = function () {
      builder.forBrowser(browser.name, browser.version, browser.platform)

      if (browser.capabilities) {
        builder.getCapabilities().merge(browser.capabilities)
      }

      if (browser.name === 'firefox') {
        builder.setCapability('moz:debuggerAddress', true)
      }

      // Enable BiDi for supporting browsers.
      if (browser.name === Browser.FIREFOX || browser.name === Browser.CHROME || browser.name === Browser.EDGE) {
        builder.setCapability('webSocketUrl', true)
        builder.setCapability('unhandledPromptBehavior', 'ignore')
      }

      if (typeof urlOrServer === 'string') {
        builder.usingServer(urlOrServer)
      } else if (urlOrServer) {
        builder.usingServer(urlOrServer.address())
      }
      return realBuild.call(builder)
    }

    return builder
  }
}

/**
 * Configuration options for a {@linkplain ./index.suite test suite}.
 */
export interface SuiteOptions {
  /** The browsers to run the test suite against. */
  browsers?: (string | TargetBrowser)[]
}

/** Runtime placeholder so `SuiteOptions` stays an export; the shape is the interface above. */
export function SuiteOptions(): void {}

let inSuite = false

/**
 * Defines a test suite by calling the provided function once for each of the
 * target browsers. If a suite is not limited to a specific set of browsers in
 * the provided {@linkplain ./index.SuiteOptions suite options}, the suite will
 * be configured to run against each of the {@linkplain ./index.init runtime
 * target browsers}.
 *
 * Sample usage:
 *
 *     const {By, Key, until} = require('selenium-webdriver');
 *     const {suite} = require('selenium-webdriver/testing');
 *
 *     suite(function(env) {
 *       describe('Google Search', function() {
 *         let driver;
 *
 *         before(async function() {
 *           driver = await env.builder().build();
 *         });
 *
 *         after(() => driver.quit());
 *
 *         it('demo', async function() {
 *           await driver.get('http://www.google.com/ncr');
 *
 *           let q = await driver.findElement(By.name('q'));
 *           await q.sendKeys('webdriver', Key.RETURN);
 *           await driver.wait(
 *               until.titleIs('webdriver - Google Search'), 1000);
 *         });
 *       });
 *     });
 *
 * By default, this example suite will run against every WebDriver-enabled
 * browser on the current system. Alternatively, the `SELENIUM_BROWSER`
 * environment variable may be used to run against a specific browser:
 *
 *     SELENIUM_BROWSER=firefox mocha -t 120000 example_test.js
 *
 * @param fn the function to call to build the test suite.
 * @param options configuration options.
 */
function suite(fn: (env: Environment) => void, options: SuiteOptions | undefined = undefined): void {
  if (inSuite) {
    throw Error('Calls to suite() may not be nested')
  }
  try {
    init()
    inSuite = true

    const suiteBrowsers = new Map<string, TargetBrowser>()
    if (options && options.browsers) {
      for (const browser of options.browsers) {
        if (typeof browser === 'string') {
          suiteBrowsers.set(browser, { name: browser })
        } else {
          suiteBrowsers.set(browser.name, browser)
        }
      }
    }

    for (const browser of targetBrowsers) {
      if (suiteBrowsers.size > 0 && !suiteBrowsers.has(browser.name)) {
        continue
      }

      describe(`[${browser.name}]`, function () {
        if (!seleniumUrl && seleniumJar && !seleniumServer) {
          const server = new remote.SeleniumServer(seleniumJar)
          seleniumServer = server

          const startTimeout = 65 * 1000

          function startSelenium(this: { timeout?: unknown }) {
            if (typeof this.timeout === 'function') {
              this.timeout(startTimeout) // For mocha.
            }

            info(`Starting selenium server ${seleniumJar}`)
            return server.start(60 * 1000)
          }

          const beforeHook = Reflect.get(globalThis, 'beforeAll') || Reflect.get(globalThis, 'before')
          if (!isTestHook(beforeHook)) {
            throw TypeError('Expected a global beforeAll or before hook function')
          }
          beforeHook(startSelenium, startTimeout)
        }

        fn(new Environment(browser, seleniumUrl || seleniumServer))
      })
    }
  } finally {
    inSuite = false
  }
}

/**
 * Returns an object with wrappers for the standard mocha/jasmine test
 * functions: `describe` and `it`, which will redirect to `xdescribe` and `xit`,
 * respectively, if provided predicate function returns false.
 *
 * Sample usage:
 *
 *     const {Browser} = require('selenium-webdriver');
 *     const {suite, ignore} = require('selenium-webdriver/testing');
 *
 *     suite(function(env) {
 *
 *         // Skip tests the current environment targets Chrome.
 *         ignore(env.browsers(Browser.CHROME)).
 *         describe('something', async function() {
 *           let driver = await env.builder().build();
 *           // etc.
 *         });
 *     });
 *
 * @param predicateFn A predicate to call to determine
 *     if the test should be suppressed. This function MUST be synchronous.
 * @return an object with wrapped versions of the `describe` and `it` test functions.
 */
function ignore(predicateFn: () => boolean): { describe: TestHook; it: TestHook } {
  const jasmine = Reflect.get(globalThis, 'jasmine')
  const isJasmine = jasmine && typeof jasmine === 'object'

  const hooks = {
    describe: getTestHook('describe'),
    xdescribe: getTestHook('xdescribe'),
    it: getTestHook('it'),
    xit: getTestHook('xit'),
  }
  const fdescribeHook = isJasmine ? getTestHook('fdescribe') : hooks.describe.only
  const fitHook = isJasmine ? getTestHook('fit') : hooks.it.only

  const describe = wrap(hooks.xdescribe, hooks.describe)
  const fdescribe = wrap(hooks.xdescribe, fdescribeHook)
  describe.only = fdescribe

  const it = wrap(hooks.xit, hooks.it)
  const fit = wrap(hooks.xit, fitHook)
  it.only = fit

  return { describe, it }

  function wrap(onSkip: TestHook, onRun: TestHook | undefined): TestHook {
    return function (...args: unknown[]) {
      if (predicateFn()) {
        onSkip(...args)
      } else if (onRun) {
        onRun(...args)
      }
    }
  }
}

/**
 * @param name
 * @throws {TypeError}
 */
function getTestHook(name: string): TestHook {
  const fn = Reflect.get(globalThis, name)
  const type = typeof fn
  if (!isTestHook(fn)) {
    throw TypeError(
      `Expected global.${name} to be a function, but is ${type}.` +
        ' This can happen if you try using this module when running with' +
        ' node directly instead of using jasmine or mocha',
    )
  }
  return fn
}

function locate(fileLike: string): string {
  if (fs.existsSync(fileLike)) {
    return fileLike
  }

  if (!runfiles) {
    throw new Error('Unable to find ' + fileLike)
  }

  try {
    return runfiles.resolve(fileLike)
  } catch {
    // Fall through
  }

  // Is the item in the workspace?
  try {
    return runfiles.resolveWorkspaceRelative(fileLike)
  } catch {
    // Fall through
  }

  // Find the repo mapping file
  let repoMappingFile: string
  try {
    repoMappingFile = runfiles.resolve('_repo_mapping')
  } catch {
    throw new Error('Unable to locate (no repo mapping file): ' + fileLike)
  }
  const lines = fs.readFileSync(repoMappingFile, { encoding: 'utf8' }).split('\n')

  // Build a map of "repo we declared we need" to "path"
  const mapping: Record<string, string> = {}
  for (const line of lines) {
    if (line.startsWith(',')) {
      const parts = line.split(',', 3)
      mapping[parts[1]] = parts[2]
    }
  }

  // Get the first segment of the path
  const pathSegments = fileLike.split('/')
  if (!pathSegments.length) {
    throw new Error('Unable to locate ' + fileLike)
  }

  pathSegments[0] = mapping[pathSegments[0]] ? mapping[pathSegments[0]] : '_main'

  try {
    return runfiles.resolve(path.join(...pathSegments))
  } catch {
    // Fall through
  }

  throw new Error('Unable to find ' + fileLike)
}

// PUBLIC API

export { Environment, init, ignore, suite }
