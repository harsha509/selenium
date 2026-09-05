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

import * as self from './logging'

/**
 * @fileoverview Defines WebDriver's logging system. The logging system is
 * broken into major components: local and remote logging.
 *
 * The local logging API, which is anchored by the {@linkplain Logger} class is
 * similar to Java's logging API. Loggers, retrieved by
 * {@linkplain #getLogger getLogger(name)}, use hierarchical, dot-delimited
 * namespaces (e.g. "" > "webdriver" > "webdriver.logging"). Recorded log
 * messages are represented by the {@linkplain Entry} class. You can capture log
 * records by {@linkplain Logger#addHandler attaching} a handler function to the
 * desired logger. For convenience, you can quickly enable logging to the
 * console by simply calling {@linkplain #installConsoleHandler
 * installConsoleHandler}.
 *
 * The [remote logging API](https://github.com/SeleniumHQ/selenium/wiki/Logging)
 * allows you to retrieve logs from a remote WebDriver server. This API uses the
 * {@link Preferences} class to define desired log levels prior to creating
 * a WebDriver session:
 *
 *     var prefs = new logging.Preferences();
 *     prefs.setLevel(logging.Type.BROWSER, logging.Level.DEBUG);
 *
 *     var caps = Capabilities.chrome();
 *     caps.setLoggingPrefs(prefs);
 *     // ...
 *
 * Remote log entries, also represented by the {@link Entry} class, may be
 * retrieved via {@link webdriver.WebDriver.Logs}:
 *
 *     driver.manage().logs().get(logging.Type.BROWSER)
 *         .then(function(entries) {
 *            entries.forEach(function(entry) {
 *              console.log('[%s] %s', entry.level.name, entry.message);
 *            });
 *         });
 *
 * **NOTE:** Only a few browsers support the remote logging API (notably
 * Firefox and Chrome). Firefox supports basic logging functionality, while
 * Chrome exposes robust
 * [performance logging](https://chromedriver.chromium.org/logging)
 * options. Remote logging is still considered a non-standard feature, and the
 * APIs exposed by this module for it are non-frozen. This module will be
 * updated, possibly breaking backwards-compatibility, once logging is
 * officially defined by the
 * [W3C WebDriver spec](http://www.w3.org/TR/webdriver/).
 */

/** A message, or a function producing one, accepted by {@link Logger#log}. */
export type Loggable = string | (() => string)

/** A function that receives each {@link Entry} recorded on a logger. */
export type Handler = (entry: Entry) => void

/**
 * Defines a message level that may be used to control logging output.
 *
 * @final
 */
export class Level {
  private readonly name_: string
  private readonly value_: number

  /**
   * @param name the level's name.
   * @param level the level's numeric value.
   */
  constructor(name: string, level: number) {
    if (level < 0) {
      throw new TypeError('Level must be >= 0')
    }

    this.name_ = name
    this.value_ = level
  }

  /** This logger's name. */
  get name(): string {
    return this.name_
  }

  /** The numeric log level. */
  get value(): number {
    return this.value_
  }

  /** @override */
  toString(): string {
    return this.name
  }

  /**
   * Indicates no log messages should be recorded.
   */
  static readonly OFF = new Level('OFF', Infinity)

  /**
   * Log messages with a level of `1000` or higher.
   */
  static readonly SEVERE = new Level('SEVERE', 1000)

  /**
   * Log messages with a level of `900` or higher.
   */
  static readonly WARNING = new Level('WARNING', 900)

  /**
   * Log messages with a level of `800` or higher.
   */
  static readonly INFO = new Level('INFO', 800)

  /**
   * Log messages with a level of `700` or higher.
   */
  static readonly DEBUG = new Level('DEBUG', 700)

  /**
   * Log messages with a level of `500` or higher.
   */
  static readonly FINE = new Level('FINE', 500)

  /**
   * Log messages with a level of `400` or higher.
   */
  static readonly FINER = new Level('FINER', 400)

  /**
   * Log messages with a level of `300` or higher.
   */
  static readonly FINEST = new Level('FINEST', 300)

  /**
   * Indicates all log messages should be recorded.
   */
  static readonly ALL = new Level('ALL', 0)
}

const ALL_LEVELS = new Set<Level>([
  Level.OFF,
  Level.SEVERE,
  Level.WARNING,
  Level.INFO,
  Level.DEBUG,
  Level.FINE,
  Level.FINER,
  Level.FINEST,
  Level.ALL,
])

const LEVELS_BY_NAME = new Map<string, Level>([
  [Level.OFF.name, Level.OFF],
  [Level.SEVERE.name, Level.SEVERE],
  [Level.WARNING.name, Level.WARNING],
  [Level.INFO.name, Level.INFO],
  [Level.DEBUG.name, Level.DEBUG],
  [Level.FINE.name, Level.FINE],
  [Level.FINER.name, Level.FINER],
  [Level.FINEST.name, Level.FINEST],
  [Level.ALL.name, Level.ALL],
])

/**
 * Converts a level name or value to a {@link Level} value. If the name/value
 * is not recognized, {@link Level.ALL} will be returned.
 *
 * @param nameOrValue The log level name, or value, to convert.
 * @return The converted level.
 */
export function getLevel(nameOrValue: number | string): Level {
  if (typeof nameOrValue === 'string') {
    return LEVELS_BY_NAME.get(nameOrValue) || Level.ALL
  }
  if (typeof nameOrValue !== 'number') {
    throw new TypeError('not a string or number')
  }
  for (const level of ALL_LEVELS) {
    if (nameOrValue >= level.value) {
      return level
    }
  }
  return Level.ALL
}

/**
 * Describes a single log entry.
 *
 * @final
 */
export class Entry {
  level: Level
  message: string
  timestamp: number
  type: string

  /**
   * @param level The entry level.
   * @param message The log message.
   * @param opt_timestamp The time this entry was generated, in
   *     milliseconds since 0:00:00, January 1, 1970 UTC. If omitted, the
   *     current time will be used.
   * @param opt_type The log type, if known.
   */
  constructor(level: Level | string | number, message: string, opt_timestamp?: number, opt_type?: string) {
    this.level = level instanceof Level ? level : getLevel(level)
    this.message = message
    this.timestamp = typeof opt_timestamp === 'number' ? opt_timestamp : Date.now()
    this.type = opt_type || ''
  }

  /**
   * @return The JSON representation of this entry.
   */
  toJSON(): { level: string; message: string; timestamp: number; type: string } {
    return {
      level: this.level.name,
      message: this.message,
      timestamp: this.timestamp,
      type: this.type,
    }
  }
}

/**
 * An object used to log debugging messages. Loggers use a hierarchical,
 * dot-separated naming scheme. For instance, "foo" is considered the parent of
 * the "foo.bar" and an ancestor of "foo.bar.baz".
 *
 * Each logger may be assigned a {@linkplain #setLevel log level}, which
 * controls which level of messages will be reported to the
 * {@linkplain #addHandler handlers} attached to this instance. If a log level
 * is not explicitly set on a logger, it will inherit its parent.
 *
 * This class should never be directly instantiated. Instead, users should
 * obtain logger references using the {@linkplain ./logging.getLogger()
 * getLogger()} function.
 *
 * @final
 */
export class Logger {
  private readonly name_: string
  private level_: Level | null
  /** Set by {@link LogManager}; read by tests. */
  parent_: Logger | null
  private handlers_: Set<Handler> | null
  /** ids already reported via {@link #deprecate}. */
  private readonly deprecated_: Set<string>

  /**
   * @param name the name of this logger.
   * @param opt_level the initial level for this logger.
   */
  constructor(name: string, opt_level?: Level | null) {
    this.name_ = name
    this.level_ = opt_level || null
    this.parent_ = null
    this.handlers_ = null
    this.deprecated_ = new Set()
  }

  /** @return the name of this logger. */
  getName(): string {
    return this.name_
  }

  /**
   * @param level the new level for this logger, or `null` if the logger
   *     should inherit its level from its parent logger.
   */
  setLevel(level: Level | null): void {
    this.level_ = level
  }

  /** @return the log level for this logger. */
  getLevel(): Level | null {
    return this.level_
  }

  /**
   * @return the effective level for this logger.
   */
  getEffectiveLevel(): Level {
    return this.level_ || this.parent_?.getEffectiveLevel() || Level.OFF
  }

  /**
   * @param level the level to check.
   * @return whether messages recorded at the given level are loggable
   *     by this instance.
   */
  isLoggable(level: Level): boolean {
    return level.value !== Level.OFF.value && level.value >= this.getEffectiveLevel().value
  }

  /**
   * Adds a handler to this logger. The handler will be invoked for each message
   * logged with this instance, or any of its descendants.
   *
   * @param handler the handler to add.
   */
  addHandler(handler: Handler): void {
    if (!this.handlers_) {
      this.handlers_ = new Set()
    }
    this.handlers_.add(handler)
  }

  /**
   * Removes a handler from this logger.
   *
   * @param handler the handler to remove.
   * @return whether a handler was successfully removed.
   */
  removeHandler(handler: Handler): boolean {
    if (!this.handlers_) {
      return false
    }
    return this.handlers_.delete(handler)
  }

  /**
   * Logs a message at the given level. The message may be defined as a string
   * or as a function that will return the message. If a function is provided,
   * it will only be invoked if this logger's
   * {@linkplain #getEffectiveLevel() effective log level} includes the given
   * `level`.
   *
   * @param level the level at which to log the message.
   * @param loggable the message to log, or a function that will return the
   *     message.
   */
  log(level: Level, loggable: Loggable): void {
    if (!this.isLoggable(level)) {
      return
    }
    const message = '[' + this.name_ + '] ' + (typeof loggable === 'function' ? loggable() : loggable)
    this.dispatch_(new Entry(level, message, Date.now()))
  }

  /** Invokes this logger's handlers, then each ancestor's. */
  private dispatch_(entry: Entry): void {
    if (this.handlers_) {
      for (const handler of this.handlers_) {
        handler(entry)
      }
    }
    this.parent_?.dispatch_(entry)
  }

  /**
   * Logs a message at the {@link Level.SEVERE} log level.
   * @param loggable the message to log, or a function that will return the
   *     message.
   */
  severe(loggable: Loggable): void {
    this.log(Level.SEVERE, loggable)
  }

  /**
   * Logs a message at the {@link Level.WARNING} log level.
   * @param loggable the message to log, or a function that will return the
   *     message.
   */
  warning(loggable: Loggable): void {
    this.log(Level.WARNING, loggable)
  }

  /**
   * Logs a message at the {@link Level.INFO} log level.
   * @param loggable the message to log, or a function that will return the
   *     message.
   */
  info(loggable: Loggable): void {
    this.log(Level.INFO, loggable)
  }

  /**
   * Logs a deprecation notice at the {@link Level.WARNING} log level, once per
   * `id` for this logger's lifetime — a repeat call with the same `id` is a
   * no-op, matching the once-only behavior `util.deprecate` gives by call-site
   * identity, but keyed on a stable id instead so it survives being wrapped,
   * rebound, or called through multiple paths.
   *
   * `id` is only claimed once the notice is actually loggable at this
   * logger's effective level — under the default `Level.OFF` root level, a
   * call here logs nothing and leaves `id` unclaimed, so a later call (once
   * logging is enabled) still gets to report it instead of finding it already
   * silently used up.
   * @param id a stable, non-empty identifier for this deprecation
   *     (e.g. `'webdriver-getBidi'`), distinct from the message text so
   *     tooling can key off it even if the wording changes later.
   * @param message the deprecation notice to log.
   * @throws {TypeError} if `id` is empty.
   */
  deprecate(id: string, message: string): void {
    if (!id) {
      throw new TypeError('Logger#deprecate() requires a non-empty id')
    }
    if (this.deprecated_.has(id)) {
      return
    }
    if (!this.isLoggable(Level.WARNING)) {
      return
    }
    this.deprecated_.add(id)
    this.warning(`[${id}] ${message}`)
  }

  /**
   * Logs a message at the {@link Level.DEBUG} log level.
   * @param loggable the message to log, or a function that will return the
   *     message.
   */
  debug(loggable: Loggable): void {
    this.log(Level.DEBUG, loggable)
  }

  /**
   * Logs a message at the {@link Level.FINE} log level.
   * @param loggable the message to log, or a function that will return the
   *     message.
   */
  fine(loggable: Loggable): void {
    this.log(Level.FINE, loggable)
  }

  /**
   * Logs a message at the {@link Level.FINER} log level.
   * @param loggable the message to log, or a function that will return the
   *     message.
   */
  finer(loggable: Loggable): void {
    this.log(Level.FINER, loggable)
  }

  /**
   * Logs a message at the {@link Level.FINEST} log level.
   * @param loggable the message to log, or a function that will return the
   *     message.
   */
  finest(loggable: Loggable): void {
    this.log(Level.FINEST, loggable)
  }
}

/**
 * Maintains a collection of loggers.
 *
 * @final
 */
export class LogManager {
  private readonly loggers_: Map<string, Logger>
  /** The root logger; module-level helpers attach console handlers to it. */
  readonly root_: Logger

  constructor() {
    this.loggers_ = new Map()
    this.root_ = new Logger('', Level.OFF)
  }

  /**
   * Retrieves a named logger, creating it in the process. This function will
   * implicitly create the requested logger, and any of its parents, if they
   * do not yet exist.
   *
   * @param name the logger's name.
   * @return the requested logger.
   */
  getLogger(name: string): Logger {
    if (!name) {
      return this.root_
    }
    let parent = this.root_
    for (let i = name.indexOf('.'); i != -1; i = name.indexOf('.', i + 1)) {
      const parentName = name.substr(0, i)
      parent = this.createLogger_(parentName, parent)
    }
    return this.createLogger_(name, parent)
  }

  /**
   * Creates a new logger.
   *
   * @param name the logger's name.
   * @param parent the logger's parent.
   * @return the new logger.
   */
  private createLogger_(name: string, parent: Logger): Logger {
    const existing = this.loggers_.get(name)
    if (existing) {
      return existing
    }
    const logger = new Logger(name, null)
    logger.parent_ = parent
    this.loggers_.set(name, logger)
    return logger
  }
}

const logManager = new LogManager()

// Enable debug logging if SE_DEBUG or SELENIUM_VERBOSE environment variable is set
if (typeof process !== 'undefined' && process.env && (process.env.SE_DEBUG || process.env.SELENIUM_VERBOSE)) {
  logManager.root_.setLevel(Level.ALL)
  logManager.root_.addHandler(consoleHandler)
  if (process.env.SE_DEBUG) {
    logManager.root_.warning(
      'Environment Variable `SE_DEBUG` is set; Selenium is forcing verbose logging which may override user-specified settings.',
    )
  }
}

/**
 * Retrieves a named logger, creating it in the process. This function will
 * implicitly create the requested logger, and any of its parents, if they
 * do not yet exist.
 *
 * The log level will be unspecified for newly created loggers. Use
 * {@link Logger#setLevel(level)} to explicitly set a level.
 *
 * @param name the logger's name.
 * @return the requested logger.
 */
export function getLogger(name: string): Logger {
  return logManager.getLogger(name)
}

/**
 * Pads a number to ensure it has a minimum of two digits.
 *
 * @param n the number to be padded.
 * @return the padded number.
 */
function pad(n: number): string {
  if (n >= 10) {
    return '' + n
  } else {
    return '0' + n
  }
}

/**
 * Logs all messages to the Console API.
 * @param entry the entry to log.
 */
function consoleHandler(entry: Entry): void {
  if (typeof console === 'undefined' || !console) {
    return
  }

  const timestamp = new Date(entry.timestamp)
  const msg =
    '[' +
    timestamp.getUTCFullYear() +
    '-' +
    pad(timestamp.getUTCMonth() + 1) +
    '-' +
    pad(timestamp.getUTCDate()) +
    'T' +
    pad(timestamp.getUTCHours()) +
    ':' +
    pad(timestamp.getUTCMinutes()) +
    ':' +
    pad(timestamp.getUTCSeconds()) +
    'Z] ' +
    '[' +
    entry.level.name +
    '] ' +
    entry.message

  const level = entry.level.value
  if (level >= Level.SEVERE.value) {
    console.error(msg)
  } else if (level >= Level.WARNING.value) {
    console.warn(msg)
  } else {
    console.log(msg)
  }
}

/**
 * Adds the console handler to the given logger. The console handler will log
 * all messages using the JavaScript Console API.
 *
 * @param opt_logger The logger to add the handler to; defaults to the root
 *     logger.
 */
export function addConsoleHandler(opt_logger?: Logger): void {
  const logger = opt_logger || logManager.root_
  logger.addHandler(consoleHandler)
}

/**
 * Removes the console log handler from the given logger.
 *
 * @param opt_logger The logger to remove the handler from; defaults to the
 *     root logger.
 * @see exports.addConsoleHandler
 */
export function removeConsoleHandler(opt_logger?: Logger): void {
  const logger = opt_logger || logManager.root_
  logger.removeHandler(consoleHandler)
}

/**
 * Installs the console log handler on the root logger.
 */
export function installConsoleHandler(): void {
  addConsoleHandler(logManager.root_)
}

/**
 * Common log types.
 */
export const Type = {
  /** Logs originating from the browser. */
  BROWSER: 'browser',
  /** Logs from a WebDriver client. */
  CLIENT: 'client',
  /** Logs from a WebDriver implementation. */
  DRIVER: 'driver',
  /** Logs related to performance. */
  PERFORMANCE: 'performance',
  /** Logs from the remote server. */
  SERVER: 'server',
} as const

export type Type = (typeof Type)[keyof typeof Type]

/**
 * Describes the log preferences for a WebDriver session.
 *
 * @final
 */
export class Preferences {
  private readonly prefs_: Map<string, Level>

  constructor() {
    this.prefs_ = new Map()
  }

  /**
   * Sets the desired logging level for a particular log type.
   * @param type The log type.
   * @param level The desired log level.
   * @throws {TypeError} if `type` is not a `string`.
   */
  setLevel(type: string, level: Level | string | number): void {
    if (typeof type !== 'string') {
      throw TypeError('specified log type is not a string: ' + typeof type)
    }
    this.prefs_.set(type, level instanceof Level ? level : getLevel(level))
  }

  /**
   * Converts this instance to its JSON representation.
   * @return The JSON representation of this set of preferences.
   */
  toJSON(): Record<string, string> {
    const json: Record<string, string> = {}
    for (const [key, level] of this.prefs_) {
      json[key] = level.name
    }
    return json
  }
}

/** Keeps `import x from '...'` working for esModuleInterop/Babel consumers; deliberate exception to the no-default-export rule. */
const defaultExport: typeof self = self
export default defaultExport
