/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const HttpStatus = require('http-status-codes');
const sanitize = require('sanitize');
const { ModuleLogger } = require('@fluid-experimental/property-query')
const BasicAuthController = require('./basic_auth_controller');
const LoggerSanitizer = require('./logger_sanitizer');

/**
 * The LoggerController exposes an endpoint authenticated `/logger` route used to change the
 * logging levels on individual modules.
 * See {@link hfdm-logger#ModuleLogger}
 * @fileoverview
 */
class LoggerController extends BasicAuthController {
    /**
     *
     * @param {HFDM.ServerUtils.BaseServer} baseServer An instance of HFDM.ServerUtils.BaseServer
     * @param {Object} params List of parameters
     * @param {string} params.basicAuth.username A username to authenticate
     * @param {string} params.basicAuth.password A password to authenticate
     * @param {Object[]} params.basicAuth.passwordList A password list to authenticate
     *  { value: string , endAt: string ISO date}
     *
     * @constructor
     */
    constructor(baseServer, params) {
        super(baseServer, params);

        this.setupRoutes({
            get: {
                '/logger': this.getLogLevel.bind(this)
            },
            post: {
                '/logger': this.setLogLevel.bind(this)
            }
        });

        this._loggerSanitizer = sanitize(LoggerSanitizer);
    }

    /**
     * Route invoked to query the log level of a specific module, or all modules.
     * @param {Object} req The request.
     * @param {?string} req.query.name An optional module name. When specified, the logging level is
     *   returned only for that module. When left unspecified, all known module levels are outputted.
     * @param {Object} res The response.
     */
    getLogLevel(req, res) {
        var name = this._loggerSanitizer.value(req.query.name, 'moduleName');
        if (!name) {
            if (req.query.name && req.query.name.length > 0) {
                res.writeHead(HttpStatus.UNPROCESSABLE_ENTITY);
                res.write("invalid parameter: 'name'");
            } else {
                // Get a list of all registered loggers and their level
                res.writeHead(HttpStatus.OK);
                res.write(JSON.stringify(ModuleLogger.loggers));
            }
        } else {
            this._logger.debug('GET /logger [' + name + ']');
            var logger = ModuleLogger.getLogger(name);
            res.writeHead(HttpStatus.OK);
            res.write(JSON.stringify({ module: name, level: logger.level.levelStr }));
        }

        res.end();
    }

    /**
     * Changes the log level for a given module.
     * @param {Object} req The request.
     * @param {string} req.query.name The module name for which to set the logging level.
     * @param {string} req.query.level The desired logging level for that module.
     *   One of: ['ALL', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL', 'OFF'].
     * @param {Object} res The response contains the module's logging level after it's set.
     */
    setLogLevel(req, res) {
        var name = this._loggerSanitizer.value(req.query.name, 'moduleName');
        var level = this._loggerSanitizer.value(req.query.level, 'logLevel');

        if (!name) {
            res.writeHead(HttpStatus.UNPROCESSABLE_ENTITY);
            res.write("Missing or invalid parameter: 'name'");
        } else if (!level) {
            res.writeHead(HttpStatus.UNPROCESSABLE_ENTITY);
            res.write("Missing or invalid parameter: 'level'");
        } else {
            this._logger.debug('POST /logger [' + name + '], level: [' + level + ']');

            const logger = ModuleLogger.getLogger(name);
            logger.setLevel(level);
            res.writeHead(HttpStatus.OK);
            res.write(JSON.stringify({ module: name, level: logger.level.levelStr }));
        }

        res.end();
    }
}

module.exports = LoggerController;
