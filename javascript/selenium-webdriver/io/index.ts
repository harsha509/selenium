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

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as tmp from 'tmp'

/** A node-style callback; `value` is present whenever `err` is null. */
type NodeCallback<T> = (err: unknown, value?: T) => void

/**
 * @param fn .
 * @return .
 */
function checkedCall<T>(fn: (callback: NodeCallback<T>) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      fn((err, value) => {
        if (err) {
          reject(err)
        } else {
          resolve(value as T)
        }
      })
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * Recursively removes a directory and all of its contents. This is equivalent
 * to {@code rm -rf} on a POSIX system.
 * @param dirPath Path to the directory to remove.
 * @return A promise to be resolved when the operation has completed.
 */
export function rmDir(dirPath: string): Promise<void> {
  return new Promise(function (fulfill, reject) {
    fs.rm(dirPath, { recursive: true, maxRetries: 2 }, function (err) {
      if (err && err.code === 'ENOENT') {
        fulfill()
      } else if (err) {
        reject(err)
      }
      fulfill()
    })
  })
}

/**
 * Copies one file to another.
 * @param src The source file.
 * @param dst The destination file.
 * @return A promise for the copied file's path.
 */
export function copy(src: string, dst: string): Promise<string> {
  return new Promise(function (fulfill, reject) {
    const rs = fs.createReadStream(src)
    rs.on('error', reject)

    const ws = fs.createWriteStream(dst)
    ws.on('error', reject)
    ws.on('close', () => fulfill(dst))

    rs.pipe(ws)
  })
}

/**
 * Recursively copies the contents of one directory to another.
 * @param src The source directory to copy.
 * @param dst The directory to copy into.
 * @param opt_exclude An exclusion filter as either a regex or predicate
 *     function. All files matching this filter will not be copied.
 * @return A promise for the destination directory's path once all files have
 *     been copied.
 */
export function copyDir(src: string, dst: string, opt_exclude?: RegExp | ((p: string) => boolean)): Promise<string> {
  let predicate: ((p: string) => boolean) | undefined
  if (opt_exclude && typeof opt_exclude !== 'function') {
    predicate = function (p) {
      return !opt_exclude.test(p)
    }
  } else {
    predicate = opt_exclude
  }

  if (!fs.existsSync(dst)) {
    fs.mkdirSync(dst)
  }

  let files = fs.readdirSync(src)
  files = files.map(function (file) {
    return path.join(src, file)
  })

  if (predicate) {
    files = files.filter(predicate)
  }

  const results: Promise<string>[] = []
  files.forEach(function (file) {
    const stats = fs.statSync(file)
    const target = path.join(dst, path.basename(file))

    if (stats.isDirectory()) {
      if (!fs.existsSync(target)) {
        fs.mkdirSync(target, stats.mode)
      }
      results.push(copyDir(file, target, predicate))
    } else {
      results.push(copy(file, target))
    }
  })

  return Promise.all(results).then(() => dst)
}

/**
 * Tests if a file path exists.
 * @param aPath The path to test.
 * @return A promise for whether the file exists.
 */
export function exists(aPath: string): Promise<boolean> {
  return new Promise(function (fulfill, reject) {
    const type = typeof aPath
    if (type !== 'string') {
      reject(TypeError(`expected string path, but got ${type}`))
    } else {
      fulfill(fs.existsSync(aPath))
    }
  })
}

/**
 * Calls `stat(2)`.
 * @param aPath The path to stat.
 * @return A promise for the file stats.
 */
export function stat(aPath: string): Promise<fs.Stats> {
  return checkedCall<fs.Stats>((callback) => fs.stat(aPath, callback))
}

/**
 * Deletes a name from the filesystem and possibly the file it refers to. Has
 * no effect if the file does not exist.
 * @param aPath The path to remove.
 * @return A promise for when the file has been removed.
 */
export function unlink(aPath: string): Promise<void> {
  return new Promise(function (fulfill, reject) {
    const exists = fs.existsSync(aPath)
    if (exists) {
      fs.unlink(aPath, function (err) {
        if (err) {
          reject(err)
        } else {
          fulfill()
        }
      })
    } else {
      fulfill()
    }
  })
}

/**
 * @return A promise for the path to a temporary directory.
 * @see https://www.npmjs.org/package/tmp
 */
export function tmpDir(): Promise<string> {
  return checkedCall<string>((callback) => tmp.dir({ unsafeCleanup: true }, callback))
}

/**
 * @param opt_options Temporary file options.
 * @return A promise for the path to a temporary file.
 * @see https://www.npmjs.org/package/tmp
 */
export function tmpFile(opt_options?: tmp.FileOptions): Promise<string> {
  return checkedCall<string>((callback) => {
    /**  check fixed in v > 0.2.1 if
     * (typeof options === 'function') {
     *     return [{}, options];
     * }
     */
    tmp.file(opt_options ?? {}, callback)
  })
}

/**
 * Searches the {@code PATH} environment variable for the given file.
 * @param file The file to locate on the PATH.
 * @param opt_checkCwd Whether to always start with the search with
 *     the current working directory, regardless of whether it is explicitly
 *     listed on the PATH.
 * @return Path to the located file, or {@code null} if it could not be found.
 */
export function findInPath(file: string, opt_checkCwd?: boolean): string | null {
  const dirs: string[] = []
  if (opt_checkCwd) {
    dirs.push(process.cwd())
  }
  dirs.push(...(process.env['PATH'] ?? '').split(path.delimiter))

  const foundInDir = dirs.find((dir) => {
    const tmp = path.join(dir, file)
    try {
      const stats = fs.statSync(tmp)
      return stats.isFile() && !stats.isDirectory()
    } catch {
      return false
    }
  })

  return foundInDir ? path.join(foundInDir, file) : null
}

/**
 * Reads the contents of the given file.
 *
 * @param aPath Path to the file to read.
 * @return A promise that will resolve with a buffer of the file contents.
 */
export function read(aPath: string): Promise<Buffer> {
  return checkedCall<Buffer>((callback) => fs.readFile(aPath, callback))
}

/**
 * Writes to a file.
 *
 * @param aPath Path to the file to write to.
 * @param data The data to write.
 * @return A promise that will resolve when the operation has completed.
 */
export function write(aPath: string, data: string | Buffer): Promise<void> {
  return checkedCall<void>((callback) => fs.writeFile(aPath, data, callback))
}

/**
 * Creates a directory.
 *
 * @param aPath The directory path.
 * @return A promise that will resolve with the path of the created directory.
 */
export function mkdir(aPath: string): Promise<string> {
  return checkedCall<string>((callback) => {
    fs.mkdir(aPath, undefined, (err) => {
      if (err && err.code !== 'EEXIST') {
        callback(err)
      } else {
        callback(null, aPath)
      }
    })
  })
}

/**
 * Recursively creates a directory and any ancestors that do not yet exist.
 *
 * @param dir The directory path to create.
 * @return A promise that will resolve with the path of the created directory.
 */
export function mkdirp(dir: string): Promise<string> {
  return checkedCall<string>((callback) => {
    fs.mkdir(dir, undefined, (err) => {
      if (!err) {
        callback(null, dir)
        return
      }

      switch (err.code) {
        case 'EEXIST':
          callback(null, dir)
          return
        case 'ENOENT':
          return mkdirp(path.dirname(dir))
            .then(() => mkdirp(dir))
            .then(
              () => callback(null, dir),
              (err) => callback(err),
            )
        default:
          callback(err)
          return
      }
    })
  })
}

/** One entry reported by {@link walkDir}, relative to the walked root. */
export interface WalkEntry {
  path: string
  dir: boolean
}

/**
 * Recursively walks a directory, returning a promise that will resolve with
 * a list of all files/directories seen.
 *
 * @param rootPath the directory to walk.
 * @return a promise that will resolve with a list of entries seen. For each
 *     entry, the recorded path will be relative to `rootPath`.
 */
export function walkDir(rootPath: string): Promise<WalkEntry[]> {
  const seen: WalkEntry[] = []
  return (function walk(dir: string): Promise<unknown> {
    return checkedCall<string[]>((callback) => fs.readdir(dir, callback)).then((files) =>
      Promise.all(
        files.map((file) => {
          file = path.join(dir, file)
          return checkedCall<fs.Stats>((cb) => fs.stat(file, cb)).then((stats) => {
            seen.push({
              path: path.relative(rootPath, file),
              dir: stats.isDirectory(),
            })
            return stats.isDirectory() && walk(file)
          })
        }),
      ),
    )
  })(rootPath).then(() => seen)
}
