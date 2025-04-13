// Licensed to the Software Freedom Conservancy (SFC) under one
// or more contributor license agreements. See the NOTICE file
// distributed with this work for additional information regarding copyright
// ownership. The SFC licenses this file to you under the Apache License, Version 2.0
// (the "License"); you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and limitations
// under the License.

/**
 * Supported locator strategies.
 */
export type ByHash =
  | { className: string }
  | { css: string }
  | { id: string }
  | { js: string }
  | { linkText: string }
  | { name: string }
  | { partialLinkText: string }
  | { tagName: string }
  | { xpath: string };

/**
 * Represents a locator. In this code, a locator may be a plain object
 * where keys are strategy names and values are either strings or, in some cases,
 * even By instances (as with the `withTagName` function).
 */
export interface LocatorDefinition {
  [key: string]: string | By;
}

/**
 * A function that can use a script executor to locate elements.
 */
export type LocatorFunction = (driver: ScriptExecutor) => Promise<unknown>;

/**
 * Union type for a locator passed into the API.
 */
export type LocatorType = By | RelativeBy | LocatorFunction | ByHash;

/**
 * Simple interface for objects that support script execution.
 */
export interface ScriptExecutor {
  executeScript(script: string | Function, ...args: unknown[]): Promise<unknown>;
}

/**
 * Error thrown if an invalid character is encountered while escaping a CSS identifier.
 * @see https://drafts.csswg.org/cssom/#serialize-an-identifier
 */
export class InvalidCharacterError extends Error {
  constructor() {
    super();
    this.name = new.target.name;
  }
}

/**
 * Escapes a CSS string.
 *
 * @param css The string to escape.
 * @returns The escaped string.
 * @throws {TypeError} if the input is not a string.
 * @throws {InvalidCharacterError} if the string contains an invalid character.
 * @see https://drafts.csswg.org/cssom/#serialize-an-identifier
 */
export function escapeCss(css: string): string {
  if (typeof css !== 'string') {
    throw new TypeError('input must be a string');
  }
  let ret = '';
  const n = css.length;
  for (let i = 0; i < n; i++) {
    const c = css.charCodeAt(i);
    if (c === 0x0) {
      throw new InvalidCharacterError();
    }
    if (
      (c >= 0x0001 && c <= 0x001f) ||
      c === 0x007f ||
      (i === 0 && c >= 0x0030 && c <= 0x0039) ||
      (i === 1 && c >= 0x0030 && c <= 0x0039 && css.charCodeAt(0) === 0x002d)
    ) {
      ret += '\\' + c.toString(16) + ' ';
      continue;
    }
    if (i === 0 && c === 0x002d && n === 1) {
      ret += '\\' + css.charAt(i);
      continue;
    }
    if (
      c >= 0x0080 ||
      c === 0x002d || // -
      c === 0x005f || // _
      (c >= 0x0030 && c <= 0x0039) || // digits
      (c >= 0x0041 && c <= 0x005a) || // A-Z
      (c >= 0x0061 && c <= 0x007a)    // a-z
    ) {
      ret += css.charAt(i);
      continue;
    }
    ret += '\\' + css.charAt(i);
  }
  return ret;
}

/**
 * A mechanism for locating an element on the page.
 */
export class By {
  public readonly using: string;
  public readonly value: string;

  constructor(using: string, value: string) {
    this.using = using;
    this.value = value;
  }

  /**
   * Locates elements that have a specific class name.
   *
   * @param name The class name to search for.
   * @returns A new By locator.
   */
  static className(name: string): By {
    const names = name
      .split(/\s+/g)
      .filter((s) => s.length > 0)
      .map((s) => escapeCss(s));
    return By.css('.' + names.join('.'));
  }

  /**
   * Locates elements using a CSS selector.
   *
   * @param selector The CSS selector to use.
   * @returns A new By locator.
   */
  static css(selector: string): By {
    return new By('css selector', selector);
  }

  /**
   * Locates elements by the ID attribute.
   *
   * @param id The ID to search for.
   * @returns A new By locator.
   */
  static id(id: string): By {
    return By.css(`*[id="${escapeCss(id)}"]`);
  }

  /**
   * Locates link elements whose visible text exactly matches the provided text.
   *
   * @param text The link text to search for.
   * @returns A new By locator.
   */
  static linkText(text: string): By {
    return new By('link text', text);
  }

  /**
   * Locates elements by evaluating a JavaScript snippet.
   *
   * @param script The script or function to execute.
   * @param args The arguments to pass to the script.
   * @returns A locator function that accepts a driver and returns a Promise.
   */
  static js(
    script: string | Function,
    ...args: unknown[]
  ): LocatorFunction {
    return function (driver: ScriptExecutor): Promise<unknown> {
      return driver.executeScript(script, ...args);
    };
  }

  /**
   * Locates elements whose "name" attribute has the given value.
   *
   * @param name The name attribute to search for.
   * @returns A new By locator.
   */
  static name(name: string): By {
    return By.css(`*[name="${escapeCss(name)}"]`);
  }

  /**
   * Locates link elements whose visible text contains the given substring.
   *
   * @param text The substring to search for.
   * @returns A new By locator.
   */
  static partialLinkText(text: string): By {
    return new By('partial link text', text);
  }

  /**
   * Locates elements with a given tag name.
   *
   * @param name The tag name to search for.
   * @returns A new By locator.
   */
  static tagName(name: string): By {
    return new By('tag name', name);
  }

  /**
   * Locates elements matching an XPath selector.
   *
   * @param xpath The XPath selector to use.
   * @returns A new By locator.
   */
  static xpath(xpath: string): By {
    return new By('xpath', xpath);
  }

  /**
   * Returns a string representation of this locator.
   */
  toString(): string {
    return `By(${this.using}, ${this.value})`;
  }

  /**
   * Returns an object representation of this locator.
   */
  toObject(): LocatorDefinition {
    const obj: LocatorDefinition = {};
    obj[this.using] = this.value;
    return obj;
  }
}

/**
 * A filter for relative locators.
 */
interface Filter {
  kind: string;
  args: LocatorDefinition[];
}

/**
 * Returns a locator definition from a given By instance or plain locator object.
 *
 * @param locatorOrElement A By instance or an object representing the locator.
 * @returns The locator definition.
 */
export function getLocator(locatorOrElement: By | LocatorDefinition): LocatorDefinition {
  if (locatorOrElement instanceof By) {
    return locatorOrElement.toObject();
  }
  return locatorOrElement;
}

/**
 * A mechanism for locating an element relative to others on the page.
 */
export class RelativeBy {
  public readonly root: LocatorDefinition;
  public readonly filters: Filter[];

  constructor(root: LocatorDefinition, filters: Filter[] = []) {
    this.root = root;
    this.filters = filters;
  }

  /**
   * Look for elements above the root element.
   *
   * @param locatorOrElement The locator or element.
   * @returns This RelativeBy instance.
   */
  above(locatorOrElement: By | LocatorDefinition): this {
    this.filters.push({
      kind: 'above',
      args: [getLocator(locatorOrElement)],
    });
    return this;
  }

  /**
   * Look for elements below the root element.
   *
   * @param locatorOrElement The locator or element.
   * @returns This RelativeBy instance.
   */
  below(locatorOrElement: By | LocatorDefinition): this {
    this.filters.push({
      kind: 'below',
      args: [getLocator(locatorOrElement)],
    });
    return this;
  }

  /**
   * Look for elements to the left of the root element.
   *
   * @param locatorOrElement The locator or element.
   * @returns This RelativeBy instance.
   */
  toLeftOf(locatorOrElement: By | LocatorDefinition): this {
    this.filters.push({
      kind: 'left',
      args: [getLocator(locatorOrElement)],
    });
    return this;
  }

  /**
   * Look for elements to the right of the root element.
   *
   * @param locatorOrElement The locator or element.
   * @returns This RelativeBy instance.
   */
  toRightOf(locatorOrElement: By | LocatorDefinition): this {
    this.filters.push({
      kind: 'right',
      args: [getLocator(locatorOrElement)],
    });
    return this;
  }

  /**
   * Look for elements directly above the root element.
   *
   * @param locatorOrElement The locator or element.
   * @returns This RelativeBy instance.
   */
  straightAbove(locatorOrElement: By | LocatorDefinition): this {
    this.filters.push({
      kind: 'straightAbove',
      args: [getLocator(locatorOrElement)],
    });
    return this;
  }

  /**
   * Look for elements directly below the root element.
   *
   * @param locatorOrElement The locator or element.
   * @returns This RelativeBy instance.
   */
  straightBelow(locatorOrElement: By | LocatorDefinition): this {
    this.filters.push({
      kind: 'straightBelow',
      args: [getLocator(locatorOrElement)],
    });
    return this;
  }

  /**
   * Look for elements directly to the left of the root element.
   *
   * @param locatorOrElement The locator or element.
   * @returns This RelativeBy instance.
   */
  straightToLeftOf(locatorOrElement: By | LocatorDefinition): this {
    this.filters.push({
      kind: 'straightLeft',
      args: [getLocator(locatorOrElement)],
    });
    return this;
  }

  /**
   * Look for elements directly to the right of the root element.
   *
   * @param locatorOrElement The locator or element.
   * @returns This RelativeBy instance.
   */
  straightToRightOf(locatorOrElement: By | LocatorDefinition): this {
    this.filters.push({
      kind: 'straightRight',
      args: [getLocator(locatorOrElement)],
    });
    return this;
  }

  /**
   * Look for elements near the root element.
   *
   * @param locatorOrElement The locator or element.
   * @returns This RelativeBy instance.
   */
  near(locatorOrElement: By | LocatorDefinition): this {
    this.filters.push({
      kind: 'near',
      args: [getLocator(locatorOrElement)],
    });
    return this;
  }

  /**
   * Returns a marshalled version of this RelativeBy locator.
   *
   * @returns An object used in findElements.
   */
  marshall(): { relative: { root: LocatorDefinition; filters: Filter[] } } {
    return {
      relative: {
        root: this.root,
        filters: this.filters,
      },
    };
  }

  /**
   * Returns a string representation of this RelativeBy locator.
   */
  toString(): string {
    return `RelativeBy(${JSON.stringify(this.marshall())})`;
  }
}

/**
 * Allowed By static method keys.
 */
type ByKey =
  | 'className'
  | 'css'
  | 'id'
  | 'linkText'
  | 'js'
  | 'name'
  | 'partialLinkText'
  | 'tagName'
  | 'xpath';

/**
 * Interface for By static methods.
 */
interface ByStaticMethods {
  className(value: string): By;
  css(value: string): By;
  id(value: string): By;
  linkText(value: string): By;
  js(value: string | Function, ...args: unknown[]): LocatorFunction;
  name(value: string): By;
  partialLinkText(value: string): By;
  tagName(value: string): By;
  xpath(value: string): By;
}

/**
 * Checks if a value is a valid locator.
 *
 * @param locator The locator to check.
 * @returns A valid By locator or LocatorFunction.
 * @throws {TypeError} If the locator does not define a valid strategy.
 */
export function check(
  locator: LocatorType
): By | LocatorFunction {
  if (locator instanceof By || locator instanceof RelativeBy || typeof locator === 'function') {
    return locator as By | LocatorFunction;
  }

  // Check if locator has 'using' and 'value' properties.
  if (
    typeof locator === 'object' &&
    'using' in locator &&
    typeof (locator as { using: unknown }).using === 'string' &&
    'value' in locator &&
    typeof (locator as { value: unknown }).value === 'string'
  ) {
    return new By(
      (locator as { using: string }).using,
      (locator as { value: string }).value
    );
  }

  // Iterate over keys and see if it matches a known By strategy.
  const allowedKeys: ByKey[] = [
    'className',
    'css',
    'id',
    'linkText',
    'js',
    'name',
    'partialLinkText',
    'tagName',
    'xpath'
  ];
  for (const key in locator as Record<string, unknown>) {
    if (
      Object.prototype.hasOwnProperty.call(locator, key) &&
      allowedKeys.includes(key as ByKey)
    ) {
      const value = (locator as Record<ByKey, unknown>)[key as ByKey];
      if (typeof value === 'string') {
        const byStatic = By as unknown as ByStaticMethods;
        return byStatic[key as ByKey](value);
      }
    }
  }
  throw new TypeError('Invalid locator');
}

/**
 * Start searching for relative elements using the value returned from By.tagName().
 *
 * @param tagName A By locator (typically generated via By.tagName).
 * @returns A new RelativeBy locator.
 */
export function withTagName(tagName: By): RelativeBy {
  // Note: This intentionally uses a By instance as the value for the key.
  return new RelativeBy({ 'css selector': tagName });
}

/**
 * Start searching for relative elements using search criteria with By.
 *
 * @param by A By locator or locator object.
 * @returns A new RelativeBy locator.
 */
export function locateWith(by: By | LocatorDefinition): RelativeBy {
  return new RelativeBy(getLocator(by));
}
