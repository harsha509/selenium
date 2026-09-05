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

import JSZip from 'jszip'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import * as io from './index'
import { InvalidArgumentError } from '../lib/error'
import * as self from './zip'

/**
 * Manages a zip archive.
 */
export class Zip {
  /** The underlying archive; read by {@link load} and {@link unzip}. */
  readonly z_: JSZip
  private readonly pendingAdds_: Set<Promise<unknown>>

  constructor() {
    this.z_ = new JSZip()
    this.pendingAdds_ = new Set()
  }

  /**
   * Adds a file to this zip.
   *
   * @param filePath path to the file to add.
   * @param zipPath path to the file in the zip archive, defaults
   *     to the basename of `filePath`.
   * @return a promise that will resolve when added.
   */
  addFile(filePath: string, zipPath: string = path.basename(filePath)): Promise<boolean> {
    const add = Promise.all([io.read(filePath), fs.stat(filePath)]).then(([buffer, stats]) =>
      this.z_.file(zipPath.replace(/\\/g, '/'), buffer, {
        date: stats.mtime, // preserve file's "last modified" value
      }),
    )
    this.pendingAdds_.add(add)
    return add.then(
      () => this.pendingAdds_.delete(add),
      (e) => {
        this.pendingAdds_.delete(add)
        throw e
      },
    )
  }

  /**
   * Recursively adds a directory and all of its contents to this archive.
   *
   * @param dirPath path to the directory to add.
   * @param zipPath path to the folder in the archive to add the
   *     directory contents to. Defaults to the root folder.
   * @return returns a promise that will resolve when the operation is complete.
   */
  addDir(dirPath: string, zipPath = ''): Promise<boolean[]> {
    return io.walkDir(dirPath).then((entries) => {
      let archive = this.z_
      if (zipPath) {
        archive = archive.folder(zipPath) ?? archive
      }

      const files: Promise<boolean>[] = []
      entries.forEach((spec) => {
        if (spec.dir) {
          archive.folder(spec.path)
        } else {
          files.push(this.addFile(path.join(dirPath, spec.path), path.join(zipPath, spec.path)))
        }
      })

      return Promise.all(files)
    })
  }

  /**
   * @param path File path to test for within the archive.
   * @return Whether this zip archive contains an entry with the given path.
   */
  has(path: string): boolean {
    return this.z_.file(path) !== null
  }

  /**
   * Returns the contents of the file in this zip archive with the given `path`.
   * The returned promise will be rejected with an {@link InvalidArgumentError}
   * if either `path` does not exist within the archive, or if `path` refers
   * to a directory.
   *
   * @param path the path to the file whose contents to return.
   * @return a promise that will be resolved with the file's contents as a
   *     buffer.
   */
  getFile(path: string): Promise<Buffer> {
    const file = this.z_.file(path)
    if (!file) {
      return Promise.reject(new InvalidArgumentError(`No such file in zip archive: ${path}`))
    }

    if (file.dir) {
      return Promise.reject(new InvalidArgumentError(`The requested file is a directory: ${path}`))
    }

    return Promise.resolve(file.async('nodebuffer'))
  }

  /**
   * Returns the compressed data for this archive in a buffer. _This method will
   * not wait for any outstanding {@link #addFile add}
   * {@link #addDir operations} before encoding the archive._
   *
   * @param compression The desired compression.
   *     Must be `STORE` (the default) or `DEFLATE`.
   * @return a promise that will resolve with this archive as a buffer.
   */
  toBuffer(compression: 'STORE' | 'DEFLATE' = 'STORE'): Promise<Buffer> {
    if (compression !== 'STORE' && compression !== 'DEFLATE') {
      return Promise.reject(new InvalidArgumentError(`compression must be one of {STORE, DEFLATE}, got ${compression}`))
    }
    return Promise.resolve(this.z_.generateAsync({ compression, type: 'nodebuffer' }))
  }
}

/**
 * Asynchronously opens a zip archive.
 *
 * @param path to the zip archive to load.
 * @return a promise that will resolve with the opened archive.
 */
export function load(path: string): Promise<Zip> {
  return io.read(path).then((data) => {
    const zip = new Zip()
    return zip.z_.loadAsync(data).then(() => zip)
  })
}

/**
 * Asynchronously unzips an archive file.
 *
 * @param src path to the source file to unzip.
 * @param dst path to the destination directory.
 * @return a promise that will resolve with `dst` once the archive has been
 *     unzipped.
 */
export function unzip(src: string, dst: string): Promise<string> {
  return load(src).then((zip) => {
    const promisedDirs = new Map<string, Promise<string>>()
    const promises: Promise<unknown>[] = []

    zip.z_.forEach((relPath, file) => {
      let p
      if (file.dir) {
        p = createDir(relPath)
      } else {
        const dirname = path.dirname(relPath)
        if (dirname === '.') {
          p = writeFile(relPath, file)
        } else {
          p = createDir(dirname).then(() => writeFile(relPath, file))
        }
      }
      promises.push(p)
    })

    return Promise.all(promises).then(() => dst)

    function createDir(dir: string): Promise<string> {
      let p = promisedDirs.get(dir)
      if (!p) {
        p = io.mkdirp(path.join(dst, dir))
        promisedDirs.set(dir, p)
      }
      return p
    }

    function writeFile(relPath: string, file: JSZip.JSZipObject): Promise<void> {
      return file.async('nodebuffer').then((buffer) => io.write(path.join(dst, relPath), buffer))
    }
  })
}

/** Keeps `import x from '...'` working for esModuleInterop/Babel consumers; deliberate exception to the no-default-export rule. */
const defaultExport: typeof self = self
export default defaultExport
