/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* globals PropertyFactory */
const {uint32x4ToGUID} = require('@fluid-experimental/property-common').GuidUtils;
const _ = require('lodash');

const generateDeterministicGuid = function(deterministicRandom) {
  return uint32x4ToGUID([
    deterministicRandom.irandom(),
    deterministicRandom.irandom(),
    deterministicRandom.irandom(),
    deterministicRandom.irandom()
  ]);
};

const zeroFillNumber = function(in_number, in_length) {
  let number = String(in_number);
  return _.times(in_length - number.length, (x) => '0').join('') + number;
};

const convertKey = function(in_key) {
  return zeroFillNumber(Math.floor(in_key * 1e16), 17);
};

const insertSuccessiveProperties = function(in_root, in_count, in_start = 0, in_end, in_useFractions) {
  let step = 1;
  let start = in_start;
  if (in_end !== undefined) {
    step = (in_end - in_start) / (in_count + 1);
    start += step;
  }
  let testString = _.times(100, () => 'x').join('');
  for (let i = 0; i < in_count; i++) {
    let number;
    if (in_useFractions) {
      number = convertKey(start + i * step);
    } else {
      number = zeroFillNumber(start + i * step, 6);
    }
    if (!in_root.get(number)) {
      in_root.insert(number, PropertyFactory.create('String', undefined, testString));
    }
  }
};

const randomWait = function(maxTime) {
  return new Promise((resolve) => setTimeout(resolve, Math.random() * maxTime));
};

module.exports = {
  generateDeterministicGuid,
  insertSuccessiveProperties,
  convertKey,
  randomWait
};
