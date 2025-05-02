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

import * as childProcess from 'node:child_process';
import { Stream } from 'node:stream';

/**
 * Options for configuring an executed command.
 */
export interface Options {
  /**
   * Command line arguments for the child process, if any.
   */
  args?: string[];

  /**
   * Environment variables for the spawned process. If unspecified, the
   * child will inherit this process' environment.
   */
  env?: Record<string, string>;

  /**
   * IO configuration for the spawned server child process. If unspecified,
   * the child process' IO output will be ignored.
   * @see <https://nodejs.org/dist/latest-v8.x/docs/api/child_process.html#child_process_options_stdio>
   */
  stdio?: childProcess.StdioOptions;
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
    public readonly code: number | null,
    public readonly signal: string | null
  ) {}

  /** @override */
  toString(): string {
    return `Result(code=${this.code}, signal=${this.signal})`;
  }
}

/**
 * Represents a command running in a sub-process.
 */
export class Command {
  private readonly resultPromise: Promise<Result>;
  private readonly killHook: (signal: string) => void;

  /**
   * @param result The command result.
   * @param onKill The function to call when {@link #kill()} is called.
   */
  constructor(result: Promise<Result>, onKill: (signal: string) => void) {
    this.resultPromise = result;
    this.killHook = onKill;
  }

  /**
   * @return A promise for the result of this command.
   */
  result(): Promise<Result> {
    return this.resultPromise;
  }

  /**
   * Sends a signal to the underlying process.
   * @param opt_signal The signal to send; defaults to `SIGTERM`.
   */
  kill(opt_signal?: string): void {
    this.killHook(opt_signal || 'SIGTERM');
  }
}

/**
 * Spawns a child process. The returned {@link Command} may be used to wait
 * for the process result or to send signals to the process.
 *
 * @param command The executable to spawn.
 * @param opt_options The command options.
 * @return The launched command.
 */
export function exec(command: string, opt_options?: Options): Command {
  const options = opt_options || {};

  let proc = childProcess.spawn(command, options.args || [], {
    env: options.env || process.env,
    stdio: options.stdio || 'ignore',
  });

  // This process should not wait on the spawned child, however, we do
  // want to ensure the child is killed when this process exits.
  proc.unref();
  process.once('exit', onProcessExit);

  const result = new Promise<Result>((resolve, reject) => {
    proc.once('exit', (code, signal) => {
      proc = null as any;
      process.removeListener('exit', onProcessExit);
      resolve(new Result(code, signal));
    });

    proc.once('error', (err) => {
      reject(err);
    });
  });
  
  return new Command(result, killCommand);

  function onProcessExit(): void {
    killCommand('SIGTERM');
  }

  function killCommand(signal: string): void {
    process.removeListener('exit', onProcessExit);
    if (proc) {
      proc.kill(signal as NodeJS.Signals);
      proc = null as any;
    }
  }
}
