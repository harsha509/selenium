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

const path = require('node:path')
const mods = require('./modules.js')
const [trunk, built] = process.argv.slice(2).map((p) => path.resolve(p))
const importDefault = (mod) => (mod && mod.__esModule ? mod : { default: mod })
const keysOf = (m) =>
  Object.keys(m)
    .filter((k) => k !== '__esModule' && k !== 'default')
    .sort()
    .join(',')
;(async () => {
  let bad = 0
  for (const m of mods) {
    const a = require(path.join(trunk, m))
    const b = require(path.join(built, m))
    const problems = []
    if (keysOf(a) !== keysOf(b)) problems.push(`require keys differ\n   trunk: ${keysOf(a)}\n   built: ${keysOf(b)}`)
    if (typeof a !== typeof b) problems.push(`module type ${typeof a} vs ${typeof b}`)
    // TS esModuleInterop / Babel style default import must yield the module itself, as it did on trunk.
    const da = importDefault(a).default,
      db = importDefault(b).default
    if (da !== a) problems.push('trunk default import is not the module (unexpected)')
    if (db !== b) problems.push(`built default import -> ${db === undefined ? 'undefined' : typeof db}`)
    // Node ESM: default and named exports.
    const ea = await import(path.join(trunk, m) + (m.endsWith('index') ? '.js' : '.js'))
    const eb = await import(path.join(built, m) + '.js')
    if (typeof ea.default !== typeof eb.default)
      problems.push(`esm default ${typeof ea.default} vs ${typeof eb.default}`)
    const namedA = Object.keys(ea)
      .filter((k) => k !== 'default' && k !== '__esModule')
      .sort()
      .join(',')
    const namedB = Object.keys(eb)
      .filter((k) => k !== 'default' && k !== '__esModule')
      .sort()
      .join(',')
    if (namedA !== namedB) problems.push(`esm named exports differ\n   trunk: ${namedA}\n   built: ${namedB}`)
    if (problems.length) {
      bad++
      console.log('DIFF', m, '\n   ' + problems.join('\n   '))
    }
  }
  console.log(`modules: ${mods.length}, mismatches: ${bad}`)
  process.exit(bad ? 1 : 0)
})()
