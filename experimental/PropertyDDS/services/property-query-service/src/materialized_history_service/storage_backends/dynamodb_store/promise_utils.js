/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Promise conversion tools that allow converting from node callbacks to promises and vice versa.
 */
(function() {
  'use strict';

  var PromiseUtils = {};

  /**
   * Calls a node style callback upon promise fulfillment or rejection.
   * @param {Promise} in_promise A promise.
   * @param {Function} in_cb A node style callback.
   * @return {Promise} A promise that invokes in_cb upon being fulfilled or rejected.
   */
  PromiseUtils.chainCallback = function(in_promise, in_cb) {
    return in_promise.then(in_cb.bind(null, null)).catch(in_cb);
  };

  /**
   * Ensures that a callback is invoked after a promise, whether it resolves or rejects.
   * Finally does not alter the promise chain result. If in_promise is rejected,
   * in_cb is invoked and the error is propagated.
   * @param {Promise} in_promise A promise.
   * @param {Function} in_cb A callback to invoke after in_promise resolves or rejects. The
   *   callback must return a promise (to allow async final blocks). The callback is guaranteed to
   *   be invoked only once. If in_cb throws or rejects, it will cause the promise
   *   to be rejected with the thrown error. If both in_promise and in_cb reject, the resulting
   *   error in the rejected promise will be from in_cb (the in_cb error shadows the in_promise
   *   error).
   * @return {Promise} A new promise that is made of the original in_promise chained with the
   *   finally execution blocks.
   */
  PromiseUtils.finally = function(in_promise, in_cb) {
    return in_promise
      .then(
        result => in_cb().then(() => result),
        error => in_cb().then(() => Promise.reject(error))
      );
  };

  /**
   * Delays / Waits / Sleeps for the specified duration.
   * @example
   * // Sleeps for a second:
   * await sleep(1000);
   * @param {number} timeoutMilliSec The sleep timeout, in milliseconds.
   * @return {Promise} A promise that resolves after the specified timeout.
   */
  PromiseUtils.sleep = function(timeoutMilliSec) {
    return new Promise(resolve => setTimeout(resolve, timeoutMilliSec));
  };

  module.exports = PromiseUtils;
})();
