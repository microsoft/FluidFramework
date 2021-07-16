/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const yargs = require('yargs');
const PluginManager = require('../../src/plugins/PluginManager');

const settings = require('../../src/server/utils/server_settings');
const MaterializedHistoryService = require('../../src/materialized_history_service/materialized_history_service');
const BackendFactory = require('../../src/materialized_history_service/storage_backends/backend_factory');
const StorageManager = require('../../src/materialized_history_service/storage_backends/storage_manager');
const NodeDependencyManager = require('../../src/materialized_history_service/node_dependency_manager');
const BranchWriteQueue = require('../../src/server/branch_write_queue');
const SerializerFactory = require('../../src/materialized_history_service/serialization/factory');

const HfdmClassicClient = require('./dynamo_db_hfdm_classic_client');
const RepairManager = require('./repair_manager');

let repairManager;
let recoveryDate = new Date();
let dop = 1;

const processArgs = function() {
  const argv = yargs.option('since', {
    alias: 's',
    description: 'Date/time since when branches that were modified will be checked',
    type: 'string'
  }).option('dop', {
    alias: 'p',
    description: 'Maximum number of branches that will be checked in parallel',
    'default': 1,
    type: 'number'
  }).coerce('since', (value) => {
    const date = new Date(value);
    if (isNaN(date)) {
      throw new Error('The provided value is not a valid ISO date/time');
    }
    return date;
  }).demandOption(['since']).argv;

  recoveryDate = argv.since;
  dop = argv.dop;

  return Promise.resolve();
};

const init = async function() {
  const hfdmClassicClient = new HfdmClassicClient();
  const branchWriteQueue = new BranchWriteQueue({
    pssClient: hfdmClassicClient
  });
  const factory = new BackendFactory({settings});
  const mhBackend = factory.getBackend();
  const sf = new SerializerFactory({settings});

  const storageManager = new StorageManager({
    backend: mhBackend,
    settings: settings,
    serializer: sf.getSerializer()
  });

  const mhService = new MaterializedHistoryService({
    settings,
    serializer: sf.getSerializer(),
    systemMonitor: PluginManager.instance.systemMonitor,
    storageManager: storageManager,
    nodeDependencyManager: new NodeDependencyManager(mhBackend),
    branchWriteQueue
  });
  repairManager = new RepairManager({
    mhService,
    hfdmClassicClient
  });
  await repairManager.init();
};

const stop = async function() {
  await repairManager.stop();
};

const doWork = async function() {
  await repairManager.scanAndRepairBranches({
    lastModifiedSince: recoveryDate,
    dop
  });
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
