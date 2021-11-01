/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Trivial storage backend, that keeps all records in memory
 */
(function() {
  const OperationError = require('@fluid-experimental/property-common').OperationError;
  const HTTPStatus = require('http-status');

  /**
   * Trivial storage backend, that keeps all records in memory
   *
   * @param {Object} in_params            - Parameters for this service
   * @param {Object} in_params.settings   - The settings object
   *
   */
  const InMemoryBackend = function(in_params) {
    this._settings = in_params.settings;
    this._data = {};
  };

  /**
   * Initialize the backend
   * @return {Promise} - Resolves wnen the backend is initialized
   */
  InMemoryBackend.prototype.init = function() {
    return Promise.resolve();
  };

  /**
   * De-initializes the backend
   * @return {Promise} - Resolves wnen the backend is de-initialized
   */
  InMemoryBackend.prototype.stop = function() {
    return Promise.resolve();
  };

  /**
   * Starts a write batch
   * @return {*} A batch identifier
   */
  InMemoryBackend.prototype.startWriteBatch = function() {
    return {};
  };

  /**
   * Sends all write requests that were created for this batch
   * to the server
   * @param {*} in_batch - Identifier for the batch to transmit
   *
   * @return {Promise} This promise resolves once all records have been
   *                   written to the server
   */
  InMemoryBackend.prototype.finishWriteBatch = function(in_batch) {
    return Promise.resolve();
  };

  /**
   * Stores a blob in the key value store. The write will only have been be performed
   * when the finishWriteBatch is invoked and the returned promise has been resolved.
   *
   * @param {*}      in_batch    - Identifies the write batch this record belongs to
   * @param {String} in_nodeRef  - An identifier for the node in the format "<type>:<guid>"
   * @param {String} in_value    - The value under which the record is stored
   */
  InMemoryBackend.prototype.store = function(in_batch, in_nodeRef, in_value) {
    this._data[in_nodeRef] = in_value;
  };

  /**
   * Updates an already existing  blob in the key value store. The write will only
   * have been be performed when the finishWriteBatch is invoked and the returned
   * promise has been resolved.
   *
   * @param {*}      in_batch - Identifies the write batch this record belongs to
   * @param {String} in_nodeRef  - An identifier for the node in the format "<type>:<guid>"
   * @param {String} in_value - The value under which the record is stored
   */
  InMemoryBackend.prototype.update = function(in_batch, in_nodeRef, in_value) {
    if (this._data[in_nodeRef] === undefined) {
      throw new OperationError('Updated a non existing record.', 'CreateCommit', HTTPStatus.INTERNAL_SERVER_ERROR);
    }
    this._data[in_nodeRef] = in_value;
  };

  /**
   * Gets a record from the record storage
   *
   * @param {String} in_nodeRef  - An identifier for the node in the format "<type>:<guid>"
   * @param {Boolean} [in_consistent=false] - Do we need a consistent read for this operation?
   *
   * @return {Promise} A promise that resolves with the requested value or undefined
   *                   if the record does not exist.
   */
  InMemoryBackend.prototype.get = function(in_nodeRef, in_consistent) {
    let value = this._data[in_nodeRef];
    return Promise.resolve(value && this._data[in_nodeRef]);
  };

  /**
   * Deletes a full node along all its subnodes
   * @param {String} in_nodeRef - Node identifier
   * @return {Promise} - Resolves when deletion is completed
   */
  InMemoryBackend.prototype.delete = function(in_nodeRef) {
    delete this._data[in_nodeRef];
    return Promise.resolve();
  };

  /**
   * Prints some debugging statistics about the database
   */
  InMemoryBackend.prototype._dumpStatistics = function() {
    let dataForCS = 0;
    let dataForDelta = 0;
    let statistics = {};
    for (let key of Object.keys(this._data)) {
      let type = key.split(':')[0];
      statistics[type] = statistics[type] || {
        count: 0,
        size: 0
      };

      statistics[type].count++;
      statistics[type].size += JSON.stringify(this._data[key]).length;

      if (type === 'l') {
        dataForCS += JSON.stringify(JSON.parse(this._data[key]).changeSet).length;
        dataForDelta += JSON.stringify(JSON.parse(this._data[key]).deltas).length;
      }
    }

    console.log('Memory consumption statistics');
    for (let key of Object.keys(statistics)) {
      console.log(
        key + ' count: ' + statistics[key].count + ' size: ' +
        Math.ceil(statistics[key].size / 1024) + ' KB'
      );
    }

    console.log('Total CS size ' + dataForCS);
    console.log('Total Delta size ' + dataForDelta);
  };

  /**
   * Deletes a full node along with all its subnodes
   * @param {String} in_nodeRef - Node identifier
   * @return {Promise} - Resolves when deletion is completed
   */
  InMemoryBackend.prototype.delete = function(in_nodeRef) {
    delete this._data[in_nodeRef];
    return Promise.resolve();
  };

  module.exports = InMemoryBackend;
})();
