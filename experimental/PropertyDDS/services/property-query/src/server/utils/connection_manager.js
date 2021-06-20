/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Helper class to properly shutdown an http.Server
 */
class ConnectionManager {

  /**
   * Constructor.
   *
   * @param {object} httpServer The http.Server to manage connections for.
   * @param {Number} timeout    Time allowed for the http.Server.close() method to
   *                 terminate all connections. After this timeout, the remaining
   *                 connections will be forced to close.
   * @param {Logger} [logger]     The logger to use. Defaults to: console
   */
  constructor(httpServer, timeout, logger) {
    this.server = httpServer;
    this.connections = {};
    this.connectionCounter = 0;
    this.logger = logger || console;
    this.timeout = timeout;
    this.forcedCounter = 0;
    this.isShuttingDown = false;
    this.requestStarted = 0;
    this.requestCompleted = 0;

    httpServer.on('request', this._onRequest.bind(this));
    httpServer.on('connection', this._onConnection.bind(this));
  }

  /**
   * Close the listening port, drain the active connections and and finally
   * kill all remaining connections if a timeout was specified in the constructor
   * @param  {Function}   [cb]  Called as cb(err, result) where result is:
   *                            {
   *                               connectionCounter: Number,
   *                               forcedCounter: Number,
   *                               requestStarted: Number,
   *                               requestCompleted: Number
   *                             }
   */
  shutdown(cb) {
    // Force all sockets destruction after this.timeout
    let timeout = this.timeout && setTimeout(this._destroyAll.bind(this, true), this.timeout);

    this.isShuttingDown = true;
    this.logger.debug('Closing');
    this.server.close((err) => {
      // All connections from the listening port are now closed
      const result = {
        connectionCounter: this.connectionCounter,
        forcedCounter: this.forcedCounter,
        requestStarted: this.requestStarted,
        requestCompleted: this.requestCompleted
      };

      clearTimeout(timeout);
      this.logger.debug(`Closed: ${JSON.stringify(result)}`);
      if (cb) {
        process.nextTick(() => { cb(err, result); });
      }

      // The close() function completed. The server is no longer shutting down.
      this.isShuttingDown = false;
    });

    // The listening port is closed. Destroy all idling sockets
    this._destroyAll(false);
  }

  /**
   * Destroy a connection (socket)
   * @param  {net.Socket} socket socket to destroy
   * @param  {Boolean}    force Force socket destroy if true
   */
  _destroy(socket, force) {
    const id = socket._connectionId;

    if (force) {
      this.logger.warn(`Forcing destroy on connection[${id}].`);
      this.forcedCounter++;
    }
    if (socket._isIdle || force) {
      socket.destroy();
      delete this.connections[id];
    }
  }

  /**
   * Process all connections and destroy them accordinly (idle, force)
   * @param  {Boolean}    force Force all socket destroy if true
   */
  _destroyAll(force) {
    Object.keys(this.connections).forEach((id) => {
      this._destroy(this.connections[id], force);
    });
  }

  /**
   * Track a connection
   * @param  {net.Socket} socket The socket of the new connection
   */
  _onConnection(socket) {
    const id = this.connectionCounter++;
    socket._isIdle = true;
    socket._connectionId = id;
    this.connections[id] = socket;
    this.logger.debug(`New connection[${id}]`);

    socket.on('close', () => {
      this.logger.debug(`Closed connection[${id}]`);
      delete this.connections[id];
    });
  }

  /**
   * Track a request idle state
   * @param  {http.IncomingMessage} req The request
   * @param  {http.ServerResponse}  res The response
   */
  _onRequest(req, res) {
    this.requestStarted++;
    req.socket._isIdle = false;
    res.on('finish', () => {
      this.requestCompleted++;
      req.socket._isIdle = true;
      if (this.isShuttingDown) {
        this._destroy(req.socket, false);
      }
    });
  }
}

module.exports = ConnectionManager;
