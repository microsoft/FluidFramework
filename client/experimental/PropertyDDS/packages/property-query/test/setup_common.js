/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// Export modules to global scope as necessary (only for testing)
const path = require('path');
const chai = require('chai');
const sinonChai = require('sinon-chai');
const chaiAsPromised = require('chai-as-promised');
/*const {ddbSettings} = require('hfdm-dynamodb-store');
const ddbEndpoint = require('hfdm-private-tools').getDDBEndpoint();
const s3Endpoint = require('hfdm-private-tools').getS3Endpoint();
const redisConfig = require('hfdm-private-tools').getRedisConfig();*/
const ModuleLogger = require('../src/utils/module_logger');

global.targets = {};
//global.targets.ddbEndpoint = ddbEndpoint;
//global.targets.s3Endpoint = s3Endpoint;
//ddbSettings.set('hfdmRedis', redisConfig);
//ddbSettings.set('store-dynamodb:aws:endpoint', ddbEndpoint);
//ddbSettings.set('s3Store:config:endpoint', s3Endpoint);
//ddbSettings.set('binary:s3:endpoint', s3Endpoint);

// const settings = require('../src/server/utils/server_settings');
/*settings.set('hfdmRedis', redisConfig);
settings.set('store-dynamodb:aws:endpoint', ddbEndpoint);
settings.set('s3Store:config:endpoint', s3Endpoint);
settings.set('binary:s3:endpoint', s3Endpoint);*/


global.expect = chai.expect;
global.assert = chai.assert;
global.should = chai.should();
chai.use(sinonChai);
chai.use(chaiAsPromised);

global.PropertyFactory = require('@fluid-experimental/property-properties').PropertyFactory;

[
  'HFDM.Redis.HfdmRedisClient',
  'HFDM.ServerUtils.BaseServer',
  'HFDM.PropertyGraphStore.DynamoDB',
  'HFDM.PropertyGraph.BasePropertyGraph',
  'HFDM.MaterializedHistoryServer.LoadManager',
  'HFDM.MaterializedHistoryService.Server',
  'HFDM.Utils.RequestUtils'
].forEach((loggerName) => {
  ModuleLogger.getLogger(loggerName).setLevel('OFF');
});

//const PluginManager = require('../src/plugins/PluginManager');

/*let p = settings.get('pluginManager:configPath');
let pluginManager = new PluginManager(path.isAbsolute(p) ? p : path.join(__dirname, '../', p));
const Authenticator = pluginManager.resolve('Authenticator');
const Authorizer = pluginManager.resolve('Authorizer');

PluginManager.instance = {
  systemMonitor: pluginManager.resolve('SystemMonitor').createInstance(settings.get('systemMonitor'),
  ModuleLogger.getLogger('HFDM.MaterializedHistoryService.SystemMonitor'), 'test_mh', 'test_mh'),
  authenticator: new Authenticator(),
  authorizer: new Authorizer()
};*/
