/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const path = require('path');
const async = require('async');
const credsRotation = require('./credential_rotation');
const DeferredPromise = require('@fluid-experimental/property-common').DeferredPromise;
const HttpStatus = require('http-status-codes');
const OperationError = require('@fluid-experimental/property-common').OperationError;

/**
 * A promisified cargo that accumulates up to config.maxBatchWriteSize items to write them in a
 * batch to DynamoDB.
 * @fileoverview
 */
class BatchWriter {
  /**
   * Construct a new BatchWriter
   * @param {string} tableName The DynamoDB table name against which to run the batch.
   * @param {object} [config] The DynamoDB config.
   * @param {string} [operation] One of: 'insert', 'delete'. Defaults to 'insert'.
   */
  constructor(tableName, config, operation = 'insert') {
    config = config || {maxBatchWriteSize: 25};

    const opName = 'BatchWriter';
    if (!tableName) {
      throw new OperationError('Missing tableName', opName, HttpStatus.BAD_REQUEST);
    }

    this._createDeferredPromise();
    this._cargo = new async.cargo(async tasks => {
      try {
        const batchParams = {};
        batchParams[tableName] = { operation, items: tasks };
        await credsRotation.ddbClient.batchWriteItem(batchParams);
      } catch (error) {
        this._cargo.kill();
        this._batchWritePromise.reject(error);
      }
    }, config.maxBatchWriteSize);

    this._myDrain = () => {
      this._batchWritePromise.resolve();
      // When the cargo is used asynchronously, it may drain multiple times.
      this._createDeferredPromise();
    };
    this._cargo.drain(this._myDrain);
  }

  /**
   * @return {async.cargo} The underlying async cargo.
   */
  get cargo() {
    return this._cargo;
  }

  /**
   * @return {Promise} A promise that is resolved when the cargo is drained, or rejected on error.
   *  When the cargo drains, the returned promise changes to make it possible to wait for the cargo
   *  in an async loop (where the cargo can possibly drain multiple times).
   */
  get promise() {
    return this._batchWritePromise;
  }

  /**
   * Empties the cargo and resolves the {@link BatchWriter#promise}.
   * @see async.cargo.kill().
   */
  kill() {
    this._cargo.kill();
    this._batchWritePromise.resolve();
  }

  /**
   * Push a task to the cargo.
   * @param {object} task A task to add to the cargo.
   */
  push(task) {
    this._cargo.push(task);
  }

  /**
   * Create a new deferred promise.
   */
  _createDeferredPromise() {
    this._batchWritePromise = new DeferredPromise();
    // Prevent UnhandledPromiseRejection:
    this._batchWritePromise.catch(error => {}); // Intentionally empty: batchGetItem already logged the error
  }
}

module.exports = BatchWriter;
