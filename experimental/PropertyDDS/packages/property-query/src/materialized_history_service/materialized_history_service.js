/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const { OperationError } = require('@fluid-experimental/property-common');
const HTTPStatus = require('http-status');
const BranchManager = require('./branch_manager');
const CommitManager = require('./commit_manager');
const DeletionManager = require('./deletion_manager');
const IndexManager = require('./index_manager');
const BTreeManager = require('./btree_manager');

/**
 * Service that maintains the materialized history for a branch
 */
class MaterializedHistoryService {
  /**
   * Constructor for this class
   * @param {Object} params Parameters for this service
   * @param {Object} params.settings The settings object
   * @param {Object} params.serializer Used to serialize nodes
   * @param {Object} params.systemMonitor The system monitor to use
   * @param {Object} params.storageManager StorageManager used to store the materialized history
   * @param {Object} params.nodeDependencyManager Handles B-Tree traversals and updates
   * @param {BranchWriteQueue} params.branchWriteQueue Used to queue write requests for branches
   */
  constructor(params) {
    this._settings = params.settings;
    this._serializer = params.serializer;
    this._systemMonitor = params.systemMonitor;
    this._nodeDependencyManager = params.nodeDependencyManager;
    this._branchWriteQueue = params.branchWriteQueue;

    this._storageManager = params.storageManager;
    this._btreeManager = new BTreeManager({
      storageManager: this._storageManager,
      nodeDependencyManager: this._nodeDependencyManager
    });

    this._indexManager = new IndexManager({
      storageManager: this._storageManager,
      btreeManager: this._btreeManager,
      systemMonitor: this._systemMonitor
    });

    this._branchManager = new BranchManager({
      storageManager: this._storageManager,
      settings: this._settings,
      indexManager: this._indexManager,
      btreeManager: this._btreeManager
    });
    this._branchWriteQueue._branchManager = this._branchManager;

    this._commitManager = new CommitManager({
      storageManager: this._storageManager,
      settings: this._settings,
      serializer: this._serializer,
      systemMonitor: this._systemMonitor,
      btreeManager: this._btreeManager,
      indexManager: this._indexManager
    });
    this._indexManager._commitManager = this._commitManager;
    this._branchWriteQueue._commitManager = this._commitManager;

    this._deletionManager = new DeletionManager({
      storageManager: this._storageManager,
      branchManager: this._branchManager,
      commitManager: this._commitManager
    });
  }

  /**
   * Initializes the service
   * @return {Promise} Resolves when the service is initialized
   */
  init() {
    return this._storageManager.init();
  }

  /**
   * Stops the service
   * @return {Promise} Resolves when the service is stopped
   */
  stop() {
    return this._storageManager.stop();
  }

  /**
   * Creates a new branch which is tracked by this service
   * @param {Object} params The branch parameters
   * @param {String} params.guid The guid of the branch
   * @param {Object} params.meta Branch meta data
   * @param {String} params.rootCommitGuid The GUID of the root commit
   * @param {Number} [params.created] Branch creation date
   * @param {String} [params.parentBranchGuid] The GUID of the parent branch, if any
   * @return {Promise} Resolves when the branch is created
   */
  createBranch(params) {
    return this._branchWriteQueue.queueBranchGracefully(params);
  }

  /**
   * Get information about a branch
   * @param {String} branchGuid The guid of the branch
   * @return {Promise<Object>} Resolves to the branch information
   */
  getBranch(branchGuid) {
    return this._branchManager.getBranch(branchGuid);
  }

  /**
   * Create a new commit
   * @param {Object}  params The commit parameters
   * @param {String}  params.guid The guid of the commit
   * @param {Object}  params.meta Commit meta data
   * @param {String}  params.branchGuid The GUID of the branch
   * @param {String}  params.parentGuid The GUID of the parent
   * @param {Boolean} params.rebase Perform a rebase if the parent it not the tip of the branch
   * @param {String}  params.changeSet The changeSet of the commit
   * @return {Promise} Resolves when the commit is created
   */
  createCommit(params) {
    return this._branchWriteQueue.queueCommitGracefully(params);
  }

  /**
   * Get commit meta-information
   * @param {String} commitGuid The guid of the commit
   * @return {Promise<Object>} Resolves to the commit information
   */
  getCommit(commitGuid) {
    return this._commitManager.getCommit(commitGuid);
  }

  /**
   * Get the materialized view up to the specified commit
   *
   * @param {Object} params                    - The branch parameters
   * @param {String} params.guid               - The guid of the commit
   * @param {String} params.branchGuid               - The guid of the branch
   * @param {Array.<String>} params.paths      - paths to include in the response
   *                                                (an empty array returns the full MV)
   * @param {Boolean} params.followReferences  - Follow references while traversing the changeset
   *                                                and include the referenced subtrees
   * @param {Array.<Array<String>>} params.ranges
   *                                             - ranges to include in the response
   * @param {Boolean} params.fetchSchemas     - Include registered schemas as part of the result
   * @param {Number} params.pagingLimit       - Desired maximum size of the result. Note, this size limit will
   *                                               not be enforced strictly. The result can be bigger by up to the
   *                                               size of one internal chunk.
   * @param {Number} params.pagingStartPath   - Start path for the next page to request
   *
   * @return {Promise<{changeSet: Object}>} Resolves to the materialized view up to the specified commit
   */
  async getCommitMV(params) {
    const branch = await this._branchManager.getBranch(params.branchGuid);
    params.bTreeParameters = branch.bTreeParameters;
    return this._commitManager.getCommitMV(params);
  }

  /**
   * Get the change set of a commit
   *
   * @param {Object} params                    - The branch parameters
   * @param {String} params.branchGuid         - The guid of the branch
   * @param {String} params.guid               - The guid of the commit
   * @param {Array.<String>} params.paths      - paths to include in the response (an empty
   *                                                array returns the full MV)
   * @param {Array.<Array<String>>} params.ranges
   *                                              - ranges to include in the response
   * @param {Boolean} params.fetchSchemas      - Include registered schemas as part of the result
   *
   * @return {Promise<{changeSet: Object}>} - Resolves to the change set of the commit
   */
  async getCommitCS(params) {
    const branch = await this._branchManager.getBranch(params.branchGuid);
    params.bTreeParameters = branch.bTreeParameters;
    return this._commitManager.getCommitCS(params);
  }

  /**
   * Get the change set for the changes between two commits
   *
   * @param {Object} params Function parameters
   * @param {String} params.oldCommitGuid The guid of the old commit
   * @param {String} params.newCommitGuid The guid of the new commit
   * @param {Array.<String>} params.paths Paths to include in the response (an empty array returns the full MV)
   * @param {Array.<Array<String>>} params.ranges Ranges to include in the response
   *
   * @return {Promise<{changeSet: Object}>} - Resolves to the change set with the changes between the two commits
   */
  getSquashedCommitRange(params) {
    return this._commitManager.getSquashedCommitRange(params);
  }

  /**
   * Creates a multiple branches deletion task
   *
   * @param {Object} params Function parameters
   * @param {Array<String>} params.branchGuids The guid of the branches affected
   * @param {String} params.taskUrl Complete host specific URL for the task created
   * @param {String} params.taskGuid The guid of the task in question
   * @return {Promise<{task: Object}>} Resolves to the task descriptor along with its status
   */
  async createDeleteBranchTask(params) {
    await this._branchWriteQueue.lockQueuesForDeletion(params.branchGuids);
    let result;
    try {
      result = await this._deletionManager.createDeleteBranchTask(params);
    } finally {
      await this._branchWriteQueue.clearQueuesForDeletion(params.branchGuids);
    }
    return result;

  }

  /**
   * Returns the status of a branches deletion task
   *
   * @param {Object} params Function parameters
   * @param {String} params.taskGuid The guid of the task in question
   * @return {Promise<{task: Object}>} Resolves to the task descriptor along with its status
   */
  getDeleteBranchTask(params) {
    return this._deletionManager.getDeleteBranchTask(params);
  }

  /**
   * Retries a branch deletion task
   *
   * @param {Object} params Function parameters
   * @param {String} in_params.taskGuid The guid of the task in question
   * @param {Array<String>} in_params.branchGuids The guid of the branches affected
   * @param {String} in_params.taskUrl Complete host specific URL for the task created
   * @return {Promise<{task: Object}>} Resolves to the task descriptor along with its status
   */
  retryDeleteBranchTask(params) {
    return this._deletionManager.retryDeleteBranchTask(params);
  }

  /**
   * Return the task guids per branch
   *
   * @param {Object} params Parameters for this task
   * @param {Array<String>} params.branchGuids Branch Guids
   * @return {Array<Object>} Task identifiers (taskGuid)
   */
  getDeleteBranchTaskByBranches(params) {
    return this._deletionManager.getDeleteBranchTaskByBranches(params);
  }

  /**
   * Waits until the specified commit has been applied to the given branch
   * @param {String} branchGuid Guid of the branch
   * @param {String} commitGuid Guid of the commit
   * @return {Promise} Resolves when the specified commit has been created
   */
  waitUntilCommitApplied(branchGuid, commitGuid) {
    return this._branchWriteQueue.waitUntilCommitApplied(branchGuid, commitGuid);
  }

  /**
   * Deletes a commit
   * @param {String} branchGuid GUID of the branch to update
   * @param {String} commitGuid GUID of the commit to delete
   * @return {Promise} Resolves when the commit has been deleted
   */
  deleteCommit(branchGuid, commitGuid) {
    return this._commitManager.deleteCommit(branchGuid, commitGuid);
  }

  /**
   * Returns the MV for the index at the specified commit
   * @param {Object} params Parameters for this function
   * @param {String} params.branchGuid Guid of the branch that owns the index
   * @param {String} params.commitGuid Guid of the commit to get the MV for
   * @param {String} params.indexName Name of the index from where to get the data
   * @param {Object} [params.filtering] Settings that control filtering of results
   * @param {Object} [params.paging] Settings that control paging of scanned results
   * @return {Object} Result containing the change set and the list of primary paths obtained
   * {Object} changeSet Index MV
   * {Array<String>} paths List of primary paths
   */
  async getIndexMV(params) {
    const branch = await this._branchManager.getBranch(params.branchGuid);
    const indexDef = branch.indices && branch.indices[params.indexName] && branch.indices[params.indexName].def;
    if (!indexDef) {
      throw new OperationError(`Index '${params.indexName}' does not exist on branch '${params.branchGuid}'!`,
        'GetIndexMV', HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET);
    }
    return await this._indexManager.getIndexMV({
      branchGuid: params.branchGuid,
      commitGuid: params.commitGuid,
      indexName: params.indexName,
      indexDef,
      filtering: params.filtering,
      paging: params.paging
    });
  }

  /**
   * Get all leaf nodes for a given commit
   *
   * This function is only intended for unit test, since querying this information
   * might be very expensive
   *
   * @param {Object} params Function parameters
   * @param {String} params.guid The guid of the commit
   *
   * @return {Promise<Array[]>} - A list with all the leaf nodes
   *    Array contains an object such as {startPath: String, changeSet: Object}
   * @private
   */
  _getAllLeafsForCommit(params) {
    return this._commitManager._getAllLeafsForCommit(params);
  }
}

module.exports = MaterializedHistoryService;
