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

'use strict'

import { Source } from './scriptTypes';

/**
 * Represents a base log entry.
 * Described in https://w3c.github.io/webdriver-bidi/#types-log-logentry.
 */
class BaseLogEntry {
  protected _level: string;
  protected _source: Source;
  protected _text: string;
  protected _timeStamp: number;
  protected _stackTrace: string | null;

  /**
   * Creates a new instance of BaseLogEntry.
   * @param {string} level - The log level.
   * @param {source} source - Script Source
   * @param {string} text - The log source.
   * @param {string} text - The log text.
   * @param {number} timeStamp - The log timestamp.
   * @param {string} stackTrace - The log stack trace.
   */
  constructor(level: string, source: string, text: string, timeStamp: number, stackTrace: string | null) {
    this._level = level
    this._source = new Source(source)
    this._text = text
    this._timeStamp = timeStamp
    this._stackTrace = stackTrace
  }

  /**
   * Gets the log level.
   * @returns {string} The log level.
   */
  get level(): string {
    return this._level
  }

  /**
   * Gets the log text.
   * @returns {string} The log text.
   */
  get text(): string {
    return this._text
  }

  /**
   * Gets the log timestamp.
   * @returns {number} The log timestamp.
   */
  get timeStamp(): number {
    return this._timeStamp
  }

  /**
   * Gets the log stack trace.
   * @returns {string} The log stack trace.
   */
  get stackTrace(): string | null {
    return this._stackTrace
  }

  get source(): Source {
    return this._source
  }
}

/**
 * Represents a generic log entry.
 * @class
 * @extends BaseLogEntry
 */
class GenericLogEntry extends BaseLogEntry {
  protected _type: string;

  /**
   * Creates an instance of GenericLogEntry.
   * @param {string} level - The log level.
   * @param {source} source - Script Source
   * @param {string} text - The log text.
   * @param {Date} timeStamp - The log timestamp.
   * @param {string} type - The log type.
   * @param {string} stackTrace - The log stack trace.
   */
  constructor(level: string, source: string, text: string, timeStamp: number, type: string, stackTrace: string | null) {
    super(level, source, text, timeStamp, stackTrace)
    this._type = type
  }

  /**
   * Gets the log type.
   * @returns {string} The log type.
   */
  get type(): string {
    return this._type
  }
}

/**
 * Represents a log entry for console logs.
 * @class
 * @extends GenericLogEntry
 */
class ConsoleLogEntry extends GenericLogEntry {
  private _method: string;
  private _args: any[];

  constructor(level: string, source: string, text: string, timeStamp: number, type: string, method: string, args: any[], stackTrace: string | null) {
    super(level, source, text, timeStamp, type, stackTrace)
    this._method = method
    this._args = args
  }

  /**
   * Gets the method associated with the log entry.
   * @returns {string} The method associated with the log entry.
   */
  get method(): string {
    return this._method
  }
  /**
   * Gets the arguments associated with the log entry.
   * @returns {Array} The arguments associated with the log entry.
   */
  get args(): any[] {
    return this._args
  }
}

/**
 * Represents a log entry for JavaScript logs.
 * @class
 * @extends GenericLogEntry
 */
class JavascriptLogEntry extends GenericLogEntry {
  constructor(level: string, source: string, text: string, timeStamp: number, type: string, stackTrace: string | null) {
    super(level, source, text, timeStamp, type, stackTrace)
  }
}

// PUBLIC API

export {
  BaseLogEntry,
  GenericLogEntry,
  ConsoleLogEntry,
  JavascriptLogEntry,
};
