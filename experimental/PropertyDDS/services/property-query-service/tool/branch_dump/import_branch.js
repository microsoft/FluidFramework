/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const fs = require('fs');
const yargs = require('yargs');
const path = require('path');
const _ = require('lodash');
const { ModuleLogger } = require('@fluid-experimental/property-query')

const PluginManager = require('../../src/plugins/PluginManager');

const settings = require('../../src/server/utils/server_settings');
const BackendFactory = require('../../src/materialized_history_service/storage_backends/backend_factory');
const SerializerFactory = require('../../src/materialized_history_service/serialization/factory');
const StorageManager = require('../../src/materialized_history_service/storage_backends/storage_manager');

let p = settings.get('pluginManager:configPath');
let pluginManager = new PluginManager(path.isAbsolute(p) ? p : path.join(__dirname, '..', '..', p));

PluginManager.instance = {
  systemMonitor: pluginManager.resolve('SystemMonitor').createInstance(settings.get('systemMonitor'),
    ModuleLogger.getLogger('HFDM.MaterializedHistoryService.SystemMonitor'), 'mh', settings.get('stackName'))
};

const processArgs = () => {
  const argv = yargs.option('inputFile', {
    alias: 'i',
    description: 'Input file',
    type: 'string'
  })
  .demandOption(['inputFile']).argv;

  return Promise.resolve(argv);
};

processArgs().then(async (a) => {
  const factory = new BackendFactory({settings});
  const mhBackend = factory.getBackend();
  const sf = new SerializerFactory({settings});

  const storageManager = new StorageManager({
    backend: mhBackend,
    settings: settings,
    serializer: sf.getSerializer()
  });

  await storageManager.init();

  const nodes = JSON.parse(fs.readFileSync(a.inputFile, 'utf8'));
  const batch = storageManager.startWriteBatch();
  _.each(nodes, (value, key) => {
    storageManager.store(batch, key, JSON.stringify(value));
  });
  await storageManager.finishWriteBatch(batch);
});
