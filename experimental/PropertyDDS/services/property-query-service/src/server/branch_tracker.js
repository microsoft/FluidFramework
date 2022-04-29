/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');

/**
 * Keeps track of which branches are being used and which are not.
 */
class BranchTracker {
  /**
   * Constructor of this class
   * @param {Object} params Parameters to initialize this instance
   * @param {BranchWriteQueue} params.writeQueue Queue that handles writes for branches
   * @param {EventEmitter} params.nodeEventEmitter Emits events related to branch activity
   */
  constructor(params) {
    this._writeQueue = params.writeQueue;
    this._nodeEventEmitter = params.nodeEventEmitter;
    this._nodeEventEmitter.on('sessionEventQueued', this._countNodeEventForBranch.bind(this));

    this._branchUsage = {};
  }

  /**
   * Gives a list of all the branches that have not been accessed since the specified date. These are also removed
   * from the internal tracker collection. Branches that are being written to are not considered.
   * @param {Number} since Minimum date to consider a branch as still used.
   * @return {Array<String>} GUIDs of branches that are inactive.
   */
  removeInactive(since) {
    const inactive = [];
    _.each(this._branchUsage, (branchUsage, branchGuid) => {
      // Remove old usages for all branches
      const removeCount = _.sortedIndex(branchUsage, since);
      branchUsage.splice(0, removeCount);

      if (!(branchUsage[branchUsage.length - 1] >= since) && !this._writeQueue.isProcessing(branchGuid)) {
        inactive.push(branchGuid);
        delete this._branchUsage[branchGuid];
      }
    });
    return inactive;
    // const inactive = _.pickBy(this._branchUsage, (branchUsage, branchGuid) => {
    //   return branchUsage[branchUsage.length - 1] < since && !this._writeQueue.isProcessing(branchGuid);
    // });
    // _.each(inactive, (branchUsage, branchGuid) => delete this._branchUsage[branchGuid]);
    // return Object.keys(inactive);
  }

  /**
   * Returns a list of branches that may be shedded from this instance.
   * These are sorted by priority, based on number of uses and how recent those were. Low priority branches go first.
   * Branches that are currently being written to are excluded from the result.
   * @param {Number} since Minimum date to count a branch usage.
   * @return {Array<Object>} Branches that may be safely deassigned from this instance, ordered by priority.
   * - branchGuid: GUID of this branch
   * - priority: Numeric value that defines usage. The higher the number, the more and more recently used the branch.
   */
  getSheddable(since) {
    const branchPriority = [];
    let sheddable = _.pickBy(this._branchUsage, (bu, branchGuid) => !this._writeQueue.isProcessing(branchGuid));
    for (const branchGuid of Object.keys(sheddable)) {
      const priority = sheddable[branchGuid].reduce((acc, cur) => acc + (Math.max(cur - since, 0)), 0);
      branchPriority.splice(_.sortedIndexBy(branchPriority, priority, 'priority'), 0, { branchGuid, priority });
    }
    return branchPriority;
  }

  /**
   * Counts node events for branches to have an estimate of their workload.
   * @param {Object} session Contains information about the session that queued the event
   * @private
   */
  _countNodeEventForBranch(session) {
    const branchGuid = session.branchGuid;
    if (!this._branchUsage[branchGuid]) {
      this._branchUsage[branchGuid] = [];
    }
    this._branchUsage[branchGuid].push(Date.now());
  }
}

module.exports = BranchTracker;
