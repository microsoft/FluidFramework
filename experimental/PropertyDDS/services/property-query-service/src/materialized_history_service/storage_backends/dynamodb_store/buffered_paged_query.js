/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-use-before-define */
/* eslint-disable no-unused-vars */

const async = require('async');
const path = require('path');
const DeferredPromise = require('@fluid-experimental/property-common').DeferredPromise;
const { ModuleLogger } = require('@fluid-experimental/property-query')
const PagedQuery = require('./paged_query');
const logger = ModuleLogger.getLogger('HFDM.PropertyGraphStore.DynamoDB.PagedQuery');

/**
 * @fileoverview
 * A PagedQuery that buffers rows through a queue. Because it buffers, it can pause / resume row
 * processing.
 */
class BufferedPagedQuery extends PagedQuery {
  /**
   * Create a new BufferedPagedQuery to iterate over a db result set.
   * @param {object} params The query parameters.
   * @param {string} [params.queryName=undefined] A friendly name for the query. Used in logs.
   * @param {object} params.ddbParams The DynamoDB query params to pass to the query call.
   * @param {rowCb} params.rowCb An asynchronous callback that is called once for each
   *   row paged from the db.
   */
  constructor(params) {
    super(params);
    this._rowIndex = 0;
  }

  /**
   * @return {boolean} True if the BufferedPagedQuery is paused.
   *   See {@link #pause} and {@link #resume}.
   */
  get isPaused() {
    return this._rowQueue && this._rowQueue.paused;
  }

  /**
   * Fetches all db records by paging through the entire result set.
   * @param {number} [concurrencyLimit=1] A positive integer > 0 that limits the number of
   *   concurrent calls to the row callback (params.rowCb in the ctor).
   */
  async all(concurrencyLimit = 1) {
    _createRowQueue.call(this, concurrencyLimit);

    if (logger.isLevelEnabled(ModuleLogger.levels.TRACE)) {
      this._log(`all(${this._params.queryName}), concurrencyLimit ` +
        `${concurrencyLimit}: ${JSON.stringify(this._params)}`);
    }

    while (this.hasNext()) {
      await this.next();
    }
  }

  /**
   * Fetches a paginated (cursor-based) set of db records.
   * @param {string=} [next=undefined] Optionally override the start of the next page to fetch.
   *   The next page is recorded on success in this._params.ddbParams.ExclusiveStartKey, so setting
   *   it in 'next' is only required to override the next page, for example when paging from client
   *   requests. To continuously page through all results, simply leave 'next' undefined on all
   *   successive calls to next.
   * @param {number} [concurrencyLimit=1] A positive integer > 0 that limits the number of
   *   concurrent calls to the row callback (params.rowCb in the ctor).
   * @return {Array<object|number>} Return an object containing the paginated results (at index 0)
   *   along with the amount of consumed read capacity (at index 1).
   *  [{
   *    pagination: {
   *      limit: 50,
   *      next: 'YzY1MTU5YzgtMmJjNi05MjkzLTcyOGItNDE4MDU3ZGY3NjkyOzIwMTgtMDctMjRUMTQ6NTU6MDcuNTYxWg=='
   *    },
   *    rows: [
   *      ...
   *    ]
   *  }, consumedCU: How many RCUs were consumed by the DynamoDB call]
   */
  async next(next, concurrencyLimit = 1) {
    if (!this._rowQueue) {
      // Caller is enumerating the pages one by one (without calling 'all')
      _createRowQueue.call(this, concurrencyLimit);
    }

    if (this._rowQueue.length() > 0) {
      throw new Error('next() called after pause(). Call resume() instead.');
    }

    if (!this.hasNext()) {
      if (this._rowHandlerError) {
        return Promise.reject(this._rowHandlerError);
      }
      return Promise.resolve();
    }

    const [paginatedResults, consumedCUs] = await super.next(next);
    const bufferRowCb = _bufferRow.bind(this);
    const allRowsPromise = new DeferredPromise();
    async.eachOfLimit(paginatedResults.rows, concurrencyLimit, bufferRowCb, allRowsPromise.getCb());
    await allRowsPromise;

    // Wait for the drain promise only if there are unprocessed rows in the queue.
    // (See this._rowQueue.drain)
    if (this._rowQueue.length() > 0) {
      this._drainPromise = new DeferredPromise();
      try {
        await this._drainPromise;
      } finally {
        delete this._drainPromise;
      }
    }

    return [paginatedResults, consumedCUs];
  }

  /**
   * Pause paging. Paging through the rows will resume when {@link #resume} is called.
   * Can be used to temporarily stop paging while waiting for asynchronous data.
   */
  pause() {
    if (logger.isLevelEnabled(ModuleLogger.levels.TRACE)) {
      this._log(`pause(${this._params.queryName}), page: ${this._pageIndex}` +
        `, paused: ${this._rowQueue.paused}`);
    }

    this._rowQueue.pause();
  }

  /**
   * Resume paging after it's been previously paused. See {@link #pause}.
   */
  resume() {
    if (logger.isLevelEnabled(ModuleLogger.levels.TRACE)) {
      this._log(`resume(${this._params.queryName}), page: ${this._pageIndex}` +
        `, paused: ${this._rowQueue.paused}`);
    }

    if (!this._rowQueue.paused) {
      this._log(
        `resume(${this._params.queryName}), page: ${this._pageIndex}. PagedQuery is not paused!`,
        'warn');
    }

    this._rowQueue.resume();
  }
}

/**
 * Creates the internal row processing queue that is used to control concurrency and pause
 * row processing.
 * @param {number} [concurrencyLimit = 1] The row handler concurrency limit (how many instances of
 *   this._rowHandlerCb are allowed to execute in parallel).
 * @private
 * @this BufferedPagedQuery
 */
function _createRowQueue(concurrencyLimit = 1) {
  this._rowQueue = async.queue(_processRow.bind(this), concurrencyLimit);
  this._rowQueue.drain(_onBufferDrained.bind(this));
}

/**
 * Buffer a row as it's being read from the db.
 * @param {Object} row Row content.
 * @param {number} rowIndex Row index.
 * @private
 * @this HFDM.PropertyGraph.Cassandra.PagedQuery
 */
async function _bufferRow(row, rowIndex) {
  if (!this._isCancelled) {
    if (logger.isLevelEnabled(ModuleLogger.levels.TRACE)) {
      this._log(`_bufferRow(${this._params.queryName}), page: ${this._pageIndex}` +
        `, pushing row ${this._rowIndex} to queue`);
    }
    this._rowQueue.push({index: this._rowIndex++, row});
  }
}

/**
 * Invoked when the row buffer is emptied. It resolves the drain promise.
 */
function _onBufferDrained() {
  if (logger.isLevelEnabled(ModuleLogger.levels.TRACE)) {
    let msg = `next(${this._params.queryName}), page: ${this._pageIndex}. rowQueue drained`;
    if (!this._drainPromise) {
      msg += ', ignored (still paging)';
    }
    if (this._rowHandlerError) {
      msg += ', error: ' + (this._rowHandlerError.message ?
        this._rowHandlerError.message : this._rowHandlerError);
    }
    this._log(msg);
  }

  if (this._drainPromise) {
    if (this._rowHandlerError) {
      this._drainPromise.reject(this._rowHandlerError);
    } else {
      this._drainPromise.resolve();
    }
  }
}

/**
 * Called to process the next row in the buffer.
 * @param {object} task The task to process
 * @param {object} task.index Index of the row to process
 * @param {object} task.row The row to process
 */
async function _processRow(task) {
  try {
    if (this._isCancelled) {
      if (logger.isLevelEnabled(ModuleLogger.levels.TRACE)) {
        this._log(
          `_rowQueue(${this._params.queryName}), page: ${this._pageIndex}` +
          `. Dropped row ${task.index}: paging canceled` +
          (this._rowHandlerError ? ' due to error' : '')
        );
      }
    } else {
      await this._cancelableRowCb(task.row, task.index);
    }
  } catch (error) {
    if (logger.isLevelEnabled(ModuleLogger.levels.TRACE)) {
      this._log(
        `_invokeRowHandler(${this._params.queryName}), page: ${this._pageIndex}` +
        `, row: ${task.index}. ERROR: ${(error.stack ? error.stack : error)}`
      );
    }

    this._rowHandlerError = error;
    this._isCancelled = true;

    // Make sure the queue is not paused or the PagedQuery promise will never resolve:
    this._rowQueue.resume();
  }
}

module.exports = BufferedPagedQuery;
