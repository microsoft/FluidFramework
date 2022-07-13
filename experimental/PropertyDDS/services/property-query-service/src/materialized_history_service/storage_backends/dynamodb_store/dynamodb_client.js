/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');
const path = require('path');
const AWS = require('aws-sdk');
const Chronometer = require('@fluid-experimental/property-common').Chronometer;
const ParamFactory = require('./param_factory');
const HttpStatus = require('http-status-codes');
const JsonUtils = require('./json_utils');
const Logging = require('./logging');
const newGuid = require('@fluid-experimental/property-common').GuidUtils.generateGUID;
const OperationError = require('@fluid-experimental/property-common').OperationError;
const sleep = require('sleep-promise');
const Table = require('./table');

const DynamoDBException = require('./dynamodb_exception');
const MetricsRetryTask = require('./metrics_retry_task');
const monotonicDate = require('./monotonic_date');


const { ModuleLogger } = require('@fluid-experimental/property-query');
const logger = ModuleLogger.getLogger('HFDM.PropertyGraphStore.DynamoDB');

const PluginManager = require('../../../plugins/PluginManager');

/**
 * Expected statuses of live tables:
 */
const LIVE_TABLE_STATUSES = {
  ACTIVE: true,
  UPDATING: true
};

/**
 * Operations that do not execute in constant time (generally O(n)).
 */
const NON_CONST_TIME_OPERATIONS = {
  'delete': true,
  getSegmentHistoryLatest: true,
  getCommitRange: true,
  getCommitHistory: true,
  getMergeInfo: true
};

/**
 * Whether the batched operations are read or write.
 */
const BATCH_TYPE = {
  READ: 0,  // batchGetItem
  WRITE: 1  // batchWriteItem
};

// Don't require PagedQuery here to avoid circular dependency:
// CredentialRotation -> DynamoDBClient -> PagedQuery -> CredentialRotation:
let BatchWriter;
let BatchReader;
let BufferedPagedQuery;
let PagedQuery;
let WriteTransaction;

/**
 * @fileoverview
 * DynamoDB client.
 */
class DynamoDBClient {
  /**
   * Instantiates the DynamoDB client, given an AWS configuration used to access DynamoDB.
   * See {@link https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#constructor-property}
   *
   * @param {object} awsConfig The AWS configuration.
   * @param {object} storeConfig Additional non-AWS config.
   */
  constructor(awsConfig, storeConfig) {
    if (!BatchWriter) {
      BatchWriter = require(path.join(__dirname, 'batch_writer'));
    }

    if (!BatchReader) {
      BatchReader = require(path.join(__dirname, 'batch_reader'));
    }

    if (!BufferedPagedQuery) {
      BufferedPagedQuery = require(path.join(__dirname, 'buffered_paged_query'));
    }

    if (!PagedQuery) {
      PagedQuery = require(path.join(__dirname, 'paged_query'));
    }

    if (!WriteTransaction) {
      WriteTransaction = require(path.join(__dirname, 'write_transaction'));
    }

    const awsConfigCopy = _.clone(awsConfig);
    const regEx = new RegExp('^https://', 'i');
    const isHttps = _.isUndefined(awsConfigCopy.endpoint) || regEx.test(awsConfigCopy.endpoint);

    const Agent = isHttps ? require('https').Agent : require('http').Agent;
    this._agent = new Agent(storeConfig.httpAgent);
    _.extend(awsConfigCopy, {httpOptions: {agent: this._agent}});
    this._dynamodb = new AWS.DynamoDB(awsConfigCopy);
    this._config = storeConfig;
    this._paramFactory = new ParamFactory(storeConfig);
  }

  /**
   * @return {AWS.DynamoDB} The AWS DynamoDB client. This client should not be cached, because its
   *   credentials expire after a while.
   */
  get awsClient() {
    return this._dynamodb;
  }

  /**
   * @return {object} The DynamoDBStore configuration.
   */
  get config() {
    return this._config;
  }

  /**
   * @return {object} The free, inuse, and queued dynamodb connections in the pool.
   */
  get connectionPoolInfo() {
    const getInfo = (data) => {
      return _.mapValues(data, (d) => {
        return d.length;
      });
    };

    const agent = this._agent || {};
    return {
      max: agent.maxSockets || 0,
      maxFree: agent.maxFreeSockets || 0,
      free: getInfo(agent.freeSockets || {}),
      inuse: getInfo(agent.sockets || {}),
      queued: getInfo(agent.requests || {})
    };
  }

  /**
   * @return {DynamoDBParams} Exposes the class that allows fetching the parameters required to
   *  make common DynamoDB calls using the AWS client.
   */
  get paramFactory() {
    return this._paramFactory;
  }

  /**
   * Executes a DynamoDB API call, such as 'putItem', 'getItem', etc.
   * Input and output are logged to the 'HFDM.PropertyGraphStore.DynamoDB' logger at trace level,
   * tagged with an 'opId' attribute whose unique value matches inputs to their corresponding output.
   * @param {string} fnName The DynamoDB API function name.
   * @return {object} The DynamoDB API call result.
   */
  async _ddbApiCall(fnName) {
    const args = Array.prototype.slice.call(arguments, 1);
    let opId; // <-- Unique operation id, for tracing purposes
    const tableName = DynamoDBClient.getTableNameFromArgs.apply(null, arguments);

    if (logger.isLevelEnabled(ModuleLogger.levels.TRACE)) {
      opId = newGuid();
      let filteredLog = Logging.filterLogObject(args, Logging.filterKeys.input);
      filteredLog.opId = opId;
      logger.trace(`${fnName}${tableName ? ':' + tableName : ''} ${Logging.getDbInStyle()} ${JsonUtils.stringify(filteredLog, null, 2)}`);  // eslint-disable-line
    }

    const timedResult = await _timedApiCall.call(this, tableName, fnName, args);

    if (logger.isLevelEnabled(ModuleLogger.levels.TRACE)) {
      let filteredLog = Logging.filterLogObject(timedResult.result, Logging.filterKeys.output);
      filteredLog.opId = opId;
      filteredLog.elapsedMilliSec = timedResult.elapsedMilliSec.toFixed(0);
      logger.trace(`${fnName}${tableName ? ':' + tableName : ''} ${Logging.getDbOutStyle()} ${JsonUtils.stringify(filteredLog, null, 2)}`); // eslint-disable-line
    }

    return timedResult.result;
  }

  /**
   * Fetches multiple records in a single query, or in multiple queries if the request rate on the
   * source table(s) is too high.
   * @param {object} batchParams An object keyed by table name, whose value is an array of
   *   partition key objects. For example, to get two rows from the 'branches' table: {
   *     branches: [
   *       { branch: '252ff2b9-aa3e-e0cb-e80d-54651e231a12' },
   *       { branch: '73634787-5b0b-c503-df5d-6827803c97a3' }
   *     ]
   *   }
   * @param {object} [options] Optional batch parameters.
   * @param {object} [options.consistentRead=false] Whether or not to issue a consistent batch read
   *   for all the tables.
   * @param {boolean} [options.columns=undefined] A list of columns to get. Undefined to get all
   *   columns.
   * @return {object}  An object keyed by table name, whose value is an array of branch rows.
   *   For example: {
   *     branches: [{
   *       branch: '252ff2b9-aa3e-e0cb-e80d-54651e231a12',
   *       repository: '9f1d9b1b-d745-ee68-4b34-70de94993e63',
   *       created: '2018-04-05T20:36:18.661Z',
   *       meta: { ... },
   *       ...
   *     },
   *     {
   *       ...
   *     }]
   *   }
   */
  async batchGetItem(batchParams, options = { consistentRead: false }) {
    options.consistentRead = _.isUndefined(options.consistentRead) ? false : options.consistentRead;

    const ddbParams = {
      RequestItems: {},
      ReturnConsumedCapacity: this._config.returnConsumedCapacity
    };
    const rq = ddbParams.RequestItems;

    _.mapValues(batchParams, (pks, tableName) => {
      if (!rq[tableName]) {
        rq[tableName] = { Keys: [], ConsistentRead: options.consistentRead };
        if (options.columns) {
          const vars = _createGetVars(options.columns);
          rq[tableName].ProjectionExpression = vars.projectionExpression;
          rq[tableName].ExpressionAttributeNames = vars.expressionAttributeNames;
        }
      }

      _.each(pks, pk => {
        rq[tableName].Keys.push(AWS.DynamoDB.Converter.marshall(pk));
      });
    });

    const rowsPerTable = {};

    // A callback that fails if the batch returns a partial result set, to trigger a retry with
    // backoff for the remaining items.
    const taskCb = async retryCount => {
      try {
        const result = await this._ddbApiCall('batchGetItem', ddbParams);
        _.mapValues(result.Responses, (marshalledRows, tableName) => {
          rowsPerTable[tableName] = rowsPerTable[tableName] ? rowsPerTable[tableName] : [];
          const unmarshalledRows = rowsPerTable[tableName];
          _.each(marshalledRows, marshalledRow => {
            unmarshalledRows.push(AWS.DynamoDB.Converter.unmarshall(marshalledRow));
          });
        });

        if (!_.isEmpty(result.UnprocessedKeys)) {
          ddbParams.RequestItems = result.UnprocessedKeys;
          throw DynamoDBException.getProvisionedThroughputExceededException(
            'batchGetItem: missing results due to throttling');
        }
      } catch (error) {
        await _batchErrorHandler.call(this, error, ddbParams, BATCH_TYPE.READ);
      }
    };

    const fnName = 'batchGetItem';
    const tableName = DynamoDBClient.getTableNameFromArgs(fnName, ddbParams);
    const task = new MetricsRetryTask(this._config.retry, taskCb, fnName, tableName);
    await task.start();
    return rowsPerTable;
  }

  /**
   * Insert or delete multiple items to multiple tables in a single DynamoDB call, or in multiple
   * calls if the request rate on the target table(s) is too high.
   * Existing items are overwritten. This method cannot be used to update existing items.
   * @param {object} batchParams Maps table name to an array of params: {
   *     songs:
   *      operation: 'insert',
   *      items: [{
   *       album: '...',
   *       artist: '...'
   *     }],
   *     stats:
   *      operation: 'delete',
   *      items: [{
   *       id: '...'
   *     }]
   *   }
   * See {@link DynamoDBClient.putItem} for a description of the item parameters.
   * @param {Array<object>} batchParams.tableName An array
   */
  async batchWriteItem(batchParams) {
    const ddbParams = {
      RequestItems: {},
      ReturnConsumedCapacity: this._config.returnConsumedCapacity
    };
    const rq = ddbParams.RequestItems;

    _.mapValues(batchParams, (tableParams, tableName) => {
      if (!rq[tableName]) {
        rq[tableName] = [];
      }

      if (tableParams.operation === 'delete') {
        _.each(tableParams.items, params => {
          rq[tableName].push({
            DeleteRequest: {
              Key: AWS.DynamoDB.Converter.marshall(params)
            }
          });
        });
      } else {
        _.each(tableParams.items, params => {
          rq[tableName].push({
            PutRequest: {
              Item: AWS.DynamoDB.Converter.marshall(params)
            }
          });
        });
      }
    });

    // A callback that fails if the batch returns a partial result set, to trigger a retry with
    // backoff for the remaining items.
    const taskCb = async retryCount => {
      try {
        const result = await this._ddbApiCall('batchWriteItem', ddbParams);
        if (!_.isEmpty(result.UnprocessedItems)) {
          ddbParams.RequestItems = result.UnprocessedItems;
          throw DynamoDBException.getProvisionedThroughputExceededException(
            'batchWriteItem: some items were not persisted due to throttling');
        }
      } catch (error) {
        await _batchErrorHandler.call(this, error, ddbParams, BATCH_TYPE.WRITE);
      }
    };

    const fnName = 'batchWriteItem';
    const tableName = DynamoDBClient.getTableNameFromArgs(fnName, ddbParams);
    const task = new MetricsRetryTask(this._config.retry, taskCb, fnName, tableName);
    await task.start();
  }

  /**
   * There is no "connection" to DynamoDB. DB operations are stateless.
   * Make sure DynamoDB is properly configured by checking for the existence of the 'business'
   * table.
   */
  async connect() {
    const tableName = Table.BUSINESS.name;
    const params = {
      TableName: tableName
    };

    const operation = 'describeTable';
    let result;
    try {
      result = await this._ddbApiCall(operation, params);
    } catch (error) {
      logger.error(`Failed to describe table: ${tableName}: ${error.message ? error.message : error}`);
      throw error;
    }

    const tableStatus = result.Table ? result.Table.TableStatus : undefined;
    if (!LIVE_TABLE_STATUSES[tableStatus]) {
      throw new OperationError(
        `Table ${params.TableName} status '${tableStatus}' is not one of: ` +
          JSON.stringify(_.keys(LIVE_TABLE_STATUSES)),
        operation, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Disconnects from DynamoDB.
   */
  disconnect() {
    // Intentionally empty
  }

  /**
   * Construct a new BatchWriter.
   * @param {string} tableName The DynamoDB table name against which to run the batch.
   * @param {string} [operation] One of: 'insert', 'delete'. Defaults to 'insert'.
   * @return {BatchWriter} A batch writer.
   */
  createBatchWriter(tableName, operation = 'insert') {
    return new BatchWriter(tableName, this._config, operation);
  }

  /**
   * An asynchronous callback that is called once for each row read from the db.
   * If the rowHandler function throw, batch reader will stop reading and throw the error.
   * @callback BatchReaderRowHandler
   * @param {object} row A row that was read from the db.
   */

  /**
   * Construct a new BatchReader.
   * @param {string} tableName The DynamoDB table name against which to run the batch.
   * @param {BatchReaderRowHandler} rowHandler A function that is called once for each row read by the BatchReader.
   * @param {object} [options] Optional batch parameters.
   * @param {object} [options.consistentRead] Whether or not to issue a consistent batch read
   *   for all the tables.
   * @return {BatchReader} A batch reader.
   */
  createBatchReader(tableName, rowHandler, options) {
    return new BatchReader(tableName, rowHandler, this._config, options);
  }

  /**
   * Creates a new table.
   * @param {object} ddbParams The input parameters, in the same format as the table definitions in DynamoDBStoreSchema
   * @param {string} ddbParams.TableName The name of the table to create
   * @param {Array} ddbParams.AttributeDefinitions A list of each table column in the key or an index. Example:
   *  [
   *    {AttributeName: 'columnName', AttributeType: 'S'},
   *    {AttributeName: 'columnName2', AttributeType: 'S'}
   *  ]
   * @param {Array} ddbParams.KeySchema A list of the attributes that comprise the primary key of the table. Example:
   *  [
   *    {AttributeName: 'id', KeyType: 'HASH'}
   *  ]
   * @param {object} ddbParams.ProvisionedThroughput The read and write capacity units of the table
   * @param {number} ddbParams.ProvisionedThroughput.ReadCapacityUnits The read capacity of the table
   * @param {number} ddbParams.ProvisionedThroughput.WriteCapacityUnits The write capacity of the table
   * @param {Array} ddbParams.GlobalSecondaryIndexes A list of the global secondary indexes of the table. Example:
   *  [
   *    {
   *      IndexNAme: 'indexName',
   *      KeySchema: [{AttributeName: 'attr1', KeyType: 'HASH'}],
   *      Projection: {ProjectionType: 'KEYS_ONLY'},
   *      ProvisionedThroughput: {ReadCapacityUnits: 5, WriteCapacityUnits: 5}
   *    }
   *  ]
   * @param {Array} ddbParams.LocalSecondaryIndexes A list of the local secondary index configurations of the table
   */
  async createTable(ddbParams) {
    const params = ddbParams;
    logger.info(`Creating table: ${ddbParams.TableName}`);
    await this._ddbApiCall('createTable', params);
  }

  /**
   * @return {WriteTransaction} A write transaction to accumulate calls to conditionally put,
   *   update, and delete DynamoDB records, and execute them in a single transaction.
   */
  createWriteTransaction() {
    return new WriteTransaction(this._paramFactory);
  }

  /**
   * A function that throws an error if there is no results from a DynamoDB query, or optionally if
   * the result is missing expected columns.
   * @param {?string=} msg The optional error message to use if 'results' is empty or missing
   *   columns.
   * @param {Object} results The results of a DynamoDB query.
   * @param {Array<string>} [columns=undefined] An optional array of column names that must be
   *   present in the results.
   */
  expectResults(msg, results, columns) {
    const failFn = () => {
      // If the error bubbles up all the way up to a REST endpoint, it will return a 404:
      throw new OperationError(msg, 'expectResults', HttpStatus.NOT_FOUND);
    };

    if (!results) {
      failFn();
    }

    if (columns) {
      _.each(columns, columnName => {
        if (_.isUndefined(results[columnName])) {
          msg += `. Missing expected column: ${columnName}`;
          failFn();
        }
      });
    }
  }

  /**
   * Delete an item from a table
   * @param {string} tableName Table name
   * @param {object} pk The row's primary key. Can be simple (a partition key) or composite
   *   (partition key and sort key).
   * @param {object} [options] Delete options.
   * @param {boolean} [options.keyMustExist=true] Set to true to fail the delete if the key doesn't exist.
   */
  async deleteItem(tableName, pk, options = { keyMustExist: true }) {
    const ddbParams = this._paramFactory.createDeleteItem(tableName, pk, options);
    const operation = 'deleteItem';

    try {
      await _retryableDdbApiCall.call(this, operation, ddbParams);
    } catch (error) {
      if (options.keyMustExist && error.code === 'ConditionalCheckFailedException') {
        throw new OperationError(
          `Failed to delete ${JSON.stringify(pk)} from table ${tableName}: not found.`,
          operation, HttpStatus.NOT_FOUND
        );
      }

      throw error;
    }
  }

  /**
   * Starts a table deletion.
   * @param {string} tableName The table to delete.
   */
  async deleteTable(tableName) {
    const params = { TableName: tableName };
    await _retryableDdbApiCall.call(this, 'deleteTable', params);
    logger.info(`Table deletion started: ${tableName}`);
  }

  /**
   * Describe a table by name.
   * @param {string} tableName Table name
   * @return {object} The database table description
   */
  async describeTable(tableName) {
    const params = {
      TableName: tableName
    };

    const operation = 'describeTable';
    const data = await _retryableDdbApiCall.call(this, operation, params);
    if (!data || !data.Table) {
      throw new OperationError(
        'Unexpected describeTable reply: ' + JsonUtils.stringify(data, null, 2),
        operation, HttpStatus.BAD_REQUEST
      );
    }

    return data;
  }

  /**
   * Fetches business related information, such as the db schema layout version.
   * @param {string} fieldName The name of the db field to query. For example, use
   *   'BusinessField.LAYOUT' to query the db layout version.
   * @return {Promise} A Promise to be fulfilled with the requested field value if it exists.
   *   The promise is rejected if the requested field is not found.
   * @private
   * @this DynamoDBClient
   */
  async getBusinessField(fieldName) {
    const pk = { id: fieldName };
    const options = { columns: ['value'] };
    const result = await this.getItem(Table.BUSINESS.name, pk, options);
    this.expectResults(`Business field not found: ${fieldName}`, result, options.columns);
    return result.value;
  }

  /**
   * Fetches a row from a DynamoDB table.
   * @param {string} tableName The table name.
   * @param {object} pk The row's primary key. Can be simple (a partition key) or composite
   *   (partition key and sort key).
   * @param {object} [options=undefined] Get options.
   * @param {boolean} [options.consistentRead=false] Set to true to issue a consistent read. Set is
   *   to false or leave undefined to issue an eventually consistent read.
   * @param {Array<string>} [options.columns=undefined] An array of column names to get from
   *   the row identified by 'pk'. When specified, only the requested columns are fetched from the
   *   db. When left undefined, all the columns are fetched.
   * @return {object|undefined} The requested item if found, or undefined otherwise.
   */
  async getItem(tableName, pk, options) {
    if (options) {
      options.consistentRead = !!options.consistentRead;
    } else {
      options = { consistentRead: false };
    }

    let ddbParams = {
      Key: AWS.DynamoDB.Converter.marshall(pk),
      TableName: tableName,
      ConsistentRead: options.consistentRead,
      ReturnConsumedCapacity: this._config.returnConsumedCapacity
    };

    if (options.columns && options.columns.length > 0) {
      const vars = _createGetVars(options.columns);
      ddbParams.ProjectionExpression = vars.projectionExpression;
      ddbParams.ExpressionAttributeNames = vars.expressionAttributeNames;
    }

    let result = await _retryableDdbApiCall.call(this, 'getItem', ddbParams);
    if (!result.Item && !options.consistentRead) {
      logger.info(`Retrying getItem ${JSON.stringify(pk)} on table ${tableName} with consistent read`);
      ddbParams.ConsistentRead = true;
      result = await _retryableDdbApiCall.call(this, 'getItem', ddbParams);
    }
    return result.Item ? AWS.DynamoDB.Converter.unmarshall(result.Item) : undefined;
  }

  /**
   * Queries the db to get the primary key of a table.
   * @param {string} tableName Table name
   * @return {Array<string>} An array of pk attribute names for the requested table.
   */
  async getPKColumns(tableName) {
    const data = await this.describeTable(tableName);
    return _.map(data.Table.KeySchema, attributeObj => attributeObj.AttributeName);
  }

  /**
   * Fetches the table name from DynamoDB arguments.
   * @param {string} fnName The DynamoDB API function name.
   * @param {object} ddbParams DynamoDB parameters that contain the table name.
   * @return {string|undefined} A table name extracted from DynamoDB arguments.
   * @static
   */
  static getTableNameFromArgs(fnName, ddbParams) {
    let tableName;

    if (ddbParams) {
      tableName = ddbParams.TableName;
      if (!tableName) {
        tableName = ddbParams.RequestItems && Object.keys(ddbParams.RequestItems)[0];
      }
    }

    return tableName;
  }

  /**
   * Persist a record to DynamoDB.
   * @param {string} tableName The table name.
   * @param {object} params A row to persist in the table. At a minimum, the row must contain
   *   attributes matching the table's primary key.
   * @param {Array<string>} [protectedAttrs=undefined] When set to the name of the key attribute(s)
   *   and an item with the same key already exists, the operation fails. Defaults to undefined,
   *   which overwrites existing entries.
   * @return {object} The DynamoDB 'putItem' result.
   */
  async putItem(tableName, params, protectedAttrs) {
    const ddbParams = this._paramFactory.createPutItem(tableName, params, protectedAttrs);
    return await _retryableDdbApiCall.call(this, 'putItem', ddbParams);
  }

  /**
   * An asynchronous callback that is called once for each row paged from the db.
   * The function must either return a promise or be declared with the `async` keyword.
   * @callback rowCb
   * @param {object} row A row from the db.
   */

  /**
   * Query a series of DynamoDB records
   * @param {string} tableName The table name.
   * @param {object} pk The primary key to query. Can be simple (a partition key) or composite
   *   (partition key and sort key).
   * @param {object} params The query parameters.
   * @param {rowCb} params.rowCb An asynchronous callback that is called once for each row paged
   *   from the db.
   * @param {object} [params.condition=undefined] An optional condition to fetch a partial result
   *   set within the specified partition key (pk). May be undefined to fetch all rows identified
   *   by 'pk'. Example: {
   *     expression: 'idxTopologySK BETWEEN :minSK AND :maxSK',
   *     variables: [
   *       { minSK: 2018-10-05T14:48:00.000Z_889 },
   *       { maxSK: 2018-10-05T14:51:10.920Z_898 }
   *     ]
   *   }
   * @param {object} [params.ddbParams=undefined] Additional DynamoDB options.
   * @param {string} [params.queryName=undefined] A friendly name for the query. Used in logs.
   * @param {boolean} [params.consistentRead=false] Whether or not the query will use strongly
   *   consistent reads.
   * @return {PagedQuery} A PagedQuery instance to iterate over results.
   */
  query(tableName, pk, params) {
    this.setQueryParams(tableName, pk, params);
    return new PagedQuery(params);
  }

  /**
   * Query a series of DynamoDB records and buffers the results. Buffering adds the ability to
   * pause and resume paging, which the plain PagedQuery (returned by {@link #query}) cannot do.
   * @param {string} tableName The table name.
   * @param {object} pk The primary key to query. Can be simple (a partition key) or composite
   *   (partition key and sort key).
   * @param {object} params The query parameters.
   * @param {rowCb} params.rowCb An asynchronous callback that is called once for each row paged
   *   from the db.
   * @param {object} [params.condition=undefined] An optional condition to fetch a partial result
   *   set within the specified partition key (pk). May be undefined to fetch all rows identified
   *   by 'pk'. Example: {
   *     expression: 'idxTopologySK BETWEEN :minSK AND :maxSK',
   *     variables: [
   *       { minSK: 2018-10-05T14:48:00.000Z_889 },
   *       { maxSK: 2018-10-05T14:51:10.920Z_898 }
   *     ]
   *   }
   * @param {object} [params.ddbParams=undefined] Additional DynamoDB options.
   * @param {string} [params.queryName=undefined] A friendly name for the query. Used in logs.
   * @param {boolean} [params.consistentRead=false] Whether or not the query will use strongly
   *   consistent reads.
   * @return {PagedQuery} A PagedQuery instance to iterate over results.
   */
  bufferedQuery(tableName, pk, params) {
    this.setQueryParams(tableName, pk, params);
    return new BufferedPagedQuery(params);
  }

  /**
   * Sets a business field by name.
   * @param {string} fieldName The name of the business field to set.
   * @param {string} value The field value to set.
   */
  async setBusinessField(fieldName, value) {
    const params = {
      id: fieldName,
      value: value,
      created: monotonicDate.now().toISOString()
    };
    await this.putItem(Table.BUSINESS.name, params);
  }

  /**
   * Sets the params so it can be used in a PagedQuery or BufferedPagedQuery.
   * @param {string} tableName The table name.
   * @param {object} pk The primary key to query. Can be simple (a partition key) or composite
   *   (partition key and sort key).
   * @param {object} params The query parameters.
   * @param {rowCb} params.rowCb An asynchronous callback that is called once for each row paged
   *   from the db.
   * @param {object} [params.condition=undefined] An optional condition to fetch a partial result
   *   set within the specified partition key (pk). May be undefined to fetch all rows identified
   *   by 'pk'. Example: {
   *     expression: 'idxTopologySK BETWEEN :minSK AND :maxSK',
   *     variables: [
   *       { minSK: 2018-10-05T14:48:00.000Z_889 },
   *       { maxSK: 2018-10-05T14:51:10.920Z_898 },
   *     ]
   *   }
   * @param {object} [params.ddbParams=undefined] Additional DynamoDB options.
   * @param {string} [params.queryName=undefined] A friendly name for the query. Used in logs.
   * @param {boolean} [params.consistentRead=false] Whether or not the query will use strongly
   *   consistent reads.
   */
  setQueryParams(tableName, pk, params) {
    params.ddbParams = _.extend({
      TableName: tableName,
      ReturnConsumedCapacity: this._config.returnConsumedCapacity,
      ConsistentRead: _.isUndefined(params.consistentRead) ? false : params.consistentRead
    }, params.ddbParams);

    let conditionalExpressions = [];
    let conditionValueMap = {};
    let valueIndex = 0;

    _.mapValues(pk, (value, key) => {
      const valueVarName = `:v${valueIndex++}`;
      conditionValueMap[valueVarName] = value;
      conditionalExpressions.push(`${key} = ${valueVarName}`);
    });

    if (params.condition) {
      _.each(params.condition.variables, conditionVar => {
        _.mapValues(conditionVar, (value, key) => {
          conditionValueMap[`:${key}`] = value;
        });
      });
      conditionalExpressions.push(params.condition.expression);
    }

    params.ddbParams.ExpressionAttributeValues = AWS.DynamoDB.Converter.marshall(conditionValueMap);
    params.ddbParams.KeyConditionExpression = conditionalExpressions.join(' AND ');
  }

  /**
   * Sets the params so it can be used in a scan PagedQuery.
   * @param {string} tableName The table name.
   * @param {object} params The query parameters.
   * @param {rowCb} params.rowCb An asynchronous callback that is called once for each row paged
   *   from the db.
   * @param {object} [params.ddbParams=undefined] Additional DynamoDB options.
   * @param {string} [params.queryName=undefined] A friendly name for the query. Used in logs.
   * @param {boolean} [params.consistentRead=false] Whether or not the query will use strongly
   *   consistent reads.
   */
  setScanParams(tableName, params) {
    params.queryType = 'scan';
    params.ddbParams = _.extend({
      TableName: tableName,
      ReturnConsumedCapacity: this._config.returnConsumedCapacity,
      ConsistentRead: _.isUndefined(params.consistentRead) ? false : params.consistentRead
    }, params.ddbParams);
  }

  /**
   * Executes a count query on a series of DynamoDB records
   * @param {string} tableName The table name.
   * @param {object} pk The primary key to query. Can be simple (a partition key) or composite
   *   (partition key and sort key).
   * @param {object} params The query parameters.
   * @param {object} [params.condition=undefined] An optional condition to fetch a partial result
   *   set within the specified partition key (pk). May be undefined to fetch all rows identified
   *   by 'pk'. Example: {
   *     expression: 'idxTopologySK BETWEEN :minSK AND :maxSK',
   *     variables: [
   *       { minSK: 2018-10-05T14:48:00.000Z_889 },
   *       { maxSK: 2018-10-05T14:51:10.920Z_898 },
   *     ]
   *   }
   * @param {object} [params.ddbParams=undefined] Additional DynamoDB options.
   * @param {string} [params.queryName=undefined] A friendly name for the query. Used in logs.
   * @return {integer} The count of results matching the key and optional condition in the table.
   */
  async count(tableName, pk, params) {
    const ddbParams = _.extend({
      TableName: tableName,
      ReturnConsumedCapacity: this._config.returnConsumedCapacity,
      Select: 'COUNT'
    }, params.ddbParams);

    let conditionalExpressions = [];
    let conditionValueMap = {};
    let valueIndex = 0;

    _.mapValues(pk, (value, key) => {
      const valueVarName = `:v${valueIndex++}`;
      conditionValueMap[valueVarName] = value;
      conditionalExpressions.push(`${key} = ${valueVarName}`);
    });

    if (params.condition) {
      _.each(params.condition.variables, conditionVar => {
        _.mapValues(conditionVar, (value, key) => {
          conditionValueMap[`:${key}`] = value;
        });
      });
      conditionalExpressions.push(params.condition.expression);
    }

    ddbParams.ExpressionAttributeValues = AWS.DynamoDB.Converter.marshall(conditionValueMap);
    ddbParams.KeyConditionExpression = conditionalExpressions.join(' AND ');

    const result = await this._ddbApiCall('query', ddbParams);
    return result.Count;
  }

  /**
   * Test for the existence of a table. Does not check the table state.
   * @param {string} tableName The table name.
   * @return {boolean} True if the table exists in dynamodb, false otherwise.
   */
  async tableExists(tableName) {
    try {
      await this.describeTable(tableName);
      return true;
    } catch (error) {
      if (error.code !== 'ResourceNotFoundException') {
        throw error;
      }

      return false;
    }
  }

  /**
   * Update a row in a DynamoDB table.
   * @param {string} tableName The table name.
   * @param {object} pk The primary key of the row to update. Can be simple (a partition key) or
   *   composite (partition key and sort key).
   * @param {object} [updates=undefined] A map of column names to their update value.
   * @param {object} [condition=undefined] An optional condition to set for the update to succeed.
   *   Example: {
   *     keyMustExist: true,
   *     expression: 'sequence = :value',
   *     variables: {
   *       value: 3
   *     }
   *   }
   * @param {boolean} [condition.keyMustExist=true] Set to true to fail the update if the row identified by
   *   'pk' doesn't exist.
   * @param {string} condition.expression A DynamoDB ConditionExpression string.
   * @param {object} condition.variables A map of variable names to their value, that are in the
   *   condition expression.
   * @param {object} [removeArray=undefined] A list of attributes to remove.
   * @return {object|undefined} A map of attribute names to their old value, before being updated.
   *   Can be undefined when new values are being set (when no old value is replaced).
   */
  async updateItem(tableName, pk, updates, condition, removeArray) {
    const ddbParams = this._paramFactory.createUpdateItem(tableName, pk, updates, condition, removeArray);
    let result = await _retryableDdbApiCall.call(this, 'updateItem', ddbParams);
    return result.Attributes ? AWS.DynamoDB.Converter.unmarshall(result.Attributes) : undefined;
  }

  /**
   * Delete a Global Secondary Index.
   * @param {string} tableName Table name
   * @param {string} indexName Global Secondary Index name
   * @param {object} ddbAttributeDefinitions DynamoDB attribute definitions
   * @param {object} ddbIndexCreateParams DynamoDB GSI creation parameters
   */
  async createIndex(tableName, indexName, ddbAttributeDefinitions, ddbIndexCreateParams) {
    const ddbParams = {
      TableName: tableName,
      AttributeDefinitions: ddbAttributeDefinitions,
      GlobalSecondaryIndexUpdates: [{
        Create: {
          IndexName: indexName
        }
      }]
    };

    _.defaults(ddbParams.GlobalSecondaryIndexUpdates[0].Create, ddbIndexCreateParams);

    logger.info(`createIndex ${tableName}.${indexName}`);
    await this._ddbApiCall('updateTable', ddbParams);
  }

  /**
   * Delete a Global Secondary Index.
   * @param {string} tableName Table name
   * @param {string} indexName Global Secondary Index name
   */
  async deleteIndex(tableName, indexName) {
    const ddbParams = {
      TableName: tableName,
      GlobalSecondaryIndexUpdates: [{
        Delete: {
          IndexName: indexName
        }
      }]
    };

    logger.info(`Index deletion started: ${tableName}.${indexName}`);
    await this._ddbApiCall('updateTable', ddbParams);
  }

  /**
   * Scan all records of a DynamoDB table.
   * @param {string} tableName The table name.
   * @param {object} params The query parameters.
   * @param {rowCb} params.rowCb An asynchronous callback that is called once for each row paged
   *   from the db.
   * @param {object} [params.ddbParams=undefined] Additional DynamoDB options.
   * @param {string} [params.queryName=undefined] A friendly name for the query. Used in logs.
   * @param {boolean} [params.consistentRead=false] Whether or not the query will use strongly
   *   consistent reads.
   * @return {PagedQuery} A PagedQuery instance to iterate over results.
   */
  scan(tableName, params) {
    this.setScanParams(tableName, params);
    return new PagedQuery(params);
  }

  /**
   * Wait for a table to reach a state that indicates it can be used, by polling for the table
   * status every second.
   * @param {string} tableName Table name.
   * @param {string} indexName Global Secondary Index name
   * @param {string} action Action to wait on. One of: ['delete', 'create'].
   * @param {number} [maxWaitTimeMilliSec=Number.MAX_SAFE_INTEGER] How long to wait for the GSI
   *   to be deleted or active.
   */
  async waitForIndex(tableName, indexName, action, maxWaitTimeMilliSec = Number.MAX_SAFE_INTEGER) {
    const operation = 'describeTable';
    let chrono = new Chronometer();
    while (chrono.stop().elapsedMilliSec() < maxWaitTimeMilliSec) {
      const data = await this.describeTable(tableName);

      if (action === 'delete') {
        if (!data.Table.GlobalSecondaryIndexes || data.Table.GlobalSecondaryIndexes.length === 0) {
          return;
        }

        const gsiEntry = _.find(data.Table.GlobalSecondaryIndexes, gsi => gsi.IndexName === indexName);
        if (!gsiEntry) {
          return;
        }
      } else if (action === 'create') {
        if (!data.Table.GlobalSecondaryIndexes || data.Table.GlobalSecondaryIndexes.length === 0) {
          throw new OperationError(
            `waitForIndex: GSI not found ${tableName}.${indexName}`,
            operation, HttpStatus.NOT_FOUND
          );
        }

        const gsiEntry = _.find(data.Table.GlobalSecondaryIndexes, gsi => gsi.IndexName === indexName);
        if (!gsiEntry || !gsiEntry.IndexStatus) {
          throw new OperationError(
            `waitForIndex: GSI not found ${tableName}.${indexName}`,
            operation, HttpStatus.NOT_FOUND
          );
        }

        if (gsiEntry.IndexStatus === 'DELETING') {
          throw new OperationError(
            `waitForIndex: GSI is being deleted ${tableName}.${indexName}`,
            operation, HttpStatus.GONE
          );
        }

        if (gsiEntry.IndexStatus === 'ACTIVE') {
          return;
        }
      } else {
        throw new Error(`waitForIndex: Unexpected action: ${action}`);
      }

      await sleep(this._config.waitForTablePollTimeoutMS);
    }

    throw new OperationError(
      `Timeout waiting for index to be ${action === 'delete' ? 'deleted' : 'created'}: ` +
        `${tableName}.${indexName} ` +
        `Elapsed: ${chrono.elapsedMilliSec().toFixed(0)} ms`,
      operation, HttpStatus.SERVICE_UNAVAILABLE);
  }

  /**
   * Wait for a table to reach a state that indicates it can be used, by polling for the table
   * status every second.
   * @param {string} tableName Table name.
   * @param {number} maxWaitTimeMilliSec How long to wait for the table to become active. The call
   *   will after that.
   */
  async waitForTable(tableName, maxWaitTimeMilliSec) {
    const operation = 'describeTable';
    let chrono = new Chronometer();
    while (chrono.stop().elapsedMilliSec() < maxWaitTimeMilliSec) {
      try {
        let data = await this.describeTable(tableName);
        if (!data.Table.TableStatus) {
          throw new OperationError(
            'Unexpected describeTable reply: ' + JsonUtils.stringify(data, null, 2),
            operation, HttpStatus.BAD_REQUEST
          );
        }

        if (LIVE_TABLE_STATUSES[data.Table.TableStatus]) {
          return;
        }

        if (data.Table.TableStatus === 'DELETING') {
          throw new OperationError(
            `waitForTable ${tableName}: table is being deleted`,
            operation, HttpStatus.GONE
          );
        }
      } catch (error) {
        throw error;
      }

      await sleep(this._config.waitForTablePollTimeoutMS);
    }

    throw new OperationError(`Timeout waiting for table to become ready: ${tableName}. ` +
      `Elapsed: ${chrono.elapsedMilliSec().toFixed(0)} ms`,
      operation, HttpStatus.SERVICE_UNAVAILABLE);
  }
}

/**
 * Builds the DynamoDB vars for the getItem operation.
 * @param {Array<string>} columns Column names
 * @return {object} The ProjectionExpression and ExpressionAttributeNames
 */
function _createGetVars(columns) {
  let projections = [];
  let attributeNames = {};

  let index = 0;
  _.each(columns, name => {
    projections.push(`#p${index}`);
    attributeNames[`#p${index++}`] = name;
  });

  return {
    projectionExpression: projections.join(', '),
    expressionAttributeNames: attributeNames
  };
}

/**
 * The batch error handler will respond to duplicate key errors by adding the offending keys
 * to the error message.
 * @param {Error} error An error to analyze.
 * @param {object} ddbParams Batch write db input parameters.
 * @param {number} batchType Whether the batched operations are read or write.
 *   One of: [BATCH_TYPE.READ, BATCH_TYPE.WRITE].
 * @throws {Error} The input error, possibly augmented with the duplicate key list if the error is
 *   caused by duplicate keys.
 * @this DynamoDBClient
 */
async function _batchErrorHandler(error, ddbParams, batchType) {
  try {
    // See if the error is a duplicate key
    if (DynamoDBException.isDuplicateKey(error)) {
      // Find out which keys are dups:
      const tableNames = Object.keys(ddbParams.RequestItems);
      const dupItemsPerTable = {};
      for (let tableName of tableNames) {
        const tableKeys = batchType === BATCH_TYPE.READ ?
          ddbParams.RequestItems[tableName].Keys :
          ddbParams.RequestItems[tableName];
        let pkColumns;
        try {
          // Get the table's primary key attributes from the known Table instance if available.
          // If not, get the PKs by describing the table in DynamoDB
          const table = Table.fromName(tableName);
          pkColumns = table ? table.pkColumns : await this.getPKColumns(tableName);

          // Build sets of unique and duplicate keys
          const uniquePKs = new Set();
          const dupPKs = new Set();

          // The item handler is invoked once per item in the batch:
          const itemHandler = marshalledItem => {
            const item = AWS.DynamoDB.Converter.unmarshall(marshalledItem);
            const pk = JSON.stringify(_.pick(item, pkColumns));  // Set will not compare correctly with objects
            if (uniquePKs.has(pk)) {
              dupPKs.add(pk);
            } else {
              uniquePKs.add(pk);
            }
          };

          // A generic get function that can get an item from a read or write batch:
          const getItem = batchType === BATCH_TYPE.READ ?
            tableKey => tableKey :
            tableKey => _.map(tableKey, putOrDelete => putOrDelete.Item)[0];

          // Enumerate all items in the batch, invoking the item handler for each one:
          for (let tableKey of tableKeys) {
            const marshalledItem = getItem(tableKey);
            itemHandler(marshalledItem);
          }

          if (dupPKs.size < 1) {
            // Should not happen:
            throw new Error('Failed to find duplicate keys in ddbParams');
          }

          dupItemsPerTable[tableName] = _.map([...dupPKs], dupPK => JSON.parse(dupPK));
        } catch (e2) {
          // Unable to describe the table. Dump all keys without analyzing the duplicates:
          logger.warn(e2);
          error.message += `. ddbParams: ${JSON.stringify(ddbParams)}`;
          throw e2;
        }
      }

      // Append to message: 'Provided list of item keys contains duplicates':
      error.message += `: ${JSON.stringify(dupItemsPerTable)}`;
    }
  } finally {
    // Make sure the original error is rethrown no matter what:
    throw error;
  }
}

/**
 * Executes a DynamoDB API call, such as 'putItem', 'getItem', etc.
 * Ensures that the call is retried on transient failures, and applies exponential backoff between
 * retries.
 * @param {string} fnName The DynamoDB API function name.
 * @return {object} The DynamoDB API call result.
 * @private
 * @this DynamoDBClient
 */
async function _retryableDdbApiCall(fnName) {
  const taskCb = retryCount => (this._ddbApiCall.apply(this, arguments));
  const tableName = DynamoDBClient.getTableNameFromArgs.apply(null, arguments);
  const task = new MetricsRetryTask(this._config.retry, taskCb, fnName, tableName);
  return await task.start();
}


/**
 * A timed DynamoDB call that logs the DynamoDB request id if the call takes longer than a
 * configurable threshold to execute.
 * @param {string} tableName DynamoDB table name.
 * @param {string} fnName DynamoDB API function name.
 * @param {Array<*>} args API function arguments.
 * @return {object} An object: {
 *   result: The AWS API function call result
 * }
 */
async function _timedApiCall(tableName, fnName, args) {
  let result;
  let elapsedMilliSec;

  const segmentName = `ddb:${fnName}${tableName ? ':' + tableName : ''}`;
  await PluginManager.instance.systemMonitor.startSegment(segmentName, true, async () => {
    const chrono = new Chronometer();

    try {
      result = await this._dynamodb[fnName].apply(this._dynamodb, args).promise();
    } finally {
      elapsedMilliSec = chrono.stop().elapsedMilliSec();

      if (elapsedMilliSec >= this._config.elapsedWarningThresholdMilliSec ) {
        const logFn = NON_CONST_TIME_OPERATIONS[fnName] ?
          logger.debug.bind(logger) : logger.warn.bind(logger);
        const requestId = result && result['$response'] ? result['$response'].requestId : undefined;
        if (requestId) {
          const diags = {
            operation: fnName,
            elapsedMilliSec: elapsedMilliSec.toFixed(0),
            requestId: requestId
          };

          if (tableName) {
            diags.table = tableName;
          }

          logFn('Time limit exceeded: ' + JSON.stringify(diags));
        }
      }
    }
  });

  return { result, elapsedMilliSec };
}

module.exports = DynamoDBClient;
