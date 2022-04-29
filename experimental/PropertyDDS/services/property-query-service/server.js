/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const qs = require('qs');
const path = require('path');
const { ModuleLogger } = require('@fluid-experimental/property-query');;
const PluginManager = require('./src/plugins/PluginManager');

const settings = require('./src/server/utils/server_settings');

let p = settings.get('pluginManager:configPath');
let pluginManager = new PluginManager(path.isAbsolute(p) ? p : path.join(__dirname, p));
const InstanceMonitor = pluginManager.resolve('InstanceMonitor');
const Authenticator = pluginManager.resolve('Authenticator');


PluginManager.instance = {
  systemMonitor: pluginManager.resolve('SystemMonitor').createInstance(
    settings.get('systemMonitor'),
    ModuleLogger.getLogger('HFDM.MaterializedHistoryService.SystemMonitor'),
    'mh',
    settings.get('stackName')
  ),
  instanceMonitor: new InstanceMonitor({port: settings.get('mh:internal:port'), shortServiceName: 'MH'}),
  authenticator: new Authenticator()
};
const express = require('express');
const app = express();

app.set('query parser', function(str) {
  return qs.parse(str, { depth: 50 });
});

process.on('unhandledRejection', (err) => {
  console.log('Unhandled promise rejection: ' + err);
  console.log(err.stack);
});

let allowedHeaders = 'user-id, client-id, x-ads-token-data, Origin, X-Requested-With, Content-Type, Accept';
let runningOnCloudOS =
  process.env.hasOwnProperty('APP_MONIKER') &&
  process.env.hasOwnProperty('CLOUDOS_MONIKER');
if (!runningOnCloudOS) {
  // When running locally, add the Authorization header to the list of CORS pre-flight
  // headers that the browser should allow on cross-origin requests. This is only
  // needed for a local deployment when running tests in a Firefox browser because
  // it won't otherwise include the Authorization header which the server needs for
  // authentication and authorization.
  allowedHeaders += ', Authorization';
}

app.use(function(req, res, next) {
  // TODO: How should we configure the CORS headers?
  //       Will this service be called directly by the browser for queries, or will this happen
  //       through Collaboration server?
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', allowedHeaders);
  res.header('Access-Control-Allow-Methods', '');
  next();
});

let promise = new Promise( (resolve, reject) => {
  // This command line switch is used in the Dockerfile. It's a quick validation of the server
  if (process.argv.includes('--checkOnly')) {
    console.log('Detected --checkOnly. Exiting...');
    process.exit(0);
  }

  // Start the server
  let Server = require('./src/server/server');
  let materializedHistoryServer = new Server({ // eslint-disable-line no-unused-vars
    app: app,
    systemMonitor: PluginManager.instance.systemMonitor,
    instanceMonitor: PluginManager.instance.instanceMonitor,
    authenticator: PluginManager.instance.authenticator
  });

  materializedHistoryServer.start().then(() => resolve(materializedHistoryServer)).catch(reject);
});

module.exports = promise;
