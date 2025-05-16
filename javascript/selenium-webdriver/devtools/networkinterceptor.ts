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

interface Header {
  name: string;
  value: string;
}

export class HttpResponse {
  private returnBody: string;
  private returnHeaders: Header[];
  private returnMethod: string;
  private returnStatus: number;
  public urlToIntercept: string;

  /**
   * Creates a HTTP Response that will be used to
   * mock out network interceptions.
   * @param {string} urlToIntercept
   */
  constructor(urlToIntercept: string = '') {
    this.returnBody = '';
    this.returnHeaders = [];
    this.returnMethod = 'GET';
    this.returnStatus = 200;
    this.urlToIntercept = urlToIntercept;
  }

  /**
   * Add headers that will be returned when we intercept
   * a HTTP Request
   * @param {string} header
   * @param {string} value
   */
  addHeaders(header: string, value: string): void {
    this.returnHeaders.push({ name: header, value: value });
  }

  get headers(): Header[] {
    return this.returnHeaders;
  }

  /**
   * Set the STATUS value of the returned HTTP Request
   * @param {number} value
   */
  set status(value: number) {
    // Add in check that his should be a number
    this.returnStatus = value;
  }

  get status(): number {
    return this.returnStatus;
  }

  /**
   * Sets the value of the body of the HTTP Request that
   * will be returned.
   * @param {string} value
   */
  set body(value: string) {
    this.returnBody = value;
  }

  get body(): string {
    let buff = Buffer.from(this.returnBody, 'utf-8');
    return buff.toString('base64');
  }

  /**
   * Sets the method of the HTTP Request
   * @param {string} value the method of the request.
   */
  set method(value: string) {
    this.returnMethod = value;
  }

  /**
   * Returns the Method to be used in the intercept
   */
  get method(): string {
    return this.returnMethod;
  }
}
