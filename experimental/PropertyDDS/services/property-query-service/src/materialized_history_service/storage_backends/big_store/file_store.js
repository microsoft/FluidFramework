/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-use-before-define */
/**
 * @fileoverview
 * A file store to persist change sets that don't fit in the property graph.
 */
(function() {
  'use strict';

  var _ = require('lodash');
  var async = require('async');
  var path = require('path');
  var util = require('util');
  var emptyDir = require('empty-dir');
  var ERROR_CODES = require('errno').code;
  var fs = require('fs');
  var HttpStatus = require('http-status-codes');
  var mkdirp = require('mkdirp');
  var rmfr = require('rmfr');

  var DeferredPromise = require('@fluid-experimental/property-common').DeferredPromise;
  var { ModuleLogger }= require('@fluid-experimental/property-query');
  var PromiseUtils = require('../dynamodb_store/promise_utils');
  var JsonUtils = require('../dynamodb_store/json_utils');
  var StoreLocation = require('./store_location');
  var BigStore = require('./big_store');

  /**
   * How many file operations can exist concurrently.
   */
  var CONCURRENCY_LIMIT = 20;

  /**
   * A file based store.
   * @param {?Object} params Store parameters.
   * @param {?string=} params.config.path Base folder that contains the big store files.
   *   Defaults to the home directory if left unspecified.
   * @constructor
   * @alias HFDM.PropertyGraphStore.BigStore.FileStore
   */
  var FileStore = function(params) {
    BigStore.call(
      this,
      params,
      StoreLocation.File,
      ModuleLogger.getLogger('HFDM.PropertyGraphStore.BigStore.FileStore')
    );

    this._path = params && params.config ? params.config.path : undefined;
    if (!this._path) {
      var homeDir = require('os').homedir();
      this._logger.warn("FileStore is not configured. Big change sets will be stored in: '" +
        homeDir + "'. You may override this location with the 'fileStore:config:path' setting.");
      this._path = homeDir;
    }

    this._basePathExists = false;

    Object.defineProperty(this, 'config', {
      /**
       * @return {Object} The FileStore configuration.
       */
      get: function() {
        return _.clone(this._params);
      }
    });

    Object.defineProperty(this, 'pathSep', {
      /**
       * @return {string} The FileStore path separator
       */
      get: function() {
        return path.sep;
      }
    });
  };

  util.inherits(FileStore, BigStore);

  /**
   * Ensures that the path to a file exists.
   * @param {string} fileName A file name.
   * @return {Promise} A promise that is resolved when the path exists
   *   or has been created.
   * @private
   * @this HFDM.PropertyGraphStore.BigStore.FileStore
   */
  var _createPath = function(fileName) {
    var that = this;
    var pathOnly = _getParentPath.call(this, fileName);

    var promise = new DeferredPromise();
    if (this._basePathExists) {
      // The BigStore has a flat layout where all commits of a branch go in the same folder.
      // Once the root folders are created, only the branch folder needs to be created.
      fs.mkdir(pathOnly, function(error) {
        if (error && error.code !== ERROR_CODES.EEXIST.code) {
          promise.reject(error);
        } else {
          promise.resolve();
        }
      });
    } else {
      // Create the root folder hierarchy.
      mkdirp(pathOnly, function(error) {
        if (!error) {
          that._basePathExists = true;
        }

        promise.getCb()(error);
      });
    }

    return promise;
  };

  /**
   * Delete a file.
   * @param {string} fileName Name of a file to delete.
   * @return {Promise} A promise that is resolved on success.
   * @private
   * @this HFDM.PropertyGraphStore.BigStore.FileStore
   */
  var _delete = function(fileName) {
    var promise = new DeferredPromise();
    this._logger.trace('_delete (file): ' + fileName);
    fs.unlink(fileName, promise.getCb());
    return promise;
  };

  /**
   * Tests a directory to see if it's empty, and if so, deletes it.
   * @param {string} dirName Name of a directory to delete.
   * @return {Promise} A promise that is resolved on success.
   * @private
   * @this HFDM.PropertyGraphStore.BigStore.FileStore
   */
  var _deleteDirIfEmpty = function(dirName) {
    var that = this;
    var promise = new DeferredPromise();

    this._logger.trace('_deleteDirIfEmpty: ' + dirName);

    emptyDir(dirName, promise.getCb());
    return promise
      .then(function(isEmpty) {
        return isEmpty ? _deleteEmptyDir.call(that, dirName) : undefined;
      });
  };

  /**
   * Delete an empty directory.
   * @param {string} dirName Name of an empty directory to delete.
   * @return {Promise} A promise that is resolved on success.
   * @private
   * @this HFDM.PropertyGraphStore.BigStore.FileStore
   */
  var _deleteEmptyDir = function(dirName) {
    var promise = new DeferredPromise();
    this._logger.trace('_deleteDir: ' + dirName);
    fs.rmdir(dirName, promise.getCb());
    return promise;
  };

  /**
   * Recursively deletes the contents of a directory.
   * @param {string} dirName The name of a directory to delete.
   * @return {Promise} A promise that is resolved on success.
   */
  var _forceDeleteDir = function(dirName) {
    return rmfr(dirName);
  };

  /**
   * Fetches the name of the folder that contains a file.
   * @param {string} fileName Name of a file.
   * @return {Promise} A promise that is resolved with the file path on success.
   * @private
   * @this HFDM.PropertyGraphStore.BigStore.FileStore
   */
  var _getParentPath = function(fileName) {
    var pathOnly = fileName.split(path.sep);
    pathOnly.pop();
    pathOnly = pathOnly.join(path.sep);
    return pathOnly;
  };

  /**
   * @param {string} key Identifies an object to fetch.
   * @return {string} A file name that refers to the specified key.
   * @private
   * @this HFDM.PropertyGraphStore.BigStore.FileStore
   */
  var _getFileNameFromKey = function(key) {
    return path.join(this._path, key);
  };

  /**
   * @param {string} key Identifies a file or directory.
   * @return {boolean} True if key refers to a directory (key must end with a path separator),
   *   false otherwise.
   */
  var _isDirectory = function(key) {
    return key[key.length - 1] === path.sep;
  };

  /**
   * Log a file query.
   * @param {string} name File operation name.
   * @param {Object} params File operation parameters.
   * @private
   * @this HFDM.PropertyGraphStore.BigStore.FileStore
   */
  var _logQuery = function(name, params) {
    if (this._logger.isLevelEnabled(ModuleLogger.levels.DEBUG)) {
      this._logger.debug(name + ' ==> ' + JsonUtils.stringify(params, null, 2));
    }
  };

  /**
   * Log the results of a file operation.
   * @param {string} name File operation name.
   * @param {Object} result File operation result.
   * @return {*} The result is returned.
   * @private
   * @this HFDM.PropertyGraphStore.BigStore.FileStore
   */
  var _logResult = function(name, result) {
    if (this._logger.isLevelEnabled(ModuleLogger.levels.DEBUG)) {
      this._logger.debug(name + ' <== ');
    }
    return result;
  };

  /**
   * Delete an object from the store.
   * @param {string} key Identifies an object to remove.
   * @return {Promise} A promise that gets fulfilled on success.
   */
  FileStore.prototype.delete = function(key) {
    if (_isDirectory.call(this, key)) {
      var dirName = _getFileNameFromKey.call(this, key);
      return _forceDeleteDir.call(this, dirName);
    }

    var opName = 'delete';
    var fileName = _getFileNameFromKey.call(this, key);
    var parentDir = _getParentPath.call(this, fileName);
    _logQuery.call(this, opName, {file: fileName});
    return _delete.call(this, fileName)
      .then(_deleteDirIfEmpty.bind(this, parentDir))
      .then(_logResult.bind(this, opName));
  };

  /**
   * Deletes multiple objects from the store in a single call.
   * @param {Array<string>} keys An array of identifiers of objects to remove.
   * @return {Promise} A promise that gets fulfilled on success.
   */
  FileStore.prototype.deleteAll = function(keys) {
    var that = this;
    var opName = 'deleteAll';
    var promise = new DeferredPromise();
    var parentFolders = {};

    _logQuery.call(this, opName, {keys: keys});

    // Delete the requested files.
    async.forEachOfLimit(
      keys,
      CONCURRENCY_LIMIT,
      function(key, index, cb) {
        var fileName = _getFileNameFromKey.call(that, key);
        parentFolders[_getParentPath.call(that, fileName)] = true;
        PromiseUtils.chainCallback(_delete.call(that, fileName), cb);
      },
      promise.getCb()
    );
    return promise
      .then(function() {
        // Delete empty parent folders.
        var dirPromise = new DeferredPromise();
        async.forEachOfLimit(
          _.keys(parentFolders),
          CONCURRENCY_LIMIT,
          function(parentFolder, index, cb) {
            PromiseUtils.chainCallback(_deleteDirIfEmpty.call(that, parentFolder), cb);
          },
          dirPromise.getCb()
        );
        return dirPromise;
      })
      .then(_logResult.bind(this, opName));
  };

  /**
   * Tests for the existence of an object in the store.
   * @param {string} key Identifies an object
   * @return {Promise} A promise that resolves to a boolean indicating whether or not the object
   *   exists. The promise will be rejected if unable to determine if the object exists.
   */
  FileStore.prototype.exists = function(key) {
    var opName = 'exists';
    var fileName = _getFileNameFromKey.call(this, key);
    var promise = new DeferredPromise();
    _logQuery.call(this, opName, {file: fileName});
    fs.access(fileName, promise.getCb());
    return promise
      .then(_logResult.bind(this, opName))
      .then(result => true)
      .catch(error => error && error.code === ERROR_CODES.ENOENT.code ? false : Promise.reject(error));
  };

  /**
   * Fetches an object from the store.
   * @param {string} key Identifies an object to fetch.
   * @return {Promise} A promise that gets fulfilled with the object content as a Buffer.
   */
  FileStore.prototype.getObject = function(key) {
    var opName = 'getObject';
    var fileName = _getFileNameFromKey.call(this, key);
    var promise = new DeferredPromise();
    _logQuery.call(this, opName, {file: fileName});
    fs.readFile(fileName, promise.getCb());
    return promise
      .then(_logResult.bind(this, opName))
      .catch(error => {
        if (error && error.code === ERROR_CODES.ENOENT.code) {
          error.statusCode = HttpStatus.NOT_FOUND;
        }

        return Promise.reject(error);
      });
  };

  /**
   * Fetches file object information, such as its size.
   * @param {string} key Identifies an object
   * @return {Promise} A promise that resolves to the object information if it exists.
   */
  FileStore.prototype.getObjectInfo = async function(key) {
    var opName = 'getObjectInfo';
    var fileName = _getFileNameFromKey.call(this, key);
    var promise = new DeferredPromise();
    _logQuery.call(this, opName, {file: fileName});
    fs.stat(fileName, promise.getCb());
    return promise
      .then(_logResult.bind(this, opName))
      .then(stats => {
        return {
          size: stats.size,
          lastModifiedDate: stats.mtime
        };
      })
      .catch(error => {
        if (error && error.code === ERROR_CODES.ENOENT.code) {
          error.statusCode = HttpStatus.NOT_FOUND;
        }

        return Promise.reject(error);
      });
  };

  /**
   * Stores an object.
   * @param {string} key Identifies the object to store.
   * @param {Buffer} buffer The object payload.
   * @param {?string} tags An optional series of tags having the format: "key1=value1&key2=value2".
   * @return {Promise} A promise that is fulfilled on success.
   */
  FileStore.prototype.putObject = function(key, buffer, tags) {
    var opName = 'putObject';
    var fileName = _getFileNameFromKey.call(this, key);
    _logQuery.call(this, opName, {file: fileName, length: buffer.length, tags: tags});
    return _createPath.call(this, fileName)
      .then(function() {
        var promise = new DeferredPromise();
        fs.writeFile(fileName, buffer, promise.getCb());
        return promise;
      })
      .then(_logResult.bind(this, opName));
  };

  /**
   * Returns an object URL for fetching.
   * @param {string} key Identifies the object to fetch.
   * @param {Number} expiry Expiry for the url (default 60). Ignored for FileStore implementation.
   * @return {Promise} A file URL for fetching
   */
  FileStore.prototype.getObjectUrl = function(key, expiry) {
    let fileName = _getFileNameFromKey.call(this, key);
    return Promise.resolve(`file://${fileName}`);
  };

  module.exports = FileStore;
})();
