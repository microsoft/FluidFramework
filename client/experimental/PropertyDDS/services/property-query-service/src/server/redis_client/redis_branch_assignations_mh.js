/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
let HfdmRedisClient = require('./hfdm_redis_client');
const deploy = require('./deploy');
const { ModuleLogger } = require('@fluid-experimental/property-query')
let logger = ModuleLogger.getLogger('HFDM.Redis.HfdmRedisClient');
let fs = require('fs');
let path = require('path');
const _ = require('lodash');

const MH_INSTANCES_SET = '{BAMH}:MH_INSTANCES';
const MHUSER_INSTANCES_SET = '{BAMH}:MHUSER_INSTANCES:';
const MH_BRANCH_ASSIGNATIONS_HMAP = '{BAMH}:MH_BRANCH_ASSIGNATIONS';
const MHUSER_MH_FAILURE_SET = '{BAMH}:MHUSER_MH_FAILURES:';
const MH_INSTANCES_EVICTING_SET = '{BAMH}:MH_INSTANCES_DYING';

const SHARDING_PREFIX = 'BAMH';

/**
* Constructor for the Redis BranchAssignations PubSub
* @param {object} in_params - Input settings
* @param {object} in_params.redisSettings - Connection parameters to pass to the underlying ioredis driver
* @this RedisBranchAssignationsMH
*/
let RedisBranchAssignationsMH = function(in_params) {
  this._hfdmRedisClient = new HfdmRedisClient(in_params.redisSettings);
  this._currentFailureMaps = {};
  this._disconnect = this.disconnect.bind(this);

  Object.defineProperty(this, 'client', {
    /**
     * @return {HFDM.Redis.HfdmRedisClient} The redis client instance.
     */
    get: function() {
      return this._hfdmRedisClient;
    }
  });
};

const luaProcFolder = path.join(__dirname, 'resources');

const luaProcs = {
  getMhInstanceForBranch: fs.readFileSync(path.join(luaProcFolder, 'get_mh_instance_for_branch.lua')),
  removeMhInstance: fs.readFileSync(path.join(luaProcFolder, 'remove_mh_instance.lua')),
  reportMhFailure: fs.readFileSync(path.join(luaProcFolder, 'report_mh_failure.lua')),
  confirmMhEviction: fs.readFileSync(path.join(luaProcFolder, 'confirm_mh_eviction.lua')),
  upsertMhInstance: fs.readFileSync(path.join(luaProcFolder, 'upsert_mh_instance.lua')),
  upsertMhUserInstance: fs.readFileSync(path.join(luaProcFolder, 'upsert_mh_user_instance.lua')),
  markMhInstanceShuttingDown: fs.readFileSync(path.join(luaProcFolder, 'mark_mh_instance_shuttingdown.lua')),
  removeMhInstanceForBranch: fs.readFileSync(path.join(luaProcFolder, 'remove_mh_instance_for_branch.lua'))
};

/**
* Exposes a method to connect to Redis
* @this RedisBranchAssignationsMH
* @return {Promise} - Resolved when the connection is established
*/
RedisBranchAssignationsMH.prototype.connect = function() {
  process.on('exit', this._disconnect);
  return this.client.connect()
    .then(() => {
      this.client.defineCommand(
        'getMhInstanceForBranch', {
          numberOfKeys: 1,
          lua: luaProcs.getMhInstanceForBranch
        });

      this.client.defineCommand(
        'removeMhInstance', {
          numberOfKeys: 1,
          lua: luaProcs.removeMhInstance
        });

      this.client.defineCommand(
        'reportMhFailure', {
          numberOfKeys: 1,
          lua: luaProcs.reportMhFailure
        });

      this.client.defineCommand(
        'confirmMhEviction', {
          numberOfKeys: 1,
          lua: luaProcs.confirmMhEviction
        });

      this.client.defineCommand(
        'upsertMhInstance', {
          numberOfKeys: 1,
          lua: luaProcs.upsertMhInstance
        });

      this.client.defineCommand(
        'upsertMhUserInstance', {
          numberOfKeys: 1,
          lua: luaProcs.upsertMhUserInstance
        });

      this.client.defineCommand(
        'markMhInstanceShuttingDown', {
          numberOfKeys: 1,
          lua: luaProcs.markMhInstanceShuttingDown
        });

      this.client.defineCommand(
        'removeMhInstanceForBranch', {
          numberOfKeys: 1,
          lua: luaProcs.removeMhInstanceForBranch
        });
    });
};

/**
* Exposes a method to disconnect from Redis
* @this RedisBranchAssignationsMH
* @return {Promise} - Resolved when the disconnection is completed
*/
RedisBranchAssignationsMH.prototype.disconnect = function() {
  process.removeListener('exit', this._disconnect);
  return this.client.disconnect().catch(e => logger.error(e.toString()));
};

/**
* (Re)Defines a MH instance that is available to serve branches
* @param {string} host - The base url for the MH
* @param {number} load - A number representing the load
* @this RedisBranchAssignations
* @return {Promise} - Resolved the instance is upserted with its load
*/
RedisBranchAssignationsMH.prototype.upsertMhInstance = function(host, load) {
  return this.client.upsertMhInstance(SHARDING_PREFIX, host, load);
};

/**
  * Marks an instance as shutting down
  * @param {string} host - The base url for the MH
  * @this RedisBranchAssignationsMH
  * @return {Promise} - Resolved when completed
  */
RedisBranchAssignationsMH.prototype.markMhInstanceShuttingDown = function(host) {
  return this.client.markMhInstanceShuttingDown(SHARDING_PREFIX, host);
};

/**
* Registers a MH User instance within the assignations system.  It is used for
* MH availability voting majority.   Call me every minute before second 10
* @param {string} mhUserId - A unique id for a MH user
* @this RedisBranchAssignationsMH
* @return {Promise<String>} - Resolves to the upserted key
*/
RedisBranchAssignationsMH.prototype.upsertMhUserInstance = async function(mhUserId) {
  let nowDate = Date.now();
  let thisMinute = nowDate - (nowDate % (1000 * 60));
  let theKey = `${MHUSER_INSTANCES_SET}${thisMinute}`;
  let expiry = (thisMinute / 1000) + 120; // Set the expiry to be 2 minutes after this minute

  await this.client.upsertMhUserInstance(SHARDING_PREFIX, theKey, mhUserId, expiry);
  return theKey;
};

/**
* Lazy assigns a MH instance to a branch
* @param {string} branchId - Branch Id for which to get the assignation
* @this RedisBranchAssignationsMH
* @return {Promise} - Resolved with the MH host to handle the branch
*/
RedisBranchAssignationsMH.prototype.getMhInstanceForBranch = function(branchId) {
  // Try and hit out of the stored proc.  This will allow us using a replica,
  // as LUA scripts need to hit the master at all times.
  return this.client.hget(MH_BRANCH_ASSIGNATIONS_HMAP, branchId)
    .then(result => {
      if (result === null) {
        return this.client.getMhInstanceForBranch(SHARDING_PREFIX, branchId)
        .then(mhId => {
          if (!mhId) {
            throw new Error('No MH instance available. Try again later.');
          }
          logger.debug(`getMhInstanceForBranch returns branch ${branchId} -> ${mhId} from LUA script`);
          return mhId;
        });
      }
      logger.debug(`getMhInstanceForBranch returns branch ${branchId} -> ${result} from map`);
      return result;
    });
};

/**
* Assigns a MH instance to a branch
* @param {string} branchId - Branch Id for which to assign a MH
* @param {string} mhId - Identifier for the MH
* @this RedisBranchAssignationsMH
* @return {Promise} - Resolved when MH is assigned to the branch
*/
RedisBranchAssignationsMH.prototype.setMhInstanceForBranch = function(branchId, mhId) {
  logger.debug(`setMHInstanceForBranch sets branch ${branchId} -> ${mhId}`);
  return this.client.hset(MH_BRANCH_ASSIGNATIONS_HMAP, branchId, mhId);
};

/**
* Removes the MH assignation for a branch
* If mhId is passed, the removal will only occur if the assigned MH is the one passed
* @param {string} branchId - Branch Id for which to get the assignation
* @param {string?} mhId - MHId for which the branch is expected to be assigned
* @this RedisBranchAssignationsMH
* @return {Promise} - Resolved when the assignation is removed
*/
RedisBranchAssignationsMH.prototype.removeMhInstanceForBranch = function(branchId, mhId) {
  if (!mhId) {
    logger.debug(`removeMhInstanceForBranch removes branch ${branchId}`);
    return this.client.hdel(MH_BRANCH_ASSIGNATIONS_HMAP, branchId);
  } else {
    logger.debug(`removeMhInstanceForBranch removes branch ${branchId} for ${mhId}`);
    return this.client.removeMhInstanceForBranch(SHARDING_PREFIX, branchId, mhId);
  }
};

/**
 * Returns all the branches assigned to the specified host.
 * @param {String} mhId - Host to get the assigned branches for
 * @this RedisBranchAssignationsMH
 * @return {Promise} Resolves to an array with the branch ids assigned to the host
 */
RedisBranchAssignationsMH.prototype.getMhBranchesForInstance = function(mhId) {
  return this.client.hgetall(MH_BRANCH_ASSIGNATIONS_HMAP).then((allEntries) => {
    const result = [];
    _.each(allEntries, (value, key) => {
      if (value === mhId) {
        result.push(key);
      }
    });
    return result;
  });
};

/**
* Removes the MH instance with all its assignations
* @param {string} mhId - Identifier for the PSS
* @this RedisBranchAssignationsMH
* @return {Promise} - Resolved when the instance is removed
*/
RedisBranchAssignationsMH.prototype.removeMhInstance = function(mhId) {
  logger.debug(`removeMhInstance removes MH Id ${mhId}`);
  return this.client.removeMhInstance(SHARDING_PREFIX, mhId);
};

/**
* Reports a failure for a MH by a MH User
* @param {string} branchId - Id of the branch
* @param {string} mhId - Identifier for the MH
* @param {string} mhUserId - MHUser reporting failure
* @param {Number?} thisMinute - Second based timestamp, rounded to the minute
* @param {Number?} currentSecond - Current second of the minute
* @this RedisBranchAssignations
* @return {Promise} - Resolved with null if no majority was reached for this instance
*   or with a new MH id to handle the branch.  If no majority was reached, the MH user
*   must retry.
*/
RedisBranchAssignationsMH.prototype.reportFailure = function(branchId, mhId, mhUserId, thisMinute, currentSecond) {
  let nowDate = Date.now();

  // In green the eviction process is turned off for now. Will probably want to count the eviction
  // at some point and have a way to figure out if a server was evicted during a blue/green deployment.
  if (deploy.isGreen()) {
    logger.error(`server ${mhId} reported as failing in green mode for branch ${branchId}`);
    return Promise.resolve();
  }

  thisMinute = thisMinute !== undefined ?
    thisMinute :
    nowDate - (nowDate % (1000 * 60));

  currentSecond = currentSecond !== undefined ?
    currentSecond :
    (nowDate % (1000 * 60) - nowDate % 1000) / 1000;

  if (this._currentFailureMaps[mhUserId] === undefined) {
    this._currentFailureMaps[mhUserId] = {};
  }

  this._currentFailureMaps[mhUserId][mhId] = true;

  return this.client.reportMhFailure(SHARDING_PREFIX, branchId || '', mhId, mhUserId, thisMinute, currentSecond);
};

/**
* Resets the failure of a MH by a MHUser if marked as failed
* @param {string} mhId - Identifier for the MH
* @param {string} mhUserId - MHUser reporting failure
* @this RedisBranchAssignationsMH
* @return {Promise} - Promise that resolves on reset
*/
RedisBranchAssignationsMH.prototype.resetFailure = function(mhId, mhUserId) {
  if (this._currentFailureMaps[mhUserId] && this._currentFailureMaps[mhUserId][mhId]) {
    delete this._currentFailureMaps[mhUserId][mhId];
    return this.client.srem(`${MHUSER_MH_FAILURE_SET}${mhId}`, mhUserId);
  }
  return Promise.resolve();
};

/**
* Returns a list of all active PSS
* @this RedisBranchAssignationsMH
* @return {Promise} - Returns an array of strings, represting the PSS instances
*/
RedisBranchAssignationsMH.prototype.getActiveMh = function() {
  return this.client.zrange(MH_INSTANCES_SET, 0, -1);
};

/**
* Confirms the eviction for a PSS
* @this RedisBranchAssignationsMH
* @param {String} mhInstance - The ip:port of an instance
* @return {Promise} - Resolves when the eviction is confirmed
*/
RedisBranchAssignationsMH.prototype.confirmMhEviction = function(mhInstance) {
  return this.client.confirmMhEviction(SHARDING_PREFIX, mhInstance);
};

/**
* Retrieves all the instances to be killed
* @this RedisBranchAssignations
* @return {Promise} - Resolves with an array of ip:port
*/
RedisBranchAssignationsMH.prototype.getMhEvictingInstances = function() {
  return this.client.smembers(MH_INSTANCES_EVICTING_SET);
};

module.exports = RedisBranchAssignationsMH;
