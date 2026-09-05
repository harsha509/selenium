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

import { By, Locator } from './by'
import { UnsupportedOperationError } from './error'
import * as self from './select'

/** The subset of a WebElement that {@link Select} drives. */
export interface SelectElement {
  getAttribute(attributeName: string): Promise<string | null>
  findElement(locator: Locator): Promise<SelectElement>
  findElements(locator: Locator): Promise<SelectElement[]>
  getText(): Promise<string>
  isSelected(): Promise<boolean>
  isEnabled(): Promise<boolean>
  click(): Promise<void>
}

/**
 * ISelect interface makes a protocol for all kind of select elements (standard html and custom
 * model)
 */
interface ISelect {
  /**
   * @return Whether this select element supports selecting multiple options at the same time? This
   * is done by checking the value of the "multiple" attribute.
   */
  isMultiple(): Promise<boolean | undefined>

  /**
   * @return All options belonging to this select tag
   */
  getOptions(): Promise<SelectElement[]>

  /**
   * @return All selected options belonging to this select tag
   */
  getAllSelectedOptions(): Promise<SelectElement[]>

  /**
   * @return The first selected option in this select tag (or the currently selected option in a
   * normal select)
   */
  getFirstSelectedOption(): Promise<SelectElement>

  /**
   * Select all options that display text matching the argument. That is, when given "Bar" this
   * would select an option like:
   *
   * &lt;option value="foo"&gt;Bar&lt;/option&gt;
   *
   * @param text The visible text to match against
   */
  selectByVisibleText(text: string | number): Promise<void>

  /**
   * Select all options that have a value matching the argument. That is, when given "foo" this
   * would select an option like:
   *
   * &lt;option value="foo"&gt;Bar&lt;/option&gt;
   *
   * @param value The value to match against
   */
  selectByValue(value: string): Promise<void>

  /**
   * Select the option at the given index. This is done by examining the "index" attribute of an
   * element, and not merely by counting.
   *
   * @param index The option at this index will be selected
   */
  selectByIndex(index: number): Promise<void>

  /**
   * Clear all selected entries. This is only valid when the SELECT supports multiple selections.
   */
  deselectAll(): Promise<void>

  /**
   * Deselect all options that display text matching the argument. That is, when given "Bar" this
   * would deselect an option like:
   *
   * &lt;option value="foo"&gt;Bar&lt;/option&gt;
   *
   * @param text The visible text to match against
   */
  deselectByVisibleText(text: string | number): Promise<void>

  /**
   * Deselect all options that have a value matching the argument. That is, when given "foo" this
   * would deselect an option like:
   *
   * @param value The value to match against
   */
  deselectByValue(value: string): Promise<void>

  /**
   * Deselect the option at the given index. This is done by examining the "index" attribute of an
   * element, and not merely by counting.
   *
   * @param index The option at this index will be deselected
   */
  deselectByIndex(index: number): Promise<void>
}

export class Select implements ISelect {
  element: SelectElement
  multiple: boolean | undefined

  /**
   * Create an Select Element
   * @param element Select WebElement.
   */
  constructor(element: SelectElement) {
    if (element === null) {
      throw new Error(`Element must not be null. Please provide a valid <select> element.`)
    }

    this.element = element

    this.element.getAttribute('tagName').then(function (tagName) {
      if (tagName === null || tagName.toLowerCase() !== 'select') {
        throw new Error(`Select only works on <select> elements`)
      }
    })

    this.element.getAttribute('multiple').then((multiple) => {
      this.multiple = multiple !== null && multiple !== 'false'
    })
  }

  /**
   *
   * Select option with specified index.
   *
   * <example>
   <select id="selectbox">
   <option value="1">Option 1</option>
   <option value="2">Option 2</option>
   <option value="3">Option 3</option>
   </select>
   const selectBox = await driver.findElement(By.id("selectbox"));
   await selectObject.selectByIndex(1);
   * </example>
   *
   * @param index
   */
  async selectByIndex(index: number): Promise<void> {
    if (index < 0) {
      throw new Error('Index needs to be 0 or any other positive number')
    }

    const options = await this.element.findElements(By.tagName('option'))

    if (options.length === 0) {
      throw new Error("Select element doesn't contain any option element")
    }

    if (options.length - 1 < index) {
      throw new Error(
        `Option with index "${index}" not found. Select element only contains ${options.length - 1} option elements`,
      )
    }

    for (const option of options) {
      if ((await option.getAttribute('index')) === index.toString()) {
        await this.setSelected(option)
      }
    }
  }

  /**
   *
   * Select option by specific value.
   *
   * <example>
   <select id="selectbox">
   <option value="1">Option 1</option>
   <option value="2">Option 2</option>
   <option value="3">Option 3</option>
   </select>
   const selectBox = await driver.findElement(By.id("selectbox"));
   await selectObject.selectByVisibleText("Option 2");
   * </example>
   *
   *
   * @param value value of option element to be selected
   */
  async selectByValue(value: string): Promise<void> {
    let matched = false
    const isMulti = await this.isMultiple()

    const options = await this.element.findElements(By.xpath('.//option[@value = ' + escapeQuotes(value) + ']'))

    for (const option of options) {
      await this.setSelected(option)

      if (!isMulti) {
        return
      }
      matched = true
    }

    if (!matched) {
      throw new Error(`Cannot locate option with value: ${value}`)
    }
  }

  /**
   *
   * Select option with displayed text matching the argument.
   *
   * <example>
   <select id="selectbox">
   <option value="1">Option 1</option>
   <option value="2">Option 2</option>
   <option value="3">Option 3</option>
   </select>
   const selectBox = await driver.findElement(By.id("selectbox"));
   await selectObject.selectByVisibleText("Option 2");
   * </example>
   *
   * @param text       text of option element to get selected
   *
   */
  async selectByVisibleText(text: string | number): Promise<void> {
    text = typeof text === 'number' ? text.toString() : text

    const xpath = './/option[normalize-space(.) = ' + escapeQuotes(text) + ']'

    const options = await this.element.findElements(By.xpath(xpath))

    for (const option of options) {
      await this.setSelected(option)
      if (!(await this.isMultiple())) {
        return
      }
    }

    let matched = Array.isArray(options) && options.length > 0

    if (!matched && text.includes(' ')) {
      const subStringWithoutSpace = getLongestSubstringWithoutSpace(text)
      let candidates: SelectElement[]
      if ('' === subStringWithoutSpace) {
        candidates = await this.element.findElements(By.tagName('option'))
      } else {
        const xpath = './/option[contains(., ' + escapeQuotes(subStringWithoutSpace) + ')]'
        candidates = await this.element.findElements(By.xpath(xpath))
      }

      const trimmed = text.trim()

      for (const option of candidates) {
        const optionText = await option.getText()
        if (trimmed === optionText.trim()) {
          await this.setSelected(option)
          if (!(await this.isMultiple())) {
            return
          }
          matched = true
        }
      }
    }

    if (!matched) {
      throw new Error(`Cannot locate option with text: ${text}`)
    }
  }

  /**
   * Returns a list of all options belonging to this select tag
   */
  async getOptions(): Promise<SelectElement[]> {
    return await this.element.findElements({ tagName: 'option' })
  }

  /**
   * Returns a boolean value if the select tag is multiple
   */
  async isMultiple(): Promise<boolean | undefined> {
    return this.multiple
  }

  /**
   * Returns a list of all selected options belonging to this select tag
   */
  async getAllSelectedOptions(): Promise<SelectElement[]> {
    const opts = await this.getOptions()
    const results: SelectElement[] = []
    for (const options of opts) {
      if (await options.isSelected()) {
        results.push(options)
      }
    }
    return results
  }

  /**
   * Returns first Selected Option
   */
  async getFirstSelectedOption(): Promise<SelectElement> {
    return (await this.getAllSelectedOptions())[0]
  }

  /**
   * Deselects all selected options
   */
  async deselectAll(): Promise<void> {
    if (!this.isMultiple()) {
      throw new Error('You may only deselect all options of a multi-select')
    }

    const options = await this.getOptions()

    for (const option of options) {
      if (await option.isSelected()) {
        await option.click()
      }
    }
  }

  /**
   *
   * @param text text of option to deselect
   */
  async deselectByVisibleText(text: string | number): Promise<void> {
    if (!(await this.isMultiple())) {
      throw new Error('You may only deselect options of a multi-select')
    }

    /**
     * convert value into string
     */
    text = typeof text === 'number' ? text.toString() : text

    const optionElement = await this.element.findElement(
      By.xpath('.//option[normalize-space(.) = ' + escapeQuotes(text) + ']'),
    )
    if (await optionElement.isSelected()) {
      await optionElement.click()
    }
  }

  /**
   *
   * @param index       index of option element to deselect
   * Deselect the option at the given index.
   * This is done by examining the "index"
   * attribute of an element, and not merely by counting.
   */
  async deselectByIndex(index: number): Promise<void> {
    if (!(await this.isMultiple())) {
      throw new Error('You may only deselect options of a multi-select')
    }

    if (index < 0) {
      throw new Error('Index needs to be 0 or any other positive number')
    }

    const options = await this.element.findElements(By.tagName('option'))

    if (options.length === 0) {
      throw new Error("Select element doesn't contain any option element")
    }

    if (options.length - 1 < index) {
      throw new Error(
        `Option with index "${index}" not found. Select element only contains ${options.length - 1} option elements`,
      )
    }

    for (const option of options) {
      if ((await option.getAttribute('index')) === index.toString()) {
        if (await option.isSelected()) {
          await option.click()
        }
      }
    }
  }

  /**
   *
   * @param value value of an option to deselect
   */
  async deselectByValue(value: string): Promise<void> {
    if (!(await this.isMultiple())) {
      throw new Error('You may only deselect options of a multi-select')
    }

    let matched = false

    const options = await this.element.findElements(By.xpath('.//option[@value = ' + escapeQuotes(value) + ']'))

    if (options.length === 0) {
      throw new Error(`Cannot locate option with value: ${value}`)
    }

    for (const option of options) {
      if (await option.isSelected()) {
        await option.click()
      }
      matched = true
    }

    if (!matched) {
      throw new Error(`Cannot locate option with value: ${value}`)
    }
  }

  async setSelected(option: SelectElement): Promise<void> {
    if (!(await option.isSelected())) {
      if (!(await option.isEnabled())) {
        throw new UnsupportedOperationError(`You may not select a disabled option`)
      }
      await option.click()
    }
  }
}

export function escapeQuotes(toEscape: string): string {
  if (toEscape.includes(`"`) && toEscape.includes(`'`)) {
    const quoteIsLast = toEscape.lastIndexOf(`"`) === toEscape.length - 1
    const substrings = toEscape.split(`"`)

    // Remove the last element if it's an empty string
    if (substrings[substrings.length - 1] === '') {
      substrings.pop()
    }

    let result = 'concat('

    for (let i = 0; i < substrings.length; i++) {
      result += `"${substrings[i]}"`
      result += i === substrings.length - 1 ? (quoteIsLast ? `, '"')` : `)`) : `, '"', `
    }
    return result
  }

  if (toEscape.includes('"')) {
    return `'${toEscape}'`
  }

  // Otherwise return the quoted string
  return `"${toEscape}"`
}

function getLongestSubstringWithoutSpace(text: string): string {
  const words = text.split(' ')
  let longestString = ''
  for (const word of words) {
    if (word.length > longestString.length) {
      longestString = word
    }
  }
  return longestString
}

/** Keeps `import x from '...'` working for esModuleInterop/Babel consumers; deliberate exception to the no-default-export rule. */
const defaultExport: typeof self = self
export default defaultExport
