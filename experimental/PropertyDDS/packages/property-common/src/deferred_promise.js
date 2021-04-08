/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-use-before-define */
/**
 * Creates a Promise that can be fulfilled or rejected later in an arbitrary manner (rather than
 * through the constructor's executor).
 * For example, a deferred promise could be fulfilled after waiting for many asynchronous
 * tasks to terminate. This class becomes useful when combining classic async calls with promises.
 */
(function() {
  'use strict';

  /**
   * Create a new DeferredPromise.
   * @constructor
   */
  var DeferredPromise = function() {
    var lResolve, lReject;
    var p = new Promise(function(resolve, reject) {
      lResolve = resolve;
      lReject = reject;
    });

    p._deferredPromiseResolve = lResolve;
    p._deferredPromiseReject = lReject;
    p.getCb = _getCb;
    p.resolve = _resolve;
    p.reject = _reject;
    return p;
  };

  DeferredPromise.prototype = Object.create(Promise.prototype);
  DeferredPromise.prototype.constructor = Promise;

  /**
   * Fetches a node style callback that fulfills the promise when called.
   * @return {Function} A node style callback that fulfills the promise when called.
   */
  var _getCb = function() {
    var that = this;

    return function(error, result) {
      if (error) {
        return that.reject(error);
      }

      return that.resolve(result);
    };
  };

  /**
   * Resolves the promise.
   * @param {*} in_result The promise result.
   */
  var _resolve = function(in_result) {
    this._deferredPromiseResolve(in_result);
  };

  /**
   * Rejects the promise.
   * @param {*} in_error The error.
   */
  var _reject = function(in_error) {
    this._deferredPromiseReject(in_error);
  };

  module.exports = DeferredPromise;
})();
