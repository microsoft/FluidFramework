/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');
const { ModuleLogger } = require('@fluid-experimental/property-query')
let logger = ModuleLogger.getLogger('HFDM.MaterializedHistoryServer.LoadManager');

const MILLIS = 1e3;
const MICROS = 1e6;

/**
 * A class that manages the load of this instance in the Branch Assignation store
 */
class LoadManager {

  /**
   * Constructor for the LoadManager
   * @param {Object} in_params - Input parameters
   * @param {String} in_params.myHost - The host to register to
   * @param {BranchAssignations} in_params.branchAssignations - A BranchAssignations instance
   * @param {Number} in_params.loadUpdateIntervalMs - Interval for which to update the load
   * @param {Number} in_params.inactivityTimeoutMs - Time after which a formerly active branch is considered inactive
   * @param {BranchTracker} in_params.branchTracker - Provides branch usage information
   * @param {Object} in_params.loadShedding - Special parameters that determine the behavior
   * @param {Number} in_params.loadShedding.cpuThreshold - CPU usage that is considered too high
   * @param {Number} in_params.loadShedding.windowSize - Number of measures to consider CPU usage consistently high
   * @param {Number} in_params.loadShedding.cooldownFactor - Number of windows to cooldown after load shedding
   * @param {Number} in_params.storageManager - Storage Manager instance
   */
  constructor(in_params = {}) {
    this._myHost = in_params.myHost;
    this._branchAssignations = in_params.branchAssignations;
    this._loadUpdateIntervalMs = in_params.loadUpdateIntervalMs;
    this._inactivityTimeoutMs = in_params.inactivityTimeoutMs;
    this._branchTracker = in_params.branchTracker;
    this._loadMeasures = [];
    this._loadShedding = _.defaults(in_params.loadShedding || {}, {
      cpuThreshold: 80,
      windowSize: 5,
      cooldownFactor: 10
    });
    this._storageManager = in_params.storageManager;
    this._resetLoadShedCooldown();
  }

  /**
   * Initializes the background update process
   * @return {Promise} - Resolves when the load is defined for the first time
   */
  init() {
    this._updateInterval = setInterval(this._updateLoad.bind(this), this._loadUpdateIntervalMs);
    this._lastSample = process.cpuUsage();
    return this._updateLoad();
  }

  /**
   * Resets cooldown related to high load shedding
   * @private
   */
  _resetLoadShedCooldown() {
    this._loadShedCooldown = Math.floor(Math.random() * this._loadShedding.cooldownFactor *
      this._loadShedding.windowSize);
  }

  /**
   * Updates the load
   */
  async _updateLoad() {
    let load = this._calculateLoad();
    logger.trace('Updating the load for this instance, setting load as', load);

    try {
      this._branchAssignations.upsertMhInstance(this._myHost, load);
    } catch (err) {
      logger.warn('Failed updating the load for this instance', err);
    }

    this._loadMeasures.push(load);
    if (this._loadMeasures.length > this._loadShedding.windowSize) {
      this._loadMeasures.shift();
    }
    if (this._loadShedCooldown > 0) {
      this._loadShedCooldown--;
    }

    // Remove branch assignations in Redis for branches that are inactive
    let minActiveTime;
    try {
      minActiveTime = Date.now() - this._inactivityTimeoutMs;
      const inactive = this._branchTracker.removeInactive(minActiveTime);
      await Promise.all(_.map(inactive, (branchGuid) => {
        this._storageManager.clearCacheForBranch(branchGuid);
        return this._branchAssignations.removeMhInstanceForBranch(branchGuid, this._myHost);
      }));
    } catch (err) {
      logger.warn('Failed to remove inactive branches from Redis', err);
    }

    // Only consider shedding when we are not cooling down from a previous one
    if (this._loadShedCooldown === 0) {
      const average = this._loadMeasures.reduce((acc, current) => acc + current, 0) / this._loadShedding.windowSize;
      if (average > this._loadShedding.cpuThreshold) {
        // There is a consistent high load on this server.
        const overload = average - this._loadShedding.cpuThreshold;
        try {
          // Get the assigned branches and choose one/several for removal from this instance based on priority.
          const sheddable = await this._branchTracker.getSheddable(minActiveTime);
          const branchesToShed = this._getBranchesToShed(overload, sheddable);
          if (branchesToShed.length > 0) {
            logger.info(`Removing branches ['${branchesToShed.join('\', \'')}'] from assignations to shed load`);
            await Promise.all(_.map(branchesToShed, (branchGuid) => {
              this._storageManager.clearCacheForBranch(branchGuid);
              return this._branchAssignations.removeMhInstanceForBranch(branchGuid, this._myHost);
            }));
            // Reset the cooldown to avoid reassigning too much
            this._resetLoadShedCooldown();
          } else {
            logger.warn('No branches to deassign but server continues under heavy load');
          }
        } catch (error) {
          logger.warn('Failed to shed load for this instance', error);
        }
      }
    }
  }

  /**
   * Given the prioritized list of branches assigned to this server and its current server overload, it returns the
   * GUIDs of the branches that should be shedded to bring down CPU utilization within the accepted threshold.
   * The strategy is based on keeping the highest priority branches as long as the shedded load is high enough to make
   * a difference in server load.
   * @param {Number} overload Amount of load over the CPU usage threshold
   * @param {Array<Object>} sheddable Prioritized list of sheddable branches
   * @return {Array<String>} GUIDs of the branches to shed
   * @private
   */
  _getBranchesToShed(overload, sheddable) {
    // Keep at least one branch
    if (sheddable.length <= 1) {
      return [];
    }

    const totalUsage = sheddable.reduce((acc, cur) => acc + cur.priority, 0);
    const loadToShed = totalUsage * (overload / 100);
    let currentLoad = totalUsage;
    let i = sheddable.length - 1;
    do {
      const branch = sheddable[i];
      currentLoad -= branch.priority;
      i--;
    } while (i > 0 && currentLoad >= loadToShed);
    return sheddable.slice(0, i + 1).map((branch) => branch.branchGuid);
  }

  /**
   * Implementation to calculate the load
   * @return {Number} - The calculated load
   */
  _calculateLoad() {
    const cpuSample = process.cpuUsage(this._lastSample);
    this._lastSample = process.cpuUsage();
    const cpuTimeUsed = (cpuSample.user + cpuSample.system) / MICROS;
    const cpuPercentUsed = (cpuTimeUsed * 100) / (this._loadUpdateIntervalMs / MILLIS);

    return Math.ceil(cpuPercentUsed);
  }

  /**
   * Stops updating the load
   */
  async tearDown() {
    logger.info('Unsubscribing this instance from the MH availability registry');
    clearInterval(this._updateInterval);
    await this._branchAssignations.removeMhInstance(this._myHost);
  }
}

module.exports = LoadManager;
