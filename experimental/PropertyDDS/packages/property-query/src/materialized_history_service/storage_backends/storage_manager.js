/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Facade that implements common functionality for the storage backends
 * (e.g. caching and changeSet processing)
 */

const _ = require('lodash');
const LRU = require('lru-cache');
const getBaseNodeRef = require('../../utils/node_refs').getBaseNodeRef;
const ChangeSet = require('@fluid-experimental/property-changeset').ChangeSet;
const DeferredPromise = require('@fluid-experimental/property-common').DeferredPromise;
const parseNodeReference = require('../../utils/node_refs').parseNodeReference;
const OperationError = require('@fluid-experimental/property-common').OperationError;
const HTTPStatus = require('http-status');
const MockAsyncContext = require('../../utils/mock_async_context');

const ModuleLogger = require('../../utils/module_logger');
const logger = ModuleLogger.getLogger('HFDM.MaterializedHistoryService.StorageManager');

const STOP_POLLING_DELTA_TIMEOUT = 4500;
const REREAD_INTERVAL = 100;

/**
 * Facade that implements common functionality for the storage backends (e.g. caching and changeSet processing)
 */
class StorageManager {
  /**
   * Constructor for the StorageManager
   *
   * @param {Object} in_params - Parameters for this service
   * @param {Object} in_params.backend       - The settings object
   *
   */
  constructor(in_params) {
    this._backend = in_params.backend;
    this._settings = in_params.settings;
    this._serializer = in_params.serializer;
    this._asyncContext = in_params.asyncContext || new MockAsyncContext;

    this._entriesPerBranch = new Map();

    this._cache = new LRU({
      max: this._settings.get('mh:nodeCache:size'),
      length: (n) => n.length,
      dispose: (key, n) => {
        let value = this._serializer.deserialize(n);
        let branchGuid = this._getBranchGuidForNode(key, value);
        if (branchGuid) {
          let epb = this._entriesPerBranch.get(branchGuid);
          if (epb) {
            epb.delete(key);
          }
        }
      },
      maxAge: this._settings.get('mh:nodeCache:expiry'),
      noDisposeOnSet: true
    });

    // A cache that will keep every node stored in a batch until it is acknowledged
    this._cachePerBatch = new Map();
    this._pendingReads = new Map();
  }

  /**
   * Initialize the backend
   * @return {Promise} - Resolves when initialized
   */
  init() {
    return this._backend.init();
  }

  /**
   * Stops the backend
   * @return {Promise} - Resolves when initialized
   */
  stop() {
    return this._backend.stop();
  }

  /**
   * Starts a write batch
   * @return {*} A batch identifier
   */
  startWriteBatch() {
    const batch = this._backend.startWriteBatch();
    this._cachePerBatch.set(batch, new Map());
    return batch;
  }

  /**
   * Sends all write requests that were created for this batch
   * to the server
   * @param {*} in_batch - Identifier for the batch to transmit
   *
   * @return {Promise} This promise resolves once all records have been
   *                   written to the server
   */
  async finishWriteBatch(in_batch) {
    try {
      await this._backend.finishWriteBatch(in_batch);
    } finally {
      this._cachePerBatch.delete(in_batch);
    }
    logger.trace(`Batch ${in_batch.guid} completed writing`);
  }

  /**
   * Clears a pending write batch in the event of a failure
   * @param {*} in_batch - Identifier for the batch to transmit
   */
  clearWriteBatch(in_batch) {
    this._cachePerBatch.delete(in_batch);
    logger.trace(`Batch ${in_batch.guid} completed clearing`);
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
    logger.trace(`Storing ${in_nodeRef}`);
    let baseNodeReference = getBaseNodeRef(in_nodeRef);
    let storeValue = this._serializeAndCache(baseNodeReference, in_value);

    let batchCache = this._cachePerBatch.get(in_batch);
    if (batchCache) {
      batchCache.set(baseNodeReference, storeValue);
    } else {
      logger.warn('Attempted to set an item in the batch cache, but there was no batch cache', in_batch);
    }

    let pendingReads = this._pendingReads.get(baseNodeReference);
    if (pendingReads) {
      this._pendingReads.delete(baseNodeReference);
      for (let pendingRead of pendingReads) {
        pendingRead.resolve(storeValue);
      }
    }

    this._backend.store(in_batch, in_nodeRef, storeValue);
    this._asyncContext.incrementInContext('nodesWritten', 1);
    logger.trace(`Cache set and queued ${in_nodeRef}.  Batch ${in_batch.guid}`);
  }

  /**
   * Updates an already existing  blob in the key value store. The write will only
   * have been be performed when the finishWriteBatch is invoked and the returned
   * promise has been resolved.
   *
   * @param {*}      in_batch - Identifies the write batch this record belongs to
   * @param {String} in_nodeRef  - An identifier for the node in the format "<type>:<guid>"
   * @param {String} in_value - The value under which the record is stored
   * @param {Object} in_extra - Extra metainformation to pass to the storage layer
   */
  update(in_batch, in_nodeRef, in_value, in_extra) {
    logger.trace(`Updating ${in_nodeRef}`);
    let baseNodeReference = getBaseNodeRef(in_nodeRef);
    let storeValue = this._serializeAndCache(baseNodeReference, in_value);

    let batchCache = this._cachePerBatch.get(in_batch);
    if (batchCache) {
      batchCache.set(baseNodeReference, storeValue);
    } else {
      logger.warn('Attempted to set an item in the batch cache, but there was no batch cache', in_batch);
    }

    let pendingReads = this._pendingReads.get(baseNodeReference);
    if (pendingReads) {
      this._pendingReads.delete(baseNodeReference);
      for (let pendingRead of pendingReads) {
        pendingRead.resolve(storeValue);
      }
    }

    this._backend.update(in_batch, in_nodeRef, storeValue, in_extra);
    this._asyncContext.incrementInContext('nodesWritten', 1);
  }

  /**
   * Gets a record from the record storage
   *
   * @param {String} in_nodeRef  - An identifier for the node in the format "<type>:<guid>"
   * @param {Boolean} [in_consistent=false] - Do we need a consistent read for this operation?
   * @param {Boolean} [in_bypassCache=false] - Do we want to bypass the cache?
   *
   * @return {Promise} A promise that resolves with the requested value or undefined
   *                   if the record does not exist.
   */
  async get(in_nodeRef, in_consistent, in_bypassCache) {
    logger.trace(`Beginning to get ${in_nodeRef}`);
    let baseNodeReference = getBaseNodeRef(in_nodeRef);

    if (in_bypassCache) {
      let fetchedRecord = await this._backend.get(baseNodeReference, in_consistent);
      this._asyncContext.incrementInContext('nodesReadFromBackend', 1);
      if (fetchedRecord) {
        return Promise.resolve(this._serializer.deserialize(fetchedRecord));
      }
      return Promise.resolve(undefined);
    }

    let cachedValue = this._cache.get(baseNodeReference);
    if (cachedValue) {
      this._asyncContext.incrementInContext('nodesReadFromCache', 1);
      logger.trace(`Returning ${in_nodeRef} from cache`);
      return this._serializer.deserialize(cachedValue);
    }

    for (let cpb of Array.from(this._cachePerBatch.values()).reverse()) {
      let containedValue = cpb.get(baseNodeReference);
      if (containedValue) {
        this._asyncContext.incrementInContext('nodesReadFromCache', 1);
        logger.trace(`Returning ${in_nodeRef} from batch item cache`);
        return this._serializer.deserialize(containedValue);
      }
    }

    let pendingReads = this._pendingReads.get(baseNodeReference);

    if (!pendingReads) {
      this._pendingReads.set(baseNodeReference, new Set());
      pendingReads = this._pendingReads.get(baseNodeReference);
    }

    let readFromHandler = new DeferredPromise();
    let getFromBackend = this._backend.get(baseNodeReference, in_consistent);
    this._asyncContext.incrementInContext('nodesReadFromBackend', 1);
    pendingReads.add(readFromHandler);

    let completed = false;
    let racePromise = Promise.race([
      readFromHandler.then((setRecord) => {
        if (completed) {
          return undefined;
        }
        completed = true;
        return this._serializer.deserialize(setRecord);
      }),
      getFromBackend.then((fetchedRecord) => {
        if (completed) {
          return undefined;
        }
        completed = true;
        if (fetchedRecord) {
          let parsedRecord = this._serializer.deserialize(fetchedRecord);
          this._serializeAndCache(baseNodeReference, parsedRecord);
          logger.trace(`Returning ${in_nodeRef} from storage`);
          return parsedRecord;
        } else {
          logger.trace(`Tried returning ${in_nodeRef} from storage but it was empty!`);
          return undefined;
        }
      })
    ]);

    const cleanUp = () => {
      this._pendingReads.delete(baseNodeReference);
    };

    racePromise.then(cleanUp, cleanUp);

    return racePromise;
  }

  /**
   * Issues a read to ensure that a delta is present in the node or time out eventually
   * @param {String} nodeRef - Node reference
   * @param {String} expectedDelta - Expected delta
   * @param {Boolean} consistent - Whether to issue a consistent read
   * @return {Object} - Response (node, delta)
   */
  async getNodeExpectingDelta(nodeRef, expectedDelta, consistent) {
    let timedOut = false;
    let shouldBypassCache = false;
    let node;
    let deltaIndex;

    setTimeout(() => {
      timedOut = true;
    }, STOP_POLLING_DELTA_TIMEOUT);

    do {
      node = await this.get(nodeRef, consistent || shouldBypassCache, shouldBypassCache);
      deltaIndex = !node ? -1 : node.deltas.findIndex((x) => x.id === expectedDelta);
      if (deltaIndex === -1) {
        await new Promise((res) => setTimeout(res, REREAD_INTERVAL));
      }
      shouldBypassCache = true;
    } while (deltaIndex === -1 && !timedOut); // eslint-disable-line no-unmodified-loop-condition

    if (deltaIndex === -1) {
      throw new OperationError(
        `Delta Index was not found! ${nodeRef}/${expectedDelta}`, 'GetCommit', HTTPStatus.NOT_FOUND,
        OperationError.FLAGS.TRANSIENT);
    }

    return { node, deltaIndex };
  }

  /**
   * Gets a record from the record storage
   *
   * @param {String} in_nodeRef  - An identifier for the node in the format "<type>:<guid>:subId"
   * @param {Boolean} [in_consistent=false] - Do we need a consistent read for this operation?
   * @param {StorageManager.ChangeSetType} [in_changeSetType=StorageManager.ChangeSetType.MATERIALIZED_VIEW] -
   *     The type of changeset to return
   *
   * @return {Promise} A promise that resolves with the requested value or undefined
   *                   if the record does not exist.
   */
  async getNodeChangeset(in_nodeRef, in_consistent, in_changeSetType) {
    // Get the node containing the changeset from the storage
    let nodeSubId = parseNodeReference(in_nodeRef).subId;

    let { node, deltaIndex } = await this.getNodeExpectingDelta(in_nodeRef, nodeSubId, in_consistent);

    // Get the list of all changesets from the stored normalized changeset to
    // the changeSet for the requested subID
    let changeSetsToApply = [];
    let deltaEntry = node.deltas[deltaIndex];
    while (deltaEntry.previousDeltaIndex !== undefined) {
      changeSetsToApply.unshift(deltaEntry.changeSet);
      deltaEntry = node.deltas[deltaEntry.previousDeltaIndex];
    }

    // Apply all the changes sequentially to get the requested CS
    let accumulatedCS = new ChangeSet(in_changeSetType !== StorageManager.ChangeSetType.FULL_CHANGESET ?
      node.changeSet : // By default, we accumulate with respect to the materialized view
      {}               // But if a changeset with a delta relative to the start of the node
      // is requested, we start with an empty changeSet
    );
    for (let i = 0; i < changeSetsToApply.length; i++) {
      accumulatedCS.applyChangeSet(changeSetsToApply[i]);
    }

    let deltaCS;
    if (in_changeSetType === StorageManager.ChangeSetType.INDIVIDUAL_CHANGESET) {
      // Find the entry which came prior to the requested subID
      let previousEntry = node.deltas.find((x) =>  x.previousDeltaIndex === deltaIndex);

      // If the delta has been requested, we compute it, by
      // making the CS reversible with regard to the normalized changeSet
      // and then inverting it
      // We have to do this, since the node stores the changeSets with
      // regard to the last state in the node, but we want to have
      // a changeset in the opposite direction
      deltaCS = new ChangeSet(previousEntry.changeSet);
      deltaCS._toReversibleChangeSet(accumulatedCS.getSerializedChangeSet());
      deltaCS.toInverseChangeSet();

      return deltaCS.getSerializedChangeSet();
    } else if (in_changeSetType === StorageManager.ChangeSetType.FULL_CHANGESET) {
      // Make the resulting changeset reversible
      accumulatedCS._toReversibleChangeSet(node.changeSet);
      // And invert it (currently, it is from the last node to the start)
      accumulatedCS.toInverseChangeSet();
    }

    return accumulatedCS.getSerializedChangeSet();
  }

  /**
   * Deletes a full node along all its subnodes
   * @param {String} nodeRef - Node identifier
   * @return {Promise} - Resolves when deletion is completed
   */
  async delete(nodeRef) {
    logger.trace(`Deleting ${nodeRef}`);
    this._asyncContext.incrementInContext('nodesDeleted', 1);
    await this._backend.delete(nodeRef);
    this._cache.del(nodeRef);
    this._cachePerBatch.forEach((cpb) => {
      cpb.delete(nodeRef);
    });

    return Promise.resolve();
  }

  /**
   * Clears the cache for a branch
   * @param {String} branchGuid - Guid of the branch to clean
   */
  clearCacheForBranch(branchGuid) {
    let epb = this._entriesPerBranch.get(branchGuid);

    if (epb) {
      epb.forEach((key) => {
        this._cache.del(key);
      });
    }

    this._entriesPerBranch.delete(branchGuid);
  }

  /**
   * Serializes and cache a value
   * @param {String} key - Key of the node
   * @param {Object} value - Value of the node
   * @return {String} - Serialized value
   */
  _serializeAndCache(key, value) {
    let branchGuid = this._getBranchGuidForNode(key, value);

    if (branchGuid) {
      let epb = this._entriesPerBranch.get(branchGuid);

      if (!epb) {
        epb = new Set();
        this._entriesPerBranch.set(branchGuid, epb);
      }

      epb.add(key);
    }
    let storeValue = !_.isString(value) ? this._serializer.serialize(value) : value;
    this._cache.set(key, storeValue);

    return storeValue;
  }

  /**
   * Infers the branch guid from the node data
   * @param {String} key - Node identifier
   * @param {Object} node - A node
   * @return {String?} - Inferred branch guid
   */
  _getBranchGuidForNode(key, node) {
    let branchGuid = node.branchGuid;

    if (!branchGuid) {
      if (key.indexOf('branch:') === 0) {
        branchGuid = node.guid;
      }
    }

    return branchGuid;
  }

  /**
   * Prints some debugging statistics about the database
   * @return {Promise} - When the statistics are dumped
   */
  _dumpStatistics() {
    return this._backend._dumpStatistics();
  }

  /**
   * Sleeps for a time in ms
   * @param {Number} duration - How long to sleep
   * @return {Promise} - Resolves after sleep
   */
  _sleep(duration) {
    return new Promise((resolve) => {
      setTimeout(resolve, duration);
    });
  }
}

/**
 * @enum {Object}
 * The different types of changeSets that can be returned by getNodeChangeset
 */
StorageManager.ChangeSetType = {
  MATERIALIZED_VIEW: {},     // The materialized view at the provided subID
  INDIVIDUAL_CHANGESET: {},  // The changeset for one subid entry relative to it predecessor node
  FULL_CHANGESET: {}         // The changeset relative to the start of the node
};

module.exports = StorageManager;
