'use strict';

import { isObject } from './util';

export class WebDriverError extends Error {
  remoteStacktrace: string;

  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
    this.remoteStacktrace = '';
  }
}

export class DetachedShadowRootError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class ElementClickInterceptedError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class ElementNotSelectableError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class ElementNotInteractableError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class InsecureCertificateError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class InvalidArgumentError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class InvalidCookieDomainError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class InvalidCoordinatesError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class InvalidElementStateError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class InvalidSelectorError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class NoSuchSessionError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class JavascriptError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class MoveTargetOutOfBoundsError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class NoSuchAlertError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class NoSuchCookieError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class NoSuchElementError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class NoSuchShadowRootError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class NoSuchFrameError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class NoSuchWindowError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class ScriptTimeoutError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class SessionNotCreatedError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class StaleElementReferenceError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class TimeoutError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class UnableToSetCookieError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class UnableToCaptureScreenError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class UnexpectedAlertOpenError extends WebDriverError {
  private text_?: string;

  constructor(message?: string, text?: string) {
    super(message);
    this.text_ = text;
  }

  getAlertText(): string | undefined {
    return this.text_;
  }
}

export class UnknownCommandError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class UnknownMethodError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export class UnsupportedOperationError extends WebDriverError {
  constructor(message?: string) {
    super(message);
  }
}

export enum ErrorCode {
  SUCCESS = 0,
  NO_SUCH_SESSION = 6,
  NO_SUCH_ELEMENT = 7,
  NO_SUCH_FRAME = 8,
  UNKNOWN_COMMAND = 9,
  UNSUPPORTED_OPERATION = 9,
  STALE_ELEMENT_REFERENCE = 10,
  ELEMENT_NOT_VISIBLE = 11,
  INVALID_ELEMENT_STATE = 12,
  UNKNOWN_ERROR = 13,
  ELEMENT_NOT_SELECTABLE = 15,
  JAVASCRIPT_ERROR = 17,
  XPATH_LOOKUP_ERROR = 19,
  TIMEOUT = 21,
  NO_SUCH_WINDOW = 23,
  INVALID_COOKIE_DOMAIN = 24,
  UNABLE_TO_SET_COOKIE = 25,
  UNEXPECTED_ALERT_OPEN = 26,
  NO_SUCH_ALERT = 27,
  SCRIPT_TIMEOUT = 28,
  INVALID_ELEMENT_COORDINATES = 29,
  IME_NOT_AVAILABLE = 30,
  IME_ENGINE_ACTIVATION_FAILED = 31,
  INVALID_SELECTOR_ERROR = 32,
  SESSION_NOT_CREATED = 33,
  MOVE_TARGET_OUT_OF_BOUNDS = 34,
  SQL_DATABASE_ERROR = 35,
  INVALID_XPATH_SELECTOR = 51,
  INVALID_XPATH_SELECTOR_RETURN_TYPE = 52,
  ELEMENT_NOT_INTERACTABLE = 60,
  INVALID_ARGUMENT = 61,
  NO_SUCH_COOKIE = 62,
  UNABLE_TO_CAPTURE_SCREEN = 63,
  ELEMENT_CLICK_INTERCEPTED = 64,
  DETACHED_SHADOW_ROOT = 65,
  METHOD_NOT_ALLOWED = 405,
}

const LEGACY_ERROR_CODE_TO_TYPE = new Map<ErrorCode, typeof WebDriverError>([
  [ErrorCode.NO_SUCH_SESSION, NoSuchSessionError],
  [ErrorCode.NO_SUCH_ELEMENT, NoSuchElementError],
  [ErrorCode.NO_SUCH_FRAME, NoSuchFrameError],
  [ErrorCode.UNSUPPORTED_OPERATION, UnsupportedOperationError],
  [ErrorCode.STALE_ELEMENT_REFERENCE, StaleElementReferenceError],
  [ErrorCode.INVALID_ELEMENT_STATE, InvalidElementStateError],
  [ErrorCode.UNKNOWN_ERROR, WebDriverError],
  [ErrorCode.ELEMENT_NOT_SELECTABLE, ElementNotSelectableError],
  [ErrorCode.JAVASCRIPT_ERROR, JavascriptError],
  [ErrorCode.XPATH_LOOKUP_ERROR, InvalidSelectorError],
  [ErrorCode.TIMEOUT, TimeoutError],
  [ErrorCode.NO_SUCH_WINDOW, NoSuchWindowError],
  [ErrorCode.INVALID_COOKIE_DOMAIN, InvalidCookieDomainError],
  [ErrorCode.UNABLE_TO_SET_COOKIE, UnableToSetCookieError],
  [ErrorCode.UNEXPECTED_ALERT_OPEN, UnexpectedAlertOpenError],
  [ErrorCode.NO_SUCH_ALERT, NoSuchAlertError],
  [ErrorCode.SCRIPT_TIMEOUT, ScriptTimeoutError],
  [ErrorCode.INVALID_ELEMENT_COORDINATES, InvalidCoordinatesError],
  [ErrorCode.INVALID_SELECTOR_ERROR, InvalidSelectorError],
  [ErrorCode.SESSION_NOT_CREATED, SessionNotCreatedError],
  [ErrorCode.MOVE_TARGET_OUT_OF_BOUNDS, MoveTargetOutOfBoundsError],
  [ErrorCode.INVALID_XPATH_SELECTOR, InvalidSelectorError],
  [ErrorCode.INVALID_XPATH_SELECTOR_RETURN_TYPE, InvalidSelectorError],
  [ErrorCode.ELEMENT_NOT_INTERACTABLE, ElementNotInteractableError],
  [ErrorCode.INVALID_ARGUMENT, InvalidArgumentError],
  [ErrorCode.NO_SUCH_COOKIE, NoSuchCookieError],
  [ErrorCode.UNABLE_TO_CAPTURE_SCREEN, UnableToCaptureScreenError],
  [ErrorCode.ELEMENT_CLICK_INTERCEPTED, ElementClickInterceptedError],
  [ErrorCode.DETACHED_SHADOW_ROOT, DetachedShadowRootError],
  [ErrorCode.METHOD_NOT_ALLOWED, UnsupportedOperationError],
]);

const ERROR_CODE_TO_TYPE = new Map<string, typeof WebDriverError>([
  ['unknown error', WebDriverError],
  ['detached shadow root', DetachedShadowRootError],
  ['element click intercepted', ElementClickInterceptedError],
  ['element not interactable', ElementNotInteractableError],
  ['element not selectable', ElementNotSelectableError],
  ['insecure certificate', InsecureCertificateError],
  ['invalid argument', InvalidArgumentError],
  ['invalid cookie domain', InvalidCookieDomainError],
  ['invalid coordinates', InvalidCoordinatesError],
  ['invalid element state', InvalidElementStateError],
  ['invalid selector', InvalidSelectorError],
  ['invalid session id', NoSuchSessionError],
  ['javascript error', JavascriptError],
  ['move target out of bounds', MoveTargetOutOfBoundsError],
  ['no such alert', NoSuchAlertError],
  ['no such cookie', NoSuchCookieError],
  ['no such element', NoSuchElementError],
  ['no such frame', NoSuchFrameError],
  ['no such shadow root', NoSuchShadowRootError],
  ['no such window', NoSuchWindowError],
  ['script timeout', ScriptTimeoutError],
  ['session not created', SessionNotCreatedError],
  ['stale element reference', StaleElementReferenceError],
  ['timeout', TimeoutError],
  ['unable to set cookie', UnableToSetCookieError],
  ['unable to capture screen', UnableToCaptureScreenError],
  ['unexpected alert open', UnexpectedAlertOpenError],
  ['unknown command', UnknownCommandError],
  ['unknown method', UnknownMethodError],
  ['unsupported operation', UnsupportedOperationError],
]);

const TYPE_TO_ERROR_CODE = new Map<typeof WebDriverError, string>();
ERROR_CODE_TO_TYPE.forEach((value, key) => {
  TYPE_TO_ERROR_CODE.set(value, key);
});

interface EncodedError {
  error: string;
  message: string;
}

export function encodeError(err: unknown): EncodedError {
  let type: typeof WebDriverError = WebDriverError;
  if (err instanceof WebDriverError && TYPE_TO_ERROR_CODE.has(err.constructor as typeof WebDriverError)) {
    type = err.constructor as typeof WebDriverError;
  }

  let message = err instanceof Error ? err.message : String(err);
  let code = TYPE_TO_ERROR_CODE.get(type) || '';
  return { error: code, message: message };
}

export function isErrorResponse(data: unknown): boolean {
  return isObject(data) && typeof (data as { error: unknown }).error === 'string';
}

export function throwDecodedError(data: {
  error: string;
  message: string;
  stacktrace?: string;
  stackTrace?: string;
}): never {
  if (isErrorResponse(data)) {
    let ctor = ERROR_CODE_TO_TYPE.get(data.error) || WebDriverError;
    let err = new ctor(data.message);
    if (typeof data.stacktrace === 'string') {
      err.remoteStacktrace = data.stacktrace;
    } else if (typeof data.stackTrace === 'string') {
      err.remoteStacktrace = data.stackTrace;
    }
    throw err;
  }
  throw new WebDriverError('Unknown error: ' + JSON.stringify(data));
}

interface LegacyResponse {
  status: number;
  value: unknown;
}

export function checkLegacyResponse(responseObj: unknown): unknown {
  if (isObject(responseObj) &&
      typeof (responseObj as LegacyResponse).status === 'number' &&
      (responseObj as LegacyResponse).status !== 0) {

    const { status, value } = responseObj as LegacyResponse;
    let ctor = LEGACY_ERROR_CODE_TO_TYPE.get(status) || WebDriverError;

    if (!value || typeof value !== 'object') {
      throw new ctor(String(value));
    } else {
      const valueObj = value as { message?: unknown; alert?: { text?: string } };
      let message = String(valueObj.message || '');

      if (ctor !== UnexpectedAlertOpenError) {
        throw new ctor(message);
      }

      let text = '';
      if (valueObj.alert && typeof valueObj.alert.text === 'string') {
        text = valueObj.alert.text;
      }
      throw new UnexpectedAlertOpenError(message, text);
    }
  }
  return responseObj;
}
