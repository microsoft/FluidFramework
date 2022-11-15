/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const RedisBranchAssignationsMH = require('hfdm-redis-client').RedisBranchAssignationsMH;
const settings = require('../src/server/utils/server_settings');

let branchAssignationsMH = new RedisBranchAssignationsMH({
  redisSettings: settings.get('hfdmRedis')
});
let branchGuid;

const processArgs = function() {
  const printUsageAndExit = function() {
    console.log('Usage: node get_mh_instance_for_branch.js "<BRANCH_GUID>"');
    process.exit(1);
  };
  if (process.argv.length < 3) {
    printUsageAndExit();
  }

  branchGuid = process.argv[2];
  return Promise.resolve();
};

const init = function() {
  return branchAssignationsMH.connect();
};

const doWork = async function() {
  const instance = await branchAssignationsMH.getMhInstanceForBranch(branchGuid);
  console.log(`Assigned instance: ${instance}`);
};

const stop = function() {
  return branchAssignationsMH.disconnect();
};

processArgs().then(
  init
).then(
  doWork
).then(
  stop
).then(() => {
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
