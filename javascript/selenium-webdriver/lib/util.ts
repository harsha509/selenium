/**
 * Determines whether a given value should be treated as an object.
 *
 * @param value The value to test.
 * @returns True if the value is an object; otherwise, false.
 */
export function isObject(value: unknown): boolean {
  return Object.prototype.toString.call(value) === '[object Object]';
}

/**
 * Determines whether a given value should be treated as a promise.
 * Any object (or function) having a "then" property that is a function is considered a promise.
 *
 * @param value The value to test.
 * @returns True if the value is a promise; otherwise, false.
 */
export function isPromise(value: unknown): boolean {
  try {
    return (
      (typeof value === 'object' || typeof value === 'function') &&
      typeof (value as { then?: unknown }).then === 'function'
    );
  } catch (ex) {
    return false;
  }
}
