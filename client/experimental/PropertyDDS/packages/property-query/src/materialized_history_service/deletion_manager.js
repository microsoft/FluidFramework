/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const HTTPStatus = require('http-status');
const ModuleLogger = require('../utils/module_logger');
const logger = ModuleLogger.getLogger('HFDM.MaterializedHistoryService.DeletionManager');
const { getBaseNodeRef, parseNodeReference } = require('../utils/node_refs');
const _ = require('lodash');
const TIME_BEFORE_DELETING_TASK = 300000;

/**
 * Manages the deletion of branches and all associated nodes
 */
class DeletionManager {
  /**
   * Constructor for the DeletionManager
   * @param {Object} in_params - Parameters
   * @param {StorageManager} in_params.storageManager - Storage Manager instance
   * @param {CommitManager} in_params.commitManager - Commit Manager instance
   * @param {BranchManager} in_params.branchManager - Branch Manager instance
   */
  constructor(in_params) {
    this._storage = in_params.storageManager;
    this._branchManager = in_params.branchManager;
    this._commitManager = in_params.commitManager;
    this._promisesForTasks = {};
  }

  /**
   * Creates a task for deleting a branch
   * @param {Object} in_params - Parameters for this task
   * @param {Array<String>} in_params.branchGuids - Branch Guids to be deleted
   * @param {String} in_params.taskUrl - Complete host specific URL for the task created
   * @param {String} in_params.taskGuid - Guid for the task
   * @return {Object} - Task description (taskGuid, status)
   */
  async createDeleteBranchTask(in_params) {
    let taskGuid = in_params.taskGuid;

    let task = {
      taskGuid: taskGuid,
      status: 'NEW',
      branchGuids: in_params.branchGuids,
      taskUrl: in_params.taskUrl
    };

    logger.debug(`Creating delete task ${taskGuid}, for branchGuids`, in_params.branchGuids);
    await this._writeTaskStatus(task);
    await this._writeTaskPerBranch(task);
    logger.debug(`Done creating delete task ${taskGuid}, beginning to process`);
    this._promisesForTasks[taskGuid] = this._startProcessingTask(task);

    return [task, this._promisesForTasks[taskGuid]];
  }

  /**
   * Updates the task status
   * @param {Object} task - Task status
   */
  async _writeTaskStatus(task) {
    let batch = this._storage.startWriteBatch();
    this._storage.store(batch, `deleteTask:${task.taskGuid}`, task);
    await this._storage.finishWriteBatch(batch);
  }

  /**
   * Creates the task per branch records
   * @param {Object} task - Task status
   */
  async _writeTaskPerBranch(task) {
    let batch = this._storage.startWriteBatch();
    task.branchGuids.map((bg) =>
      this._storage.store(batch, `deleteTaskPerBranch:${bg}`, {taskGuid: task.taskGuid})
    );
    await this._storage.finishWriteBatch(batch);
  }

  /**
   * Deletes the task status
   * @param {Object} task - Task status
   */
  async _deleteTaskStatus(task) {
    await this._storage.delete('deleteTask:' + task.taskGuid, task);
    let deletePromises = task.branchGuids.map((bg) =>
      this._storage.delete(`deleteTaskPerBranch:${bg}`, {taskGuid: task.taskGuid})
    );
    await Promise.all(deletePromises);
  }

  /**
   * Return the task guids
   * @param {Object} in_params - Parameters for this task
   * @param {Array<String>} in_params.branchGuids - Branch Guids
   * @return {Array<Object>} - Task identifiers (taskGuid)
   */
  async getDeleteBranchTaskByBranches(in_params) {
    let taskByBranches = in_params.branchGuids.map(async (bg) =>
      this._storage.get(`deleteTaskPerBranch:${bg}`)
    );
    let tbb = await Promise.all(taskByBranches);
    return await Promise.all(_.uniq(
      tbb
        .filter((t) => t !== undefined)
        .map((t) => t.taskGuid)
    ).map(async (tg) => {
      return this._storage.get(`deleteTask:${tg}`);
    }));
  }

  /**
   * Returns the status for a branches deletion task
   * @param {Object} in_params - Parameters for this task
   * @param {String} in_params.taskGuid - Guid of the task
   * @return {Object} - Task description (taskGuid, status)
   */
  async getDeleteBranchTask(in_params) {
    let task = await this._storage.get('deleteTask:' + in_params.taskGuid, true);
    return [task, task && this._promisesForTasks[task.taskGuid]];
  }

  /**
   * Initiates the processing of a task
   * @param {Object} task - Task descriptor
   */
  async _startProcessingTask(task) {
    try {
      logger.debug(`Beginning to process ${task.taskGuid}`);

      task.status = 'SCANNING';
      await this._writeTaskStatus(task);

      await this._scanNodes(task);
      logger.trace(`[${task.taskGuid}] Done scanning nodes`, task.nodesToDelete);

      task.status = 'DELETING';
      task.nodesToDelete = Array.from(task.nodesToDelete);
      await this._writeTaskStatus(task);

      logger.trace(`[${task.taskGuid}] Beginning to delete`, task.nodesToDelete);
      await this._doDeletion(task);
      logger.trace(`[${task.taskGuid}] Done deleting`, task.nodesToDelete);

      task.status = 'COMPLETED';
      delete task.nodesToDelete;
      await this._writeTaskStatus(task);
      logger.debug(`Done processing ${task.taskGuid}`);
    } catch (ex) {
      task.status = 'FAILED';
      task.error = ex.message;
      await this._writeTaskStatus(task);
    } finally {
      setTimeout(() => {
        delete this._promisesForTasks[task.taskGuid];
        this._deleteTaskStatus(task);
      }, TIME_BEFORE_DELETING_TASK);
    }
  }

  /**
   * Scans the nodes to mark for deletion
   * @param {Object} task - Task descriptor
   */
  async _scanNodes(task) {
    let nodesMarkedForDeletion = new Set();

    let fetchTasks = task.branchGuids.map(async (bg) => {
      logger.trace(`[${task.taskGuid}] Beginning to fetch branch ${bg}`);
      let branchInfo;
      try {
        branchInfo = await this._branchManager.getBranch(bg);
      } catch (ex) {
        // Not found branch?  Must be already deleted.  Exit early.
        if (ex.statusCode === HTTPStatus.NOT_FOUND) {
          return;
        }
        throw ex;
      }

      logger.trace(`[${task.taskGuid}] Done fetching branch ${bg}`, branchInfo);
      nodesMarkedForDeletion.add('branch:' + bg);

      let headCommitGuid = branchInfo.headCommitGuid;
      await this._traverseCommitChain(bg, headCommitGuid, nodesMarkedForDeletion);
    });

    await Promise.all(fetchTasks);

    task.nodesToDelete = Array.from(nodesMarkedForDeletion);
  }

  /**
   * Performs the deletion from nodesToDelete
   * @param {Object} task - Task description
   */
  async _doDeletion(task) {
    let deleteTasks = task.nodesToDelete.map((ntd) => {
      logger.trace(`[${task.taskGuid}] Deleting ${ntd}`);
      return this._storage.delete(ntd);
    });

    await Promise.all(deleteTasks);
  }

  /**
   * Re-initiates the processing of a task
   * @param {Object} task - Task descriptor
   * @return {Promise} - Resolves when done
   */
  async retryDeleteBranchTask(task) {
    if (!task.nodesToDelete) {
      this._promisesForTasks[task.taskGuid] = this._startProcessingTask(task);
      return this._promisesForTasks[task.taskGuid];
    }
    try {
      await this._doDeletion(task);
      task.status = 'COMPLETED';
      delete task.nodesToDelete;
      await this._writeTaskStatus(task);
    } catch (ex) {
      logger.warn('Deletion failed', ex);
      task.status = 'FAILED';
      task.error = ex.message;
      await this._writeTaskStatus(task);
    } finally {
      setTimeout(() => {
        delete this._promisesForTasks[task.taskGuid];
        this._deleteTaskStatus(task);
      }, TIME_BEFORE_DELETING_TASK);
      return Promise.resolve();
    }
  }

  /**
   * Traverses the chain of commits, commit per commit
   * @param {String} branchGuid - Branch Guid in question
   * @param {String} commitGuid - Commit Guid to start with
   * @param {Set} nodesMarkedForDeletion - All nodes marked for deletion
   */
  async _traverseCommitChain(branchGuid, commitGuid, nodesMarkedForDeletion) {
    let commitNodeIds = [
      'commit:' + commitGuid,
      'commitTemplates:' + commitGuid
    ];

    let parentCommitGuid;

    let fetchCommitNodes = commitNodeIds.map(async (cni) => {
      if (nodesMarkedForDeletion.has(cni)) {
        return;
      }

      logger.trace(`[${branchGuid}] Beginning to fetch commitNode ${cni}`);
      let commitNode = await this._storage.get(cni);

      if (!commitNode) {
        // Commit node not found.  Must be partially deleted.
        // Bail out
        return;
      }

      logger.trace(`[${branchGuid}] Done fetching commitNode ${cni}`, commitNode);
      nodesMarkedForDeletion.add(cni);

      if (commitNode) {
        // If branchGuid is undefined we still want to delete. Otherwise the node will never be deleted
        if (commitNode.branchGuid && commitNode.branchGuid !== branchGuid) {
          logger.trace(`[${branchGuid}] ${cni} does not belong to ${branchGuid}, skipping`);
          return;
        }

        await this._traverseBTree(branchGuid, commitNode.rootNodeRef, nodesMarkedForDeletion);
        parentCommitGuid = commitNode.parentGuid;
      }
    });

    await Promise.all(fetchCommitNodes);

    if (parentCommitGuid) {
      await this._traverseCommitChain(branchGuid, parentCommitGuid, nodesMarkedForDeletion);
    }
  }

  /**
   * Traverses the BTree recursively to mark all nodes for deletion
   * @param {String} branchGuid - Branch guid for deletion
   * @param {String} nodeRef - Ref for the node name
   * @param {Set} nodesMarkedForDeletion - All nodes marked for deletion
   */
  async _traverseBTree(branchGuid, nodeRef, nodesMarkedForDeletion) {
    logger.trace('Beginning to traverse internal node', nodeRef);
    let baseNodeRef = getBaseNodeRef(nodeRef);
    if (nodesMarkedForDeletion.has(baseNodeRef)) {
      logger.trace('Already marked for deletion', baseNodeRef);
      return;
    }
    nodesMarkedForDeletion.add(getBaseNodeRef(nodeRef));

    let node = await this._storage.get(baseNodeRef);
    let nodeChangeSet;
    if (node) {
      // If branchGuid is undefined we still want to delete. Otherwise the node will never be deleted
      if (!node.branchGuid || node.branchGuid === branchGuid) {
        for (const delta of node.deltas) {
          nodeChangeSet = await this._storage.getNodeChangeset(baseNodeRef + ':' + delta.id);
          if (nodeChangeSet) {
            let childrenNodes = nodeChangeSet['array<String>'].children.insert[0][1];
            let subTraversals = childrenNodes.map(async (cn) => {
              let indexOfHash = cn.indexOf('#');
              let trimmedCn = indexOfHash > -1 ? cn.substring(0, indexOfHash) : cn;
              if (cn.substring(0, 2) === 'l:') {
                nodesMarkedForDeletion.add((getBaseNodeRef(trimmedCn)));
                await this._traverseHierarchicalHistory(trimmedCn, nodesMarkedForDeletion);
              } else {
                await this._traverseBTree(branchGuid, trimmedCn, nodesMarkedForDeletion);
              }
            });
            await Promise.all(subTraversals);
          }
        }
      }
    }
    logger.trace('Done traversing internal node', nodeRef);
  }

  /**
   * Traverses the hierarchical history associated to a leaf node and marks all nodes for deletion
   * @param {String} nodeRef Reference to the leaf node where to start the traversal
   * @param {Set<String>} nodesMarkedForDeletion Nodes marked for deletion
   * @private
   */
  async _traverseHierarchicalHistory(nodeRef, nodesMarkedForDeletion) {
    const { guid } = parseNodeReference(nodeRef);
    const hiNodeRef = 'hi:' + guid;
    logger.trace('Beginning to traverse hierarchical history node', hiNodeRef);
    if (nodesMarkedForDeletion.has(hiNodeRef)) {
      logger.trace('Already marked for deletion', hiNodeRef);
      return;
    }
    nodesMarkedForDeletion.add(hiNodeRef);

    const hiNode = await this._storage.get(hiNodeRef);
    if (hiNode) {
      const addHRefs = (array) => {
        for (let i = 1; i < array.length; i++) {
          const hNodeRef = 'h:' + parseNodeReference(array[i].ref).guid +
            '#' + parseNodeReference(array[i - 1].ref).guid;
          nodesMarkedForDeletion.add(hNodeRef);
        }
      };
      for (const level of hiNode.levels) {
        addHRefs(level.current);
        addHRefs(level.previous);
      }
    }
  }
}

module.exports = DeletionManager;
