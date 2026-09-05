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
const fs = require('node:fs')
const [dtRoot, ourRoot, tsDir] = process.argv.slice(2).map((p) => path.resolve(p))
const ts = require(path.join(tsDir, 'lib/typescript.js'))

function listDts(root) {
  const out = []
  ;(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') walk(p)
      } else if (p.endsWith('.d.ts')) out.push(path.relative(root, p).replace(/\.d\.ts$/, ''))
    }
  })(root)
  return out
}

function describe(root, mod) {
  const file = path.join(root, mod + '.d.ts')
  const program = ts.createProgram([file], {
    types: ['node'],
    typeRoots: [path.join(tsDir, '..', '@types')],
    skipLibCheck: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
  })
  const checker = program.getTypeChecker()
  const sf = program.getSourceFile(file)
  const modSym = checker.getSymbolAtLocation(sf)
  const result = new Map() // exportName -> { kind, members: Map<name, sig> }
  if (!modSym) return result
  const exps = checker.getExportsOfModule(modSym)
  const describeSym = (name, sym) => {
    let s = sym
    if (s.flags & ts.SymbolFlags.Alias) s = checker.getAliasedSymbol(s)
    const kind =
      ts.SymbolFlags.Class & s.flags
        ? 'class'
        : ts.SymbolFlags.Interface & s.flags
          ? 'interface'
          : ts.SymbolFlags.Function & s.flags
            ? 'function'
            : ts.SymbolFlags.TypeAlias & s.flags && !(ts.SymbolFlags.Variable & s.flags)
              ? 'type'
              : ts.SymbolFlags.Enum & s.flags
                ? 'enum'
                : ts.SymbolFlags.Module & s.flags
                  ? 'namespace'
                  : 'value'
    const members = new Map()
    const decl = s.valueDeclaration || (s.declarations && s.declarations[0])
    if (!decl) return { kind, members }
    if (kind === 'class' || kind === 'interface') {
      const instType = checker.getDeclaredTypeOfSymbol(s)
      for (const p of checker.getPropertiesOfType(instType)) {
        const pd = p.valueDeclaration || (p.declarations && p.declarations[0])
        if (!pd) continue
        const mods = ts.canHaveModifiers(pd) ? ts.getModifiers(pd) || [] : []
        if (mods.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword))
          continue
        if (p.escapedName.startsWith('__')) continue
        const t = checker.getTypeOfSymbolAtLocation(p, pd)
        const sigs = t.getCallSignatures()
        members.set(
          p.name,
          sigs.length
            ? sigs.map((sg) => `(${sg.parameters.length}) ` + checker.signatureToString(sg)).join(' | ')
            : ': ' + checker.typeToString(t),
        )
      }
      if (kind === 'class') {
        const staticType = checker.getTypeOfSymbolAtLocation(s, decl)
        for (const p of checker.getPropertiesOfType(staticType)) {
          if (p.name === 'prototype' || p.escapedName.startsWith('__')) continue
          const pd = p.valueDeclaration || (p.declarations && p.declarations[0])
          const t = pd ? checker.getTypeOfSymbolAtLocation(p, pd) : null
          const sigs = t ? t.getCallSignatures() : []
          members.set(
            'static ' + p.name,
            sigs.length
              ? sigs.map((sg) => `(${sg.parameters.length}) ` + checker.signatureToString(sg)).join(' | ')
              : t
                ? ': ' + checker.typeToString(t)
                : '',
          )
        }
        for (const sg of checker.getSignaturesOfType(staticType, ts.SignatureKind.Construct))
          members.set('constructor', `(${sg.parameters.length}) ` + checker.signatureToString(sg))
      }
    } else if (kind === 'function' || kind === 'value') {
      const t = checker.getTypeOfSymbolAtLocation(s, decl)
      const sigs = t.getCallSignatures()
      members.set(
        '',
        sigs.length
          ? sigs.map((sg) => `(${sg.parameters.length}) ` + checker.signatureToString(sg)).join(' | ')
          : ': ' + checker.typeToString(t),
      )
      if (kind === 'value' && !sigs.length)
        for (const p of checker.getPropertiesOfType(t))
          members.set('.' + p.name, ': ' + checker.typeToString(checker.getTypeOfSymbolAtLocation(p, decl)))
    }
    result.set(name, { kind, members })
  }
  const eq = exps.find((e) => e.escapedName === 'export=')
  if (eq) describeSym('export=', eq)
  else
    for (const e of exps) {
      if (e.name === 'default' || e.name === '__esModule') continue
      describeSym(e.name, e)
    }
  return result
}

const dtMods = listDts(dtRoot)
const ourMods = new Set(listDts(ourRoot))
const rows = []
for (const mod of dtMods) {
  const ourMod = ourMods.has(mod) ? mod : ourMods.has(mod + '/index') ? mod + '/index' : null
  if (!ourMod) {
    rows.push([mod, '(module)', 'missing in ours', '', ''])
    continue
  }
  const a = describe(dtRoot, mod),
    b = describe(ourRoot, ourMod)
  for (const [name, da] of a) {
    const db = b.get(name)
    if (!db) {
      rows.push([mod, name, `missing export (${da.kind})`, '', ''])
      continue
    }
    if (
      da.kind !== db.kind &&
      !(da.kind === 'interface' && db.kind === 'type') &&
      !(da.kind === 'value' && db.kind === 'function') &&
      !(da.kind === 'enum' && db.kind === 'value')
    )
      rows.push([mod, name, `kind ${da.kind} -> ${db.kind}`, '', ''])
    for (const [m, sa] of da.members) {
      const sb = db.members.get(m)
      if (sb === undefined) {
        rows.push([mod, name + (m ? '.' + m : ''), 'missing member', sa, ''])
        continue
      }
      const arity = (s) => (s.match(/^\((\d+)\)/) || [])[1]
      if (arity(sa) !== undefined && arity(sb) !== undefined && arity(sa) !== arity(sb))
        rows.push([mod, name + '.' + m, `arity ${arity(sa)} -> ${arity(sb)}`, sa, sb])
      else if (/\bany\b/.test(sa) && !/\bany\b/.test(sb)) rows.push([mod, name + '.' + m, 'narrowed (DT any)', sa, sb])
    }
  }
}
const trunc = (s) => (s.length > 90 ? s.slice(0, 87) + '...' : s).replace(/\|/g, '\\|')
console.log('| module | symbol | issue | DT | ours |\n|---|---|---|---|---|')
for (const r of rows) console.log(`| ${r[0]} | ${trunc(r[1])} | ${r[2]} | ${trunc(r[3])} | ${trunc(r[4])} |`)
console.log(`\nrows: ${rows.length}`)
