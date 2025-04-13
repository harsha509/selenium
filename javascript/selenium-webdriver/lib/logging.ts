/*******************************************************************************
 * Licensed to the Software Freedom Conservancy (SFC) under one or more
 * contributor license agreements.  See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership.
 * The SFC licenses this file to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  See the
 * License for the specific language governing permissions and limitations
 * under the License.
 ******************************************************************************/

'use strict'

/* ============================================================================
 * Level
 * ========================================================================== */
class Level {
  private name_: string;
  private value_: number;

  constructor(name: string, level: number) {
    if (level < 0) {
      throw new TypeError('Level must be >= 0');
    }
    this.name_ = name;
    this.value_ = level;
  }

  get name(): string {
    return this.name_;
  }

  get value(): number {
    return this.value_;
  }

  toString(): string {
    return this.name;
  }

  // Static level constants
  public static readonly OFF: Level = new Level('OFF', Infinity);
  public static readonly SEVERE: Level = new Level('SEVERE', 1000);
  public static readonly WARNING: Level = new Level('WARNING', 900);
  public static readonly INFO: Level = new Level('INFO', 800);
  public static readonly DEBUG: Level = new Level('DEBUG', 700);
  public static readonly FINE: Level = new Level('FINE', 500);
  public static readonly FINER: Level = new Level('FINER', 400);
  public static readonly FINEST: Level = new Level('FINEST', 300);
  public static readonly ALL: Level = new Level('ALL', 0);
}

const ALL_LEVELS: Set<Level> = new Set([
  Level.OFF,
  Level.SEVERE,
  Level.WARNING,
  Level.INFO,
  Level.DEBUG,
  Level.FINE,
  Level.FINER,
  Level.FINEST,
  Level.ALL,
]);

const LEVELS_BY_NAME: Map<string, Level> = new Map([
  [Level.OFF.name, Level.OFF],
  [Level.SEVERE.name, Level.SEVERE],
  [Level.WARNING.name, Level.WARNING],
  [Level.INFO.name, Level.INFO],
  [Level.DEBUG.name, Level.DEBUG],
  [Level.FINE.name, Level.FINE],
  [Level.FINER.name, Level.FINER],
  [Level.FINEST.name, Level.FINEST],
  [Level.ALL.name, Level.ALL],
]);

/**
 * Converts a level name or numeric value to a Level instance.
 *
 * @param nameOrValue The log level name (string) or numeric value.
 * @return The corresponding Level instance.
 */
function getLevel(nameOrValue: string | number): Level {
  if (typeof nameOrValue === 'string') {
    return LEVELS_BY_NAME.get(nameOrValue) || Level.ALL;
  }
  if (typeof nameOrValue !== 'number') {
    throw new TypeError('not a string or number');
  }
  for (const level of ALL_LEVELS) {
    if (nameOrValue >= level.value) {
      return level;
    }
  }
  return Level.ALL;
}

/* ============================================================================
 * Entry
 * ========================================================================== */
class Entry {
  public level: Level;
  public message: string;
  public timestamp: number;
  public type: string;

  /**
   * @param level The entry level (a Level instance, string, or number).
   * @param message The log message.
   * @param opt_timestamp Optional timestamp in milliseconds (defaults to now).
   * @param opt_type Optional log type.
   */
  constructor(level: Level | string | number, message: string, opt_timestamp?: number, opt_type?: string) {
    this.level = level instanceof Level ? level : getLevel(level);
    this.message = message;
    this.timestamp = typeof opt_timestamp === 'number' ? opt_timestamp : Date.now();
    this.type = opt_type || '';
  }

  toJSON(): { level: string; message: string; timestamp: number; type: string } {
    return {
      level: this.level.name,
      message: this.message,
      timestamp: this.timestamp,
      type: this.type,
    };
  }
}

/* ============================================================================
 * Logger
 * ========================================================================== */
class Logger {
  private name_: string;
  private level_?: Level;
  public parent_?: Logger;
  private handlers_?: Set<(entry: Entry) => void>;

  /**
   * @param name The name of the logger.
   * @param opt_level Optional initial log level.
   */
  constructor(name: string, opt_level?: Level) {
    this.name_ = name;
    this.level_ = opt_level;
    this.parent_ = undefined;
    this.handlers_ = undefined;
  }

  getName(): string {
    return this.name_;
  }

  setLevel(level: Level): void {
    this.level_ = level;
  }

  getLevel(): Level | undefined {
    return this.level_;
  }

  /**
   * Walks up the logger hierarchy to determine the effective level.
   * @return The effective Level.
   */
  getEffectiveLevel(): Level {
    let logger: Logger | undefined = this;
    let level: Level | undefined;
    do {
      level = logger.level_;
      logger = logger.parent_;
    } while (logger && !level);
    return level || Level.OFF;
  }

  /**
   * Checks if the given level is loggable by this logger.
   * @param level The level to check.
   * @return True if loggable.
   */
  isLoggable(level: Level): boolean {
    return level.value !== Level.OFF.value && level.value >= this.getEffectiveLevel().value;
  }

  /**
   * Adds a log handler to this logger.
   * @param handler The handler function to add.
   */
  addHandler(handler: (entry: Entry) => void): void {
    if (!this.handlers_) {
      this.handlers_ = new Set();
    }
    this.handlers_.add(handler);
  }

  /**
   * Removes a log handler from this logger.
   * @param handler The handler function to remove.
   * @return True if a handler was removed.
   */
  removeHandler(handler: (entry: Entry) => void): boolean {
    if (!this.handlers_) {
      return false;
    }
    return this.handlers_.delete(handler);
  }

  /**
   * Logs a message at the specified level.
   *
   * @param level The log level.
   * @param loggable A string message or function returning a string.
   */
  log(level: Level, loggable: string | (() => string)): void {
    if (!this.isLoggable(level)) {
      return;
    }
    const msg = '[' + this.name_ + '] ' + (typeof loggable === 'function' ? loggable() : loggable);
    const entry = new Entry(level, msg, Date.now());
    for (let logger: Logger | undefined = this; logger !== undefined; logger = logger.parent_) {
      if (logger.handlers_) {
        for (const handler of logger.handlers_) {
          handler(entry);
        }
      }
    }
  }

  severe(loggable: string | (() => string)): void {
    this.log(Level.SEVERE, loggable);
  }

  warning(loggable: string | (() => string)): void {
    this.log(Level.WARNING, loggable);
  }

  info(loggable: string | (() => string)): void {
    this.log(Level.INFO, loggable);
  }

  debug(loggable: string | (() => string)): void {
    this.log(Level.DEBUG, loggable);
  }

  fine(loggable: string | (() => string)): void {
    this.log(Level.FINE, loggable);
  }

  finer(loggable: string | (() => string)): void {
    this.log(Level.FINER, loggable);
  }

  finest(loggable: string | (() => string)): void {
    this.log(Level.FINEST, loggable);
  }
}

/* ============================================================================
 * LogManager
 * ========================================================================== */
class LogManager {
  private loggers_: Map<string, Logger>;
  public root_: Logger;

  constructor() {
    this.loggers_ = new Map();
    this.root_ = new Logger('', Level.OFF);
  }

  /**
   * Retrieves a named logger (creating parent loggers as necessary).
   *
   * @param name The logger's dot-delimited name.
   * @return The Logger instance.
   */
  getLogger(name: string): Logger {
    if (!name) {
      return this.root_;
    }
    let parent: Logger = this.root_;
    for (let i = name.indexOf('.'); i !== -1; i = name.indexOf('.', i + 1)) {
      const parentName = name.substring(0, i);
      parent = this.createLogger_(parentName, parent);
    }
    return this.createLogger_(name, parent);
  }

  private createLogger_(name: string, parent: Logger): Logger {
    if (this.loggers_.has(name)) {
      return this.loggers_.get(name)!;
    }
    const logger = new Logger(name);
    logger.parent_ = parent;
    this.loggers_.set(name, logger);
    return logger;
  }
}

const logManager = new LogManager();

/* ============================================================================
 * Public Logger Functions
 * ========================================================================== */
/**
 * Retrieves a named logger, creating it and its parents if necessary.
 *
 * @param name The logger's name.
 * @return The requested Logger.
 */
function getLogger(name: string): Logger {
  return logManager.getLogger(name);
}

/**
 * Pads a number to at least two digits.
 *
 * @param n The number to pad.
 * @return The padded number as a string.
 */
function pad(n: number): string {
  return n >= 10 ? n.toString() : '0' + n.toString();
}

/**
 * Logs an Entry to the console using the Console API.
 *
 * @param entry The log entry to handle.
 */
function consoleHandler(entry: Entry): void {
  if (typeof console === 'undefined' || !console) {
    return;
  }
  const timestamp = new Date(entry.timestamp);
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
    entry.message;

  if (entry.level.value >= Level.SEVERE.value) {
    console.error(msg);
  } else if (entry.level.value >= Level.WARNING.value) {
    console.warn(msg);
  } else {
    console.log(msg);
  }
}

/**
 * Adds the console handler to the specified logger, defaulting to the root logger.
 *
 * @param opt_logger Optional Logger to add the handler to.
 */
function addConsoleHandler(opt_logger?: Logger): void {
  const logger = opt_logger || logManager.root_;
  logger.addHandler(consoleHandler);
}

/**
 * Removes the console log handler from the specified logger.
 *
 * @param opt_logger Optional Logger to remove the handler from.
 * @return True if the handler was removed.
 */
function removeConsoleHandler(opt_logger?: Logger): boolean {
  const logger = opt_logger || logManager.root_;
  return logger.removeHandler(consoleHandler);
}

/**
 * Installs the console log handler on the root logger.
 */
function installConsoleHandler(): void {
  addConsoleHandler(logManager.root_);
}

/* ============================================================================
 * Log Types and Preferences
 * ========================================================================== */
/**
 * Common log types.
 */
const Type = {
  BROWSER: 'browser',
  CLIENT: 'client',
  DRIVER: 'driver',
  PERFORMANCE: 'performance',
  SERVER: 'server',
} as const;

/**
 * Describes the log preferences for a WebDriver session.
 */
class Preferences {
  private prefs_: Map<string, Level>;

  constructor() {
    this.prefs_ = new Map();
  }

  /**
   * Sets the desired logging level for a particular log type.
   *
   * @param type The log type (as a string).
   * @param level The desired log level (Level instance, string, or number).
   * @throws {TypeError} if `type` is not a string.
   */
  setLevel(type: string, level: Level | string | number): void {
    if (typeof type !== 'string') {
      throw new TypeError('specified log type is not a string: ' + typeof type);
    }
    this.prefs_.set(type, level instanceof Level ? level : getLevel(level));
  }

  /**
   * Converts the preferences to a JSON representation.
   *
   * @return An object mapping log types to their level names.
   */
  toJSON(): { [key: string]: string } {
    const json: { [key: string]: string } = {};
    for (const key of this.prefs_.keys()) {
      json[key] = this.prefs_.get(key)!.name;
    }
    return json;
  }
}

/* ============================================================================
 * Public API Export
 * ========================================================================== */
export {
  Entry,
  Level,
  LogManager,
  Logger,
  Preferences,
  Type,
  addConsoleHandler,
  getLevel,
  getLogger,
  installConsoleHandler,
  removeConsoleHandler,
};

// And define a union type
export type LogType = typeof Type[keyof typeof Type];
