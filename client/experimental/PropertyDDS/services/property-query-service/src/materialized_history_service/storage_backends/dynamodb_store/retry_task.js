/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');
const Chronometer = require('@fluid-experimental/property-common').Chronometer;
const { ModuleLogger } = require('@fluid-experimental/property-query');
const PromiseUtils = require('./promise_utils');
const logger = ModuleLogger.getLogger('HFDM.Utils.RetryTask');

const MIN_JITTERED_TIMEOUT = 0; // Absolute minimum timeout after applying jitter. Prevents timeouts that may be too
                                // short (or even negative).
const DEFAULT_MAX_RETRYCOUNT = 3; // The default values of maximum retry times.
const DEFAULT_INTERVALFN = retryCount => 100 * retryCount;

/**
 * @fileOverview
 * A RetryTask will retry `taskFunction` maximum of `maxRetryCount` upon encountering a retryable error condition.
 * If the task is successful, RetryTask will stop retrying and return a successful response. If the task
 * continues to fail, RetryTask will stop retrying when one of conditions belows takes place:
 * 1. RetryTask exceeds `taskTimeoutMilliSec` limits if `maxRetryCount` is undefined.
 * 2. RetryTask reaches `maxRetryCount` limit if `taskTimeoutMilliSec` is undefined.
 * 3. If both `maxRetryCount` and `taskTimeoutMilliSec` are defined, RetryTask will abort when whichever condition
 *    happens first.
 * 4. Error from previous retry is not retryable.
 * And it will throw the last retry error.
 */
class RetryTask {
  /**
   * A function that is called to start the async execution of a new or retried task.
   * @param {object} config Configures the retry behaviour.
   * @param {number} [config.firstTimeoutMilliSec=undefined] How much time to wait before retrying after the
   *   first task failure.
   * @param {number} [config.maxRetryCount=DEFAULT_MAX_RETRYCOUNT] - A number of attempts to make before giving up.
   *    When left undefined, the task is retried 3 times, by default, if config.firstTimeoutMilliSec is undefined.
   * @param {function} [config.intervalFn=DEFAULT_INTERVALFN] A function that defines time to wait between retries,
   *  in millisecond.
   * @param {number} [config.jitter=undefined] A fraction greater than zero that adds entropy to the retry
   *   timeouts. For example, a jitter of 0.25 applied to a 1 second timeout distributes timeout
   *   values between 750 ms and 1250 ms.
   * @param {function} [config.errorFilter=undefined] An optional synchronous function that is invoked on
   *   erroneous result. If it returns `true` the retry attempts will continue; if the function
   *   returns `false` the retry flow is aborted with the current attempt's error and result being
   *   returned to the final callback.
   * @param {number} [config.taskTimeoutMilliSec=undefined] The maximum allowable timeout for the
   *   whole task to complete. Retries will stop once that timeout is reached (or if the next retry
   *   would occur past the end of the task timeout), and the current error will be thrown from the
   *   {@link #start} method. When undefined, the task is retried indefinitely.
   * @param {number} [config.maxSingleTimeoutMilliSec=undefined] The maximum amont of time to wait
   *   between retries. When left undefined, the timeout between retries grows indefinitely.
   * @param {taskFunction} taskFn A function that returns an asynchronous task to start or retry.
   * @param {string} [taskName=undefined] The task name. Used in debug logs only.
   * @example
   * // retry interval of 250, 200, 300, 400, 500, 500, 500 ...
   * const task = new RetryTask ({
   *    maxRetryCount: 10,
   *    intervalFn = function(retryCount) {
   *        return 100 * retryCount;
   *    },
   *    errorFilter: function(error) {
   *        return error.statusCode !== 400;
   *    },
   *    firstTimeoutMilliSec: 250,
   *    taskTimeoutMilliSec: 10000,
   *    jitter: 0.1,
   *    maxSingleTimeoutMilliSec: 500
   * }, apiMethod);
   * let result;
   * try {
   *   await result = task.start;
   * } catch {}
   */
  constructor(config, taskFn, taskName) {
    this._taskFn = taskFn;
    this._config = config;
    this._taskName = taskName;
    this._retryCount = 0;
    this._currentRetryTimeout = 0;
  }

  /**
   * @return {number} How many times the task has been retried.
   */
  get retryCount() {
    return this._retryCount;
  }

  /**
   * Create a exponential interval function a*b^n, a is coefficient, b is base. NOTE: n starts by 1, not 0. For example,
   * a exponential interval of 60ms, 180ms, 540ms ..., can be created by calling createExpIntervalFn(20, 3).
   * @param {number} coefficient coefficient of an exponential function
   * @param {number} base base of an exponential function
   * @return {function} A exponential interval function.
   */
  static createExpIntervalFn(coefficient, base) {
    return _expIntervalFn.bind(undefined, coefficient, base);
  }

  /**
   * Starts waiting on the task to complete. The function completes only after the tasks succeeds,
   * possibly after total retry timeout exceeds `taskTimeoutMilliSec` or being retried `maxRetryCount` times
   * @return {object} A task result object that contains the result of task and retry count.
   */
  async start() {
    let that = this;

    _parseConfig.call(this);

    // set first retry timeout
    if (this._config.firstTimeoutMilliSec) {
      this._currentRetryTimeout = this._config.firstTimeoutMilliSec;
    } else {
      this._currentRetryTimeout = Math.floor(this._config.intervalFn(that._retryCount + 1));
    }

    this._chrono = new Chronometer();

    while (true) {  // eslint-disable-line
      try {
        const result = await this._taskFn(this._retryCount);
        return {
          result: result,
          retryCount: this._retryCount
        };
      } catch (error) {
        try {
          // If this throws the task is not retried:
          await _onError.call(this, error);
        } catch (nonRetryableError) {
          nonRetryableError.retryCount = this._retryCount;
          throw nonRetryableError;
        }
      }
    }
  }
}

/**
 * @param {number} coefficient coefficient of an exponential function.
 * @param {number} base base of an exponential function
 * @param {number} retryCount retry times
 * @return {number} How many times the task has been retried.
 */
function _expIntervalFn(coefficient, base, retryCount) {
  return Number(coefficient) * Math.pow(Number(base), retryCount);
}

/**
 * Validate and set defualt value for config.
 * @param {object} config Congig to validate.
 * @private
 * @this RetryTask
 */
function _parseConfig() {
  if (typeof this._config === 'object') {
    this._config.intervalFn = this._config.intervalFn || DEFAULT_INTERVALFN;
    if (typeof this._config.intervalFn !== 'function') {
      throw new Error('Invalid interval function for retryTask');
    }

    if (!this._config.maxRetryCount && this._config.taskTimeoutMilliSec) {
       // Set maxRetryCount to infinite if undefined and there is a timeout set:
      this._maxRetryCount = Infinity;
    } else {
      this._maxRetryCount = Number(this._config.maxRetryCount) || DEFAULT_MAX_RETRYCOUNT;
    }
  } else {
    throw new Error('Invalid arguments for retryTask');
  }
}

/**
 * Applies jitter to a value.
 * @param {number} value A value to apply jitter on.
 * @return {number} A jittered value.
 * @private
 * @this RetryTask
 */
function _applyJitter(value) {
  const jitterValue = value * this._config.jitter;
  const min = Math.max(value - jitterValue, MIN_JITTERED_TIMEOUT);

  // +1 because random number generation excludes max:
  let max = value + jitterValue + 1;
  if (_isMaxTimeoutConfigured.call(this)) {
    // Max timeout cannot exceed maxSingleTimeoutMilliSec:
    max = Math.min(max, this._config.maxSingleTimeoutMilliSec);
  }

  return Math.random() * (max - min) + min;
}

/**
 * @return {boolean} Whether or not the maximum amont of time to wait between retries is configured.
 * @private
 * @this RetryTask
 */
function _isMaxTimeoutConfigured() {
  return this._config.maxSingleTimeoutMilliSec && this._config.maxSingleTimeoutMilliSec > 0;
}

/**
 * Wait and retry the task on error.
 * @param {Error} error A task error.
 * @private
 * @this RetryTask
 */
async function _onError(error) {
  const msgPrefix = this._taskName ? `Task '${this._taskName}': ` : '';
  const errorFilterAbort = (typeof this._config.errorFilter === 'function') &&
    this._config.errorFilter(error) === false;
  const isFatalError = !!(error.isTransient && !error.isTransient());
  const elapsedMilliSec = this._chrono.stop().elapsedMilliSec();

  if (errorFilterAbort || isFatalError) {
    // Error is not retryable. Abort the task with this error.
    const diags = _.pick(error, ['code', 'statusCode', 'message']);
    diags.taskName = this._taskName;
    diags.errorFilterAbort = errorFilterAbort;
    diags.isTransientError = error.isTransient && error.isTransient();
    diags.retryCount = this._retryCount;
    diags.elapsedMilliSec = elapsedMilliSec.toFixed(0);
    logger.debug(`${msgPrefix}Error is not retryable. Aborting task.`, diags);
    throw error;
  }

  if (this._maxRetryCount && this._retryCount >= this._maxRetryCount) {
    // Retry times exceed maximum retry count. Abort the task with this error.
    const diags = {
      retryCount: this._retryCount,
      elapsedMilliSec: elapsedMilliSec.toFixed(0)
    };
    logger.debug(`${msgPrefix}Max retry count reached. Aborting task.`, diags);
    throw error;
  }

  // This error can be retried.
  let jitteredTimeoutMilliSec = this._config.jitter === undefined ? this._currentRetryTimeout :
    _applyJitter.call(this, this._currentRetryTimeout);

  if (this._config.taskTimeoutMilliSec && this._config.taskTimeoutMilliSec > 0) {
    // Task timeout is configured.
    const elapsedAtRetryTime = elapsedMilliSec + jitteredTimeoutMilliSec;
    if (elapsedAtRetryTime >= this._config.taskTimeoutMilliSec) {
      // Waiting before the next retry would cause the whole operation to exceed the total timeout.
      if (logger.isLevelEnabled(ModuleLogger.levels.DEBUG)) {
        logger.debug(`${msgPrefix}next retry in ` +
          `${jitteredTimeoutMilliSec.toFixed(0)} ms would cause the total duration to exceed ` +
          `the task timeout of ${this._config.taskTimeoutMilliSec.toFixed(0)} ms. ` +
          `${JSON.stringify({retryCount: this._retryCount, elapsedMilliSec: elapsedMilliSec.toFixed(0)})}`);
      }
      throw error;
    }
  }

  const diags = _.pick(error, ['code', 'statusCode', 'message']);
  diags.taskName = this._taskName;
  logger.info(`${msgPrefix}Transient failure. Retry in ` +
    `${jitteredTimeoutMilliSec.toFixed(0)} ms.`, diags);

  await PromiseUtils.sleep(jitteredTimeoutMilliSec);
  this._retryCount++;
  _setNextRetryTimeout.call(this);
}

/**
 * Sets the next retry timeout to use if an error occurs.
 * @param {number} currentRetryCount .
 * @private
 * @this RetryTask
 */
function _setNextRetryTimeout() {
  this._currentRetryTimeout = Math.floor(this._config.intervalFn(this._retryCount + 1));
  if (_isMaxTimeoutConfigured.call(this)) {
    this._currentRetryTimeout =
      Math.min(this._currentRetryTimeout, this._config.maxSingleTimeoutMilliSec);
  }
}

module.exports = RetryTask;
