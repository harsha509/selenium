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
 *  This implementation is still in beta, and may change.
 *
 *  Wrapper for getting information from the Selenium Manager binaries
 */

import { platform, arch } from 'node:process'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import * as logging from '../lib/logging'
import * as self from './seleniumManager'

/** One log line in Selenium Manager's JSON output. */
interface SeleniumManagerLog {
  level: string
  message: string
}

/** Selenium Manager's `--output json` payload. */
interface SeleniumManagerOutput {
  logs?: SeleniumManagerLog[]
  result: {
    message?: string
    driver_path: string
    browser_path: string
  }
}

/** Resolved driver and browser locations. */
export interface BinaryPaths {
  browserPath: string
  driverPath: string
}

const log_ = logging.getLogger(logging.Type.DRIVER)
let debugMessagePrinted = false

/**
 * Determines the path of the correct Selenium Manager binary
 */
function getBinary(): string {
  const directories: Record<string, string> = {
    darwin: 'macos',
    win32: 'windows',
    cygwin: 'windows',
    linux: arch === 'arm64' ? 'linux-arm64' : 'linux-x86_64',
  }
  const directory = directories[platform]

  const file = directory === 'windows' ? 'selenium-manager.exe' : 'selenium-manager'

  const seleniumManagerBasePath = path.join(__dirname, '..', '/bin')

  const filePath = process.env.SE_MANAGER_PATH || path.join(seleniumManagerBasePath, directory, file)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Unable to obtain Selenium Manager at ${filePath}`)
  }

  if (!debugMessagePrinted) {
    log_.debug(`Selenium Manager binary found at ${filePath}`)
    debugMessagePrinted = true // Set the flag to true after printing the debug message
  }

  return filePath
}

/**
 * Determines the path of the correct driver
 * @param args arguments to invoke Selenium Manager
 * @returns path of the driver and browser location
 */
export function binaryPaths(args: string[]): BinaryPaths {
  const smBinary = getBinary()
  const spawnResult = spawnSync(smBinary, args)
  let output: SeleniumManagerOutput
  if (spawnResult.status) {
    let errorMessage
    if (spawnResult.stderr.toString()) {
      errorMessage = spawnResult.stderr.toString()
    }
    if (spawnResult.stdout.toString()) {
      try {
        output = JSON.parse(spawnResult.stdout.toString())
        logOutput(output)
        errorMessage = output.result.message
      } catch (e) {
        errorMessage = String(e)
      }
    }
    throw new Error(`Error executing command for ${smBinary} with ${args}: ${errorMessage}`)
  }
  try {
    output = JSON.parse(spawnResult.stdout.toString())
  } catch (e) {
    throw new Error(`Error executing command for ${smBinary} with ${args}: ${String(e)}`, { cause: e })
  }

  logOutput(output)
  return {
    driverPath: output.result.driver_path,
    browserPath: output.result.browser_path,
  }
}

function logOutput(output: SeleniumManagerOutput): void {
  for (const log of output.logs ?? []) {
    if (log.level === 'WARN') {
      log_.warning(`${log.message}`)
    }
    if (['DEBUG', 'INFO'].includes(log.level)) {
      log_.debug(`${log.message}`)
    }
  }
}

/** Keeps `import x from '...'` working for esModuleInterop/Babel consumers; deliberate exception to the no-default-export rule. */
const defaultExport: typeof self = self
export default defaultExport
