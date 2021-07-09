/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview
 * JSON utilities
 */
class JsonUtils {
  /**
   * Initializes the instance by specifying not to pretty print JSON by default.
   */
  constructor() {
    this._prettyJson = false;
  }

  /**
   * Initializes the singleton.
   * @param {boolean} [prettyJson=undefined] Whether or not calls that explicitly expand JSON
   *   strings, should be expanded. This is set to false in our monitored environments because
   *   splunk treats line breaks as separate log entries. That breaks logging of entries that
   *   contain expanded JSON strings.
   */
  init(prettyJson) {
    this._prettyJson = !!prettyJson;
  }

  /**
   * Behaves like the standard JSON.stringify, but ignores the replacer and space arguments when
   * this._prettyJson is false.
   * @param {object} value See JSON.stringify value
   * @param {*} replacer See JSON.stringify replacer
   * @param {*} space See JSON.stringify space
   * @return {string} The stringified JSON.
   */
  stringify(value, replacer, space) {
    if (!this._prettyJson) {
      return JSON.stringify(value);
    }

    return JSON.stringify(value, replacer, space);
  }
}

module.exports = new JsonUtils();

