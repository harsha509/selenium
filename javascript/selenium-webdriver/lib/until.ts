import * as by from './by';
import * as error from './error';
import {
  Condition,
  WebElementCondition,
  WebDriver,
  WebElement,
  Alert,
} from './webdriver';

/**
 * Type guard to check if a given value implements WebElement.
 */
function isWebElement(value: unknown): value is WebElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as WebElement).getAttribute === 'function'
  );
}

/**
 * Creates a condition that waits until the driver is able to switch to the designated frame.
 * The frame parameter may be:
 *  - a number (index),
 *  - a WebElement,
 *  - a By locator,
 *  - or a function that returns a Promise<WebElement>.
 *
 * @param frame The frame identifier.
 * @return A Condition that resolves to true if the switch succeeds.
 */
export function ableToSwitchToFrame(
  frame: number | WebElement | by.By | ((driver: WebDriver) => Promise<WebElement>)
): Condition<boolean> {
  // Helper: attempts switching to the given frame.
  function attemptToSwitchFrames(
    driver: WebDriver,
    target: number | WebElement
  ): Promise<boolean> {
    return driver
      .switchTo()
      .frame(target)
      .then(
        () => true,
        (e: unknown) => {
          if (!(e instanceof error.NoSuchFrameError)) {
            throw e;
          }
          // Returning null signals that the condition is not yet fulfilled.
          return null as unknown as boolean;
        }
      );
  }

  let conditionFn: (driver: WebDriver) => Promise<boolean | null>;
  if (typeof frame === 'number' || isWebElement(frame)) {
    conditionFn = (driver: WebDriver) => attemptToSwitchFrames(driver, frame);
  } else {
    // For a locator (or function) resolve the frame element and try switching.
    conditionFn = (driver: WebDriver) => {
      // Replace checkedLocator with the new getLocator helper.
      const locator = typeof frame === 'function' ? frame : by.getLocator(frame);
      return driver.findElements(locator).then((els: WebElement[]) => {
        if (els.length > 0) {
          return attemptToSwitchFrames(driver, els[0]);
        }
        return null;
      });
    };
  }
  return new Condition<boolean>('to be able to switch to frame', conditionFn);
}

/**
 * Creates a condition that waits for an alert to be present.
 *
 * @return A Condition that resolves to the Alert if found.
 */
export function alertIsPresent(): Condition<Alert> {
  return new Condition<Alert>('for alert to be present', (driver: WebDriver) =>
    driver
      .switchTo()
      .alert()
      .catch((e: unknown) => {
        if (
          e instanceof error.NoSuchAlertError ||
          (e instanceof error.WebDriverError && e.message === `can't convert null to object`)
        ) {
          return null;
        }
        throw e;
      })
  );
}

/**
 * Creates a condition that waits for the page title to exactly equal the expected title.
 *
 * @param title The expected page title.
 * @return A Condition that resolves to true when the title matches.
 */
export function titleIs(title: string): Condition<boolean> {
  return new Condition<boolean>(
    'for title to be ' + JSON.stringify(title),
    (driver: WebDriver) => driver.getTitle().then((t: string) => t === title)
  );
}

/**
 * Creates a condition that waits for the page title to contain the given substring.
 *
 * @param substr The substring to locate within the title.
 * @return A Condition that resolves to true when the substring is present.
 */
export function titleContains(substr: string): Condition<boolean> {
  return new Condition<boolean>(
    'for title to contain ' + JSON.stringify(substr),
    (driver: WebDriver) => driver.getTitle().then((title: string) => title.includes(substr))
  );
}

/**
 * Creates a condition that waits for the page title to match the given regex.
 *
 * @param regex The regular expression to test against.
 * @return A Condition that resolves to true when the title matches.
 */
export function titleMatches(regex: RegExp): Condition<boolean> {
  return new Condition<boolean>(
    'for title to match ' + regex.toString(),
    (driver: WebDriver) => driver.getTitle().then((title: string) => regex.test(title))
  );
}

/**
 * Creates a condition that waits for the current URL to exactly equal the expected URL.
 *
 * @param url The expected URL.
 * @return A Condition that resolves to true when the URL matches.
 */
export function urlIs(url: string): Condition<boolean> {
  return new Condition<boolean>(
    'for URL to be ' + JSON.stringify(url),
    (driver: WebDriver) => driver.getCurrentUrl().then((u: string) => u === url)
  );
}

/**
 * Creates a condition that waits for the current URL to contain the given substring.
 *
 * @param substrUrl The substring expected in the URL.
 * @return A Condition that resolves to true when the substring is found.
 */
export function urlContains(substrUrl: string): Condition<boolean> {
  return new Condition<boolean>(
    'for URL to contain ' + JSON.stringify(substrUrl),
    (driver: WebDriver) =>
      driver.getCurrentUrl().then((url: string) => (url ? url.includes(substrUrl) : false))
  );
}

/**
 * Creates a condition that waits for the current URL to match the given regular expression.
 *
 * @param regex The regular expression to test against.
 * @return A Condition that resolves to true when the URL matches.
 */
export function urlMatches(regex: RegExp): Condition<boolean> {
  return new Condition<boolean>(
    'for URL to match ' + regex.toString(),
    (driver: WebDriver) => driver.getCurrentUrl().then((url: string) => regex.test(url))
  );
}

/**
 * Creates a condition that waits until an element is located using the given locator.
 *
 * @param locator A By instance or a function returning a Promise<WebElement>.
 * @return A WebElementCondition that resolves to the first located element.
 */
export function elementLocated(
  locator: by.By | ((driver: WebDriver) => Promise<WebElement>)
): WebElementCondition {
  const resolvedLocator =
    typeof locator === 'function' ? locator : by.getLocator(locator);
  const locatorStr =
    typeof locator === 'function' ? 'by function()' : resolvedLocator.toString();
  return new WebElementCondition(
    'for element to be located ' + locatorStr,
    (driver: WebDriver) =>
      driver.findElements(resolvedLocator).then((elements: WebElement[]) =>
        elements.length ? elements[0] : null
      )
  );
}

/**
 * Creates a condition that waits until at least one element is located using the given locator.
 *
 * @param locator A By instance or a function returning a Promise<WebElement[]>.
 * @return A Condition that resolves to an array of located elements.
 */
export function elementsLocated(
  locator: by.By | ((driver: WebDriver) => Promise<WebElement[]>)
): Condition<WebElement[]> {
  const resolvedLocator =
    typeof locator === 'function' ? locator : by.getLocator(locator);
  const locatorStr =
    typeof locator === 'function' ? 'by function()' : resolvedLocator.toString();
  return new Condition<WebElement[]>(
    'for at least one element to be located ' + locatorStr,
    (driver: WebDriver) =>
      driver.findElements(resolvedLocator).then((elements: WebElement[]) =>
        elements.length > 0 ? elements : null
      )
  );
}

/**
 * Creates a condition that waits until the given element becomes stale.
 * An element is considered stale if it is removed from the DOM or the page changes.
 *
 * @param element The WebElement to check.
 * @return A Condition that resolves to true if the element is stale.
 */
export function stalenessOf(element: WebElement): Condition<boolean> {
  return new Condition<boolean>('element to become stale', () =>
    element.getTagName().then(
      () => false,
      (e: unknown) => {
        if (e instanceof error.StaleElementReferenceError) {
          return true;
        }
        throw e;
      }
    )
  );
}

/**
 * Creates a condition that waits until the given element is visible.
 *
 * @param element The WebElement to check.
 * @return A WebElementCondition that resolves to the element if visible.
 */
export function elementIsVisible(element: WebElement): WebElementCondition {
  return new WebElementCondition(
    'until element is visible',
    () => element.isDisplayed().then((v: boolean) => (v ? element : null))
  );
}

/**
 * Creates a condition that waits until the given element is not visible.
 *
 * @param element The WebElement to check.
 * @return A WebElementCondition that resolves to the element if not visible.
 */
export function elementIsNotVisible(element: WebElement): WebElementCondition {
  return new WebElementCondition(
    'until element is not visible',
    () => element.isDisplayed().then((v: boolean) => (v ? null : element))
  );
}

/**
 * Creates a condition that waits until the given element is enabled.
 *
 * @param element The WebElement to check.
 * @return A WebElementCondition that resolves to the element if enabled.
 */
export function elementIsEnabled(element: WebElement): WebElementCondition {
  return new WebElementCondition(
    'until element is enabled',
    () => element.isEnabled().then((v: boolean) => (v ? element : null))
  );
}

/**
 * Creates a condition that waits until the given element is disabled.
 *
 * @param element The WebElement to check.
 * @return A WebElementCondition that resolves to the element if disabled.
 */
export function elementIsDisabled(element: WebElement): WebElementCondition {
  return new WebElementCondition(
    'until element is disabled',
    () => element.isEnabled().then((v: boolean) => (v ? null : element))
  );
}

/**
 * Creates a condition that waits until the given element is selected.
 *
 * @param element The WebElement to check.
 * @return A WebElementCondition that resolves to the element if selected.
 */
export function elementIsSelected(element: WebElement): WebElementCondition {
  return new WebElementCondition(
    'until element is selected',
    () => element.isSelected().then((v: boolean) => (v ? element : null))
  );
}

/**
 * Creates a condition that waits until the given element is not selected.
 *
 * @param element The WebElement to check.
 * @return A WebElementCondition that resolves to the element if not selected.
 */
export function elementIsNotSelected(element: WebElement): WebElementCondition {
  return new WebElementCondition(
    'until element is not selected',
    () => element.isSelected().then((v: boolean) => (v ? null : element))
  );
}

/**
 * Creates a condition that waits until the visible text of the element exactly equals the expected text.
 *
 * @param element The WebElement to check.
 * @param text The expected text.
 * @return A WebElementCondition that resolves to the element if the text matches.
 */
export function elementTextIs(element: WebElement, text: string): WebElementCondition {
  return new WebElementCondition(
    'until element text is',
    () => element.getText().then((t: string) => (t === text ? element : null))
  );
}

/**
 * Creates a condition that waits until the element's text contains the specified substring.
 *
 * @param element The WebElement to check.
 * @param substr The substring that should be present.
 * @return A WebElementCondition that resolves to the element if the text contains the substring.
 */
export function elementTextContains(element: WebElement, substr: string): WebElementCondition {
  return new WebElementCondition(
    'until element text contains',
    () => element.getText().then((t: string) => (t.indexOf(substr) !== -1 ? element : null))
  );
}

/**
 * Creates a condition that waits until the element's text matches the given regular expression.
 *
 * @param element The WebElement to check.
 * @param regex The regular expression to test.
 * @return A WebElementCondition that resolves to the element if the text matches.
 */
export function elementTextMatches(element: WebElement, regex: RegExp): WebElementCondition {
  return new WebElementCondition(
    'until element text matches',
    () => element.getText().then((t: string) => (regex.test(t) ? element : null))
  );
}
