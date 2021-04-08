/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Utility functions related to handling GUIDs
 */

(function() {

  const { generateRandomUInt32Array } = require('../platform-dependent');
  const { repeatString } = require('./strings/index');
  const base64js = require('base64-js');
  const UINT_32HASH_PRIME = 16777619;

  /**
   * Fast high quality 32 bit RNG for consistent guid.
   *
   * Good "randomness" (distribution); Period is approximately equal to  3.11*10^37
   * Implementation was take from "Numerical recipes. The Art of Scientific Computing.", 3rd edition.
   * Page 357, algorithm name: Ranlim32
   *
   */
  const guidRNG = {};

  /**
   * Check if guid is base64 based on the length
   * The length of base16 guid is 36, base64 - 22
   *
   * @param {string} guid Input guid
   * @return {boolean} True if guid is base64
   */
  var isBase64 = function(guid) {
    return guid.length === 22;
  };

  /**
   * Initialize RNG.
   * This function need to be called once, before the first guid gets created.
   *
   * @param {number} [in_seed] Optional 32-bit seed for guid RNG;
   *                           If no seed is given, a combination of system's
   *                           local time and Math.random() is used.
   * @param {boolean} [in_enforceReInitialization] Optionally enforce re-initialization with another seed
   *
   * @return {number} The seed used to initialize the RNG;
   *                  If re-initialization is not enforced,
   *                  a zero indicates that the RNG was not re-seeded.
   * @alias property-common.initializeGUIDGenerator
   */
  guidRNG.initialize = function(in_seed, in_enforceReInitialization) {

    // Quit if the RNG has already been initialized and we do not
    // want to enforce a re-initialization with a new seed
    if (guidRNG.isInitialized && !in_enforceReInitialization) {
      return 0;
    } else {
      guidRNG.isInitialized = true;

      if (in_seed === undefined) {
        const randomValues = generateRandomUInt32Array(4);
        guidRNG.u = randomValues[0];
        guidRNG.v = randomValues[1];
        guidRNG.w1 = randomValues[2];
        guidRNG.w2 = randomValues[3];
      } else {
        guidRNG.v = 224461437;
        guidRNG.w1 = 521288629;
        guidRNG.w2 = 362436069;

        guidRNG.u = in_seed ^ guidRNG.v;
        guidRNG.genRandUInt32();
        guidRNG.v = guidRNG.u;
        guidRNG.genRandUInt32();
      }
      return -1;
    }
  };
  /**
   * Allows for 32-bit integer multiplication with C-like semantics
   *
   * @param {number} n - unsigned int32 value
   * @param {number} m - unsigned int32 value
   * @return {number} - result of unsigned integer multiplication
   */
  function multiply_uint32(n, m) {
    n >>>= 0;
    m >>>= 0;
    const nlo = n & 0xffff;
    return (((n - nlo) * m >>> 0) + (nlo * m)) >>> 0;
  }

  /**
   * @return {number} 32-bit random number based on the RNGs internal state
   */
  guidRNG.genRandUInt32 = function() {

    guidRNG.u = multiply_uint32(guidRNG.u, 2891336453) + 1640531513;
    guidRNG.v ^= guidRNG.v >>> 13;
    guidRNG.v ^= guidRNG.v << 17;
    guidRNG.v = ((guidRNG.v >>> 5) ^ guidRNG.v) >>> 0;

    guidRNG.w1 = multiply_uint32(33378, (guidRNG.w1 & 0xffff)) + (guidRNG.w1 >>> 16);
    guidRNG.w2 = multiply_uint32(57225, (guidRNG.w2 & 0xffff)) + (guidRNG.w2 >>> 16);

    let x = guidRNG.u ^ (guidRNG.u << 9);
    x ^= x >>> 17;
    x ^= x << 6;

    let y = guidRNG.w1 ^ (guidRNG.w1 << 17);
    y ^= y >>> 15;
    y ^= y << 5;
    return (((x >>> 0) + guidRNG.v) ^ ((y >>> 0) + guidRNG.w2)) >>> 0;
  };

  /**
   * Helper function to convert base64 encoding to url friendly format
   *
   * @param {string} base64 Base64 string
   *
   * @return {string} Url-friendly base64 encoding.
   * @alias property-common.toUrlBase64
   */
  var toUrlBase64 = function(base64) {
    return base64.replace(/\+/g, '-').replace(/\//g, '_').split('=')[0];
  };

  /**
   * Helper function to recover padding of base64 encoding
   *
   * @param {string} base64 Base64 string
   *
   * @return {string} Padded base64 encoding.
   * @alias property-common.toPaddedBase64
   */
  var toPaddedBase64 = function(base64) {
    const padLength = 4 - base64.length % 4;
    base64 += repeatString('=', padLength);
    return base64;
  };

  /**
   * Helper function to create a guid string from an array with 32Bit values
   *
   * @param {Uint32Array | Int32Array | Array.<number>} in_guidArray Array with the 32 bit values
   * @param {boolean} base64 Use base64 encoding instead of standart guids
   *
   * @return {string} The guid
   * @alias property-common.uint32x4ToGUID
   */
  var uint32x4ToGUID = function(in_guidArray, base64 = false) {
    if (base64) {
      const intArray = new Uint32Array(in_guidArray);
      const byteArray = new Uint8Array(intArray.buffer);
      const base64guid = base64js.fromByteArray(byteArray);
      // return url-friendly base64
      return toUrlBase64(base64guid);
    } else {
      // Convert to hexadecimal string
      var str = '';
      for (var i = 0; i < 4; i++) {
        var hex = in_guidArray[i].toString(16);
        str += (repeatString('0', 8 - hex.length) + hex);
      }
      return str.substr(0, 8) + '-' + str.substr(8, 4) + '-' +
        str.substr(12, 4) + '-' + str.substr(16, 4) + '-' +
        str.substr(20, 12);
    }
  };

  /**
   * Convert guid to four 32Bit values.
   *
   * @param {string} in_guid The guid to convert
   * @param {Uint32Array | Array.<number>} [io_result] An optional array to write the result to;
   *                                If no array is given, a new one gets created
   * @return {Uint32Array | Array.<number>} Four 32-bit values
   *
   * @alias property-common.guidToUint32x4
   */
  var guidToUint32x4 = function(in_guid, io_result) {
    var result = io_result;
    if (result === undefined) {
      result = new Uint32Array(4);
    }
    if (isBase64(in_guid)) {
      const guid = toPaddedBase64(in_guid);
      const bytes = base64js.toByteArray(guid);
      const intArray = new Uint32Array(bytes.buffer);
      result.set(intArray);
    } else {
      result[0] = parseInt('0x' + in_guid.substr(0, 8), 16);
      result[1] = parseInt('0x' + in_guid.substr(9, 4) + in_guid.substr(14, 4), 16);
      result[2] = parseInt('0x' + in_guid.substr(19, 4) + in_guid.substr(24, 4), 16);
      result[3] = parseInt('0x' + in_guid.substr(28, 8), 16);
    }
    return result;
  };

  /**
   * Convert base64 guid into base16.
   *
   * @param {string} in_guid Base64 guid to convert
   * @return {string} Base16 guid
   *
   * @alias property-common.base64Tobase16
   */
  var base64Tobase16 = function(in_guid) {
    return uint32x4ToGUID(guidToUint32x4(in_guid));
  };

  /**
   * Convert base16 into base64 guid.
   *
   * @param {string} in_guid Base16 guid to convert
   * @return {string} Base64 guid
   *
   * @alias property-common.base16ToBase64
   */
  var base16ToBase64 = function(in_guid) {
    return uint32x4ToGUID(guidToUint32x4(in_guid), true);
  };

  /**
   * Based on the boolean parameter generate either
   * a 128 bit base16 guid with the following format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxx
   * or url-friendly base64 string guid of length 22
   *
   * This function is *not* thread safe!
   *
   * @param {boolean} base64 Use base64 encoding instead of standart guids
   *
   * @return {string} The guid
   * @alias property-common.generateGUID
   */
  var generateGUID = function(base64 = false) {
    var rnds = new Uint32Array(4);

    // Random numbers for guid (4x32 bit)
    rnds[0] = guidRNG.genRandUInt32();
    rnds[1] = guidRNG.genRandUInt32();
    rnds[2] = guidRNG.genRandUInt32();
    rnds[3] = guidRNG.genRandUInt32();
    return uint32x4ToGUID(rnds, base64);
  };

  /**
   * Routine used to check whether the given string is a valid guid
   *
   * @param {string} in_guid The guid to test.
   * @return {boolean} True if the parameter is a valid guid, false otherwise.
   * @alias property-common.isGUID
   */
  // The last character is checked this way because last 4 bits of 22nd character are ignored
  // by decoder, e.g. "+Q" and "+Z" result in the same decoding.
  // The only characters with last 4 bits set to 0 are A, Q, g, w.
  const reBase64 = (/^[A-Za-z0-9\-_]{21}[AQgw]{1}$/);
  const reBase16 = (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
  var isGUID = function(in_guid) {
    return reBase16.test(in_guid) || reBase64.test(in_guid);
  };

  /**
   * Performs a hash combination operation on the two supplied Uint32 arrays of length 4 (using
   * a variant of the algorithm from boost::hash_combine
   *
   * @param {Uint32Array} in_array1 First array
   * @param {Uint32Array} in_array2 Second array
   * @return {Uint32Array} New combined hash
   */
  var hashCombine4xUint32 = function(in_array1, in_array2) {

    var accumulated = new Uint32Array(in_array2);
    accumulated[0] += 0x9e3779b9;
    accumulated[1] += 0x638f227;
    accumulated[2] += 0x1aff2bad;
    accumulated[3] += 0x3a8f05c5;

    accumulated[0] += in_array1[3] << 6;
    accumulated[1] += in_array1[0] << 6;
    accumulated[2] += in_array1[1] << 6;
    accumulated[3] += in_array1[2] << 6;

    accumulated[0] += in_array1[2] >> 2;
    accumulated[1] += in_array1[3] >> 2;
    accumulated[2] += in_array1[0] >> 2;
    accumulated[3] += in_array1[1] >> 2;

    accumulated[0] = ((accumulated[0] ^ in_array1[1]) * UINT_32HASH_PRIME) >>> 0;
    accumulated[1] = ((accumulated[1] ^ in_array1[2]) * UINT_32HASH_PRIME) >>> 0;
    accumulated[2] = ((accumulated[2] ^ in_array1[3]) * UINT_32HASH_PRIME) >>> 0;
    accumulated[3] = ((accumulated[3] ^ in_array1[0]) * UINT_32HASH_PRIME) >>> 0;

    return accumulated;
  };

  /**
   * Takes two guids and generates a new derived guid.
   * Note: You should only use this helper function when you need only one combination.
   *       Otherwise, it is more efficient to work on the uint8 arrays directly.
   *
   * @param {string} in_guid1 Input guid
   * @param {string} in_guid2 Input guid
   * @param {boolean} base64 Use base64 encoding instead of standart guids
   * @return {string} Combined guid
   */
  var combineGuids = function(in_guid1, in_guid2, base64 = false) {
    var firstArray = guidToUint32x4(in_guid1);
    var secondArray = guidToUint32x4(in_guid2);
    var combined = hashCombine4xUint32(firstArray, secondArray);
    return uint32x4ToGUID(combined, base64);
  };

  // Make sure the RNG is initialized
  guidRNG.initialize();

  module.exports = {
    uint32x4ToGUID,
    guidToUint32x4,
    base64Tobase16,
    base16ToBase64,
    initializeGUIDGenerator: guidRNG.initialize,
    generateGUID,
    isGUID,
    combineGuids,
    hashCombine4xUint32
  };
})();
