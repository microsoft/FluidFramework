/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-use-before-define */
const _ = require('lodash');
const path = require('path');
const async = require('async');
const AWS = require('aws-sdk');
const credsRotation = require('./credential_rotation');
const DeferredPromise = require('@fluid-experimental/property-common').DeferredPromise;
const { ModuleLogger } = require('@fluid-experimental/property-query');
const MetricsRetryTask = require(path.join(__dirname, 'metrics_retry_task'));

const logger = ModuleLogger.getLogger('HFDM.PropertyGraphStore.DynamoDB.PagedQuery');

let id = 0;
let DynamoDBClient;

/**
 * @fileoverview
 * A PagedQuery maintains the state of a db row enumeration that spans multiple queries.
 */
class PagedQuery {
  /**
   * An asynchronous callback that is called once for each row paged from the db.
   * The function must either return a promise or be declared with the `async` keyword.
   * @callback rowCb
   * @param {object} row A row from the db.
   */

  /**
   * Create a new PagedQuery to iterate over a db result set. Use {@link DynamoDBClient#query}
   * to obtain a PagedQuery instance.
   * @param {object} params The query parameters.
   * @param {string} [params.queryName=undefined] A friendly name for the query. Used in logs.
   * @param {object} params.ddbParams The DynamoDB query params to pass to the query call.
   * @param {rowCb} [params.rowCb=undefined] An asynchronous callback that is called once for each
   *   row paged from the db. Can be left undefined when calling {@link #begin} that doesn't use a
   *   row callback. For all other PagedQuery calls, the row callback is mandatory.
   * @param {string} [params.queryType] The query type. One of ['query', 'scan']. Defaults to 'query'.
   *  Use 'scan' to perform a DynamoDB scan operation instead of a query.
   */
  constructor(params) {
    if (!DynamoDBClient) {
      DynamoDBClient = require(path.join(__dirname, 'dynamodb_client'));
    }

    this._params = params;
    this._queryType = this._params.queryType || 'query';
    this._id = id++;
    this._pageIndex = 0;
  }

  /**
   * @return {Function} A callback that is invoked once for each row.
   *   See {@link #BufferedPagedQuery} ctor.
   */
  get rowCb() {
    return this._params.rowCb;
  }

  /**
   * @param {Function} cb Sets the callback that is invoked to process buffered db rows.
   */
  set rowCb(cb) {
    this._params.rowCb = cb;
  }

  /**
   * Fetches all db records by paging through the entire result set.
   * To fetch only the first few records of a query, consider {@link #begin} that doesn't require
   * a callback.
   * @param {number} [concurrencyLimit=1] A positive integer > 0 that limits the number of
   *   concurrent calls to the row callback (params.rowCb in the ctor).
   * @param {TokenBucket} [rcuTokenBucket] An optional bucket to limit the rate at which to consume
   *   DynamoDB RCUs (read capacity units) while querying or scanning.
   */
  async all(concurrencyLimit = 1, rcuTokenBucket) {
    const cancelableRowCb = this._cancelableRowCb.bind(this);

    if (logger.isLevelEnabled(ModuleLogger.levels.TRACE)) {
      this._log(`all(${this._params.queryName}), concurrencyLimit ` +
        `${concurrencyLimit}: ${JSON.stringify(this._params)}`);
    }

    while (this.hasNext()) {
      const [paginatedResults, consumedCUs] = await this.next();
      const allRowsPromise = new DeferredPromise();
      async.eachOfLimit(paginatedResults.rows, concurrencyLimit, cancelableRowCb, allRowsPromise.getCb());
      await Promise.all([
        allRowsPromise,
        rcuTokenBucket && rcuTokenBucket.remove(consumedCUs)
      ]);
    }
  }

  /**
   * Buffer the first few query results in memory. Used when the result size is known to be small.
   * If paging through a large result set (or a result set of unknown size), use {@link #all}
   * instead.
   * @param {number} [maxRowCount=1] The maximum number of rows to buffer. If the result set is bigger,
   *   only the first maxRowCount rows are returned.
   * @return {Array<object>} An array of db rows, containing at most maxRowCount elements.
   */
  async begin(maxRowCount = 1) {
    const savedRowCb = this._params.rowCb;
    const savedLimit = this._params.ddbParams.Limit;

    const allRows = [];
    let rowIndex = 0;

    this._params.ddbParams.Limit = maxRowCount;
    this._params.rowCb = row => {
      allRows.push(row);

      if (++rowIndex >= maxRowCount) {
        this.cancel();
      }
    };

    try {
      await this.all();
      return allRows;
    } finally {
      _restoreProperty(this._params, 'rowCb', savedRowCb);
      _restoreProperty(this._params.ddbParams, 'Limit', savedLimit);
    }
  }

  /**
   * Cancels paging. Ensures that the row callback (params.rowCb) in the ctor will not be called
   * again, and that the promise returned by {@link #all} resolves.
   */
  cancel() {
    if (logger.isLevelEnabled(ModuleLogger.levels.TRACE)) {
      this._log(`cancel(${this._params.queryName}), page: ${this._pageIndex}. Paging canceled.`);
    }

    this._isCancelled = true;
  }

  /**
   * Checks if there are pages left to fetch. If paging is interrupted (by throwing or returning
   * false from the row handler callback), hasNext will return false.
   * @return {boolean} Whether or not there are pages left to fetch.
   */
  hasNext() {
    const hasNext =
      !this._isCancelled && (this._pageIndex === 0 || !!this._params.ddbParams.ExclusiveStartKey);

    if (logger.isLevelEnabled(ModuleLogger.levels.TRACE)) {
      this._log(`hasNext(${this._params.queryName}), page: ${this._pageIndex}, ${hasNext}`);
    }

    return hasNext;
  }

  /**
   * Fetches a paginated (cursor-based) set of db records.
   * @param {string=} [next=undefined] Optionally override the start of the next page to fetch.
   *   The next page is recorded on success in this._params.ddbParams.ExclusiveStartKey, so setting
   *   it in 'next' is only required to override the next page, for example when paging from client
   *   requests. To continuously page through all results, simply leave 'next' undefined on all
   *   successive calls to next.
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
  async next(next) {
    const ddbParams = this._params.ddbParams;

    if (next) {
      ddbParams.ExclusiveStartKey = AWS.DynamoDB.Converter.marshall(next);
    }

    // The paging task is a single call to DynamoDB that can be retried with exponential backoff.
    // It is configured here:
    const taskConfig = credsRotation.ddbClient.config.retry;
    const taskCb = error => (credsRotation.ddbClient._ddbApiCall(this._queryType, ddbParams));
    const tableName = DynamoDBClient.getTableNameFromArgs(this._queryType, ddbParams);

    const task = new MetricsRetryTask(taskConfig, taskCb, this._params.queryName, tableName);
    const queryResult = await task.start();
    ++this._pageIndex;

    const rows = queryResult.Count > 0 ?
      // Unmarshall from the DynamoDB format into a standard object format:
      _.map(queryResult.Items, item => AWS.DynamoDB.Converter.unmarshall(item)) :
      [];

    // There may be more items to be retrieved:
    ddbParams.ExclusiveStartKey = queryResult.LastEvaluatedKey;

    return [{
      pagination: {
        limit: ddbParams.Limit,
        next: queryResult.LastEvaluatedKey ? AWS.DynamoDB.Converter.unmarshall(queryResult.LastEvaluatedKey) : undefined
      },
      rows
    }, queryResult.ConsumedCapacity ? queryResult.ConsumedCapacity.CapacityUnits : 0];
  }

  /**
   * Called once for each row paged from the db. Checks if paging has been canceled before invoking
   * the requestor's row callback.
   * @param {object} row A row from the db.
   * @param {number} rowIndex The row index within the current page.
   */
  async _cancelableRowCb(row, rowIndex) {
    if (this._isCancelled) {
      if (logger.isLevelEnabled(ModuleLogger.levels.TRACE)) {
        this._log(`_cancelableRowCb(${this._params.queryName}), page ${this._pageIndex}` +
          `. Dropped row ${rowIndex}: paging canceled`);
      }
    } else {
      if (logger.isLevelEnabled(ModuleLogger.levels.TRACE)) {
        this._log(`_cancelableRowCb(${this._params.queryName}), page: ${this._pageIndex}` +
          `. Processing row: ${rowIndex}`);
      }

      await this._params.rowCb(row);
    }
  }

  /**
   * Log a trace that contains a unique PagedQuery.
   * @param {string} msg Log message
   * @param {string} [level='trace'] The logging level
   */
  _log(msg, level = 'trace') {
    logger[level](`[${this._id}] ${msg}`);
  }
}

/**
 * Restore a saved property on an object.
 * @param {object} obj The object.
 * @param {string} key The object key name.
 * @param {*} property The property value.
 */
function _restoreProperty(obj, key, property) {
  if (_.isUndefined(property)) {
    delete obj[key];
  } else {
    obj[key] = property;
  }
}

module.exports = PagedQuery;
