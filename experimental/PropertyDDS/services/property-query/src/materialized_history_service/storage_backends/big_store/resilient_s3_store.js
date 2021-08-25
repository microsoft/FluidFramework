/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-use-before-define */
/* eslint-disable consistent-return */
'use strict';

const _ = require('lodash');
const Promise = require('bluebird');

const BigStore = require('./big_store');
const S3Store = require('./s3_store');
const { ModuleLogger } = require('@fluid-experimental/property-query');
const StoreLocation = require('./store_location');
const Chronometer = require('@fluid-experimental/property-common').Chronometer;

/**
 * @fileoverview
 * A resilient big store implementation backed by S3.  Uses a collection of S3Store objects,
 * each configured for a different region/bucket. A write must succeed to all of the regions in
 * order to be considered successful.
 */
class ResilientS3Store extends BigStore {

  /**
   * Instantiate an ResilientS3 BigStore.
   * @param {Object} params Store parameters
   * @param {Object} params.regionalConfigs Array of configs for the individual regional
   *    S3Stores making up the resilient store.
   */
  constructor(params) {

    super(params, StoreLocation.S3, ModuleLogger.getLogger('HFDM.BigStore.ResilientS3Store'));

    this._regionalS3s = [];
    params.regionalConfigs.forEach( rc => {
      this._regionalS3s.push(new S3Store(rc));
    });
  }

  /**
   * @return {string} The S3Store path separator
   */
  get pathSep() {
    return '/';
  }

  /**
   * @return {Object} The S3Store configuration, without sensitive information.
   */
  get config() {
    var filteredConfig = {};
    filteredConfig.regionalConfigs = [];

    this._regionalS3s.forEach(regionalStore => {
      filteredConfig.regionalConfigs.push(regionalStore.config);
    });

    return filteredConfig;
  }

  /**
   * Calls a method on a regional S3 store implementation.
   * @param {S3Store} regionalStore the regional S3Store instance.
   * @param {strging} method the name of the method to invoke.
   * @param {Object[]} args the array of arguments to pass to the method.
   * @return {any} the result of the method call.
   * @private
   */
  async _regionalCall(regionalStore, method, args) {
    if (this._logger.isLevelEnabled(ModuleLogger.levels.DEBUG)) {
      return this._regionalCallTimed(regionalStore, method, args);
    } else {
      var fn = regionalStore[method];
      return fn.apply(regionalStore, args);
    }
  }

  /**
   * Calls a method on a regional S3 store implementation and logs the duration of that call.
   * @param {S3Store} regionalStore the regional S3Store instance.
   * @param {strging} method the name of the method to invoke.
   * @param {Object[]} args the array of arguments to pass to the method.
   * @return {any} the result of the method call.
   * @private
   */
  async _regionalCallTimed(regionalStore, method, args) {
    const c = new Chronometer();
    let detail = `S3(${regionalStore.config.config.region}).${method}`;
    if (args && args.length > 0) {
      detail += `[${args[0]}]`;
    }
    try {
      var fn = regionalStore[method];
      return await fn.apply(regionalStore, args);
    } finally {
      c.stop();
      this._logger.debug(`${detail} elapsed = ${c.elapsedMilliSec()}`);
    }
  }

  /**
   * Delete an object from the store.
   * @param {string} key Identifies an object to remove.
   * @return {Promise} A promise that gets fulfilled with the deletion result.
   */
  async delete(key) {
    var deletePromises = [];
    this._regionalS3s.forEach(regionalStore => {
      deletePromises.push(this._regionalCall(regionalStore, 'delete', [key]));
    });

    return Promise.all(deletePromises);
  }

  /**
   * Deletes multiple objects from the store in a single call.
   * @param {Array<string>} keys An array of identifiers of objects to remove.
   * @return {Promise} A promise that gets fulfilled with the deletion result.
   */
  async deleteAll(keys) {
    var deletePromises = [];
    this._regionalS3s.forEach(regionalStore => {
      deletePromises.push(this._regionalCall(regionalStore, 'deleteAll', [keys]));
    });

    return Promise.all(deletePromises);
  }


  /**
   * Tests for the existence of an object in the store.
   * @param {string} key Identifies an object
   * @return {Promise} A promise that resolves to a boolean indicating whether or not the object
   *   exists. The promise will be rejected if unable to determine if the object exists.
   */
  async exists(key) {
    let existsResult = {};
    existsResult.result = false;
    existsResult.resolved = false;
    existsResult.errors = [];

    return Promise.mapSeries(this._regionalS3s, async regionalStore => {
      if (!existsResult.result) {
        try {
          existsResult.result = await this._regionalCall(regionalStore, 'exists', [key]);
          existsResult.resolved = true;
        } catch (error) {
          existsResult.errors.push(error);
        }
        return Promise.resolve();
      }
    }).then(function() {
      if (existsResult.resolved) {
        return Promise.resolve(existsResult.result);
      } else {
        return Promise.reject(existsResult.errors[0]);
      }
    });
  }

  /**
   * Fetches an object from the store.
   * @param {string} key Identifies an object to fetch.
   * @return {Promise} A promise that gets fulfilled with the object content as a Buffer.
   */
  async getObject(key) {

    let getObjectResult = {};
    getObjectResult.errors = [];

    return Promise.mapSeries(this._regionalS3s, async regionalStore => {
      if (!getObjectResult.result) {
        try {
          getObjectResult.result = await this._regionalCall(regionalStore, 'getObject', [key]);
        } catch (error) {
          getObjectResult.errors.push(error);
        }
        return Promise.resolve();
      }
    }).then(function() {
      if (getObjectResult.result) {
        return Promise.resolve(getObjectResult.result);
      } else {
        return Promise.reject(getObjectResult.errors[0]);
      }
    });
  }

  /**
   * Stores an object.
   * @param {string} key Identifies the object to store.
   * @param {Buffer} buffer The object payload.
   * @param {?string} tags An optional series of tags having the format: "key1=value1&key2=value2".
   * @return {Promise} A promise that is fulfilled on success.
   * @this HFDM.HFDM.BigStore.ResilientS3Store
   */
  async putObject(key, buffer, tags) {
    // keep track of the regions where the put succeeded to rollback on failure
    let successfulRegions = [];
    let firstError;

    let rollbackPromise = async regionalStore => {
      try {
        await regionalStore.delete(key);
      } catch (revertError) {
        // intentionally ignored
      }
    };

    let putPromise = async regionalStore => {
      if (firstError) {
        return;
      }

      try {
        await this._regionalCall(regionalStore, 'putObject', [key, buffer, tags]);
        if (firstError) {
          await rollbackPromise(regionalStore);
        } else {
          successfulRegions.push(regionalStore);
        }
      } catch (putError) {
        if (!firstError) {
          firstError = putError;
        }
      }
    };

    const putPromises = [];
    this._regionalS3s.forEach(regionalStore => {
      putPromises.push(putPromise(regionalStore));
    });

    await Promise.all(putPromises);
    if (firstError) {
      if (successfulRegions.length > 0) {
        try {
          await Promise.all(_.map(successfulRegions, regionalStore => rollbackPromise(regionalStore)));
        } catch (rollbackError) {
          // intentionally ignored
        }
      }
      return Promise.reject(firstError);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Returns signed S3 object URL for fetching.  Tests for the existence of the object in a region before returning
   * an object url from that region.  If the requested object doesn't exist in any of the configured region, will
   * reject with StatusCode 404.
   * @param {string} key Identifies the object to fetch.
   * @param {Number} expiry Expiry for the signed url (default 60)
   * @return {Promise} An URL for fetching
   */
  async getObjectUrl(key, expiry) {
    let getObjectUrlResult = {};
    getObjectUrlResult.errors = [];

    return Promise.mapSeries(this._regionalS3s, async regionalStore => {
      if (!getObjectUrlResult.result) {
        try {
          let exists = await this._regionalCall(regionalStore, 'exists', [key]);
          if (exists) {
            getObjectUrlResult.result = await this._regionalCall(regionalStore, 'getObjectUrl', [key, expiry]);
          } else {
            getObjectUrlResult.errors.push({statusCode: 404});
          }
        } catch (error) {
          getObjectUrlResult.errors.push(error);
        }
        return Promise.resolve();
      }
    }).then(function() {
      if (getObjectUrlResult.result) {
        return Promise.resolve(getObjectUrlResult.result);
      } else {
        return Promise.reject(getObjectUrlResult.errors[0]);
      }
    });
  }
}

module.exports = ResilientS3Store;
