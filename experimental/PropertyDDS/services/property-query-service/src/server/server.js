/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Service that maintains the materialized history for a branch
 */

const _ = require('lodash');
const BaseServer = require('./utils/base_server');
const BranchAssignations = require('./redis_client/redis_branch_assignations_mh');
//const PSSBranchAssignations = require('hfdm-redis-client').RedisBranchAssignations;
const BranchesController = require('./controllers/branches_controller');
const Discovery = require('./discovery');
const LoadManager = require('./load_manager');
const PSSClient = require('./pss_client');
const { ModuleLogger } = require('@fluid-experimental/property-query')
const RequestSignatureValidator = require('./utils/request_signature_validator');
const { SerializationFactory, NodeDependencyManager, MaterializedHistoryService,
     BackendFactory, BranchWriteQueue, StorageManager } = require('@fluid-experimental/property-query');
const BranchTracker = require('./branch_tracker');
const logger = ModuleLogger.getLogger('HFDM.MaterializedHistoryService.Server');
const settings = require('./utils/server_settings');
const ConsoleUtils = require('@fluid-experimental/property-common').ConsoleUtils;
const MetricsController = require('./controllers/metrics_controller');

/**
 * Health check response HTTP content-type.
 */
let HEALTH_CONTENT_TYPE = {
  'Content-Type': 'application/json'
};

/**
 * Materialized History Service Server
 * @param {object} in_params MaterializedHistoryService parameters
 * @constructor
 */
let Server = function(in_params) {
  let port = in_params.port || settings.get('mh:internal').port;

  if (in_params.port !== settings.get('mh:internal').port) {
    settings.set('mh:internal:port', in_params.port);
  }

  ConsoleUtils.assert(in_params.systemMonitor, 'Missing systemMonitor');
  this._systemMonitor = in_params.systemMonitor;

  // This MHS is an internal service, it doesn't use the common authenticator plugin for authentication.
  // It need to be removed from in_params which will be passed to BaseServer, otherwise the BaseServer
  // will setup the authenticator middleware. But we still need authenticator for construct PSSClient.
  let _authenticator = in_params.authenticator;
  delete in_params.authenticator;

  let params = _.defaults({}, in_params, {
    name: 'HFDM.MaterializedHistoryService.Server',
    port: port,
    basicAuth: {
      username: settings.get('basicAuthName'),
      passwordList: settings.get('basicAuthPasswordList')
    },
    redisConfig: settings.get('hfdmRedis'),
    urlWhiteList: ['/v1/health', '/health', '/logger', '/metrics', '/killswitch', '/v1/system'],
    shortServiceName: 'MH',
    systemMonitor: this._systemMonitor,
    instanceMonitor: in_params.instanceMonitor
  });

  BaseServer.call(this, params);
  this._healthStatusCode = -1;

  // Install the signal handler
  this.installSignalHandler();

  const backendFactory = new BackendFactory({settings});

  // Create a storage backend
  this._storageBackend = backendFactory.getBackend();

  const serializationFactory = new SerializationFactory({settings});

  this._serializer = serializationFactory.getSerializer({settings});

  this._nodeDependencyManager = new NodeDependencyManager();

  /*this._pssBranchAssignations = new PSSBranchAssignations({
    redisSettings: _.defaults(
      settings.get('hfdmRedis') || {}
    )
  });*/
  this._pssClient = new PSSClient({
    branchAssignations: undefined, // TODO: The PSS Client doesn't make sense here...
    brokerId: this.getId(),
    authenticator: _authenticator
  });

  this._branchWriteQueue = new BranchWriteQueue({
    pssClient: this._pssClient
  });

  this._storageManager = new StorageManager({
    backend: this._storageBackend,
    settings: settings,
    serializer: this._serializer
  });

  // Create the actual materialized history service
  this._materializedHistoryService = new MaterializedHistoryService({
    settings,
    storageManager: this._storageManager,
    serializer: this._serializer,
    systemMonitor: this._systemMonitor,
    nodeDependencyManager: this._nodeDependencyManager,
    branchWriteQueue: this._branchWriteQueue
  });

  if (settings.get('enableRedisBranchAssignation') === true) {
    this._branchAssignations = new BranchAssignations({
        redisSettings: _.defaults(
        settings.get('hfdmRedis') || {}
        )
    });
  }

  this._myHostPort = Discovery.discoverMe(settings.get('mh:internal:port'));

  this._branchTracker = new BranchTracker({
    writeQueue: this._branchWriteQueue,
    nodeEventEmitter: this._nodeDependencyManager
  });

  if (settings.get('enableRedisBranchAssignation') === true) {
        this._loadManager = new LoadManager({
        myHost: `${this._myHostPort.host}:${this._myHostPort.port}`,
        branchAssignations: this._branchAssignations,
        loadUpdateIntervalMs: settings.get('loadUpdateIntervalMs'),
        inactivityTimeoutMs: settings.get('defaultBranchPurgeTimeout'),
        loadShedding: settings.get('mh:loadShedding'),
        branchTracker: this._branchTracker,
        storageManager: this._storageManager
        });
  }

  this._requestSignatureValidator = new RequestSignatureValidator({
    enableRequestSigning: settings.get('materializedHistoryService:enableRequestSigning'),
    requestSigningKeys: settings.get('materializedHistoryService:requestSigningKeys'),
    signatureToleranceMsec: settings.get('materializedHistoryService:signatureToleranceMsec'),
    supportedSignatureAlgos: settings.get('materializedHistoryService:supportedSignatureAlgos')
  });
};

Server.prototype = Object.create(BaseServer.prototype);

/**
 * Override the BaseServer init function by adding own async initialization
 * @return {Promise} A promise that resolves when the initialization is done
 */
Server.prototype.init = async function() {
  await BaseServer.prototype.init.call(this);
  if (settings.get('enableRedisBranchAssignation') === true) {
      await this._branchAssignations.connect();
  }
  //await this._pssBranchAssignations.connect();
  await this._pssClient.registerBroker();
  await this._materializedHistoryService.init();

  this._app.use((err, _req, res, next) => {
    // Errors in range [400 - 500] do not typically end up in _app.use
    // because they are usually handled by controllers
    // For all the rest we will log them until we can filter them out
    if (!err.status || err.status < 400 || err.status > 500) {
      logger.error(err);
    }
    // Do not send stack trace to clients
    if (err.stack) {
      delete err.stack;
    }
    if (err && err.toString().startsWith('PayloadTooLargeError')) {
      res.status(413).json({ message: 'PayloadTooLargeError: request entity too large' });
    } else if (err instanceof SyntaxError && err.status >= 400 && err.status < 500 &&
      err.message.indexOf('JSON')) {
      res.status(400).json({ message: 'Invalid JSON payload' });
    } else {
      // This will use express default error handler
      // If the code didn't treat errors right, it will end up here and won't be logged
      next(err);
    }
  });

  this._branchesController = new BranchesController({
    app: this._app,
    server: this,
    materializedHistoryService: this._materializedHistoryService,
    requestSignatureValidator: this._requestSignatureValidator,
    pssClient: this._pssClient,
    branchTracker: this._branchTracker,
    branchWriteQueue: this._branchWriteQueue,
    myHostPort: `${this._myHostPort.host}:${this._myHostPort.port}`,
    systemMonitor: this._systemMonitor
  });

  if (settings.get('enableRedisBranchAssignation') === true) {
    this._metrics = {
        load: { metricName: 'MH_load', getValue: () => this._loadManager._calculateLoad() }
    };
  } else {
    this._metrics = {
        load: { metricName: 'MH_load', getValue: () => -1 }
    };
  }

  this._metricsController = new MetricsController({
    app: this._app,
    metric: this._metrics.load
  });

  logger.info('Materialized History Service initialization completed');
  this._fetchHealth();

  if (settings.get('enableRedisBranchAssignation') === true) {
    await this._loadManager.init();
  }

  // At this point the server is healthy
  this._status = 'passed';

  // TODO ESLINT: only needed for eslint 4.19.1.
  // Will be removed once mono repo is migrated to eslint ^5.0.0
  return Promise.resolve();
};

/**
 * Override the BaseServer term function
 * @return {Promise} A promise that resolves when the termination is done
 */
Server.prototype.term = async function() {
  logger.info('Materialized History Service terminating');

  await this.close();
  clearTimeout(this._healthTimeout);
  await Promise.all([
    settings.get('enableRedisBranchAssignation') === true ? this._loadManager.tearDown() : Promise.resolve(),
    this._materializedHistoryService.stop(),
    this._pssClient.unregisterBroker()
  ]);
  if (settings.get('enableRedisBranchAssignation') === true) {
    await this._branchAssignations.disconnect();
  }

  await BaseServer.prototype.term.call(this);
  logger.info('Materialized History Service termination completed');

  // TODO ESLINT: only needed for eslint 4.19.1.
  // Will be removed once mono repo is migrated to eslint ^5.0.0
  return Promise.resolve();
};

Server.prototype._fetchHealth = function() {
  let statusCode = 200;

  this._healthResult = _.extend(
    this.getBasicHealth(),
    {
      status: this._healthResult === -1 ? 'failed' : 'passed',
      errors: []
    }
  );
  this._healthStatusCode = statusCode;
  this._healthTimeout = setTimeout(this._fetchHealth.bind(this), settings.get('mh:health_polling_interval'));

  return {
    result: this._healthResult,
    statusCode: this._healthStatusCode
  };
};

/**
 * Get the health of the server.
 * @param {Object} req request
 * @param {ServerResponse} res The HTTP server response object.
 *   On success, the health check returns 'OK'. If the health check fails, it returns a JSON
 *   object containing details.
 */
Server.prototype.getHealth = function(req, res) {
  if (this._healthStatusCode === -1) {
    this._fetchHealth()
      .then((healthResult) => {
        res.writeHead(healthResult.statusCode, HEALTH_CONTENT_TYPE );
        res.write(JSON.stringify(healthResult.result));
        res.end();
      });
  } else {
    res.writeHead(this._healthStatusCode, HEALTH_CONTENT_TYPE);
    res.write(JSON.stringify(this._healthResult));
    res.end();
  }
};

module.exports = Server;
