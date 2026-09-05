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

import * as childProcess from 'node:child_process'

/**
 * Options for configuring an executed command.
 */
export class Options {
  /**
   * Command line arguments for the child process, if any.
   */
  declare args?: string[]

  /**
   * Environment variables for the spawned process. If unspecified, the
   * child will inherit this process' environment.
   */
  declare env?: NodeJS.ProcessEnv

  /**
   * IO configuration for the spawned server child process. If unspecified,
   * the child process' IO output will be ignored.
   *
   * @see <https://nodejs.org/dist/latest-v8.x/docs/api/child_process.html#child_process_options_stdio>
   */
  declare stdio?: childProcess.StdioOptions
}

/**
 * Describes a command's termination conditions.
 */
export class Result {
  /**
   * @param code The exit code, or {@code null} if the command did not
   *     exit normally.
   * @param signal The signal used to kill the command, or {@code null}.
   */
  constructor(
    public code: number | null,
    public signal: string | null,
  ) {}

  /** @override */
  toString(): string {
    return `Result(code=${this.code}, signal=${this.signal})`
  }
}

/**
 * Represents a command running in a sub-process.
 */
export class Command {
  readonly #result: Promise<Result>
  readonly #onKill: (signal: NodeJS.Signals) => void

  /**
   * @param result The command result.
   * @param onKill The function to call when {@link #kill()} is called.
   */
  constructor(result: Promise<Result>, onKill: (signal: NodeJS.Signals) => void) {
    this.#result = result
    this.#onKill = onKill
  }

  /**
   * @return A promise for the result of this command.
   */
  result(): Promise<Result> {
    return this.#result
  }

  /**
   * Sends a signal to the underlying process.
   * @param opt_signal The signal to send; defaults to `SIGTERM`.
   */
  kill(opt_signal?: NodeJS.Signals): void {
    this.#onKill(opt_signal || 'SIGTERM')
  }
}

// PUBLIC API

/**
 * Spawns a child process. The returned {@link Command} may be used to wait
 * for the process result or to send signals to the process.
 *
 * @param command The executable to spawn.
 * @param opt_options The command options.
 * @return The launched command.
 */
export function exec(command: string, opt_options?: Options): Command {
  const options = opt_options || {}

  const child = childProcess.spawn(command, options.args || [], {
    env: options.env || process.env,
    stdio: options.stdio || 'ignore',
  })
  let proc: childProcess.ChildProcess | null = child

  // This process should not wait on the spawned child, however, we do
  // want to ensure the child is killed when this process exits.
  child.unref()
  process.once('exit', onProcessExit)

  const result = new Promise<Result>((resolve, reject) => {
    child.once('exit', (code, signal) => {
      proc = null
      process.removeListener('exit', onProcessExit)
      resolve(new Result(code, signal))
    })

    child.once('error', (err) => {
      reject(err)
    })
  })
  return new Command(result, killCommand)

  function onProcessExit() {
    killCommand('SIGTERM')
  }

  function killCommand(signal: NodeJS.Signals) {
    process.removeListener('exit', onProcessExit)
    if (proc) {
      proc.kill(signal)
      proc = null
    }
  }
}
