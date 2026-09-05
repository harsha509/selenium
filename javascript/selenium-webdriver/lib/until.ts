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
 * @fileoverview Defines common conditions for use with
 * {@link webdriver.WebDriver#wait WebDriver wait}.
 *
 * Sample usage:
 *
 *     driver.get('http://www.google.com/ncr');
 *
 *     var query = driver.wait(until.elementLocated(By.name('q')));
 *     query.sendKeys('webdriver\n');
 *
 *     driver.wait(until.titleIs('webdriver - Google Search'));
 *
 * To define a custom condition, simply call WebDriver.wait with a function
 * that will eventually return a truthy-value (neither null, undefined, false,
 * 0, or the empty string):
 *
 *     driver.wait(function() {
 *       return driver.getTitle().then(function(title) {
 *         return title === 'webdriver - Google Search';
 *       });
 *     }, 1000);
 */

import * as by from './by'
import * as error from './error'
import * as webdriver from './webdriver'
import type { Alert, WebDriver, WebElement } from './webdriver'

const Condition = webdriver.Condition
const WebElementCondition = webdriver.WebElementCondition

type Condition<OUT> = webdriver.Condition<OUT>
type WebElementCondition = webdriver.WebElementCondition

/**
 * Creates a condition that will wait until the input driver is able to switch
 * to the designated frame. The target frame may be specified as
 *
 * 1. a numeric index into
 *     [window.frames](https://developer.mozilla.org/en-US/docs/Web/API/Window.frames)
 *     for the currently selected frame.
 * 2. a {@link ./webdriver.WebElement}, which must reference a FRAME or IFRAME
 *     element on the current page.
 * 3. a locator which may be used to first locate a FRAME or IFRAME on the
 *     current page before attempting to switch to it.
 *
 * Upon successful resolution of this condition, the driver will be left
 * focused on the new frame.
 *
 * @param frame The frame identifier.
 * @return A new condition.
 */
export function ableToSwitchToFrame(frame: number | WebElement | by.Locator): Condition<boolean | undefined> {
  let condition: (driver: WebDriver) => Promise<boolean | undefined>
  if (typeof frame === 'number' || frame instanceof webdriver.WebElement) {
    condition = (driver) => attemptToSwitchFrames(driver, frame)
  } else {
    condition = function (driver) {
      const locator = frame
      return driver.findElements(locator).then(function (els) {
        if (els.length) {
          return attemptToSwitchFrames(driver, els[0])
        }
        return undefined
      })
    }
  }

  return new Condition('to be able to switch to frame', condition)

  function attemptToSwitchFrames(driver: WebDriver, frame: number | WebElement): Promise<boolean | undefined> {
    return driver
      .switchTo()
      .frame(frame)
      .then(
        function () {
          return true
        },
        function (e) {
          if (!(e instanceof error.NoSuchFrameError)) {
            throw e
          }
          return undefined
        },
      )
  }
}

/**
 * Creates a condition that waits for an alert to be opened. Upon success, the
 * returned promise will be fulfilled with the handle for the opened alert.
 *
 * @return The new condition.
 */
export function alertIsPresent(): Condition<Alert | undefined> {
  return new Condition('for alert to be present', function (driver) {
    return driver
      .switchTo()
      .alert()
      .catch(function (e) {
        if (!(
          e instanceof error.NoSuchAlertError ||
          // XXX: Workaround for GeckoDriver error `TypeError: can't convert null
          // to object`. For more details, see
          // https://github.com/SeleniumHQ/selenium/pull/2137
          (e instanceof error.WebDriverError && e.message === `can't convert null to object`)
        )) {
          throw e
        }
        return undefined
      })
  })
}

/**
 * Creates a condition that will wait for the current page's title to match the
 * given value.
 *
 * @param title The expected page title.
 * @return The new condition.
 */
export function titleIs(title: string): Condition<boolean> {
  return new Condition('for title to be ' + JSON.stringify(title), function (driver) {
    return driver.getTitle().then(function (t) {
      return t === title
    })
  })
}

/**
 * Creates a condition that will wait for the current page's title to contain
 * the given substring.
 *
 * @param substr The substring that should be present in the page title.
 * @return The new condition.
 */
export function titleContains(substr: string): Condition<boolean> {
  return new Condition('for title to contain ' + JSON.stringify(substr), function (driver) {
    return driver.getTitle().then(function (title) {
      return title.indexOf(substr) !== -1
    })
  })
}

/**
 * Creates a condition that will wait for the current page's title to match the
 * given regular expression.
 *
 * @param regex The regular expression to test against.
 * @return The new condition.
 */
export function titleMatches(regex: RegExp): Condition<boolean> {
  return new Condition('for title to match ' + regex, function (driver) {
    return driver.getTitle().then(function (title) {
      return regex.test(title)
    })
  })
}

/**
 * Creates a condition that will wait for the current page's url to match the
 * given value.
 *
 * @param url The expected page url.
 * @return The new condition.
 */
export function urlIs(url: string): Condition<boolean> {
  return new Condition('for URL to be ' + JSON.stringify(url), function (driver) {
    return driver.getCurrentUrl().then(function (u) {
      return u === url
    })
  })
}

/**
 * Creates a condition that will wait for the current page's url to contain
 * the given substring.
 *
 * @param substrUrl The substring that should be present in the current URL.
 * @return The new condition.
 */
export function urlContains(substrUrl: string): Condition<boolean | string> {
  return new Condition('for URL to contain ' + JSON.stringify(substrUrl), function (driver) {
    return driver.getCurrentUrl().then(function (url) {
      return url && url.includes(substrUrl)
    })
  })
}

/**
 * Creates a condition that will wait for the current page's url to match the
 * given regular expression.
 *
 * @param regex The regular expression to test against.
 * @return The new condition.
 */
export function urlMatches(regex: RegExp): Condition<boolean> {
  return new Condition('for URL to match ' + regex, function (driver) {
    return driver.getCurrentUrl().then(function (url) {
      return regex.test(url)
    })
  })
}

/**
 * Creates a condition that will loop until an element is
 * {@link ./webdriver.WebDriver#findElement found} with the given locator.
 *
 * @param locator The locator to use.
 * @return The new condition.
 */
export function elementLocated(locator: by.Locator): WebElementCondition {
  locator = by.checkedLocator(locator)
  const locatorStr = typeof locator === 'function' ? 'by function()' : locator + ''
  return new WebElementCondition('for element to be located ' + locatorStr, function (driver) {
    return driver.findElements(locator).then(function (elements) {
      return elements[0]
    })
  })
}

/**
 * Creates a condition that will loop until at least one element is
 * {@link ./webdriver.WebDriver#findElement found} with the given locator.
 *
 * @param locator The locator to use.
 * @return The new condition.
 */
export function elementsLocated(locator: by.Locator): Condition<WebElement[] | null> {
  locator = by.checkedLocator(locator)
  const locatorStr = typeof locator === 'function' ? 'by function()' : locator + ''
  return new Condition('for at least one element to be located ' + locatorStr, function (driver) {
    return driver.findElements(locator).then(function (elements) {
      return elements.length > 0 ? elements : null
    })
  })
}

/**
 * Creates a condition that will wait for the given element to become stale. An
 * element is considered stale once it is removed from the DOM, or a new page
 * has loaded.
 *
 * @param element The element that should become stale.
 * @return The new condition.
 */
export function stalenessOf(element: WebElement): Condition<boolean> {
  return new Condition('element to become stale', function () {
    return element.getTagName().then(
      function () {
        return false
      },
      function (e) {
        if (e instanceof error.StaleElementReferenceError) {
          return true
        }
        throw e
      },
    )
  })
}

/**
 * Creates a condition that will wait for the given element to become visible.
 *
 * @param element The element to test.
 * @return The new condition.
 * @see ./webdriver.WebDriver#isDisplayed
 */
export function elementIsVisible(element: WebElement): WebElementCondition {
  return new WebElementCondition('until element is visible', function () {
    return element.isDisplayed().then((v) => (v ? element : null))
  })
}

/**
 * Creates a condition that will wait for the given element to be in the DOM,
 * yet not visible to the user.
 *
 * @param element The element to test.
 * @return The new condition.
 * @see ./webdriver.WebDriver#isDisplayed
 */
export function elementIsNotVisible(element: WebElement): WebElementCondition {
  return new WebElementCondition('until element is not visible', function () {
    return element.isDisplayed().then((v) => (v ? null : element))
  })
}

/**
 * Creates a condition that will wait for the given element to be enabled.
 *
 * @param element The element to test.
 * @return The new condition.
 * @see webdriver.WebDriver#isEnabled
 */
export function elementIsEnabled(element: WebElement): WebElementCondition {
  return new WebElementCondition('until element is enabled', function () {
    return element.isEnabled().then((v) => (v ? element : null))
  })
}

/**
 * Creates a condition that will wait for the given element to be disabled.
 *
 * @param element The element to test.
 * @return The new condition.
 * @see webdriver.WebDriver#isEnabled
 */
export function elementIsDisabled(element: WebElement): WebElementCondition {
  return new WebElementCondition('until element is disabled', function () {
    return element.isEnabled().then((v) => (v ? null : element))
  })
}

/**
 * Creates a condition that will wait for the given element to be selected.
 *
 * @param element The element to test.
 * @return The new condition.
 * @see webdriver.WebDriver#isSelected
 */
export function elementIsSelected(element: WebElement): WebElementCondition {
  return new WebElementCondition('until element is selected', function () {
    return element.isSelected().then((v) => (v ? element : null))
  })
}

/**
 * Creates a condition that will wait for the given element to be deselected.
 *
 * @param element The element to test.
 * @return The new condition.
 * @see webdriver.WebDriver#isSelected
 */
export function elementIsNotSelected(element: WebElement): WebElementCondition {
  return new WebElementCondition('until element is not selected', function () {
    return element.isSelected().then((v) => (v ? null : element))
  })
}

/**
 * Creates a condition that will wait for the given element's
 * {@link webdriver.WebDriver#getText visible text} to match the given
 * {@code text} exactly.
 *
 * @param element The element to test.
 * @param text The expected text.
 * @return The new condition.
 * @see webdriver.WebDriver#getText
 */
export function elementTextIs(element: WebElement, text: string): WebElementCondition {
  return new WebElementCondition('until element text is', function () {
    return element.getText().then((t) => (t === text ? element : null))
  })
}

/**
 * Creates a condition that will wait for the given element's
 * {@link webdriver.WebDriver#getText visible text} to contain the given
 * substring.
 *
 * @param element The element to test.
 * @param substr The substring to search for.
 * @return The new condition.
 * @see webdriver.WebDriver#getText
 */
export function elementTextContains(element: WebElement, substr: string): WebElementCondition {
  return new WebElementCondition('until element text contains', function () {
    return element.getText().then((t) => (t.indexOf(substr) != -1 ? element : null))
  })
}

/**
 * Creates a condition that will wait for the given element's
 * {@link webdriver.WebDriver#getText visible text} to match a regular
 * expression.
 *
 * @param element The element to test.
 * @param regex The regular expression to test against.
 * @return The new condition.
 * @see webdriver.WebDriver#getText
 */
export function elementTextMatches(element: WebElement, regex: RegExp): WebElementCondition {
  return new WebElementCondition('until element text matches', function () {
    return element.getText().then((t) => (regex.test(t) ? element : null))
  })
}
