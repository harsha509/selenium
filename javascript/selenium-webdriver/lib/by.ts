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

/**
 * @fileoverview Factory methods for the supported locator strategies.
 */

import type { ShadowRoot, WebDriver, WebElement } from './webdriver'

/**
 * Short-hand expressions for the primary element locator strategies.
 * For example the following two statements are equivalent:
 *
 *     var e1 = driver.findElement(By.id('foo'));
 *     var e2 = driver.findElement({id: 'foo'});
 *
 * Care should be taken when using JavaScript minifiers (such as the
 * Closure compiler), as locator hashes will always be parsed using
 * the un-obfuscated properties listed.
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
  | { xpath: string }

/** A script body or function accepted by {@link By.js}. */
export type ScriptSource = string | ((...args: never[]) => unknown)

/** Where an element search starts: the driver (document root), an element, or a shadow root. */
export type SearchContext = WebDriver | WebElement | ShadowRoot

/** A custom locator: receives the search context and yields an element, a list of elements, or a promise of either. */
export type LocatorFunction = (context: SearchContext) => unknown

/** A serialised locator: `{using: value}`, or `{using, value}` in wire form. */
export type LocatorDefinition = Record<string, unknown>

/** Anything accepted by {@link checkedLocator}. */
export type Locator = By | RelativeBy | LocatorFunction | ByHash | { using: string; value: string }

/**
 * Error thrown if an invalid character is encountered while escaping a CSS
 * identifier.
 * @see https://drafts.csswg.org/cssom/#serialize-an-identifier
 */
class InvalidCharacterError extends Error {
  constructor() {
    super()
    this.name = this.constructor.name
  }
}

/**
 * Escapes a CSS string.
 * @param css the string to escape.
 * @return the escaped string.
 * @throws {TypeError} if the input value is not a string.
 * @throws {InvalidCharacterError} if the string contains an invalid character.
 * @see https://drafts.csswg.org/cssom/#serialize-an-identifier
 */
export function escapeCss(css: string): string {
  if (typeof css !== 'string') {
    throw new TypeError('input must be a string')
  }
  let ret = ''
  const n = css.length
  for (let i = 0; i < n; i++) {
    const c = css.charCodeAt(i)
    if (c == 0x0) {
      throw new InvalidCharacterError()
    }

    if (
      (c >= 0x0001 && c <= 0x001f) ||
      c == 0x007f ||
      (i == 0 && c >= 0x0030 && c <= 0x0039) ||
      (i == 1 && c >= 0x0030 && c <= 0x0039 && css.charCodeAt(0) == 0x002d)
    ) {
      ret += '\\' + c.toString(16) + ' '
      continue
    }

    if (i == 0 && c == 0x002d && n == 1) {
      ret += '\\' + css.charAt(i)
      continue
    }

    if (
      c >= 0x0080 ||
      c == 0x002d || // -
      c == 0x005f || // _
      (c >= 0x0030 && c <= 0x0039) || // [0-9]
      (c >= 0x0041 && c <= 0x005a) || // [A-Z]
      (c >= 0x0061 && c <= 0x007a)
    ) {
      // [a-z]
      ret += css.charAt(i)
      continue
    }

    ret += '\\' + css.charAt(i)
  }
  return ret
}

/**
 * Describes a mechanism for locating an element on the page.
 * @final
 */
export class By {
  /**
   * @param using the name of the location strategy to use.
   * @param value the value to search for.
   */
  constructor(
    public using: string,
    public value: string,
  ) {}

  /**
   * Locates elements that have a specific class name.
   *
   * @param name The class name to search for.
   * @return The new locator.
   * @see http://www.w3.org/TR/2011/WD-html5-20110525/elements.html#classes
   * @see http://www.w3.org/TR/CSS2/selector.html#class-html
   */
  static className(name: string): By {
    const names = name
      .split(/\s+/g)
      .filter((s) => s.length > 0)
      .map((s) => escapeCss(s))
    return By.css('.' + names.join('.'))
  }

  /**
   * Locates elements using a CSS selector.
   *
   * @param selector The CSS selector to use.
   * @return The new locator.
   * @see http://www.w3.org/TR/CSS2/selector.html
   */
  static css(selector: string): By {
    return new By('css selector', selector)
  }

  /**
   * Locates elements by the ID attribute. This locator uses the CSS selector
   * `*[id="$ID"]`, _not_ `document.getElementById`.
   *
   * @param id The ID to search for.
   * @return The new locator.
   */
  static id(id: string): By {
    return By.css('*[id="' + escapeCss(id) + '"]')
  }

  /**
   * Locates link elements whose
   * {@linkplain webdriver.WebElement#getText visible text} matches the given
   * string.
   *
   * @param text The link text to search for.
   * @return The new locator.
   */
  static linkText(text: string): By {
    return new By('link text', text)
  }

  /**
   * Locates elements by evaluating a `script` that defines the body of
   * a {@linkplain webdriver.WebDriver#executeScript JavaScript function}.
   * The return value of this function must be an element or an array-like
   * list of elements. When this locator returns a list of elements, but only
   * one is expected, the first element in this list will be used as the
   * single element value.
   *
   * @param script The script to execute.
   * @param var_args The arguments to pass to the script.
   * @return A new JavaScript-based locator function.
   */
  static js(script: ScriptSource, ...var_args: unknown[]): LocatorFunction {
    return function (driver: SearchContext): Promise<unknown> {
      if (!('executeScript' in driver)) {
        throw new TypeError('By.js locators can only be evaluated against a WebDriver')
      }
      return driver.executeScript.call(driver, script, ...var_args)
    }
  }

  /**
   * Locates elements whose `name` attribute has the given value.
   *
   * @param name The name attribute to search for.
   * @return The new locator.
   */
  static name(name: string): By {
    return By.css('*[name="' + escapeCss(name) + '"]')
  }

  /**
   * Locates link elements whose
   * {@linkplain webdriver.WebElement#getText visible text} contains the given
   * substring.
   *
   * @param text The substring to check for in a link's visible text.
   * @return The new locator.
   */
  static partialLinkText(text: string): By {
    return new By('partial link text', text)
  }

  /**
   * Locates elements with a given tag name.
   *
   * @param name The tag name to search for.
   * @return The new locator.
   */
  static tagName(name: string): By {
    return new By('tag name', name)
  }

  /**
   * Locates elements matching a XPath selector. Care should be taken when
   * using an XPath selector with a {@link webdriver.WebElement} as WebDriver
   * will respect the context in the specified in the selector. For example,
   * given the selector `//div`, WebDriver will search from the document root
   * regardless of whether the locator was used with a WebElement.
   *
   * @param xpath The XPath selector to use.
   * @return The new locator.
   * @see http://www.w3.org/TR/xpath/
   */
  static xpath(xpath: string): By {
    return new By('xpath', xpath)
  }

  /** @override */
  toString(): string {
    // The static By.name() overrides this.constructor.name.  Shame...
    return `By(${this.using}, ${this.value})`
  }

  toObject(): LocatorDefinition {
    const tmp: LocatorDefinition = {}
    tmp[this.using] = this.value
    return tmp
  }
}

/** A {@link By} or an already-serialised locator or element reference. */
export type LocatorOrElement = By | object

/**
 * Start Searching for relative objects using the value returned from
 * `By.tagName()`.
 *
 * Note: this method will likely be removed in the future please use
 * `locateWith`.
 * @param tagName The value returned from calling By.tagName()
 * @returns
 */
export function withTagName(tagName: By): RelativeBy {
  return new RelativeBy({ 'css selector': tagName })
}

/**
 * Start searching for relative objects using search criteria with By.
 * @param by A By map that shows how to find the initial element
 * @returns {RelativeBy}
 */
export function locateWith(by: LocatorOrElement): RelativeBy {
  return new RelativeBy(getLocator(by))
}

function getLocator(locatorOrElement: LocatorOrElement): object {
  let toFind: object
  if (locatorOrElement instanceof By) {
    toFind = locatorOrElement.toObject()
  } else {
    toFind = locatorOrElement
  }
  return toFind
}

/** One relative-location constraint, e.g. `{kind: 'above', args: [locator]}`. */
export interface RelativeFilter {
  kind: string
  args: object[]
}

/**
 * Describes a mechanism for locating an element relative to others
 * on the page.
 * @final
 */
export class RelativeBy {
  root: object
  filters: RelativeFilter[]

  /**
   * @param findDetails
   * @param filters
   */
  constructor(findDetails: object, filters: RelativeFilter[] | null = null) {
    this.root = findDetails
    this.filters = filters || []
  }

  /**
   * Look for elements above the root element passed in
   * @param locatorOrElement
   * @return Return this object
   */
  above(locatorOrElement: LocatorOrElement): this {
    this.filters.push({
      kind: 'above',
      args: [getLocator(locatorOrElement)],
    })
    return this
  }

  /**
   * Look for elements below the root element passed in
   * @param locatorOrElement
   * @return Return this object
   */
  below(locatorOrElement: LocatorOrElement): this {
    this.filters.push({
      kind: 'below',
      args: [getLocator(locatorOrElement)],
    })
    return this
  }

  /**
   * Look for elements left the root element passed in
   * @param locatorOrElement
   * @return Return this object
   */
  toLeftOf(locatorOrElement: LocatorOrElement): this {
    this.filters.push({
      kind: 'left',
      args: [getLocator(locatorOrElement)],
    })
    return this
  }

  /**
   * Look for elements right the root element passed in
   * @param locatorOrElement
   * @return Return this object
   */
  toRightOf(locatorOrElement: LocatorOrElement): this {
    this.filters.push({
      kind: 'right',
      args: [getLocator(locatorOrElement)],
    })
    return this
  }

  /**
   * Look for elements above the root element passed in
   * @param locatorOrElement
   * @return Return this object
   */
  straightAbove(locatorOrElement: LocatorOrElement): this {
    this.filters.push({
      kind: 'straightAbove',
      args: [getLocator(locatorOrElement)],
    })
    return this
  }

  /**
   * Look for elements below the root element passed in
   * @param locatorOrElement
   * @return Return this object
   */
  straightBelow(locatorOrElement: LocatorOrElement): this {
    this.filters.push({
      kind: 'straightBelow',
      args: [getLocator(locatorOrElement)],
    })
    return this
  }

  /**
   * Look for elements left the root element passed in
   * @param locatorOrElement
   * @return Return this object
   */
  straightToLeftOf(locatorOrElement: LocatorOrElement): this {
    this.filters.push({
      kind: 'straightLeft',
      args: [getLocator(locatorOrElement)],
    })
    return this
  }

  /**
   * Look for elements right the root element passed in
   * @param locatorOrElement
   * @return Return this object
   */
  straightToRightOf(locatorOrElement: LocatorOrElement): this {
    this.filters.push({
      kind: 'straightRight',
      args: [getLocator(locatorOrElement)],
    })
    return this
  }

  /**
   * Look for elements near the root element passed in
   * @param locatorOrElement
   * @return Return this object
   */
  near(locatorOrElement: LocatorOrElement): this {
    this.filters.push({
      kind: 'near',
      args: [getLocator(locatorOrElement)],
    })
    return this
  }

  /**
   * Returns a marshalled version of the {@link RelativeBy}
   * @return Object representation of a {@link WebElement}
   *     that will be used in {@link #findElements}.
   */
  marshall(): { relative: { root: object; filters: RelativeFilter[] } } {
    return {
      relative: {
        root: this.root,
        filters: this.filters,
      },
    }
  }

  /** @override */
  toString(): string {
    // The static By.name() overrides this.constructor.name.  Shame...
    return `RelativeBy(${JSON.stringify(this.marshall())})`
  }
}

/** The {@link By} factory for each {@link ByHash} key. */
const HASH_STRATEGIES: Record<string, ((value: string) => By | LocatorFunction) | undefined> = {
  className: By.className,
  css: By.css,
  id: By.id,
  js: By.js,
  linkText: By.linkText,
  name: By.name,
  partialLinkText: By.partialLinkText,
  tagName: By.tagName,
  xpath: By.xpath,
}

function isLocatorFunction(locator: Locator): locator is LocatorFunction {
  return typeof locator === 'function'
}

/**
 * Checks if a value is a valid locator.
 * @param locator The value to check.
 * @return The valid locator.
 * @throws {TypeError} If the given value does not define a valid locator
 *     strategy.
 */
function check(locator: Locator): By | RelativeBy | LocatorFunction {
  if (locator instanceof By || locator instanceof RelativeBy) {
    return locator
  }
  if (isLocatorFunction(locator)) {
    return locator
  }

  if (
    locator &&
    typeof locator === 'object' &&
    'using' in locator &&
    typeof locator.using === 'string' &&
    'value' in locator &&
    typeof locator.value === 'string'
  ) {
    return new By(locator.using, locator.value)
  }

  for (const [key, value] of Object.entries(locator)) {
    const strategy = HASH_STRATEGIES[key]
    if (strategy && typeof value === 'string') {
      return strategy(value)
    }
  }
  throw new TypeError('Invalid locator')
}

export { check as checkedLocator }
