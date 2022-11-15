/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const debug = require('debug');

class Logger {
  constructor(namespace) {
    this._logger = debug(namespace);
    this._traceLogger = debug(namespace + ':trace');
  }

  trace(message) {
    this._traceLogger(message);
  }

  debug(message) {
    this._logger(message);
  }

  info(message) {
    this._logger(message);
  }

  warn(message) {
    console.warn(message);
  }

  error(message) {
    console.error(message);
  }
  setLevel() {
  }
  muteLogs() {
  }
  isLevelEnabled() {
    return true;
  }
}

class ModuleLogger {
  getLogger(namespace) {
    return new Logger(namespace);
  }
  levels = {
    TRACE: {},
    INFO: {},
    WARN: {},
    ERROR: {}
  }
}

module.exports = new ModuleLogger();
