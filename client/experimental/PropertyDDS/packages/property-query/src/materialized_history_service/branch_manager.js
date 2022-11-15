/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Code that is related to branch management
 */

const DeterministicGuidGenerator = require('../utils/deterministic_guid_generator');
const OperationError = require('@fluid-experimental/property-common').OperationError;
const HTTPStatus = require('http-status');

/**
 * This class contains all code related to branch management
 */
class BranchManager {
  /**
   * Constructor for this class
   * @param {Object} params Function parameters
   * @param {Object} params.storageManager Storage manager used to store the materialized history
   * @param {Object} params.settings Settings object
   * @param {Object} params.indexManager Index manager to which index-related operations are delegated
   * @param {Object} params.btreeManager Manager that deals with shared B-tree related functionality
   */
  constructor(params) {
    this._storage = params.storageManager;
    this._settings = params.settings;
    this._indexManager = params.indexManager;
    this._btreeManager = params.btreeManager;
  }

  /**
   * Creates a new branch which is tracked by this service
   *
   * @param {Object} in_params                    - The branch parameters
   * @param {String} in_params.guid               - The guid of the branch
   * @param {Object} in_params.meta               - Branch meta data
   * @param {String} in_params.rootCommitGuid     - The GUID of the root commit
   * @param {Number} [in_params.created]          - Creation date of the branch
   * @param {String} [in_params.parentBranchGuid] - Parent branch GUID
   */
  async createBranch(in_params) {
    let [branch, rootCommit] = await Promise.all([
      this._storage.get('branch:' + in_params.guid, false),
      this._storage.get('commit:' + in_params.rootCommitGuid)
    ]);

    if (branch !== undefined) {
      throw new OperationError('Branch already exists!', 'CreateBranch', HTTPStatus.CONFLICT,
        OperationError.FLAGS.QUIET);
    }

    let batch = this._storage.startWriteBatch();

    let createdDate = in_params.created ? new Date(in_params.created) : new Date();

    let bTreeParameters, indices;
    if (in_params.parentBranchGuid) {
      const parentBranch = await this.getBranch(in_params.parentBranchGuid);
      bTreeParameters = parentBranch.bTreeParameters;
      indices = parentBranch.indices;
    } else {
      bTreeParameters = {
        chunkSize: this._settings.get('mh:chunkSize'),
        initialChunkSizeFactor: this._settings.get('mh:initialChunkSizeFactor'),
        splitLimitFactor: this._settings.get('mh:splitLimitFactor'),
        mergeLimitFactor: this._settings.get('mh:mergeLimitFactor'),
        maxNodeSizeFactor: this._settings.get('mh:maxNodeSizeFactor'),
        maxNodeSubEntries: this._settings.get('mh:maxNodeSubEntries'),
        bTreeOrder: this._settings.get('mh:bTreeOrder'),
        nodesPerHierarchicalHistoryLevel: this._settings.get('mh:nodesPerHierarchicalHistoryLevel')
      };
      indices = undefined;
    }

    branch = {
      guid: in_params.guid,
      meta: in_params.meta,
      rootCommitGuid: in_params.rootCommitGuid,
      headCommitGuid: in_params.rootCommitGuid,
      headSequenceNumber: 0,
      created: createdDate.toISOString(),
      bTreeParameters: bTreeParameters
    };

    if (!rootCommit) {
      // Index creation based on metadata is only done when creating the repository.
      // We do not attempt to do that from branching, as it would require re-processing
      // the parent branch history.
      if (in_params.meta && in_params.meta.materializedHistory && in_params.meta.materializedHistory.indices) {
        for (const indexName of Object.keys(in_params.meta.materializedHistory.indices)) {
          await this._indexManager.createIndex({
            branchGuid: in_params.guid,
            name: indexName,
            def: in_params.meta.materializedHistory.indices[indexName],
            inBatch: {
              batch,
              branch
            }
          });
        }
      }

      const guidGenerator = new DeterministicGuidGenerator(in_params.guid, in_params.rootCommitGuid);
      const rootNodeRef = this._btreeManager.createBTree(batch, {}, in_params.guid, guidGenerator);

      // Create the commit object
      this._storage.store(batch, 'commit:' + in_params.rootCommitGuid, {
        guid: in_params.rootCommitGuid,
        branchGuid: in_params.guid,
        meta: {},
        created: new Date().toISOString(),
        timestamp: Date.now(),
        sequence: 0,
        rootNodeRef,
        treeLevels: 1
      });

      const templateRootNodeRef = this._btreeManager.createBTree(batch, {}, in_params.guid, guidGenerator);

      // Create the template object
      this._storage.store(batch, 'commitTemplates:' + in_params.rootCommitGuid, {
        guid: in_params.rootCommitGuid,
        branchGuid: in_params.guid,
        rootNodeRef: templateRootNodeRef,
        treeLevels: 1
      });
    } else if (indices) {
      // Branch each index from the parent branch
      for (const indexName of Object.keys(indices)) {
        await this._indexManager.branchIndex({
          branchGuid: in_params.guid,
          parentBranchGuid: in_params.parentBranchGuid,
          rootCommit,
          name: indexName,
          def: indices[indexName].def,
          inBatch: {
            batch,
            branch
          }
        });
      }
    }

    // Create the branch object
    this._storage.store(batch, 'branch:' + in_params.guid, branch);

    await this._storage.finishWriteBatch(batch);
  }

  /**
   * Get information about a branch
   * @param {String} branchGuid The guid of the branch
   * @return {Promise<Object>} Promise that resolves to the branch information
   */
  getBranch(branchGuid) {
    return this._storage.get('branch:' + branchGuid, true).then((branch) => {
      if (branch === undefined) {
        throw new OperationError('Branch does not exist!', 'GetBranch', HTTPStatus.NOT_FOUND,
          OperationError.FLAGS.QUIET);
      }
      return branch;
    });
  }
}

module.exports = BranchManager;

