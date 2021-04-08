/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Helper class to create a deterministic sequence of random numbers.
 */
(function() {
  const { guidToUint32x4 } = require('./guid_utils');
  const { hashCombine4xUint32, HashCalculator } = require('./hash_calculator');
  const _ = require('lodash');

  /**
   * Random number generator that creates a deterministic sequence of random numbers based on an initial seed GUID
   *
   * Warning: This is a very straight forward implementation based on the hashCombine4xUint32 function. It probably
   *          doesn't produce very high quality random numbers (do not use this for cryptography!) and it is not very
   *          efficient.
   *
   * @param {string|number} in_seed - The initial seed (it can be either a GUID or a number)
   *                                  which is used to initialize the random number generator
   */
  var DeterministicRandomGenerator = function(in_seed) {
    // Initialize the internal state from the given initial guid
    if (_.isString(in_seed)) {
      this._guid1 = guidToUint32x4(in_seed);
    } else if (_.isNumber(in_seed)) {
      const hashCalculator = new HashCalculator()
      hashCalculator.pushFloat64(in_seed);
      this._guid1 = guidToUint32x4(hashCalculator.getHash());
    }
    this._guid2 = new Uint32Array(4);
    this._guid2[0] = (this._guid1[0] + 1) >>> 0;
    this._guid2[1] = (this._guid1[1] + 1) >>> 0;
    this._guid2[2] = (this._guid1[2] + 1) >>> 0;
    this._guid2[3] = (this._guid1[3] + 1) >>> 0;

    this._result = new Uint32Array(4);
  };

  /**
   * Creates a floating point random number
   *
   * @param {number=} [in_max=1.0] If supplied the returned number will be 0 <= number < in_max. If none is given
   *                               in_max = 1 is assumed
   * @return {number} The random number
   */
  DeterministicRandomGenerator.prototype.random = function(in_max) {
    var randomInteger = this.irandom();

    if (in_max === undefined) {
      return randomInteger / 4294967296;
    } else {
      return randomInteger / 4294967296 * in_max;
    }
  };

  /**
   * Creates an integer point random number
   *
   * @param {number=} [in_max=4294967296] If supplied the returned number will be 0 <= number < in_max. If none is given
   *                                      in_max = 14294967296 (2^32) is assumed
   * @return {number} The random number
   */
  DeterministicRandomGenerator.prototype.irandom = function(in_max) {
    // Create a new hash
    hashCombine4xUint32(this._guid1, this._guid2, this._result);

    // Permute the hashes
    for (var i = 0; i < 4; i++) {
      this._guid1[i] = this._guid2[i];
      this._guid2[i] = this._result[i];
    }

    if (in_max === undefined) {
      return this._guid1[0];
    } else {
      if (in_max < 16777619) {
        // The random generator doesn't seem to be very good.
        // It is quite biased (e.g. it generates too many even numbers)
        // this is a hack to solve at least this problem, but we probably should
        // instead use a different approach alltogether
        return ((this._guid1[0]) % 16777619) % in_max;
      } else {
        return this._guid1[0] % in_max;
      }
    }
  };

  module.exports = DeterministicRandomGenerator;
})();
