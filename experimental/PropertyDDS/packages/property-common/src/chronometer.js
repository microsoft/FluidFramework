/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview A chronometer implementation backed by a high resolution timer. Implementation
 *   falls back to milliseconds precision when high resolution timers are not supported.
 */
(function() {

  /**
   * Creates and starts a new Chronometer.
   */
  var Chronometer = function() {
    this.start();
  };

  /**
   * All the chronometer implementations (hrtime, window.performance, and date:
   */
  var implementations = {
    // Node implementation uses hrtime
    node: {
      name: 'hrtime',
      _start: function() {
        this._startTime = process.hrtime();
      },
      _stop: function() {
        this._stopTime = process.hrtime(this._startTime);
        return this;
      },
      _elapsedSec: function() {
        if (!this._stopTime) {
          this.stop();
        }
        return this._stopTime[0] + this._stopTime[1] / 1000000000;
      },
      _elapsedMilliSec: function() {
        if (!this._stopTime) {
          this.stop();
        }
        return this._stopTime[0] * 1000 + this._stopTime[1] / 1000000;
      },
      _elapsedMicroSec: function() {
        if (!this._stopTime) {
          this.stop();
        }
        return this._stopTime[0] * 1000000 + this._stopTime[1] / 1000;
      }
    },
    // Browser implementation uses window.performance (if available):
    performance: {
      name: 'window.performance',
      _start: function() {
        this._startTime = window.performance.now();
      },
      _stop: function() {
        this._stopTime = window.performance.now();
        return this;
      },
      _elapsedSec: function() {
        if (!this._stopTime) {
          this.stop();
        }
        return this.elapsedMilliSec() / 1000;
      },
      _elapsedMilliSec: function() {
        if (!this._stopTime) {
          this.stop();
        }
        return this._stopTime - this._startTime;
      },
      _elapsedMicroSec: function() {
        if (!this._stopTime) {
          this.stop();
        }
        return this.elapsedMilliSec() * 1000;
      }
    },
    // Fallback is Date implementation if none of the above is supported:
    date: {
      name: 'date',
      _start: function() {
        this._startTime = new Date();
      },
      _stop: function() {
        this._stopTime = new Date();
        return this;
      },
      _elapsedSec: function() {
        if (!this._stopTime) {
          this.stop();
        }
        return this.elapsedMilliSec() / 1000;
      },
      _elapsedMilliSec: function() {
        if (!this._stopTime) {
          this.stop();
        }
        return this._stopTime - this._startTime;
      },
      _elapsedMicroSec: function() {
        if (!this._stopTime) {
          this.stop();
        }
        return this.elapsedMilliSec() * 1000;
      }
    }
  };

  var impl;
  if (typeof process !== 'undefined' && typeof process.hrtime !== 'undefined') {
    impl = implementations.node;
  } else if (
    typeof window !== 'undefined' &&
    typeof window.performance !== 'undefined' &&
    typeof window.performance.now !== 'undefined'
  ) {
    impl = implementations.performance;
  } else {
    impl = implementations.date;
  }

  /**
   * Sets the chronometer start time.
   */
  Chronometer.prototype.start = impl._start;

  /**
   * Stops the chronometer. Stopped chronometers can be reused by calling {@link #start} again.
   * @return {Chronometer} The chronometer instance, so that callers can do this:
   *   let elapsedMS = chrono.stop().elapsedMS();
   */
  Chronometer.prototype.stop = impl._stop;

  /**
   * @return {number} How many microseconds have elapsed between the last call to {@link #start}
   *   (or the chronometer creation), and {@link #stop}. Implementations that are not precise
   *   enough may return "elapsedMilliSec() * 1000". Measuring elapsed time causes the chronometer
   *   to be stopped if required (if the chrono is not stopped when this method is called).
   */
  Chronometer.prototype.elapsedMicroSec = impl._elapsedMicroSec;

  /**
   * @return {number} How many milliseconds have elapsed between the last call to {@link #start}
   *   (or the chronometer creation), and {@link #stop}. Measuring elapsed time causes the
   *   chronometer to be stopped if required (if the chrono is not stopped when this method is
   *   called).
   */
  Chronometer.prototype.elapsedMilliSec = impl._elapsedMilliSec;

  /**
   * @return {number} How many seconds have elapsed between the last call to {@link #start}
   *   (or the chronometer creation), and {@link #stop}. Measuring elapsed time causes the
   *   chronometer to be stopped if required (if the chrono is not stopped when this method is
   *   called).
   */
  Chronometer.prototype.elapsedSec = impl._elapsedSec;

  /**
   * A utility function to measure promise execution time.
   * @param {Function} in_promiseFn A function that returns a promise whose execution time is to be
   *   measured.
   * @return {Promise} A Promise that resolves with an object: {
   *   {object} chrono A stopped chronometer instance from which to get the elapsed time,
   *   {*} result The resolved result of the promise returned by in_promiseFn
   * }
   */
  Chronometer.timePromise = function(in_promiseFn) {
    return new Promise(function(resolve, reject) {
      var chrono = new Chronometer();
      return in_promiseFn()
        .then(function(result) {
          chrono.stop();
          resolve({ chrono: chrono, result: result });
        })
        .catch(function(error) {
          reject(error);
        });
    });
  };

  module.exports = Chronometer;
})();
