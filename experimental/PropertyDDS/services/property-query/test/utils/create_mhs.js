/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const path = require('path');
const PluginManager = require('../../src/plugins/PluginManager');
//const { Settings } = require('hfdm-settings');

const MaterializedHistoryService = require('../../src/materialized_history_service/materialized_history_service');
const BackendFactory = require('../../src/materialized_history_service/storage_backends/backend_factory');
const NodeDependencyManager = require('../../src/materialized_history_service/node_dependency_manager');
const BranchWriteQueue = require('../../src/server/branch_write_queue');
const PSSClient = require('../../src/server/pss_client');
const SerializerFactory = require('../../src/materialized_history_service/serialization/factory');
const StorageManager = require('../../src/materialized_history_service/storage_backends/storage_manager');
const getExpressApp = require('./get_express_app');
const Settings = require('../../src/server/utils/settings');

const createMhs = (settingOverrides) => {
  const settingFiles = [path.join(__dirname, '..', '..', 'config', 'settings.json')];
  const settings = new Settings(settingFiles, settingOverrides);
  const factory = new BackendFactory({
    settings
  });
  const backend = factory.getBackend();
  const sf = new SerializerFactory({
    settings
  });
  const branchWriteQueue = new BranchWriteQueue({
    pssClient: new PSSClient()
  });
  const storageManager = new StorageManager({
    backend: backend,
    settings,
    serializer: sf.getSerializer()
  });
  const mhService = new MaterializedHistoryService({
    app: getExpressApp(),
    settings,
    serializer: sf.getSerializer(),
    systemMonitor: PluginManager.instance.systemMonitor,
    storageManager: storageManager,
    nodeDependencyManager: new NodeDependencyManager(backend),
    branchWriteQueue
  });
  return { mhService, backend };
};

module.exports = createMhs;
