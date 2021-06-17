/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Utility Functions to process node references
 */

/**
 * Splits a node reference string
 * @param {String} in_reference -
 *     Reference to the node
 * @return {{type: String, guid: String}} The parsed node reference
 */
const parseNodeReference = function(in_reference) {
  let splitRef = in_reference.split(':');
  return {
    type: splitRef[0],
    guid: splitRef[1],
    subId: splitRef[2]
  };
};

const getBaseNodeRef = function(in_reference) {
  let parsedRef = parseNodeReference(in_reference);
  return parsedRef.type + ':' + parsedRef.guid;
};

module.exports = {
  parseNodeReference,
  getBaseNodeRef
};
