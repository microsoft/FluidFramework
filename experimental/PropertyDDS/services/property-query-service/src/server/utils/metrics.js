/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');

const METRIC_SEND_FREQUENCY = 5 * 1000;

const METRICS = {
  SOCKET_CONNECTIONS: 'Custom/Socket/ConnectionCount',
  MEMORY_USAGE: 'Custom/Memory/PercentUsed'
};

const MEGA = 1024 * 1024; // how many Bytes in a MegaByte

/**
 * Custom instrumentation for server requests and connections.
 */
class Metrics {
  /**
   * Create a new metrics handler
   * @constructor
   * @param {http.Server} server The express server.
   * @param {object} systemMonitor The system monitor to use
   */
  constructor(server, systemMonitor) {
    this._systemMonitor = systemMonitor;
    this._server = server;

    this._connectionCount = 0;
    this._additionalMetrics = [];
    this._reservedMemoryBytes = _.isUndefined(process.env.HFDM_MEMORY_RESERVATION) ?
      undefined :
      Number(process.env.HFDM_MEMORY_RESERVATION) * MEGA;

    server.on('request', _onRequest.bind(this));
    server.on('connection', _onConnection.bind(this));

    _sendMetricsPeriodically.call(this);
  }

  /**
   * Record additional metrics periodically.
   * @param {function} handler The handler that produces the metrics to record.
   * @this Metrics
   */
  recordMetrics(handler) {
    this._additionalMetrics.push(handler);
  }
}

/**
 * Invoked each time a route is invoked on the server
 * @param {http.IncomingMessage} req The request
 * @param {http.ServerResponse} res The response
 * @this Metrics
 * @private
 */
function _onRequest(req, res) {
  const contentLength = req.headers['content-length'] || 0;
  this._systemMonitor.addCustomAttribute('ContentLength', Number(contentLength));

  const clientId = _getClientId(req);
  this._systemMonitor.addCustomAttribute('ClientId', clientId);

  const userId = _getUserId(req);
  this._systemMonitor.addCustomAttribute('UserId', userId);
}

/**
 * Track a connection
 * @param {net.Socket} socket The socket of the new connection
 * @this Metrics
 * @private
 */
function _onConnection(socket) {
  ++this._connectionCount;

  socket.on('close', () => {
    --this._connectionCount;
  });
}

/**
 * Sends custom metrics to every `METRIC_SEND_FREQUENCY`
 * @this Metrics
 * @private
 */
function _sendMetricsPeriodically() {
  _recordConnectionCount.call(this);
  _recordMemory.call(this);

  this._additionalMetrics.forEach((am) => {
    am().forEach((m) => {
      this._systemMonitor.recordMetric(m.name, m.value);
    });
  });

  setTimeout(_sendMetricsPeriodically.bind(this), METRIC_SEND_FREQUENCY);
}

/**
 * Sends `Custom/Socket/ConnectionCount`
 * @this Metrics
 * @private
 */
function _recordConnectionCount() {
  this._systemMonitor.recordMetric(METRICS.SOCKET_CONNECTIONS, this._connectionCount);
}

/**
 * Sends `Custom/Memory/PercentUsed`
 * @this Metrics
 * @private
 */
function _recordMemory() {
  if (!this._reservedMemoryBytes) {
    return;
  }

  let mem = process.memoryUsage();
  let memUsage = Math.ceil((mem.rss / this._reservedMemoryBytes) * 100);
  this._systemMonitor.recordMetric(METRICS.MEMORY_USAGE, memUsage);
}

/**
 * Resolve the client id from the headers in request
 * @param {http.IncomingMessage} req The request
 * @return {string} - The client id
 * @private
 */
function _getClientId(req) {
  return (req.user && req.user.clientId) || 'Unknown';
}

/**
 * Resolve the client id from the headers in request
 * @param {http.IncomingMessage} req The request
 * @return {string} - The user id
 * @private
 */
function _getUserId(req) {
  return (req.user && req.user.userId) || 'Unknown';
}

module.exports = Metrics;
