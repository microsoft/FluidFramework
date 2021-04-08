/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Create an array with random uint32 values
 *
 * @param {number} length - size of a new array
 * @return {number[]} - an array with random values
 */
function generateRandomUInt32Array(length) {
  const array = new Uint32Array(length);
  const crypto = window.crypto || window.msCrypto; // IE 11 support
  crypto.getRandomValues(array);
  return array;
}

module.exports = {
  generateRandomUInt32Array
};
