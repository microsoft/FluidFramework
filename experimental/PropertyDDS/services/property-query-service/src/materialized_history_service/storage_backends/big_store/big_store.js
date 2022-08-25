/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview
 * A store to persist big objects, that only supports operations required by HFDM.
 */
(function() {
  'use strict';

  var _ = require('lodash');

  /**
   * Instantiate a big store.
   * @param {Object} params Store specific parameters.
   * @param {HFDM.PropertyGraphStore.Types.StoreLocation} location The store location.
   * @param {log4js.Logger} logger The store logger.
   * @constructor
   * @alias HFDM.PropertyGraphStore.BigStore.BigStore
   */
  var BigStore = function(params, location, logger) {
    this._params = _.clone(params);
    this._location = location;
    this._logger = logger;
    BigStore.isTest = params && params.isTest;

    Object.defineProperty(this, 'location', {
      /**
       * @return {HFDM.PropertyGraphStore.Types.StoreLocation} Where the store is located.
       */
      get: function() {
        return this._location;
      }
    });
  };

  /**
   * @param {string} branchGuid Guid that identifies a branch.
   * @return {string} An object identifier that refers to the branch.
   */
  BigStore.prototype.getBranchKey = function(branchGuid) {
    var nameComponents = ['HFDM', 'BigStore', branchGuid, ''];

    if (BigStore.isTest) {
      nameComponents.unshift('TEST');
    }

    return nameComponents.join(this.pathSep);
  };

  /**
   * @param {string} branchGuid Guid that identifies the branch that contains the commit.
   * @param {string} commitGuid A commit guid.
   * @param {?boolean=} isGZipped Whether or not the id refers to a compressed object.
   *   Defaults to false.
   * @return {string} An object identifier that refers to the commit.
   */
  BigStore.prototype.getCommitKey = function(branchGuid, commitGuid, isGZipped) {
    var nameComponents = ['HFDM', 'BigStore', branchGuid, commitGuid + (isGZipped ? '.txt.gz' : '.txt')];

    if (BigStore.isTest) {
      nameComponents.unshift('TEST');
    }

    return nameComponents.join(this.pathSep);
  };

  /**
   * @param {string} branchGuid Guid that identifies the branch that contains the commit.
   * @param {string} commitGuid A merge commit guid.
   * @return {string} An object identifier that refers to the merge commit payload.
   */
  BigStore.prototype.getMergeKey = function(branchGuid, commitGuid) {
    const nameComponents = ['HFDM', 'BigStore', branchGuid, 'Merge', commitGuid + '.txt'];

    if (BigStore.isTest) {
      nameComponents.unshift('TEST');
    }

    return nameComponents.join(this.pathSep);
  };

  /**
   * Delete an object from the store.
   * @param {string} key Identifies an object to remove.
   * Returns {Promise} A promise that gets fulfilled with the deletion result.
   */
  BigStore.prototype.delete = function(key) {
    throw new Error('Not implemented: delete');
  };

  /**
   * Deletes multiple objects from the store in a single call.
   * @param {Array<string>} keys An array of identifiers of objects to remove.
   * Returns {Promise} A promise that gets fulfilled with the deletion result.
   */
  BigStore.prototype.deleteAll = function(keys) {
    throw new Error('Not implemented: deleteAll');
  };

  /**
   * Tests for the existence of an object in the store.
   * @param {string} key Identifies an object
   * Returns {Promise} A promise that resolves to a boolean indicating whether or not the object
   *   exists. The promise will be rejected if unable to determine if the object exists.
   */
  BigStore.prototype.exists = function(key) {
    throw new Error('Not implemented: exists');
  };

  /**
   * Fetches an object from the store.
   * @param {string} key Identifies an object to fetch.
   * Returns {Promise} A promise that gets fulfilled with the object content as a Buffer.
   */
  BigStore.prototype.getObject = function(key) {
    throw new Error('Not implemented: fetch');
  };

  /**
   * Fetches object information, such as its size.
   * @param {string} key Identifies an object
   * returns {Promise} A promise that resolves to the object information if it exists: {
   *   {number} size The object size
   *   {Date} lastModifiedDate The object last modification date
   * }
   */
  BigStore.prototype.getObjectInfo = function(key) {
    throw new Error('Not implemented: getObjectInfo');
  };

  /**
   * Stores an object.
   * @param {string} key Identifies the object to store.
   * @param {Buffer} buffer The object payload.
   * @param {?string} tags An optional series of tags having the format: "key1=value1&key2=value2".
   * Returns {Promise} A promise that is fulfilled on success.
   */
  BigStore.prototype.putObject = function(key, buffer, tags) {
    throw new Error('Not implemented: store');
  };

  /**
   * Returns an object URL for fetching.
   * @param {string} key Identifies the object to fetch.
   * @param {Number} expiry Expiry for the url (default 60)
   * Returns {Promise} An URL for fetching
   */
  BigStore.prototype.getObjectUrl = function(key, expiry) {
    throw new Error('Not implemented: getObjectUrl');
  };

  module.exports = BigStore;

})();
