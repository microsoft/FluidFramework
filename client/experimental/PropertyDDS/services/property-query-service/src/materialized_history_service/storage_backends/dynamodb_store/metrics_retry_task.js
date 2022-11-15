/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const path = require('path');
const RetryTask = require('./retry_task');
const DynamoDBException = require('./dynamodb_exception');
const metricsEmitter = require('./metrics_emitter');

/**
 * @fileOverview
 * Wraps a RetryTask to emit metrics on the retry count.
 */
class MetricsRetryTask extends RetryTask {
  /**
   * See {@link RetryTask.constructor}
   * @param {object} config - See {@link RetryTask.constructor}
   * @param {taskFunction} taskFn - See {@link RetryTask.constructor}
   * @param {string} taskName - See {@link RetryTask.constructor}
   * @param {string} tableName - The table name to use in the metrics.
   */
  constructor(config, taskFn, taskName, tableName) {
    config.intervalFn = retryCount => (
      (config.firstTimeoutMilliSec / config.backoffRate) * Math.pow(config.backoffRate, retryCount)
    );
    config.errorFilter = DynamoDBException.isTransient;
    super(config, taskFn, taskName);
    this._tableName = tableName;
  }

  /**
   * Start a retryable task and emits metrics on the retry count.
   * @return {*} The result of the taskCb.
   */
  async start() {
    let event;
    try {
      const taskResult = await super.start();
      event = _metricEventFactory.call(this, true, taskResult.retryCount);
      return taskResult.result;
    } catch (error) {
      event = _metricEventFactory.call(this, false, error.retryCount);
      throw error;
    } finally {
      metricsEmitter.emit(event.name, event.payload);
    }
  }
}

/**
 * Create a new metric event.
 * @param {boolean} success Whether or not the metric event is for a successful operation.
 * @param {number} retryCount How many times the operation was retried.
 * @return {object} An metric event object to emit.
 */
function _metricEventFactory(success, retryCount) {
  return {
    name: 'dynamodb.retries',
    payload: {
      table: this._tableName,
      operation: this._taskName,
      success: success,
      count: retryCount
    }
  };
}

module.exports = MetricsRetryTask;
