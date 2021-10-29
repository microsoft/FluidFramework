/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const fs = require('fs');
const yargs = require('yargs');
const path = require('path');
const { ModuleLogger } = require('@fluid-experimental/property-query')
const generateGUID = require('@fluid-experimental/property-common').GuidUtils.generateGUID;

const PluginManager = require('../../src/plugins/PluginManager');

const settings = require('../../src/server/utils/server_settings');
const MaterializedHistoryService = require('../../src/materialized_history_service/materialized_history_service');
const BackendFactory = require('../../src/materialized_history_service/storage_backends/backend_factory');
const NodeDependencyManager = require('../../src/materialized_history_service/node_dependency_manager');
const BranchWriteQueue = require('../../src/server/branch_write_queue');
const SerializerFactory = require('../../src/materialized_history_service/serialization/factory');
const StorageManager = require('../../src/materialized_history_service/storage_backends/storage_manager');

let p = settings.get('pluginManager:configPath');
let pluginManager = new PluginManager(path.isAbsolute(p) ? p : path.join(__dirname, '..', '..', p));

PluginManager.instance = {
  systemMonitor: pluginManager.resolve('SystemMonitor').createInstance(settings.get('systemMonitor'),
    ModuleLogger.getLogger('HFDM.MaterializedHistoryService.SystemMonitor'), 'mh', settings.get('stackName'))
};

/**
 * Class in charge of repairing MH for branches given their state in both MHS and HFDM Classic
 */
class BranchDump {
  /**
   * Creates a new instance of the repair manager
   * @param {Object} params Constructor parameters
   * @param {Object} params.mhService Used to read and write MH information
   */
  constructor(params) {
    this._mhService = params.mhService;
  }

  /**
   * Fetches all the nodes and their content for a branch
   * @param {String} branchGuid - Branch to dump
   * @return {Object} - Nodes, by their key and their content
   */
  async fetchNodes(branchGuid) {
    const pseudoTask = {
      taskGuid: generateGUID(),
      branchGuids: [ branchGuid ]
    };
    await this._mhService._deletionManager._scanNodes(pseudoTask);
    let allNodesIds = pseudoTask.nodesToDelete;
    return allNodesIds;
  }
}

const processArgs = function() {
  const argv = yargs.option('branchGuid', {
    alias: 'b',
    description: 'Branch guids to dump',
    type: 'string'
  })
  .option('outputFile', {
    alias: 'o',
    description: 'Output file',
    type: 'string'
  })
  .demandOption(['branchGuid', 'outputFile']).argv;

  return Promise.resolve(argv);
};

let branchDumper;

processArgs().then(async (a) => {
  const factory = new BackendFactory({settings});
  const mhBackend = factory.getBackend();
  const sf = new SerializerFactory({settings});
  const branchWriteQueue = new BranchWriteQueue({
    pssClient: {}
  });

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

  await mhService.init();

  branchDumper = new BranchDump({
    mhService: mhService
  });

  let result = await branchDumper.fetchNodes(a.branchGuid);

  let allNodes = {};

  await Promise.all(result.map(async (r) => {
    let contents =  await mhService._storageManager.get(r);
    allNodes[r] = contents;
  }));

  fs.writeFileSync(a.outputFile, JSON.stringify(allNodes));

});

