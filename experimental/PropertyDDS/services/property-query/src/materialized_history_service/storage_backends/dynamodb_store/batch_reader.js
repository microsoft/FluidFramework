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
 * A promisified cargo that accumulates up to config.maxBatchReadSize items to read them in a
 * batch to DynamoDB.
 * @fileoverview
 */
class BatchReader {
  /**
   * An asynchronous callback that is called once for each row read from the db.
   * If the rowHandler function throw, batch reader will stop reading and throw the error.
   * @callback BatchReaderRowHandler
   * @param {object} row A row that was read from the db.
   */

  /**
   * Construct a new BatchReader
   * @param {string} tableName The DynamoDB table name against which to run the batch.
   * @param {BatchReaderRowHandler} rowHandler A function that is called once for each row read by the BatchReader.
   * @param {object} [config] The DynamoDB config.
   * @param {object} [options] Optional batch parameters.
   * @param {object} [options.consistentRead] Whether or not to issue a consistent batch read
   *   for all the tables.
   */
  constructor(tableName, rowHandler, config, options) {
    config = config || { maxBatchReadSize: 100 };
    const opName = 'BatchReader';
    if (!tableName) {
      throw new OperationError('Missing tableName', opName, HttpStatus.BAD_REQUEST);
    }
    this._createDeferredPromise();
    this._cargo = new async.cargo(async (tasks) => {
      try {
        const batchParams = {};
        batchParams[tableName] = tasks;
        const result = await credsRotation.ddbClient.batchGetItem(batchParams, options);
        for (let rowData of result[tableName]) {
          await rowHandler(rowData);
        }
      } catch (error) {
        this._cargo.kill();
        this._batchReadPromise.reject(error);
      }
    }, config.maxBatchReadSize);

    this._myDrain = () => {
      this._batchReadPromise.resolve();
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
    return this._batchReadPromise;
  }

  /**
   * Empties the cargo and resolves the {@link BatchReader#promise}.
   * @see async.cargo.kill().
   */
  kill() {
    this._cargo.kill();
    this._batchReadPromise.resolve();
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
    this._batchReadPromise = new DeferredPromise();
    // Prevent UnhandledPromiseRejection:
    this._batchReadPromise.catch(error => {}); // Intentionally empty: batchGetItem already logged the error
  }
}

module.exports = BatchReader;
