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

import * as path from 'node:path'
import * as cp from 'node:child_process'
import * as logging from '../lib/logging'
import * as self from './util'

/**
 * returns path to java or 'java' string if JAVA_HOME does not exist in env obj
 */
export function getJavaPath(): string {
  return process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin/java') : 'java'
}

/**
 * @param seleniumStandalonePath path to standalone server
 */
export function isSelenium3x(seleniumStandalonePath: string): boolean {
  const javaPath = getJavaPath()

  const execRes = cp.execFileSync(javaPath, ['-jar', seleniumStandalonePath, '--version'])

  return execRes.toString().trim().startsWith('Selenium server version: 3')
}

/**
 * @param seleniumStandalonePath path to standalone server
 * @param args spawn arguments array
 * returns formatted args based on selenium standalone server version
 */
export function formatSpawnArgs(seleniumStandalonePath: string, args: string[]): string[] {
  if (isSelenium3x(seleniumStandalonePath)) {
    logging
      .getLogger(logging.Type.SERVER)
      .warning('Deprecation: Support for Standalone Server 3.x will be removed soon. Please update to version 4.x')
    return args
  }

  const standaloneArg = 'standalone'
  const port3xArgFormat = '-port'
  const port4xArgFormat = '--port'

  const formattedArgs = Array.from(args)

  const standaloneArgIndex = formattedArgs.findIndex((arg) => arg === seleniumStandalonePath)
  const v3portArgFormat = formattedArgs.findIndex((arg) => arg === port3xArgFormat)

  // old v3x port arg format was -port, new v4x port arg format is --port
  if (v3portArgFormat !== -1) {
    formattedArgs[v3portArgFormat] = port4xArgFormat
  }

  // 'standalone' arg should be right after jar file path
  // in case if it is already in place - returns args
  if (formattedArgs[standaloneArgIndex + 1] === standaloneArg) return formattedArgs

  // insert 'standalone' right after jar file path
  formattedArgs.splice(standaloneArgIndex + 1, 0, standaloneArg)

  return formattedArgs
}

/** Keeps `import x from '...'` working for esModuleInterop/Babel consumers; deliberate exception to the no-default-export rule. */
const defaultExport: typeof self = self
export default defaultExport
