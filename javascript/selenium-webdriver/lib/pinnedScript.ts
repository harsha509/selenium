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

import { randomUUID } from 'node:crypto'
import * as self from './pinnedScript'

export class PinnedScript {
  private readonly scriptSource_: string
  private readonly scriptHandle_: string
  private scriptId_?: string

  constructor(script: string) {
    this.scriptSource_ = script
    this.scriptHandle_ = randomUUID().replace(/-/gi, '')
  }

  get handle(): string {
    return this.scriptHandle_
  }

  get source(): string {
    return this.scriptSource_
  }

  get scriptId(): string | undefined {
    return this.scriptId_
  }

  set scriptId(id: string | undefined) {
    this.scriptId_ = id
  }

  creationScript(): string {
    return `function __webdriver_${this.scriptHandle_}(arguments) { ${this.scriptSource_} }`
  }

  executionScript(): string {
    return `return __webdriver_${this.scriptHandle_}(arguments)`
  }

  removalScript(): string {
    return `__webdriver_${this.scriptHandle_} = undefined`
  }
}

/** Keeps `import x from '...'` working for esModuleInterop/Babel consumers; deliberate exception to the no-default-export rule. */
const defaultExport: typeof self = self
export default defaultExport
