/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Checks whether the given key from a ChangeSet is not a typeid, but one of the
 * reserved keywords.
 *
 * @ignore
 * @param {string} in_key - The key to check
 * @return {boolean} - True if it is a reserved keyword
 */
var isReservedKeyword = function(in_key) {
  return in_key === 'insert' ||
         in_key === 'remove' ||
         in_key === 'modify' ||
         in_key === '.children' || // To be removed
         in_key === 'typeid' ||
         in_key === 'insertTemplates';
};

module.exports = isReservedKeyword;
