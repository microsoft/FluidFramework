/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');
const asyncQueue = require('async/queue');
const { OperationError } = require('@fluid-experimental/property-common');
const HTTPStatus = require('http-status');
const { ModuleLogger } = require('@fluid-experimental/property-query')
const logger = ModuleLogger.getLogger('HFDM.Query.Tool.RepairManager');
// Uncomment to get meaningful output from this tool
// logger.setLevel('TRACE');

const MAX_DATE = 8640000000000000;
const CONSISTENT_COMMIT_LIMIT = 10;

/**
 * Class in charge of repairing MH for branches given their state in both MHS and HFDM Classic
 */
class RepairManager {
  /**
   * Creates a new instance of the repair manager
   * @param {Object} params Constructor parameters
   * @param {Object} params.mhService Used to read and write MH information
   * @param {Object} params.hfdmClassicClient Used to read HFDM Classic information
   */
  constructor(params) {
    this._mhService = params.mhService;
    this._hfdmClassicClient = params.hfdmClassicClient;
  }

  /**
   * Initializes the repair manager dependencies
   */
  async init() {
    await this._hfdmClassicClient.init();
    await this._mhService.init();
    logger.trace('Initialized');
  }

  /**
   * De-initializes the repair manager dependencies
   */
  async stop() {
    await this._mhService.stop();
    await this._hfdmClassicClient.stop();
    logger.trace('Stopped');
  }

  /**
   * Entry point of the repair process. Scans HFDM Classic for branches modified since the specified date
   * and takes the necessary steps to make the Materialized History of those branches consistent.
   * @param {Object} params Function parameters
   * @param {Date} params.lastModifiedSince Minimum last modified date to consider a branch to repair
   * @param {Number} params.dop Number of branches that may be processed in parallel
   */
  async scanAndRepairBranches(params) {
    const branchProcessingQueue = asyncQueue(this._makeBranchConsistent.bind(this), params.dop || 1);
    let filteredResult = {};
    const pushedBackBranches = [];
    let totalBranchCount = 0;
    logger.trace('Started scanning');
    do {
      filteredResult = await this._hfdmClassicClient.scanBranches({
        lastModifiedSince: params.lastModifiedSince,
        lastEvaluatedKey: filteredResult.lastEvaluatedKey
      });
      totalBranchCount += filteredResult.branches.length;
      for (const branchGuid of filteredResult.branches) {
        const branchInfo = await this._hfdmClassicClient.getBranch(branchGuid);
        if (branchInfo.branch.parent) {
          logger.trace(`Pushing back branch '${branchGuid}' because it has a parent`);
          pushedBackBranches.push({ guid: branchGuid, parent: branchInfo.branch.parent.branch.guid });
        } else {
          branchProcessingQueue.push({ branchGuid, since: params.lastModifiedSince });
        }
      }
    } while (filteredResult.lastEvaluatedKey);
    logger.trace('Ended scanning');

    // Wait for these branches, because pushed back branches may depend on them
    await branchProcessingQueue.drain();

    // Processes the pushed back branches. Note that due to the possible existence of chains of dependencies,
    // trees are created respecting ancestry so that branches can be processed in the right order.
    if (pushedBackBranches.length > 0) {
      logger.trace('Started processing pushed back branches');
      const branchTrees = this._createBranchTrees(pushedBackBranches);

      let currentBatch = branchTrees;
      let nextBatch;
      do {
        nextBatch = new Map();
        for (const tree of currentBatch) {
          branchProcessingQueue.push({ branchGuid: tree[0], since: params.lastModifiedSince });
          for (const childTree of tree[1]) {
            nextBatch.set(childTree[0], childTree[1]);
          }
        }
        // Wait for the current batch before going to the next
        await branchProcessingQueue.drain();
        currentBatch = nextBatch;
      } while (currentBatch.size > 0);

      logger.trace('Ended processing pushed back branches');
    }

    logger.trace(`Total processed branches: ${totalBranchCount}`);
  }

  /**
   * Given an array of branches with their parents, it creates a map of trees following ancestry.
   * @param {Array<Object>} branches List of branches containing their guid and parent.
   * @return {Map<String,Map>} Trees containing the branch guids respecting ancestry.
   */
  _createBranchTrees(branches) {
    const branchTrees = new Map();
    const childToParent = new Map();
    const parentToChildren = new Map();

    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i];

      // Get chain of already processed ancestors
      const ancestors = [];
      let ancestor = branch.parent;
      while (childToParent.has(ancestor)) {
        ancestors.push(ancestor);
        ancestor = childToParent.get(ancestor);
      }

      // Place the branch in the right place of the ancestry
      let treeNode = branchTrees;
      for (let j = ancestors.length - 1; j >= 0; j--) {
        treeNode = treeNode.get(ancestors[j]);
      }
      const myChildMap = new Map();
      treeNode.set(branch.guid, myChildMap);

      // Place already processed child trees under their parent
      if (parentToChildren.has(branch.guid)) {
        for (const child of parentToChildren.get(branch.guid)) {
          const childTree = branchTrees.get(child);
          myChildMap.set(child, childTree);
          branchTrees.delete(child);
        }
      }

      // Update relationship information
      childToParent.set(branch.guid, branch.parent);
      let child;
      if (parentToChildren.has(branch.parent)) {
        child = parentToChildren.get(branch.parent);
      } else {
        child = [];
        parentToChildren.set(branch.parent, child);
      }
      child.push(branch.guid);
    }

    return branchTrees;
  }

  /**
   * Makes the specified branch consistent with the information stored in HFDM Classic in case it is not
   * @param {Object} params Parameters for this function
   * @param {String} params.branchGuid Guid of the branch to be checked
   * @param {Date} params.since Date since which consistency should be checked
   */
  async _makeBranchConsistent({ branchGuid, since }) {
    logger.trace(`Checking consistency for branch '${branchGuid}'`);

    // Assume that the HFDM Classic is the owner of truth and base our consistency on it
    let branch, rootCommitGuid, localBranch;
    const branchInfo = await this._hfdmClassicClient.getBranch(branchGuid);
    rootCommitGuid = branchInfo.branch.parent && branchInfo.branch.parent.commit &&
      branchInfo.branch.parent.commit.guid || branchInfo.repository.rootCommit.guid;
    branch = branchInfo.branch;
    const mhEnabled = branch.meta && branch.meta.materializedHistory && branch.meta.materializedHistory.enabled;
    if (!mhEnabled) {
      logger.trace(`Branch '${branchGuid}' does not have Materialized History enabled`);
      return;
    }

    try {
      localBranch = await this._mhService.getBranch(branchGuid);
    } catch (err) {
      if (err instanceof OperationError && err.statusCode === HTTPStatus.NOT_FOUND) {
        logger.trace(`Branch '${branchGuid}' does not have Materialized History. Creating it from scratch.`);

        // Check if the root node is owned by this branch, and delete it if so.
        // This way when we create the branch it will create the root commit again, possibly fixing it.
        if (!branch.parent) {
          await this._mhService._storageManager.delete('commit:' + rootCommitGuid);
        }

        // Now we can create the branch and override all the commits
        await this._mhService.createBranch({
          guid: branch.guid,
          meta: branch.meta || {},
          rootCommitGuid
        });
        await this._forceRepairBranch({ guid: branch.guid, headCommitGuid: rootCommitGuid }, branch.head.guid);
        logger.trace(`Done repairing branch '${branchGuid}'`);
        return;
      } else {
        // If something else failed re-throw
        throw err;
      }
    }

    if (localBranch.headCommitGuid !== branch.head.guid) {
      // We may be either ahead or behind. Getting the local head from HFDM Classic should tell us what is the case.
      try {
        await this._hfdmClassicClient.getCommit({
          branchGuid,
          commitGuid: localBranch.headCommitGuid
        });
        logger.trace(`MH is behind for branch '${branchGuid}'`);
      } catch (err) {
        if (err instanceof OperationError && err.statusCode === HTTPStatus.NOT_FOUND) {
          logger.trace(`MH is ahead for branch '${branchGuid}'. Deleting commits until head is at ` +
            branch.head.guid);
          // We need to delete the extra commits. We cannot just update the head and assume repeatable
          // writes will take care of it, because the commits may be different this time around.
          await this._deleteCommitRange(localBranch, branch.head.guid);
          localBranch.headCommitGuid = branch.head.guid;
        } else {
          // If something else failed re-throw
          throw err;
        }
      }
    } else {
      logger.trace(`MH is at same commit for branch '${branchGuid}'`);
    }

    // Rewind the branch until we find a consistent head commit.
    localBranch.headCommitGuid = await this._getLatestConsistentCommit(localBranch, since);
    logger.trace(`Last consistent commit for branch '${branchGuid}' is '${localBranch.headCommitGuid}'`);

    // Update the head to where we are, so that commits can be applied.
    await this._updateBranchHead(localBranch);

    // Repeatable writes should take care of overwriting the inconsistent commits.
    await this._forceRepairBranch(localBranch, branch.head.guid);
    logger.trace(`Done repairing branch '${branchGuid}'`);
  }

  /**
   * Updates the branch node to point to the new head
   * @param {Object} branch Branch node
   */
  async _updateBranchHead(branch) {
    let commitInfo;
    try {
      commitInfo = await this._mhService.getCommit(branch.headCommitGuid);
      branch.headSequenceNumber = commitInfo.commit.sequence;
    } catch (err) {
      if (err instanceof OperationError && err.statusCode === HTTPStatus.NOT_FOUND) {
        // This means this is the root commit
        branch.headSequenceNumber = 0;
      } else {
        // Another error we don't know of. Re-throw.
        throw err;
      }
    }

    // This is a very low-level operation that should not be exposed in MHS
    const batch = this._mhService._storageManager.startWriteBatch();
    this._mhService._storageManager.update(batch, 'branch:' + branch.guid, branch);
    await this._mhService._storageManager.finishWriteBatch(batch);
  }

  /**
   * Performs a repair of the branch, up to the specified commit, by requesting commits from HFDM Classic.
   * A force repair will recreate commits even if they exist or they are not at the head.
   * @param {Object} branch Branch node
   * @param {String} commitGuid Guid of the commit we want to update to
   * @private
   */
  async _forceRepairBranch(branch, commitGuid) {
    let finished = branch.headCommitGuid === commitGuid;
    let commitsApplied = 0;
    while (!finished) {
      const response = await this._hfdmClassicClient.getCommitRange({
        branchGuid: branch.guid,
        minCommitGuid: branch.headCommitGuid,
        maxCommitGuid: commitGuid,
        limit: 10
      });

      // Queue the creation of the missing commits and wait for them
      for (const commit of response.commits) {
        const createCommitReq = _.pick(commit, ['guid', 'meta', 'changeSet']);
        createCommitReq.parentGuid = branch.headCommitGuid;
        createCommitReq.branchGuid = branch.guid;
        createCommitReq.options = { force: true };
        await this._mhService._commitManager.createCommit(createCommitReq);
        commitsApplied++;
        branch.headCommitGuid = commit.guid;
      }

      finished = branch.headCommitGuid === commitGuid;
    }
    logger.trace(`Applied ${commitsApplied} commits on branch ${branch.guid}`);
  }

  /**
   * Delete a range of local commits between the branch head and the specified commit GUID (exclusive). This is
   * achieved by deleting nodes that were created between the date of the previous commit and the current commit. We
   * can assume that if a node was not affected we can stop the traversal, even if nodes processing order is not
   * guaranteed. That is because if there was a node created further down the traversal, then it is not accessible.
   * @param {Object} branch Branch node
   * @param {String} targetCommitGuid GUID of the commit we want to revert to
   * @return {String} GUID of the head
   * @private
   */
  async _deleteCommitRange(branch, targetCommitGuid) {
    let headCommitGuid = branch.headCommitGuid;
    while (headCommitGuid !== targetCommitGuid) {
      let commitNode;
      try {
        commitNode = await this._mhService.getCommit(headCommitGuid);
      } catch (err) {
        if (err instanceof OperationError && err.statusCode === HTTPStatus.NOT_FOUND) {
          // We are deleting a commit but we have no reference to its tree.
          // To make things worse, we don't even have the parent commit.
          // The best we can do is just skip right to the head in HFDM Classic.
          logger.trace(`Cannot delete commits beyond '${headCommitGuid}' due to inconsistencies in branch ` +
            branch.guid);
          headCommitGuid = targetCommitGuid;
          break;
        } else {
          // Some other error we didn't expect occurred. Re-throw.
          throw err;
        }
      }

      await this._mhService.deleteCommit(branch.guid, headCommitGuid);
      headCommitGuid = commitNode.commit.parentGuid;
    }
    return headCommitGuid;
  }

  /**
   * Gets the GUID of the latest consistent commit of this branch in window from the given date to the HEAD.
   * Consistency is checked by getting the materialized view, which basically checks that nodes are reachable.
   * This is enough because:
   * - If there was a missing update at some point in the tree, then we would find invalid references.
   * - If there was an extra update, then it would not be reachable anyway, so it would not affect consistency.
   * @param {Object} branch Branch node
   * @param {Date} since Date since which commits are checked
   * @return {String} Guid of the last consistent commit
   * @private
   */
  async _getLatestConsistentCommit(branch, since) {
    let headCommitGuid = branch.headCommitGuid;
    let consistentCommitGuid;
    let commitDate = new Date(MAX_DATE);
    let consecutiveConsistentCommits = 0;
    while (!consistentCommitGuid || (consecutiveConsistentCommits < CONSISTENT_COMMIT_LIMIT && commitDate >= since)) {
      // Are we at the root of this branch?
      if (headCommitGuid === branch.rootCommitGuid) {
        // Can't go back any further
        // However, we still need to check that the root commit is consistent
        try {
          await this._mhService.getCommitMV({ guid: headCommitGuid, fetchSchemas: true, branchGuid: branch.guid });
          if (!consistentCommitGuid) {
            consistentCommitGuid = headCommitGuid;
          }
        } catch (err) {
          if (err instanceof OperationError && err.statusCode === HTTPStatus.NOT_FOUND) {
            // It is not consistent. We need to create it again, but it's easier to recreate the branch.
            // Check if the commit exists on HFDM. If it does, then it belongs to another branch,
            // so we shouldn't delete it.
            logger.trace(`Root commit '${headCommitGuid}' is inconsistent for branch '${branch.guid}'. Re-creating.`);
            try {
              await this._hfdmClassicClient.getCommit({
                branchGuid: branch.guid,
                commitGuid: branch.rootCommitGuid
              });
            } catch (err2) {
              if (err2 instanceof OperationError && err2.statusCode === HTTPStatus.NOT_FOUND) {
                // We delete the commit node, so that the branch creation does not think we are branching
                // from an existing commit.
                await this._mhService._storageManager.delete('commit:' + branch.rootCommitGuid);
              } else {
                // Some other error occurred
                throw err2;
              }
            }

            // Delete the branch node so that we can create the branch again
            await this._mhService._storageManager.delete('branch:' + branch.guid);

            // Now we create the branch again so the commit should be recovered
            await this._mhService._branchManager.createBranch({
              guid: branch.guid,
              meta: branch.meta,
              rootCommitGuid: branch.rootCommitGuid,
              created: branch.created
            });

            consistentCommitGuid = headCommitGuid;
          } else {
            // Some other error we didn't expect occurred. Re-throw.
            throw err;
          }
        }
        break;
      }

      let commitNode;
      try {
        commitNode = await this._mhService.getCommit(headCommitGuid);
        commitDate = new Date(commitNode.commit.timestamp);
      } catch (err) {
        if (err instanceof OperationError && err.statusCode === HTTPStatus.NOT_FOUND) {
          // If the commit node can't even be found then the commit is not consistent
          // We need to get the previous commit from HFDM Classic
          logger.trace(`Commit '${headCommitGuid}' node is missing for branch '${branch.guid}'`);
          const commitInfo = await this._hfdmClassicClient.getCommit({
            branchGuid: branch.guid,
            commitGuid: headCommitGuid
          });
          headCommitGuid = commitInfo.commit.parent.guid;
          // We want to redo this commit, so our consistent commit needs to be before this one
          consistentCommitGuid = undefined;
          consecutiveConsistentCommits = 0;
          commitDate = new Date(commitInfo.commit.created);
          continue;
        } else {
          // Some other error we didn't expect occurred. Re-throw.
          throw err;
        }
      }

      // Since checking a commit consistency is about checking every node reference is valid,
      // we can simply ask for the full MV and if it does not fail consider the commit consistent
      try {
        await this._mhService.getCommitMV({ guid: headCommitGuid, fetchSchemas: true, branchGuid: branch.guid });
        if (!consistentCommitGuid) {
          // This is our latest consistent guid
          consistentCommitGuid = headCommitGuid;
        }
        consecutiveConsistentCommits++;
      } catch (err) {
        if (err instanceof OperationError && err.statusCode === HTTPStatus.NOT_FOUND) {
          logger.trace(`Commit '${headCommitGuid}' has an inconsistent tree for branch '${branch.guid}'`);
          // We want to redo this commit, so our consistent commit needs to be before this one
          consistentCommitGuid = undefined;
          consecutiveConsistentCommits = 0;
        } else {
          // Something else happened
          throw err;
        }
      }
      // Continue checking parent if needed
      headCommitGuid = commitNode.commit.parentGuid;
    }

    return consistentCommitGuid;
  }
}

module.exports = RepairManager;
