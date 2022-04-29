/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-use-before-define */
/**
 * BaseServer class packaging common server code
 * @fileoverview
 */
const errorMiddlewareFactory = require('./middlewares/error');
const basicAuthMiddlewareFactory = require('./middlewares/basicauth').middlewareFactory;
const ConnectionManager = require('./connection_manager');
const defaultInstanceMonitor = {
  publish: () => Promise.resolve(),
  getDefinition: () => { return {}; },
  noop: () => { return Promise.resolve(); }
};

(function() {
  var EventEmitter = require('events').EventEmitter,
      express = require('express'),
      http = require('http'),
      url = require('url'),
      path = require('path'),
      _ = require('lodash'),
      settings = require('./server_settings'),
      generateGUID = require('@fluid-experimental/property-common').GuidUtils.generateGUID,
      Metrics = require('./metrics'),
      { ModuleLogger } = require('@fluid-experimental/property-query'),
      isPortFree = require('./is_port_free'),
      LoggerController = require('./logger_controller'),
      PendingRequestTracker = require('./pending_request_tracker'),
      DiagsController = require('./diags_controller'),
      logger = ModuleLogger.getLogger('HFDM.ServerUtils.BaseServer');

  try {
    // heapdump is not a dependency listed in the package.json because it is causing too many
    // issues for people attempting to use HFDM locally.
    // If you need to enable heapdump, add it to the package.json, recompile the shrinkwrap and
    // run the servers. The heapdump should not be part of a production stack
    if (settings.get('baseServer:enableHeapdump')) {
      // require('heapdump');
      logger.warn(`heapdump module loaded`);
    }
  } catch (e) {
    logger.warn(`heapdump module not loaded`);
  }

  const DEFAULT_PORT = 3080;

  const errorMiddleware = errorMiddlewareFactory();

  /**
   * BaseServer class with the following common functionalities:
   * - App server
   *
   * @param {object} in_params Parameter object
   * @param {boolean=} [in_params.listen=true] Flag indicating whether to run the server as
   *   a web server.
   * @param {boolean=} [in_params.initializeServer=true] If true, do one time initialization
   * @param {ExpressApp=} in_params.app An instance of an express app
   * @param {HttpServer=} in_params.server An instance of the Http server
   * @param {number=} [in_params.port=3080] The port at which we want to host the server.
   *   If listen is set to false this option is ignored.
   * @param {string=} [in_params.name=HFDM.ServerUtils.BaseServer] The name of the server
   * @param {boolean=} [in_params.muteLogs=false] Flag indicating whether we want to mute logs
   * @param {string=} [in_params.logLevel='INFO'] Set the log level: DEBUG, INFO, WARN or ERROR
   * @param {object=} [in_params.instanceMonitor] The instance monitor plugin
   * @param {object=} [in_params.logger] To override the default logger
   * @param {object=} [in_params.termTimeout] Timeout in seconds for a gracefull shutdown
   * @param {object=} [in_params.shortServiceName='BS'] The short name of the service. (BS: BaseServer)
   * @param {string=} [in_params.healthRoute=''] The health endpoint you want to expose. By default,
   *    the BaseServer will ALWAYS expose `/health`. If you want the health information to be
   *    available from another endpoint, pass it here.
   * @param {number} [in_params.softOngoingRequests] A count of how many in flight requests will
   *   cause warnings to get logged.
   * @param {boolean=} [in_params.systemMonitor] The system monitor to use
   * @constructor
   */
  var BaseServer = function(in_params) {
    var that = this;
    var closeTimeout = settings.get('baseServer:closeTimeout');

    EventEmitter.call(this);

    this._params = _.clone(in_params || {});
    this._healthEndpoints = _.compact(_.uniq(['/health', '/v1/health', '/v2/health', this._params.healthRoute]));
    _.defaults(this._params, {
      name: 'HFDM.ServerUtils.BaseServer',
      muteLogs: false,
      logLevel: 'INFO',
      logHTTPRequests: { skip: this._healthEndpoints.concat(['/isup']) },
      listen: true,
      initializeServer: true
    });

    if (!this._params.logger) {
      this._logger = logger;
      this._logger.setLevel(this._params.logLevel);
      if (this._params.muteLogs) {
        this._logger.muteLogs();
      }
    } else {
      this._logger = this._params.logger;
    }

    this._name = this._params.name || 'BaseServer';
    this._stackName = settings.get('stackName') || 'local';
    this._startedOn = new Date().toISOString();
    this._app = this._params.app || express();
    this._server = this._params.server || http.createServer(this._app);
    this._connectionManager = new ConnectionManager(this._server, closeTimeout, this._logger);
    this._shortServiceName = this._params.shortServiceName || process.env.SHORT_SERVICE_NAME || 'BS';
    this._id = generateGUID();
    this._terminating = 0;
    this._stopping = false;
    this._logHTTPRequests = this._params.logHTTPRequests;  // HTTP Request logging options
    this._loggerController = new LoggerController(this, this._params);
    this._instanceMonitor = this._params.instanceMonitor || defaultInstanceMonitor;
    this._authenticator = this._params.authenticator;

    let systemMonitor;
    if (in_params.systemMonitor && (process.env.SYSTEM_MONITOR_ENABLED === 'true')) {
      systemMonitor = in_params.systemMonitor;
      this._metrics = new Metrics(this._server, systemMonitor);
    }
    this._pendingRequestTracker = new PendingRequestTracker(this._server, systemMonitor, in_params.softOngoingRequests);
    this._diagsController = new DiagsController(this, this._params, this._pendingRequestTracker);

    if (this._params.initializeServer) {
      if (this._authenticator) {

        if (this._params.urlWhiteList) {
          this._authenticator.setUrlWhiteList(this._params.urlWhiteList);
        }

        // Install a middleware for authentication
        this._app.use(function(req, res, next) {
          var user = that._authenticator.authenticate(req);
          if (!user) {
            var msg = 'Proxy Authentication Required';
            // Make sure we have a _logger...
            if (that._logger) {
              const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
              that._logger.warn(
                `HTTP <<<< [${req.method}] [${req.url}]: [407 - ${msg}],` +
                ` from ${ip}, ips:${req.ips}, ip:${req.ip}`
              );
            }
            res.status(407).send(msg);
            return;
          }
          // Set the authenticated user to req.user
          req.user = user;
          next();
        });
      }

      // Install a middleware handler for logging incoming http requests
      this._app.use(function(req, res, next) {
        // Make sure we have a _logger...
        if (that._logger && that._logger.isLevelEnabled(ModuleLogger.levels.TRACE)) {
          // Skip logging some high-frequency, diagnostic routes
          var pathname = url.parse(req.url).pathname;
          if (_.indexOf(that._logHTTPRequests.skip, pathname) === -1) {
            var headers = JSON.stringify(_.pick(req.headers, that._logHTTPRequests.headers));
            that._logger.trace('HTTP >>>> [' + req.method + '] [' + req.url + '] [' + headers + ']');
          }
        }
        next();
      });

      // Error handler middleware
      this._app.use(errorMiddleware);
    }
  };

  BaseServer.prototype = Object.create(EventEmitter.prototype);

  /**
   * Sets the basic auth params for services that require basic authentication, such as the
   * LoggerController. Classes that implement the base server call this method after loading
   * the credentials from the settings, like in the example.
   * @example
   *  SomeServer.prototype.init = function() {
   *    var that = this;
   *    return BaseServer.prototype.init.call(this)
   *      .then(function() {
   *        that.setBasicAuth({
   *          username: settings.get('basicAuthName'),
   *          password: settings.get('basicAuthPassword'),
   *          passwordList: settings.get('basicAuthPasswordList'),
   *        });
   *      });
   * @param {Object} basicAuthParams The basic auth parameters.
   * @param {string} basicAuthParams.username The username to use for authentication.
   * @param {Object[]} basicAuthParams.passwordList The password list to use for authentication
   *  { value: string, endAt: string ISO date}
   * @param {string} basicAuthParams.password The password to use for authentication.
   */
  BaseServer.prototype.setBasicAuth = function(basicAuthParams) {
    this._params.basicAuth = basicAuthParams;
  };

  /**
   * Starts a server by calling `init` in which all asynchronous initialization is done, waits for its
   * execution to be done and then calls `_listen` (if needed) in which the server should start listening.
   * That way, the server only starts listening when the async initialization is done.
   *
   * Any servers having async initialization should override the `init` method whereas the `_listen` method
   * should not be override.
   * @param {Object} [options] Options
   * @param {Boolean} [options.listen] Do not listen if false is specified
   * @param {Number} [options.keepAliveTimeout] The keepAliveTimeout timeout to use for all new connections
   * @return {Promise} A promise that resolves when `init` or `_listen` is completed
   */
  BaseServer.prototype.start = function(options) {
    var that = this;

    // The BaseServer implementation had a chance (in init) to set all its settings.
    // We can now set default values for those settings that were left unspecified, and optionally
    // start the server.
    _initServer.call(that);

    if (options && _.isFinite(options.keepAliveTimeout)) {
      that._server.keepAliveTimeout = options.keepAliveTimeout;
      that._logger.debug(`New keepAliveTimeout: ${options.keepAliveTimeout}`);
    }

    return that._instanceMonitor.publish('starting')
      .then(() => this.init())
      .then(function() { // eslint-disable-line consistent-return
        var listen;
        listen = that._params.listen && ((options && _.isBoolean(options.listen)) ? options.listen : true);
        if (listen) {
          return that.listen();
        } else {
          return Promise.resolve();
        }
      })
      .then(function() {
        var getEventLoopTime = function() {
          var start = process.hrtime();
          setImmediate(function() {
            var diff = process.hrtime(start);
            var metric = (diff[0] + (diff[1] / 1e9) * 1000).toFixed(5);
            that.emit('eventloop.latency', {
              latency: metric
            });
            that._eventLoopTimeTimeout = setTimeout(getEventLoopTime, 5000);
          });
        };

        // Adds a metric to time how long it takes to complete a full event loop turn
        that._eventLoopTimeTimeout = setTimeout(getEventLoopTime, 0);
      });
  };

  /**
   * Stops the server
   * @return {Promise} A promise that resolves when the server is stopped
   */
  BaseServer.prototype.stop = function() {
    this._stopping = true;
    clearTimeout(this._eventLoopTimeTimeout);
    this._pendingRequestTracker.stop();

    // This server no longer support keepAlive
    this._server.keepAliveTimeout = 0;
    return this.close().catch(e => this._logger.warn(e))
      .then(() => this._logger.info('Calling terminate handler for:', this._name))
      .then(() => this.term())
      .catch(e => this._logger.warn(e))
      .then(() => {
        this._stopping = false;
        this.emit('stopped');
      })
      .catch(e => this._logger.warn(e));
  };

  /**
   * Optional asynchronous initialization of servers that inherit from the
   * BaseServer should be done here.
   * @return {Promise} A promise that resolves when the initialization is done
   */
  BaseServer.prototype.init = function() {
    return Promise.resolve();
  };

  /**
   * Optional asynchronous initialization of servers that inherit from the BaseServer should be done here.
   * @return {Promise} A promise that resolves when the initialization is done
   */
  BaseServer.prototype.term = function() {
    return Promise.resolve();
  };

  /**
   * Initializes the server once all the settings have been obtained, and defaults have been merged
   * in this._params.
   * @this HFDM.ServerUtils.BaseServer
   */
  var _initServer = function() {
    var that = this;

    if (this._params.initializeServer) {
      this._params.initializeServer = false;

      this._app.get(this._healthEndpoints, function(req, res) {
        that.getHealth(req, res);
      });

      // The /isup route. Simply returns 200. Useful for target group on aws.
      this._app.get(['/isup'], function(req, res) { res.status(200).end(); });

      if (!this._params || !this._params.basicAuth) {
        this._logger.info('No basicAuth parameters defined, disabling /killswitch and /noop resources');
        return;
      }

      _setupAdminEndpoints.call(this, this._app, this._params.basicAuth);
    }
  };

  /**
   * @function
   * @description Create the admin endpoint paths
   *
   * @param {object} app : Express app
   * @param {object} basicAuth : basicAuth credentials
   * @param {string} basicAuth.username : username
   * @param {string} basicAuth.password : password
   * @param {Object[]} basicAuth.passwordList : password list with rotation { value:string, endAt: ISO date}
   */
  function _setupAdminEndpoints(app, basicAuth) {
    const { username, password, passwordList } = basicAuth;

    if (!username || (!password && !passwordList)) {
      this._logger.info('Missing basicAuth parameters, disabling /killswitch and /noop resources');
      return;
    }

    const passwordListToUse = passwordList || [{
      value: password,
      endAt: '3000-01-01T00:00:00.000Z'
    }];

    app.post('/killswitch', [
      basicAuthMiddlewareFactory(username, passwordListToUse),
      this._killswitch.bind(this)
    ]);

    // Only support in test and dev
    if (this.getStackName() === 'test' || this.getStackName() === 'dev') {
      app.get('/noop', [
        basicAuthMiddlewareFactory(username, passwordListToUse),
        this._noop.bind(this)
      ]);
    }
  }

  /**
   * Starts listening to incoming requests. This method rarely needs to be overridden by BaseServer implementations.
   * @return {Promise} A promise that resolves when the server is listening and rejects when an error
   *                   event occurs in the server
   */
  BaseServer.prototype.listen = function() {
    if (this._server.listening) {
      // Server is already listening. Return an already resolved promise
      return Promise.resolve();
    } else {
      this._port = this._params.port || DEFAULT_PORT;
      return isPortFree(this._port).then(() => {
        return new Promise((resolve, reject) => {
          this._server.listen(this._port, settings.get('baseServer:backlog'), err => {
            if (err) {
              reject(err);
            } else {
              this._logger.info('Started listening on port', this._port);
              this.emit('server.listen');
              this._instanceMonitor.publish('started').then(() => resolve());
            }
          });
        });
      });
    }
  };

  /**
   * Stop listening and complete all ongoing request.
   * This method rarely needs to be overridden by BaseServer implementations.
   * @return {Promise} A promise that resolves when the server is no longer listening and
   *                   all ongoing request have completed.
   */
  BaseServer.prototype.close = function() {
    if (this._server.listening) {
      let that = this;
      const displayCount = () => {
        that._server.getConnections((err, count) => {
          if (err) {
            that._logger.error(`Failed getting active connection count(${this._name})`, err);
          } else {
            that._logger.info(`Active connection count(${this._name}): ${count}`);
            that.emit('displayCount', count);
          }
        });
      };

      const intervalLength = settings.get('baseServer:connectionCountInterval');
      const displayInterval = setInterval(displayCount.bind(this), intervalLength);

      // The promise will reject on error. It will resolve if the close succeeds.
      return new Promise((resolve, reject) => {
        let stoppingPromise;

        that._logger.info('Closing port', that._port);
        that._connectionManager.shutdown((err, result) => {
          clearInterval(displayInterval);

          stoppingPromise = stoppingPromise || Promise.resolve();
          stoppingPromise.then(() => that._instanceMonitor.publish('stopped'))
            .then(() => {
              if (err) {
                that._logger.error('Closing the server', JSON.stringify(result), err);
                reject(err);
              } else {
                that._logger.info('Server stopped.', JSON.stringify(result));
                resolve();
              }
            });
        });
        that._logger.info('Stopped listening on port', that._port);

        // A promise to let the stopping publishing state to complete before publishing a stopped state
        stoppingPromise = this._instanceMonitor.publish('stopping');
      });
    } else {
      return Promise.resolve();
    }
  };

  BaseServer.prototype.getBasicHealth = function() {
    return _.extend(
      {
        id: this.getId(),
        status: 'passed',
        startedOn: this._startedOn
      },
      this._instanceMonitor.getDefinition()
    );
  };

  /**
   * Get the health of the server
   * @param {Request} req Good ole' request object
   * @param {Response} res Good ole' response object
   */
  BaseServer.prototype.getHealth = function(req, res) {
    if (!res.headersSent) {
      res.writeHead(200);
    }
    res.write(JSON.stringify(this.getBasicHealth()));
    res.end();
  };

  /**
   * Get the server id to display in the health check
   * @return {string} The server id
   */
  BaseServer.prototype.getId = function() {
    return this._instanceMonitor.getDefinition().id || this._id;
  };

  /**
   * Get the server type
   * @return {string} The server type
   */
  BaseServer.prototype.getServerType = function() {
    return this._shortServiceName;
  };

  /**
   * Get the name of the stack currently deployed on
   * @return {string} The stack name currently deploy on
   */
  BaseServer.prototype.getStackName = function() {
    return this._stackName;
  };

  /**
   * Get the express app
   * @return {ExpressApp} The express app instance
   */
  BaseServer.prototype.getExpressApp = function() {
    return this._app;
  };

  /**
   * Get the server name
   * @return {string} The name of the server
   */
  BaseServer.prototype.getName = function() {
    return this._params.name;
  };

  /**
   * Get the HTTP server instance
   * @return {HttpServer} The HTTP server instance
   */
  BaseServer.prototype.getHTTPServer = function() {
    return this._server;
  };

  /**
   * Kills the server
   * @param {Request} req  Request object
   * @param {Response} res Response object
   */
  BaseServer.prototype._killswitch = function(req, res) {
    if (req.query.hard === 'true') {
      res.once('finish', process.exit.bind(process, 0));
    } else {
      this._connectionManager.shutdown(process.exit.bind(process, 0));
    }
    res.status(200).end();
  };

  /**
   * An overloadable system operation.
   * @param {Request} req  Request object
   * @param {Response} res Response object
   */
  BaseServer.prototype._noop = async function(req, res) {
    await this._instanceMonitor.noop();

    res.status(200).end();
  };

  /**
   * Print a message onto the logger
   * @param {string} in_message The message to print in the logger
   */
  BaseServer.prototype._log = function(in_message) {
    this._logger.info(in_message);
  };

  /**
   * Print a message onto the logger as a warning
   * @param {string} in_message The message to print in the logger
   */
  BaseServer.prototype._logWarn = function(in_message) {
    this._logger.warn(in_message);
  };

  /**
   * Print an error message onto the logger
   * @param {Error|string} in_error The Error to print in the logger
   */
  BaseServer.prototype._logError = function(in_error) {
    if (in_error) {
      this._logger.error(in_error);
    }
  };

  /**
   * Exit this process
   * @param {Number} code The code to exit with
   */
  BaseServer.prototype.exit = function(code) {
    process.exit(code);
  };

  /**
   * To ask the BaseServer if it's currently terminating. Expect the process to exit shortly.
   * @return {Boolean} True when terminating, false otherwise
   */
  BaseServer.prototype.isTerminating = function() {
    return Boolean(this._terminating);
  };

  /**
   * To ask the BaseServer if it's currently stopping. Not the same as isTerminating
   * @return {Boolean} True when stopping, false otherwise
   */
  BaseServer.prototype.isStopping = function() {
    return Boolean(this._stopping);
  };

  /**
   * Define and install the signal handler for this server
   */
  BaseServer.prototype.installSignalHandler = function() {
    const maxSignals = 5;
    const signals = ['SIGINT', 'SIGTERM'];
    let handlers = {};
    let sigHandler = function(signal) {
      this._termStartTime = Date.now();
      this._terminating++;
      this._logger.warn(`Received signal: ${signal}: ${this._terminating}/${maxSignals}`);
      if (this._terminating > 1) {
        if (this._terminating >= maxSignals) {
          this._logger.warn('Force exit');
          process.exit(1);
        }
        return;
      } else {
        const termTimeout = (this._params.termTimeout || settings.get('baseServer:termTimeout')) * 1000;
        setTimeout(() => {
          const duration = Date.now() - this._termStartTime;
          this._logger.error(`Too long to terminate: ${duration} ms. Aborting...`);
          process.exit(1);
        }, termTimeout);
        this.stop()
          .catch(e => this._logger.error(e))
          .then(res => {
            const duration = Date.now() - this._termStartTime;
            this._logger.info(`Terminated in ${duration} ms. Exiting...`);
            signals.forEach(sig => process.removeListener(sig, handlers[sig]));
            this.exit(res === 'failed' ? 1 : 0);
          });
      }
    };

    signals.forEach(signal => {
      handlers[signal] = sigHandler.bind(this, signal);
      process.on(signal, handlers[signal]);
    });
  };

  BaseServer.prototype.getAuthenticator = function() {
    return this._authenticator;
  };

  module.exports = BaseServer;

})();
