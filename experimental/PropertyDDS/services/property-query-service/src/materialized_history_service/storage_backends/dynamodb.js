/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview DynamoDB storage backend
 */

const asyncCargo = require('async/cargo');
const asyncCargoQueue = require('async/cargoQueue');
const AsyncContext = require('../../server/utils/async_context');
const asyncQueue = require('async/queue');
const generateGUID = require('@fluid-experimental/property-common').GuidUtils.generateGUID;
const OperationError = require('@fluid-experimental/property-common').OperationError;
const HTTPStatus = require('http-status');
const { ModuleLogger } = require('@fluid-experimental/property-query')
const logger = ModuleLogger.getLogger('HFDM.MaterializedHistoryService.StorageBackends.DynamoDBBackend');
const Table = require('./dynamodb_store/table');
const _ = require('lodash');
const MAX_DDB_WRITE_CONCURRENT_BATCHES = Infinity;
const MAX_DDB_FETCH_CONCURRENT_BATCHES = 20;


const BATCH_STATUSES = {
  STARTED: 1,
  FINISHED: 2,
  ERRORED: 3
};

/**
 * DynamoDB storage backend
 */
class DynamoDBBackend {

  /**
 * DynamoDB storage backend constructor
 *
 * @param {Object} in_params - Parameters for this service
 * @param {Object} in_params.settings       - The settings object
 * @param {Number} in_params.settings.maxBatchWriteSize  - Max batch size for writes to Dynamo
 * @param {Number} in_params.settings.maxConcurrentS3Uploads  - Max concurrent uploads to S3
 * @param {Number} in_params.settings.largeNodeSize  - Threshold (bytes) to send a node to S3
 * @param {Object} in_params.credsRotation  - A DDB CredentialsRotation instance
 * @param {Object} in_params.bigStore       - A BigStore instance
 * @param {String} in_params.keyspace       - The keyspace
 * @param {Object} in_params.tableNames     - Maps table ids to individual table names. Overrides the keyspace
 */
  constructor(in_params) {
    this._settings = in_params.settings;
    this._ddbSettings = in_params.ddbSettings;
    this._data = {};

    this._bigStore = in_params.bigStore;
    this._credsRotation = in_params.credsRotation;

    this._maxBatchDeleteSize = this._settings.maxBatchDeleteSize || 25;
    this._maxBatchSize = this._settings.maxBatchWriteSize || 25;
    this._maxConcurrentS3Uploads = this._settings.maxConcurrentS3Uploads || 10;
    this._largeNodeThreshold = this._settings.largeNodeSize || 300000;

    this._writeCargos = {};
    this._batchStatuses = {};
    this._batchErrors = {};
    this._batchErrorHandlers = {};

    this._oldS3DeleteCargo = asyncCargo(this._deleteS3Items.bind(this), this._maxBatchDeleteSize);
    this._uploadToS3Queue = asyncQueue(this._uploadS3Item.bind(this), this._maxConcurrentS3Uploads);

    this._nodeDeleteCargoQueue = asyncCargoQueue(
      this._deleteBatch.bind(this),
      MAX_DDB_WRITE_CONCURRENT_BATCHES,
      this._maxBatchSize
    );

    this._nodeFetchInconsistentCargoQueue = asyncCargoQueue(
      this._fetchBatch.bind(this, false),
      MAX_DDB_FETCH_CONCURRENT_BATCHES,
      this._maxBatchSize
    );

    this._nodeFetchConsistentCargoQueue = asyncCargoQueue(
      this._fetchBatch.bind(this, true),
      MAX_DDB_FETCH_CONCURRENT_BATCHES,
      this._maxBatchSize
    );

    this._keyspace = in_params.keyspace;
    this._tableNames = in_params.tableNames;

    this._pendingGetRequests = [];
    this._pendingRequestHandler = undefined;
    this._stampedePromises = {_get: {}}; // A list of promises for .get currently executing
  }

  /**
   * Initialize the backend
   * @return {Promise} - Resolves wnen the backend is initialized
   */
  async init() {
    this._credsRotation.init(this._ddbSettings.aws, this._ddbSettings.config);
    Table.init(this._keyspace, this._tableNames);
    if (!this._credsRotation.isStarted) {
      await this._credsRotation.start();
    }
    this._tableName = Table.MATERIALIZED_HISTORY.name;
    return Promise.resolve();
  }

  /**
   * De-initializes the backend
   */
  async stop() {
    if (this._credsRotation.isStarted) {
      this._credsRotation.stop();
    }
  }

  /**
   * Starts a write batch
   * @return {*} A batch identifier
   */
  startWriteBatch() {
    let batchGuid = generateGUID();

    logger.debug('Initializing batch write', batchGuid);

    this._writeCargos[batchGuid] = asyncCargoQueue(
      this._writeBatch.bind(this),
      MAX_DDB_WRITE_CONCURRENT_BATCHES,
      this._maxBatchSize
    );
    this._batchStatuses[batchGuid] = BATCH_STATUSES.STARTED;
    this._batchErrorHandlers[batchGuid] = null;

    return {
      guid: batchGuid
    };
  }

  /**
   * Writes a DynamoDB batch from a batch;
   * @param {Tasks[]} tasks - A bunch of records to be written
   * @return {Promise<Array<object>>} A resolve promise
   */
  async _writeBatch(tasks) {
    let writeItems = [];

    let itemsToWriteToS3 = [];
    let preDynamoWritePromises = [];

    tasks.forEach((t) => {
      let s3Key = t.value.length > this._largeNodeThreshold ? `${t.key}:rev:${generateGUID()}` : null;

      if (s3Key) {
        itemsToWriteToS3.push({
          key: s3Key,
          value: t.value
        });
      }

      writeItems.push({
        PK: t.key,
        SK: '.',
        value: t.value.length > this._largeNodeThreshold ? null : t.value,
        s3Key: s3Key
      });
    });

    // Identify nodes that had previous S3 records to delete them after we've updated
    let recordsWithPreviousS3 = tasks.filter((t) => t.extra &&
      t.extra.originalNodeSize &&
      t.extra.originalNodeSize > this._largeNodeThreshold
    );

    // Fetch the S3Key stored in there, to know what to delete
    if (recordsWithPreviousS3.length > 0) {
      let getParams = {};
      getParams[this._tableName] = recordsWithPreviousS3.map((r) => {
        return {
          PK: r.key,
          SK: '.'
        };
      });

      preDynamoWritePromises.push(
        this._credsRotation.ddbClient.batchGetItem(getParams, {
          columns: ['s3Key']
        })
      );
    }

    itemsToWriteToS3.forEach((itwts) => {
      preDynamoWritePromises.push(new Promise((res, rej) => {
        this._uploadToS3Queue.push(itwts, (ex) => {
          if (ex) {
            rej(ex);
          } else {
            res();
          }
        });
      }));
    });

    let promiseResults;
    try {
      promiseResults = await Promise.all(preDynamoWritePromises);
    } catch (ex) {
      itemsToWriteToS3.forEach((itwts) => {
        this._oldS3DeleteCargo.push({
          key: itwts.key
        });
      });
      throw ex;
    }

    let result;
    try {
      let writeParams = {};
      writeParams[this._tableName] = {
        operation: 'insert',
        items: writeItems
      };

      await this._credsRotation.ddbClient.batchWriteItem(writeParams);
    } catch (ex) {
      itemsToWriteToS3.forEach((itwts) => {
        this._oldS3DeleteCargo.push({
          key: itwts.key
        });
      });
      throw ex;
    }

    if (recordsWithPreviousS3.length > 0) {
      const fetchedOldS3Keys = promiseResults[0];
      // Defer the deletion to an asynchronous task
      if (fetchedOldS3Keys) {
        fetchedOldS3Keys[this._tableName].forEach((fr) => {
          this._oldS3DeleteCargo.push({
            key: fr.s3Key
          });
        });
      }
    }

    return result;
  }

  /**
   * Deletes a DynamoDB batch from a batch;
   * @param {Tasks[]} tasks - A bunch of records to be deleted
   * @return {Promise<Array<object>>} A resolve promise
   */
  async _deleteBatch(tasks) {
    let writeParams = {};
    writeParams[this._tableName] = {
      operation: 'delete',
      items: _.uniqWith(tasks, (t1, t2) => t1.PK === t2.PK)
    };

    return await this._credsRotation.ddbClient.batchWriteItem(writeParams);
  }

  /**
   * AsyncCargoQueue handler for fetch-before-delete operations
   * @param {boolean} consistent - Consistent read
   * @param {Array<Object>} tasks - Tasks requested for deletion
   */
  async _fetchBatch(consistent, tasks) {
    const options = {
      consistentRead: consistent
    };

    let getParams = {};

    getParams[this._tableName] = _.uniqWith(tasks.map((r) => r.key), (k1, k2) => k1.PK === k2.PK);

    try {
      let fetched = await this._credsRotation.ddbClient.batchGetItem(getParams, options);
      tasks.forEach((t) => {
        let fetchResult = fetched[this._tableName].find((f) => f.PK === t.key.PK);
        t.handler.resolve(fetchResult);
      });
    } catch (ex) {
      tasks.forEach((t) => {
        t.handler.reject(ex);
      });
    }
  }
  /**
   * Worker to upload items to S3
   * @param {Task} itwts - The item, key, value
   */
  async _uploadS3Item(itwts) {
    logger.debug('Beginning to store large node with key', itwts.key);
    await this._bigStore.putObject(itwts.key, Buffer.from(itwts.value));
    logger.debug('Done storing large node with key', itwts.key);
  }

  /**
   * Deletes S3 records, by example after a superseding S3 record is created
   * to replace a previous one
   * @param {Tasks[]} tasks - A bunch of S3 items to be deleted
   */
  async _deleteS3Items(tasks) {
    let keys = _.uniq(tasks.map((t) => t.key));
    logger.debug('Beginning to delete S3 items', keys);
    try {
      await this._bigStore.deleteAll(keys);
      logger.debug('Done deleting S3 items', keys);
    } catch (ex) {
      logger.warn('Failed deleting some S3 items', keys);
    }
  }

  /**
   * Sends all write requests that were created for this batch
   * to the server
   * @param {*} in_batch - Identifier for the batch to transmit
   *
   * @return {Promise} This promise resolves once all records have been
   *                   written to the server
   */
  finishWriteBatch(in_batch) {

    if (!this._writeCargos[in_batch.guid]) {
      throw new OperationError('Trying to finish a non-started batch', 'CreateCommit',
        HTTPStatus.INTERNAL_SERVER_ERROR);
    }

    if (this._batchStatuses[in_batch.guid] === BATCH_STATUSES.FINISHED) {
      throw new OperationError('Trying to finish an already finished batch', 'CreateCommit',
        HTTPStatus.INTERNAL_SERVER_ERROR);
    }

    const cleanUp = () => {
      if (this._writeCargos[in_batch.guid]) {
        this._writeCargos[in_batch.guid].kill();
      }
      delete this._writeCargos[in_batch.guid];
      delete this._batchStatuses[in_batch.guid];
      delete this._batchErrors[in_batch.guid];
      delete this._batchErrorHandlers[in_batch.guid];
    };

    if (this._batchStatuses[in_batch.guid] === BATCH_STATUSES.ERRORED) {
      let p = Promise.reject(this._batchErrors[in_batch.guid]);
      cleanUp();
      return p;
    }

    this._batchStatuses[in_batch.guid] = BATCH_STATUSES.FINISHED;

    let returnPromise = new Promise((res, rej) => {
      const possiblyResolve = () => {
        if (this._writeCargos[in_batch.guid].idle()) {
          cleanUp();
          logger.debug('Successfully wrote batch', in_batch.guid);
          res();
        }
      };

      possiblyResolve();

      this._writeCargos[in_batch.guid].drain(possiblyResolve);

      this._batchErrorHandlers[in_batch.guid] = () => {
        rej(this._batchErrors[in_batch.guid]);
        cleanUp();
      };
    });

    return returnPromise;
  }

  /**
   * Stores a blob in the key value store. The write will only have been be performed
   * when the finishWriteBatch is invoked and the returned promise has been resolved.
   *
   * @param {*}      in_batch    - Identifies the write batch this record belongs to
   * @param {String} in_nodeRef  - An identifier for the node in the format "<type>:<guid>"
   * @param {String} in_value    - The value under which the record is stored
   */
  store(in_batch, in_nodeRef, in_value) {
    if (!this._writeCargos[in_batch.guid]) {
      throw new OperationError('Trying to store in a non-started batch', 'CreateCommit',
        HTTPStatus.INTERNAL_SERVER_ERROR);
    }

    if (this._batchStatuses[in_batch.guid] === BATCH_STATUSES.FINISHED) {
      throw new OperationError('Trying to store in an already finished batch', 'CreateCommit',
        HTTPStatus.INTERNAL_SERVER_ERROR);
    }

    if (this._batchStatuses[in_batch.guid] === BATCH_STATUSES.ERRORED) {
      return;
    }

    this._writeCargos[in_batch.guid].push({
      key: in_nodeRef,
      value: in_value
    }, (err) => {
      if (err && this._writeCargos[in_batch.guid]) {
        this._batchStatuses[in_batch.guid] = BATCH_STATUSES.ERRORED;
        this._batchErrors[in_batch.guid] = err;
        this._writeCargos[in_batch.guid].kill();
        logger.debug('Failed writing batch', in_batch.guid, err);

        if (this._batchErrorHandlers[in_batch.guid]) {
          this._batchErrorHandlers[in_batch.guid]();
        }
      }

      if (in_value.length > this._largeNodeThreshold) {
        AsyncContext.incrementInContext('wcuUsed', 1);
      } else {
        AsyncContext.incrementInContext('wcuUsed', Math.ceil(in_value.length / 1024));
      }
    });
  }

  /**
   * Updates an already existing blob in the key value store. The write will only
   * have been be performed when the finishWriteBatch is invoked and the returned
   * promise has been resolved.
   *
   * @param {*}      in_batch - Identifies the write batch this record belongs to
   * @param {String} in_nodeRef  - An identifier for the node in the format "<type>:<guid>"
   * @param {String} in_value - The value under which the record is stored
   * @param {Object} in_extra - Additional information
   * @param {Number} in_extra.originalNodeSize - Original node size before the update
   *      it is used to determine whether it is needed to touch a previous S3 stored node.
   */
  update(in_batch, in_nodeRef, in_value, in_extra) {
    if (!this._writeCargos[in_batch.guid]) {
      throw new OperationError('Trying to update in a non-started batch', 'CreateCommit',
        HTTPStatus.INTERNAL_SERVER_ERROR);
    }

    if (this._batchStatuses[in_batch.guid] === BATCH_STATUSES.FINISHED) {
      throw new OperationError('Trying to update in an already finished batch', 'CreateCommit',
        HTTPStatus.INTERNAL_SERVER_ERROR);
    }

    if (this._batchStatuses[in_batch.guid] === BATCH_STATUSES.ERRORED) {
      return;
    }

    this._writeCargos[in_batch.guid].push({
      key: in_nodeRef,
      value: in_value,
      extra: in_extra
    }, (err) => {
      if (err && this._writeCargos[in_batch.guid]) {
        this._batchStatuses[in_batch.guid] = BATCH_STATUSES.ERRORED;
        this._batchErrors[in_batch.guid] = err;
        this._writeCargos[in_batch.guid].kill();
        logger.debug('Failed writing batch', in_batch.guid, err);

        if (this._batchErrorHandlers[in_batch.guid]) {
          this._batchErrorHandlers[in_batch.guid]();
        }
      }

      if (in_value.length > this._largeNodeThreshold) {
        AsyncContext.incrementInContext('wcuUsed', 1);
      } else {
        AsyncContext.incrementInContext('wcuUsed', Math.ceil(in_value.length / 1024));
      }
    });
  }

  /**
   * Gets a record from the record storage (private impl)
   * @private
   * @param {String} in_nodeRef  - An identifier for the node in the format "<type>:<guid>"
   * @param {Boolean} [in_consistent=false] - Do we need a consistent read for this operation?
   *
   * @return {Promise} A promise that resolves with the requested value or undefined
   *                   if the record does not exist.
   */
  _get(in_nodeRef, in_consistent) {
    let primaryKey = {
      PK: in_nodeRef,
      SK: '.'
    };

    return new Promise((resolve, reject) => {
      logger.debug('Beginning to read node', primaryKey);

      let queue = in_consistent ? this._nodeFetchConsistentCargoQueue : this._nodeFetchInconsistentCargoQueue;

      queue.push({
        key: primaryKey,
        handler: {
          resolve: async (result) => {
            if (!result) {
              logger.debug('Done reading node', primaryKey, result);
              AsyncContext.incrementInContext('rcuUsed', 1);
              resolve(result);
            } else {
              const readCostRatio = in_consistent ? 4096 : 8192;
              AsyncContext.incrementInContext('rcuUsed', 1);
              if (result.s3Key) {
                logger.debug('Done reading node.  Beginning to read from S3', primaryKey, result.s3Key);
                try {
                  let s3Result = await this._bigStore.getObject(result.s3Key);
                  let parsedS3Result = s3Result.toString();
                  logger.debug('Done reading from S3', primaryKey, parsedS3Result);
                  resolve(parsedS3Result);
                  return;
                } catch (ex) {
                  reject(ex);
                  return;
                }

              }
              AsyncContext.incrementInContext('rcuUsed', Math.ceil(result.value.length / readCostRatio));
              resolve(result.value);
            }
          },
          reject: (error) => {
            reject(error);
          }
        }
      });
    });
  }

  /**
   * Private implementation to de-duplicate concurrent function calls
   * @private
   * @param {String} fnName - Function to de-duplicate
   * @param {Array} args - Arguments of the function call
   * @return {*} - Return of the function call
   */
  async _wrapStampede(fnName, args) {
    let cacheKey = JSON.stringify(args);

    if (this._stampedePromises[fnName][cacheKey]) {
      return await this._stampedePromises[fnName][cacheKey];
    } else {
      this._stampedePromises[fnName][cacheKey] = this[fnName].apply(this, args);

      this._stampedePromises[fnName][cacheKey]
        .then(() => {
          delete this._stampedePromises[fnName][cacheKey];
        })
        .catch(() => {
          delete this._stampedePromises[fnName][cacheKey];
        });

      return await this._stampedePromises[fnName][cacheKey];
    }
  }

  /**
   * Gets a record from the record storage
   *
   * @param {String} in_nodeRef  - An identifier for the node in the format "<type>:<guid>"
   * @param {Boolean} [in_consistent=false] - Do we need a consistent read for this operation?
   *
   * @return {Promise} A promise that resolves with the requested value or undefined
   *                   if the record does not exist.
   */
  get(in_nodeRef, in_consistent) {
    return this._wrapStampede('_get', arguments);
  }

  /**
   * Deletes a full node along all its subnodes
   * @param {String} in_nodeRef - Node identifier
   * @return {Promise} - Resolves when deletion is completed
   */
  async delete(in_nodeRef) {
    const primaryKey = {
      PK: in_nodeRef,
      SK: '.'
    };

    let rawRecord = await new Promise((resolve, reject) => {
      this._nodeFetchInconsistentCargoQueue.push({
        key: primaryKey,
        handler: {
          resolve: async (result) => {
            resolve(result);
          },
          reject: (error) => {
            reject(error);
          }
        }
      });
    });
    if (rawRecord) {
      if (rawRecord.s3Key) {
        logger.trace('Queuing a S3 delete', rawRecord.s3Key);
        await new Promise((resolve, reject) => {
          this._oldS3DeleteCargo.push({
            key: rawRecord.s3Key
          }, () => {
            logger.trace('Completed a S3 node delete', in_nodeRef);
            resolve();
          });
        });
      }

      return new Promise((resolve, reject) => {
        logger.trace('Queuing a DDB node delete', in_nodeRef);
        this._nodeDeleteCargoQueue.push(primaryKey, (err) => {
          if (err) {
            reject(err);
          } else {
            logger.trace('Completed a DDB node delete', in_nodeRef);
            resolve();
          }
        });
      });
    } else {
      return Promise.resolve();
    }
  }
}

module.exports = DynamoDBBackend;
