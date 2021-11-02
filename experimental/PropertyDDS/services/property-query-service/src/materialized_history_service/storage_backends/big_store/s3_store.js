/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-use-before-define */
/**
 * @fileoverview
 * A store backed by Amazon S3. Differs from:
 *   - it doesn't operate on file objects
 *   - doesn't auto generate keys (filenames)
 *   - doesn't generate checksums on content
 *   - promise based api
 *   - Supports: server side encryption, metadata, batch deletion
 */
(function() {
  'use strict';

  var _ = require('lodash');
  var path = require('path');
  var AWS = require('aws-sdk');
  var BigStore = require('./big_store');
  var DeferredPromise = require('@fluid-experimental/property-common').DeferredPromise;
  var HttpStatus = require('http-status-codes');
  var JsonUtils = require('../dynamodb_store/json_utils');
  var { ModuleLogger } = require('@fluid-experimental/property-query');
  var Chronometer = require('@fluid-experimental/property-common').Chronometer;
  var StoreLocation = require('./store_location');
  var credsRotation = require('../../../server/utils/creds_rotation');

  var util = require('util');

  /**
   * Instantiate an S3 BigStore.
   * @param {Object} params Store parameters
   * @param {Object} params.config S3 specific parameters
   * @param {Object} params.options S3Store specific parameters
   * @param {Object} params.awsRole STS role
   */
  var S3Store = function(params) {
    BigStore.call(
      this,
      params,
      StoreLocation.S3,
      ModuleLogger.getLogger('HFDM.PropertyGraphStore.BigStore.S3Store')
    );

    this._timingLogger = ModuleLogger.getLogger('HFDM.PropertyGraphStore.BigStore.S3Store.Timing');

    this._params.options.acl = this._params.options.acl || 'bucket-owner-full-control';

    if (this._params.options.signedUrlExpirySec && this._params.options.signedUrlExpirySec <= 0) {
      throw new RangeError(`signedUrlExpirySec must be greater than 0, is ${this._params.options.signedUrlExpirySec}`);
    }
    this._params.options.signedUrlExpirySec = this._params.options.signedUrlExpirySec || 60;

    Object.defineProperty(this, 'config', {
      /**
       * @return {Object} The S3Store configuration, without sensitive information.
       */
      get: function() {
        var filteredConfig = JSON.parse(JSON.stringify(this._params));

        if (filteredConfig.config.accessKeyId) {
          filteredConfig.config.accessKeyId = '<REDACTED>';
        }

        if (filteredConfig.config.secretAccessKey) {
          filteredConfig.config.secretAccessKey = '<REDACTED>';
        }

        return filteredConfig;
      }
    });

    Object.defineProperty(this, 'pathSep', {
      /**
       * @return {string} The S3Store path separator
       */
      get: function() {
        return '/';
      }
    });

    const { awsRole, config } = this._params;

    this._initS3Promise = new DeferredPromise();

    if (awsRole && awsRole.arn && awsRole.prefix) {
      const onRotation = (error, creds) => {
        if (error) {
          this._rotationError = error;
          delete this._s3;

          this._initS3Promise.reject(error);

          return;
        }

        delete this._rotationError;
        this._s3 = new AWS.S3({
          ...config,
          ...{
            accessKeyId: creds.AccessKeyId,
            secretAccessKey: creds.SecretAccessKey,
            sessionToken: creds.SessionToken
          }
        });

        this._initS3Promise.resolve(this._s3);
      };

      credsRotation.addRotation(awsRole, onRotation);
    } else {
      this._initS3Promise = Promise.resolve(new AWS.S3(config));
    }
  };

  util.inherits(S3Store, BigStore);

  /**
   * Gets S3 instance
   * @return {Promise} A promise that is resolved with the S3 instance.
   * @private
   * @this HFDM.PropertyGraphStore.BigStore.S3Store
   */
  S3Store.prototype._getS3 = function() {
    if (this._rotationError) {
      return Promise.reject(this._rotationError);
    }

    if (this._s3) {
      return Promise.resolve(this._s3);
    }

    return this._initS3Promise;
  };

  /**
   * A call into S3 whose inputs and outputs are logged.
   * @param {string} name S3 operation name.
   * @param {Object} params S3 operation parameters.
   * @return {Promise} A promise that is resolved with the S3 operation result on success.
   * @private
   * @this HFDM.PropertyGraphStore.BigStore.S3Store
   */
  var _apiCall = async function(name, params) {
    _logQuery.call(this, name, params);
    let chrono = new Chronometer();

    const s3 = await this._getS3();
    const result = await s3[name](params).promise();

    this._timingLogger.debug(name, 'Duration:', chrono.stop().elapsedMilliSec());
    return _logResult.call(this, name, result);
  };

  /**
   * Deletes all the keys within a directory by paging through the directory content.
   * This function is not recursive. It's intended to delete a single directory that may contain
   * many files.
   * @param {string} key Identifies a directory to remove.
   * @return {Promise} A promise that is resolved on success.
   */
  var _deleteDir = async function(key) {
    var that = this;
    var params = {
      Bucket: this._params.options.bucket,
      Prefix: key
    };

    var isTruncated = true;

    // Page through the directory content in case it contains many files:
    while (isTruncated) {
      const result = await _apiCall.call(that, 'listObjectsV2', params);
      params.ContinuationToken = result.NextContinuationToken;
      isTruncated = result.IsTruncated;

      if (result.Contents && result.Contents.length > 0) {
        var deleteParams = {
          Bucket: that._params.options.bucket,
          Delete: {
            Objects: _.map(result.Contents, function(content) {
              return { Key: content.Key };
            }),
            Quiet: true
          }
        };

        await _apiCall.call(that, 'deleteObjects', deleteParams);
      }
    }
  };

  /**
   * @param {string} key Identifies an object that may or may not be a directory.
   * @return {boolean} True if key refers to a directory, false otherwise.
   */
  var _isDirectory = function(key) {
    return key[key.length - 1] === this.pathSep;
  };

  /**
   * Logs an S3 query.
   * @param {string} name S3 operation name.
   * @param {Object} params S3 operation parameters.
   * @private
   * @this HFDM.PropertyGraphStore.BigStore.S3Store
   */
  var _logQuery = function(name, params) {
    if (this._logger.isLevelEnabled(ModuleLogger.levels.DEBUG)) {
      var body = params.Body;
      var bodyExists = !_.isUndefined(body);
      if (bodyExists) {
        params.Body = '<redacted ' + body.length + ' bytes>';
      }

      this._logger.debug(name + ' ==> ' + JsonUtils.stringify(params, null, 2));

      if (bodyExists) {
        params.Body = body;
      }
    }
  };

  /**
   * Logs S3 results.
   * @param {string} name S3 operation name.
   * @param {Object} result S3 operation results.
   * @return {*} The result is returned.
   * @private
   * @this HFDM.PropertyGraphStore.BigStore.S3Store
   */
  var _logResult = function(name, result) {
    if (this._logger.isLevelEnabled(ModuleLogger.levels.DEBUG)) {
      var body = result.Body;
      if (body) {
        result.Body = '<redacted ' + body.length + ' bytes>';
      }

      this._logger.debug(name + ' <== ' + JSON.stringify(result));

      if (body) {
        result.Body = body;
      }
    }
    return result;
  };

  /**
   * Delete an object from the store.
   * @param {string} key Identifies an object to remove.
   * @return {Promise} A promise that gets fulfilled with the deletion result.
   */
  S3Store.prototype.delete = function(key) {
    if (_isDirectory.call(this, key)) {
      return _deleteDir.call(this, key);
    }

    var params = {
      Bucket: this._params.options.bucket,
      Key: key
    };

    return _apiCall.call(this, 'deleteObject', params);
  };

  /**
   * Deletes multiple objects from the store in a single call.
   * @param {Array<string>} keys An array of identifiers of objects to remove.
   * @return {Promise} A promise that gets fulfilled with the deletion result.
   */
  S3Store.prototype.deleteAll = function(keys) {
    if (keys.length === 0) {
      return Promise.resolve();
    }

    var params = {
      Bucket: this._params.options.bucket,
      Delete: {
        Objects: _.map(keys, function(key) {
          return { Key: key };
        }),
        Quiet: false
      }
    };

    return _apiCall.call(this, 'deleteObjects', params);
  };

  /**
   * Tests for the existence of an object in the store.
   * @param {string} key Identifies an object
   * @return {Promise} A promise that resolves to a boolean indicating whether or not the object
   *   exists. The promise will be rejected if unable to determine if the object exists.
   */
  S3Store.prototype.exists = function(key) {
    var params = {
      Bucket: this._params.options.bucket,
      Key: key
    };
    return _apiCall.call(this, 'headObject', params)
      .then(result => !!result)
      .catch(error =>
        error && error.statusCode === HttpStatus.NOT_FOUND ? false : Promise.reject(error)
      );
  };

  /**
   * Fetches an object from the store.
   * @param {string} key Identifies an object to fetch.
   * @return {Promise} A promise that gets fulfilled with the object content as a Buffer.
   */
  S3Store.prototype.getObject = function(key) {
    var that = this;
    var params = {
      Bucket: this._params.options.bucket,
      Key: key
    };

    return _apiCall.call(this, 'getObject', params)
    .then(function(result) {
      return result.Body;
    })
    .catch(function(error) {
      if (error.code === 'NoSuchKey') {
        error.message += ` Key: ${key}`;
      }

      that._logger.debug('getObject failed: ' + JSON.stringify(params), error.message);
      return Promise.reject(error);
    });
  };

  /**
   * Fetches S3 object information, such as its size.
   * @param {string} key Identifies an object
   * @return {Promise} A promise that resolves to the object information if it exists.
   */
  S3Store.prototype.getObjectInfo = async function(key) {
    var params = {
      Bucket: this._params.options.bucket,
      Key: key
    };
    const result = await _apiCall.call(this, 'headObject', params);
    return {
      size: result.ContentLength,
      lastModifiedDate: result.LastModified
    };
  };

  /**
   * Stores an object.
   * @param {string} key Identifies the object to store.
   * @param {Buffer} buffer The object payload.
   * @param {?string} tags An optional series of tags having the format: "key1=value1&key2=value2".
   * @return {Promise} A promise that is fulfilled on success.
   */
  S3Store.prototype.putObject = function(key, buffer, tags) {
    var params = {
      Bucket: this._params.options.bucket,
      Key: key,
      Body: buffer,
      ACL: this._params.options.acl
    };

    if (tags) {
      params.Tagging = tags;
    }

    if (this._params.options.serverSideEncryption) {
      params.ServerSideEncryption = this._params.options.serverSideEncryption;
    }

    return _apiCall.call(this, 'putObject', params);
  };

  /**
   * Returns an object URL for fetching.
   * @param {string} key Identifies the object to fetch.
   * @param {Number} expiry Expiry for the signed url (defaults to signedUrlExpirySec configuration value).
   * @return {Promise} An S3 URL for fetching
   */
  S3Store.prototype.getObjectUrl = async function(key, expiry) {
    const methodName = 'getObject';
    const params = {
      Bucket: this._params.options.bucket,
      Key: key,
      Expires: expiry || this._params.options.signedUrlExpirySec
    };

    _logQuery.call(this, 'getSignedUrl', {Method: methodName, Params: params});

    const s3 = await this._getS3();
    const url = s3.getSignedUrl(methodName, params);

    _logResult.call(this, 'getSignedUrl', {Method: methodName, Url: 'redacted'});

    return url;
  };

  module.exports = S3Store;

})();
