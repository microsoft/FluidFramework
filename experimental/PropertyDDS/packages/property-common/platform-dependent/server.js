/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
const crypto = require('crypto');
/**
 * Create an array with random uint32 values
 *
 * @param {number} length - size of a new array
 * @return {number[]} - an array with random values
 */
function generateRandomUInt32Array(length) {
  const buffer = Buffer.alloc(length * 4);
  crypto.randomFillSync(buffer);
  return Array.from({ length }, (_, i) => buffer.readUIntBE(i * 4, 4));
}

module.exports = {
  generateRandomUInt32Array
};
