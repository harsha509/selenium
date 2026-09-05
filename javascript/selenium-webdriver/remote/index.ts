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

import * as url from 'node:url'
import type { StdioOptions } from 'node:child_process'
import * as httpUtil from '../http/util'
import * as io from '../io/index'
import { exec } from '../io/exec'
import type { Command as ExecCommand } from '../io/exec'
import { Zip } from '../io/zip'
import * as cmd from '../lib/command'
import * as input from '../lib/input'
import type { WebDriver } from '../lib/webdriver'
import * as net from '../net/index'
import * as portprober from '../net/portprober'
import * as logging from '../lib/logging'
import { getJavaPath, formatSpawnArgs } from './util'
import * as self from './index'

/** IO configuration for a spawned server process, as accepted by `child_process.spawn`. */
export type StdIoOptions = StdioOptions

/** A command line flag, or a promise for one. */
export type CommandLineFlag = string | PromiseLike<string>

/**
 * A record object that defines the configuration options for a DriverService
 * instance.
 */
export interface ServiceOptions {
  /** Whether the service should only be accessed on this host's loopback address. */
  loopback?: boolean
  /** The host name to access the server on. If this option is specified, the loopback option will be ignored. */
  hostname?: string
  /** The port to start the server on (must be > 0). A promised port is awaited before starting. */
  port: number | PromiseLike<number>
  /** The arguments to pass to the service. A promised list is awaited before starting. */
  args: CommandLineFlag[] | PromiseLike<CommandLineFlag[]>
  /** The base path on the server for the WebDriver wire protocol (e.g. '/wd/hub'). Defaults to '/'. */
  path?: string | null
  /** The environment variables visible to the server process. Defaults to the current environment. */
  env?: NodeJS.ProcessEnv | null
  /** IO configuration for the spawned server process. */
  stdio?: StdIoOptions
}

/** Runtime placeholder so `ServiceOptions` stays an export; the shape is the interface above. */
export function ServiceOptions(): void {}

/** The options a {@link DriverService.Builder} accumulates before {@link DriverService.Builder#build}. */
interface BuilderOptions {
  args: CommandLineFlag[]
  port: number
  env: NodeJS.ProcessEnv | null
  stdio: StdIoOptions
  hostname?: string
  loopback?: boolean
  path?: string | null
}

/**
 * Manages the life and death of a native executable WebDriver server.
 *
 * It is expected that the driver server implements the
 * https://github.com/SeleniumHQ/selenium/wiki/JsonWireProtocol.
 * Furthermore, the managed server should support multiple concurrent sessions,
 * so that this class may be reused for multiple clients.
 */
export class DriverService {
  private readonly log_: logging.Logger
  private executable_: string | null | undefined
  private readonly loopbackOnly_: boolean
  private readonly hostname_: string | undefined
  private readonly port_: number | PromiseLike<number>
  private readonly args_: CommandLineFlag[] | PromiseLike<CommandLineFlag[]>
  private readonly path_: string
  private readonly env_: NodeJS.ProcessEnv
  private readonly stdio_: StdIoOptions
  /**
   * A promise for the managed subprocess, or null if the server has not been
   * started yet. This promise will never be rejected.
   */
  private command_: Promise<ExecCommand> | null
  /**
   * Promise that resolves to the server's address or null if the server has
   * not been started. This promise will be rejected if the server terminates
   * before it starts accepting WebDriver requests.
   */
  private address_: Promise<string> | null

  /**
   * The default amount of time, in milliseconds, to wait for the server to
   * start.
   */
  static DEFAULT_START_TIMEOUT_MS = 30 * 1000

  /**
   * @param executable Path to the executable to run; may be left unset and
   *     provided later via {@link #setExecutable}.
   * @param options Configuration options for the service.
   */
  constructor(executable: string | null | undefined, options: ServiceOptions) {
    this.log_ = logging.getLogger(`${logging.Type.DRIVER}.DriverService`)
    this.executable_ = executable
    this.loopbackOnly_ = !!options.loopback
    this.hostname_ = options.hostname
    this.port_ = options.port
    this.args_ = options.args
    this.path_ = options.path || '/'
    this.env_ = options.env || process.env
    this.stdio_ = options.stdio || 'ignore'
    this.command_ = null
    this.address_ = null
  }

  getExecutable(): string | null | undefined {
    return this.executable_
  }

  setExecutable(value: string): void {
    this.executable_ = value
  }

  /**
   * @return A promise that resolves to the server's address.
   * @throws {Error} If the server has not been started.
   */
  address(): Promise<string> {
    if (this.address_) {
      return this.address_
    }
    throw Error('Server has not been started.')
  }

  /**
   * Returns whether the underlying process is still running. This does not take
   * into account whether the process is in the process of shutting down.
   *
   * @return Whether the underlying service process is running.
   */
  isRunning(): boolean {
    return !!this.address_
  }

  /**
   * Starts the server if it is not already running.
   *
   * @param opt_timeoutMs How long to wait, in milliseconds, for the server to
   *     start accepting requests. Defaults to 30 seconds.
   * @return A promise that will resolve to the server's base URL when it has
   *     started accepting requests. If the timeout expires before the server
   *     has started, the promise will be rejected.
   */
  start(opt_timeoutMs?: number): Promise<string> {
    if (this.address_) {
      return this.address_
    }

    const timeout = opt_timeoutMs || DriverService.DEFAULT_START_TIMEOUT_MS

    let resolveCommand: ((command: ExecCommand) => void) | undefined
    this.command_ = new Promise((resolve) => (resolveCommand = resolve))

    this.address_ = new Promise((resolveAddress, rejectAddress) => {
      resolveAddress(
        Promise.resolve(this.port_).then((port) => {
          if (port <= 0) {
            throw Error('Port must be > 0: ' + port)
          }

          return resolveCommandLineFlags(this.args_).then((args) => {
            if (!this.executable_) {
              throw Error('Executable path has not been set')
            }
            const command = exec(this.executable_, {
              args: args,
              env: this.env_,
              stdio: this.stdio_,
            })
            resolveCommand?.(command)

            const earlyTermination = command.result().then((result) => {
              const error =
                result.code == null
                  ? Error('Server was killed with ' + result.signal)
                  : Error('Server terminated early with status ' + result.code)
              rejectAddress(error)
              this.address_ = null
              this.command_ = null
              throw error
            })

            let hostname = this.hostname_
            if (!hostname) {
              hostname = (!this.loopbackOnly_ && net.getAddress()) || net.getLoopbackAddress()
            }

            const serverUrl = url.format({
              protocol: 'http',
              hostname: hostname,
              port: port + '',
              pathname: this.path_,
            })

            return new Promise<string>((fulfill, reject) => {
              const cancelToken = earlyTermination.catch((e) => reject(Error(e.message)))

              httpUtil.waitForServer(serverUrl, timeout, cancelToken).then(
                (_) => fulfill(serverUrl),
                (err) => {
                  if (err instanceof httpUtil.CancellationError) {
                    fulfill(serverUrl)
                  } else {
                    reject(err)
                  }
                },
              )
            })
          })
        }),
      )
    })

    return this.address_
  }

  /**
   * Stops the service if it is not currently running. This function will kill
   * the server immediately. To synchronize with the active control flow, use
   * {@link #stop()}.
   *
   * @return A promise that will be resolved when the server has been stopped.
   */
  kill(): Promise<unknown> {
    if (!this.address_ || !this.command_) {
      return Promise.resolve() // Not currently running.
    }
    const cmd = this.command_
    this.address_ = null
    this.command_ = null
    return cmd.then((c) => c.kill('SIGTERM'))
  }

  /**
   * Creates {@link DriverService} objects that manage a WebDriver server in a
   * child process.
   */
  static Builder = class Builder {
    readonly exe_: string | undefined
    options_: BuilderOptions

    /**
     * @param exe Path to the executable to use. This executable must accept the
     *     `--port` flag for defining the port to start the server on.
     * @throws {Error} If the provided executable path does not exist.
     */
    constructor(exe?: string) {
      this.exe_ = exe
      this.options_ = {
        args: [],
        port: 0,
        env: null,
        stdio: 'ignore',
      }
    }

    /**
     * Define additional command line arguments to use when starting the server.
     *
     * @param arguments_ The arguments to include.
     * @return A self reference.
     */
    addArguments(...arguments_: CommandLineFlag[]): this {
      this.options_.args = this.options_.args.concat(arguments_)
      return this
    }

    /**
     * Sets the host name to access the server on. If specified, the
     * {@linkplain #setLoopback() loopback} setting will be ignored.
     *
     * @param hostname
     * @return A self reference.
     */
    setHostname(hostname: string): this {
      this.options_.hostname = hostname
      return this
    }

    /**
     * Sets whether the service should be accessed at this host's loopback
     * address.
     *
     * @param loopback
     * @return A self reference.
     */
    setLoopback(loopback: boolean): this {
      this.options_.loopback = loopback
      return this
    }

    /**
     * Sets the base path for WebDriver REST commands (e.g. "/wd/hub").
     * By default, the driver will accept commands relative to "/".
     *
     * @param basePath The base path to use, or `null` to use the default.
     * @return A self reference.
     */
    setPath(basePath: string | null): this {
      this.options_.path = basePath
      return this
    }

    /**
     * Sets the port to start the server on.
     *
     * @param port The port to use, or 0 for any free port.
     * @return A self reference.
     * @throws {Error} If an invalid port is specified.
     */
    setPort(port: number): this {
      if (port < 0) {
        throw Error(`port must be >= 0: ${port}`)
      }
      this.options_.port = port
      return this
    }

    /**
     * Defines the environment to start the server under. This setting will be
     * inherited by every browser session started by the server. By default, the
     * server will inherit the environment of the current process.
     *
     * @param env The desired environment to use, or `null` if the server
     *     should inherit the current environment.
     * @return A self reference.
     */
    setEnvironment(env: Map<string, string> | NodeJS.ProcessEnv | null): this {
      if (env instanceof Map) {
        const tmp: Record<string, string> = {}
        env.forEach((value, key) => (tmp[key] = value))
        env = tmp
      }
      this.options_.env = env
      return this
    }

    /**
     * IO configuration for the spawned server process. For more information,
     * refer to the documentation of `child_process.spawn`.
     *
     * @param config The desired IO configuration.
     * @return A self reference.
     * @see https://nodejs.org/dist/latest-v4.x/docs/api/child_process.html#child_process_options_stdio
     */
    setStdio(config: StdIoOptions): this {
      this.options_.stdio = config
      return this
    }

    /**
     * Creates a new DriverService using this instance's current configuration.
     *
     * @return A new driver service.
     */
    build(): DriverService {
      const port = this.options_.port || portprober.findFreePort()
      const args = Promise.resolve(port).then((port) => {
        return this.options_.args.concat('--port=' + port)
      })
      const options: ServiceOptions = { ...this.options_, args, port }
      return new DriverService(this.exe_, options)
    }
  }
}

/**
 * @param args
 */
function resolveCommandLineFlags(args: CommandLineFlag[] | PromiseLike<CommandLineFlag[]>): Promise<string[]> {
  // Resolve the outer array, then the individual flags.
  return Promise.resolve(args).then((args) => Promise.all(args))
}

/**
 * A record object describing configuration options for a {@link SeleniumServer}
 * instance.
 */
export interface SeleniumServerOptions {
  /** Whether the server should only be accessible on this host's loopback address. */
  loopback?: boolean
  /** The port to start the server on (must be > 0). A promised port is awaited before starting. */
  port?: number | PromiseLike<number>
  /** The arguments to pass to the service. A promised list is awaited before starting. */
  args?: string[] | PromiseLike<string[]>
  /** The arguments to pass to the JVM. A promised list is awaited before starting. */
  jvmArgs?: string[] | PromiseLike<string[]>
  /** The environment variables visible to the server process. Defaults to the current environment. */
  env?: NodeJS.ProcessEnv
  /** IO configuration for the spawned server process. If unspecified, IO will be ignored. */
  stdio?: StdIoOptions
}

/**
 * Manages the life and death of the
 * <a href="https://www.selenium.dev/downloads/">
 * standalone Selenium server</a>.
 */
export class SeleniumServer extends DriverService {
  /** Runtime placeholder for the options record; the shape is {@link SeleniumServerOptions}. */
  static Options = class {}

  /**
   * @param jar Path to the Selenium server jar.
   * @param opt_options Configuration options for the server.
   * @throws {Error} If the path to the Selenium jar is not specified or if an
   *     invalid port is specified.
   */
  constructor(jar: string, opt_options?: SeleniumServerOptions) {
    if (!jar) {
      throw Error('Path to the Selenium jar not specified')
    }

    const options = opt_options || {}

    if (typeof options.port === 'number' && options.port < 0) {
      throw Error('Port must be >= 0: ' + options.port)
    }

    const port = options.port || portprober.findFreePort()
    const args = Promise.all([port, options.jvmArgs || [], options.args || []]).then((resolved) => {
      const port = resolved[0]
      const jvmArgs = resolved[1]
      const args = resolved[2]

      const fullArgsList = jvmArgs.concat('-jar', jar, '-port', String(port)).concat(args)

      return formatSpawnArgs(jar, fullArgsList)
    })

    const java = getJavaPath()

    super(java, {
      loopback: options.loopback,
      port: port,
      args: args,
      path: '/wd/hub',
      env: options.env,
      stdio: options.stdio,
    })
  }
}

/**
 * A {@link webdriver.FileDetector} that may be used when running
 * against a remote
 * [Selenium server](https://www.selenium.dev/downloads/).
 *
 * When a file path on the local machine running this script is entered with
 * {@link webdriver.WebElement#sendKeys WebElement#sendKeys}, this file detector
 * will transfer the specified file to the Selenium server's host; the sendKeys
 * command will be updated to use the transferred file's path.
 *
 * __Note:__ This class depends on a non-standard command supported on the
 * Java Selenium server. The file detector will fail if used with a server that
 * only supports standard WebDriver commands (such as the ChromeDriver).
 */
export class FileDetector extends input.FileDetector {
  /**
   * Prepares a `file` for use with the remote browser. If the provided path
   * does not reference a normal file (i.e. it does not exist or is a
   * directory), then the promise returned by this method will be resolved with
   * the original file path. Otherwise, this method will upload the file to the
   * remote server, which will return the file's path on the remote system so
   * it may be referenced in subsequent commands.
   *
   * @override
   */
  handleFile(driver: WebDriver, file: string): Promise<string> {
    return io.stat(file).then(
      function (stats) {
        if (stats.isDirectory()) {
          return file // Not a valid file, return original input.
        }

        const zip = new Zip()
        return zip
          .addFile(file)
          .then(() => zip.toBuffer())
          .then((buf) => buf.toString('base64'))
          .then((encodedZip) => {
            const command = new cmd.Command(cmd.Name.UPLOAD_FILE).setParameter('file', encodedZip)
            return driver.execute<string>(command)
          })
      },
      function (err: NodeJS.ErrnoException) {
        if (err.code === 'ENOENT') {
          return file // Not a file; return original input.
        }
        throw err
      },
    )
  }
}

/** Keeps `import x from '...'` working for esModuleInterop/Babel consumers; deliberate exception to the no-default-export rule. */
const defaultExport: typeof self = self
export default defaultExport
