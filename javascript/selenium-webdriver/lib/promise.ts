import { isObject, isPromise } from './util';

/**
 * Returns a promise that will be resolved after a specified delay.
 *
 * @param ms The number of milliseconds to wait before resolving.
 * @return A promise that resolves after the specified delay.
 */
function delayed(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a node-style function (with a callback as its final argument)
 * into a promise. The callback is expected to receive an error and a value.
 *
 * @param fn The function to wrap.
 * @param args The arguments to pass to fn (excluding the callback).
 * @return A promise that is fulfilled with the value if no error occurs,
 *         or rejected with the error.
 */
function checkedNodeCall<T>(
  fn: (...args: unknown[]) => void,
  ...args: unknown[]
): Promise<T> {
  return new Promise<T>((fulfill, reject) => {
    try {
      // Append a node-style callback to the arguments.
      fn(...args, (error: unknown, value: T) => {
        error ? reject(error) : fulfill(value);
      });
    } catch (ex) {
      reject(ex);
    }
  });
}

/**
 * Registers a callback to be invoked regardless of whether the provided promise
 * resolves or rejects. If the callback itself throws or returns a rejected promise,
 * that error will replace any previous error.
 *
 * @param promise A promise or value.
 * @param callback A function to invoke after the promise settles.
 * @return A promise that resolves with the callback's value.
 */
async function thenFinally<T, R>(
  promise: Promise<T> | T,
  callback: () => R | Promise<R>
): Promise<R> {
  try {
    await Promise.resolve(promise);
    return callback();
  } catch (e) {
    await callback();
    throw e;
  }
}

/**
 * Maps each element of an array (or a promise resolving to an array) via a callback.
 * The callback may return a promise. The returned promise resolves to an array
 * containing all mapped values.
 *
 * @param array An array or promise resolving to an array.
 * @param fn A mapping function to apply to each element.
 * @param self Optional object to use as `this` for the mapping function.
 * @return A promise that resolves to an array containing the mapped values.
 */
async function map<T, R, SELF = unknown>(
  array: T[] | Promise<T[]>,
  fn: (this: SELF, item: T, index: number, array: T[]) => R | Promise<R>,
  self?: SELF
): Promise<R[]> {
  const v = await Promise.resolve(array);
  if (!Array.isArray(v)) {
    throw new TypeError('not an array');
  }
  const values: R[] = [];
  for (const [index, item] of v.entries()) {
    values.push(await Promise.resolve(fn.call(self as SELF, item, index, v)));
  }
  return values;
}

/**
 * Filters an array (or a promise resolving to an array) by applying a predicate
 * function to each element. The predicate may return a promise. The returned promise
 * resolves to an array of elements for which the predicate returned a truthy value.
 *
 * @param array An array or a promise resolving to an array.
 * @param fn A predicate function to test each element.
 * @param self Optional object to use as `this` for the predicate.
 * @return A promise that resolves to an array containing only the elements
 *         for which the predicate returned a truthy value.
 */
async function filter<T, SELF = unknown>(
  array: T[] | Promise<T[]>,
  fn: (this: SELF, item: T, index: number, array: T[]) => boolean | Promise<boolean>,
  self?: SELF
): Promise<T[]> {
  const v = await Promise.resolve(array);
  if (!Array.isArray(v)) {
    throw new TypeError('not an array');
  }
  const values: T[] = [];
  for (const [index, item] of v.entries()) {
    const result = await Promise.resolve(fn.call(self as SELF, item, index, v));
    if (result) {
      values.push(item);
    }
  }
  return values;
}

/**
 * Fully resolves the provided value. If the value is an array, object, or function,
 * every nested key is recursively resolved. (Note: This function does not check for
 * cyclical references.)
 *
 * @param value The value to fully resolve.
 * @return A promise that resolves to the fully-resolved value.
 */
async function fullyResolved<T>(value: T): Promise<T> {
  const resolved = await Promise.resolve(value);
  if (Array.isArray(resolved)) {
    return (await fullyResolveKeys(resolved)) as T;
  }
  if (isObject(resolved)) {
    // @ts-ignore
    return (await fullyResolveKeys(resolved)) as T;
  }
  if (typeof resolved === 'function') {
    // Functions are objects in JavaScript.
    return (await fullyResolveKeys(resolved as object)) as T;
  }
  return resolved;
}

/**
 * Recursively resolves the keys of an object or array.
 *
 * @param obj An object or array whose values need to be fully resolved.
 * @return A promise that resolves to the same object with all nested keys resolved.
 */
async function fullyResolveKeys<T extends object>(obj: T): Promise<T> {
  const isArr = Array.isArray(obj);
  const numKeys = isArr ? (obj as unknown[]).length : Object.keys(obj).length;
  if (!numKeys) {
    return obj;
  }

  if (isArr) {
    for (let i = 0; i < (obj as unknown[]).length; i++) {
      const partialValue = (obj as unknown[])[i];
      if (
        !Array.isArray(partialValue) &&
        (partialValue === undefined ||
         partialValue === null ||
         typeof partialValue !== 'object')
      ) {
        continue;
      }
      (obj as unknown[])[i] = await fullyResolved(partialValue);
    }
  } else {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const partialValue = (obj as Record<string, unknown>)[key];
        if (
          !Array.isArray(partialValue) &&
          (partialValue === undefined ||
           partialValue === null ||
           typeof partialValue !== 'object')
        ) {
          continue;
        }
        (obj as Record<string, unknown>)[key] = await fullyResolved(partialValue);
      }
    }
  }
  return obj;
}

// Public API object that consolidates all utility functions.
const promiseUtils = {
  checkedNodeCall,
  delayed,
  filter,
  finally: thenFinally,
  fullyResolved,
  isPromise,
  map,
};

export default promiseUtils;
