import { By } from './by';
import { UnsupportedOperationError } from './error';

/**
 * Minimal interface for a WebElement.
 * Updated to allow locator objects (e.g. { tagName: 'option' }) as well as By instances.
 */
export interface WebElement {
  getAttribute(attribute: string): Promise<string | null>;
  findElements(locator: By | { [key: string]: string }): Promise<WebElement[]>;
  findElement(locator: By | { [key: string]: string }): Promise<WebElement>;
  isSelected(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  click(): Promise<void>;
  getText(): Promise<string>;
}

/**
 * ISelect is a protocol for select elements.
 * (This interface is provided for reference; the Select class below implements its methods.)
 */
export interface ISelect {
  isMultiple(): Promise<boolean>;
  getOptions(): Promise<WebElement[]>;
  getAllSelectedOptions(): Promise<WebElement[]>;
  getFirstSelectedOption(): Promise<WebElement>;
  selectByVisibleText(text: string | number): Promise<void>;
  selectByValue(value: string): Promise<void>;
  selectByIndex(index: number): Promise<void>;
  deselectAll(): Promise<void>;
  deselectByVisibleText(text: string | number): Promise<void>;
  deselectByValue(value: string): Promise<void>;
  deselectByIndex(index: number): Promise<void>;
}

/**
 * Class representing a select element.
 */
export class Select implements ISelect {
  private element: WebElement;
  private multiple: boolean = false;

  /**
   * Creates a new Select instance.
   * @param element The WebElement representing the select element.
   */
  constructor(element: WebElement) {
    if (element === null) {
      throw new Error('Element must not be null. Please provide a valid <select> element.');
    }
    this.element = element;

    // Validate that the element’s tag name is "select".
    this.element.getAttribute('tagName').then((tagName: string | null) => {
      if (!tagName || tagName.toLowerCase() !== 'select') {
        throw new Error('Select only works on <select> elements');
      }
    });

    // Determine if the select supports multiple selections.
    this.element.getAttribute('multiple').then((multiple: string | null) => {
      this.multiple = multiple !== null && multiple !== 'false';
    });
  }

  async selectByIndex(index: number): Promise<void> {
    if (index < 0) {
      throw new Error('Index needs to be 0 or any other positive number');
    }
    const options = await this.element.findElements(By.tagName('option'));
    if (options.length === 0) {
      throw new Error("Select element doesn't contain any option element");
    }
    if (options.length - 1 < index) {
      throw new Error(
        `Option with index "${index}" not found. Select element only contains ${options.length - 1} option elements`
      );
    }
    for (const option of options) {
      const attr = await option.getAttribute('index');
      if (attr === index.toString()) {
        await this.setSelected(option);
      }
    }
  }

  async selectByValue(value: string): Promise<void> {
    let matched = false;
    const isMulti = await this.isMultiple();
    const options = await this.element.findElements(
      By.xpath('.//option[@value = ' + escapeQuotes(value) + ']')
    );
    for (const option of options) {
      await this.setSelected(option);
      if (!isMulti) {
        return;
      }
      matched = true;
    }
    if (!matched) {
      throw new Error(`Cannot locate option with value: ${value}`);
    }
  }

  async selectByVisibleText(text: string | number): Promise<void> {
    const textStr = typeof text === 'number' ? text.toString() : text;
    const xpath = './/option[normalize-space(.) = ' + escapeQuotes(textStr) + ']';
    const options = await this.element.findElements(By.xpath(xpath));
    for (const option of options) {
      await this.setSelected(option);
      if (!(await this.isMultiple())) {
        return;
      }
    }
    let matched = Array.isArray(options) && options.length > 0;
    if (!matched && textStr.includes(' ')) {
      const subStringWithoutSpace = getLongestSubstringWithoutSpace(textStr);
      let candidates: WebElement[];
      if (subStringWithoutSpace === '') {
        candidates = await this.element.findElements(By.tagName('option'));
      } else {
        const candidateXpath =
          './/option[contains(., ' + escapeQuotes(subStringWithoutSpace) + ')]';
        candidates = await this.element.findElements(By.xpath(candidateXpath));
      }
      const trimmed = textStr.trim();
      for (const option of candidates) {
        const optionText = await option.getText();
        if (trimmed === optionText.trim()) {
          await this.setSelected(option);
          if (!(await this.isMultiple())) {
            return;
          }
          matched = true;
        }
      }
    }
    if (!matched) {
      throw new Error(`Cannot locate option with text: ${textStr}`);
    }
  }

  async getOptions(): Promise<WebElement[]> {
    // Allow both locator objects and By instances.
    return await this.element.findElements({ tagName: 'option' });
  }

  async isMultiple(): Promise<boolean> {
    return this.multiple;
  }

  async getAllSelectedOptions(): Promise<WebElement[]> {
    const opts = await this.getOptions();
    const results: WebElement[] = [];
    for (const option of opts) {
      if (await option.isSelected()) {
        results.push(option);
      }
    }
    return results;
  }

  async getFirstSelectedOption(): Promise<WebElement> {
    return (await this.getAllSelectedOptions())[0];
  }

  async deselectAll(): Promise<void> {
    if (!(await this.isMultiple())) {
      throw new Error('You may only deselect all options of a multi-select');
    }
    const options = await this.getOptions();
    for (const option of options) {
      if (await option.isSelected()) {
        await option.click();
      }
    }
  }

  async deselectByVisibleText(text: string | number): Promise<void> {
    if (!(await this.isMultiple())) {
      throw new Error('You may only deselect options of a multi-select');
    }
    const textStr = typeof text === 'number' ? text.toString() : text;
    const optionElement = await this.element.findElement(
      By.xpath('.//option[normalize-space(.) = ' + escapeQuotes(textStr) + ']')
    );
    if (await optionElement.isSelected()) {
      await optionElement.click();
    }
  }

  async deselectByIndex(index: number): Promise<void> {
    if (!(await this.isMultiple())) {
      throw new Error('You may only deselect options of a multi-select');
    }
    if (index < 0) {
      throw new Error('Index needs to be 0 or any other positive number');
    }
    const options = await this.element.findElements(By.tagName('option'));
    if (options.length === 0) {
      throw new Error("Select element doesn't contain any option element");
    }
    if (options.length - 1 < index) {
      throw new Error(
        `Option with index "${index}" not found. Select element only contains ${options.length - 1} option elements`
      );
    }
    for (const option of options) {
      const attr = await option.getAttribute('index');
      if (attr === index.toString() && (await option.isSelected())) {
        await option.click();
      }
    }
  }

  async deselectByValue(value: string): Promise<void> {
    if (!(await this.isMultiple())) {
      throw new Error('You may only deselect options of a multi-select');
    }
    let matched = false;
    const options = await this.element.findElements(
      By.xpath('.//option[@value = ' + escapeQuotes(value) + ']')
    );
    if (options.length === 0) {
      throw new Error(`Cannot locate option with value: ${value}`);
    }
    for (const option of options) {
      if (await option.isSelected()) {
        await option.click();
      }
      matched = true;
    }
    if (!matched) {
      throw new Error(`Cannot locate option with value: ${value}`);
    }
  }

  /**
   * Sets the option as selected if it is not already selected.
   * Throws an error if the option is disabled.
   * @param option The option element.
   */
  private async setSelected(option: WebElement): Promise<void> {
    if (!(await option.isSelected())) {
      if (!(await option.isEnabled())) {
        throw new UnsupportedOperationError('You may not select a disabled option');
      }
      await option.click();
    }
  }
}

/**
 * Escapes a given string for use in an XPath expression.
 * Handles the case where the string contains both single and double quotes.
 * @param toEscape The string to escape.
 * @returns The escaped string.
 */
function escapeQuotes(toEscape: string): string {
  if (toEscape.includes(`"`) && toEscape.includes(`'`)) {
    const quoteIsLast = toEscape.lastIndexOf(`"`) === toEscape.length - 1;
    let substrings = toEscape.split(`"`);
    if (substrings[substrings.length - 1] === '') {
      substrings.pop();
    }
    let result = 'concat(';
    for (let i = 0; i < substrings.length; i++) {
      result += `"${substrings[i]}"`;
      result += i === substrings.length - 1 ? (quoteIsLast ? `, '"')` : `)`) : `, '"', `;
    }
    return result;
  }
  if (toEscape.includes('"')) {
    return `'${toEscape}'`;
  }
  return `"${toEscape}"`;
}

/**
 * Returns the longest substring from the provided text that does not contain a space.
 * @param text The input text.
 * @returns The longest substring without a space.
 */
function getLongestSubstringWithoutSpace(text: string): string {
  const words = text.split(' ');
  let longestString = '';
  for (const word of words) {
    if (word.length > longestString.length) {
      longestString = word;
    }
  }
  return longestString;
}

// Export a single default export that contains the Select class and the escapeQuotes helper.
const selectUtils = {
  Select,
  escapeQuotes,
};

export default selectUtils;
