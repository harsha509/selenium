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

import { Source, SourceJson } from './scriptTypes'
import * as self from './logEntries'

/**
 * Represents a base log entry.
 * Described in https://w3c.github.io/webdriver-bidi/#types-log-logentry.
 */
export class BaseLogEntry {
  private readonly _level: string
  private readonly _source: Source
  private readonly _text: string
  private readonly _timeStamp: number
  private readonly _stackTrace: unknown

  /**
   * Creates a new instance of BaseLogEntry.
   * @param level - The log level.
   * @param source - Script Source
   * @param text - The log text.
   * @param timeStamp - The log timestamp.
   * @param stackTrace - The log stack trace.
   */
  constructor(level: string, source: SourceJson, text: string, timeStamp: number, stackTrace: unknown) {
    this._level = level
    this._source = new Source(source)
    this._text = text
    this._timeStamp = timeStamp
    this._stackTrace = stackTrace
  }

  /**
   * Gets the log level.
   */
  get level(): string {
    return this._level
  }

  /**
   * Gets the log text.
   */
  get text(): string {
    return this._text
  }

  /**
   * Gets the log timestamp.
   */
  get timeStamp(): number {
    return this._timeStamp
  }

  /**
   * Gets the log stack trace.
   */
  get stackTrace(): unknown {
    return this._stackTrace
  }

  get source(): Source {
    return this._source
  }
}

/**
 * Represents a generic log entry.
 * @extends BaseLogEntry
 */
export class GenericLogEntry extends BaseLogEntry {
  private readonly _type: string

  /**
   * Creates an instance of GenericLogEntry.
   * @param level - The log level.
   * @param source - Script Source
   * @param text - The log text.
   * @param timeStamp - The log timestamp.
   * @param type - The log type.
   * @param stackTrace - The log stack trace.
   */
  constructor(level: string, source: SourceJson, text: string, timeStamp: number, type: string, stackTrace: unknown) {
    super(level, source, text, timeStamp, stackTrace)
    this._type = type
  }

  /**
   * Gets the log type.
   */
  get type(): string {
    return this._type
  }
}

/**
 * Represents a log entry for console logs.
 * @extends GenericLogEntry
 */
export class ConsoleLogEntry extends GenericLogEntry {
  private readonly _method: string
  private readonly _args: unknown[]

  constructor(
    level: string,
    source: SourceJson,
    text: string,
    timeStamp: number,
    type: string,
    method: string,
    args: unknown[],
    stackTrace: unknown,
  ) {
    super(level, source, text, timeStamp, type, stackTrace)
    this._method = method
    this._args = args
  }

  /**
   * Gets the method associated with the log entry.
   */
  get method(): string {
    return this._method
  }

  /**
   * Gets the arguments associated with the log entry.
   */
  get args(): unknown[] {
    return this._args
  }
}

/** Any log entry a log inspector reports. */
export type LogEntry = ConsoleLogEntry | JavascriptLogEntry | GenericLogEntry

/** A subscribed log handler. */
export type LogCallback = (entry: LogEntry) => void

/**
 * Represents a log entry for JavaScript logs.
 * @extends GenericLogEntry
 */
export class JavascriptLogEntry extends GenericLogEntry {
  constructor(level: string, source: SourceJson, text: string, timeStamp: number, type: string, stackTrace: unknown) {
    super(level, source, text, timeStamp, type, stackTrace)
  }
}

/** Keeps `import x from '...'` working for esModuleInterop/Babel consumers; deliberate exception to the no-default-export rule. */
const defaultExport: typeof self = self
export default defaultExport
