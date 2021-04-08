/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Helper function to check whether a changeset is empty
 */
const _ = require('lodash');

/**
 * Helper function which checks whether a given serialized changeSet is an empty changeSet.
 *
 * @param {property-changeset.SerializedChangeSet} in_changeSet - The changeset to test
 * @return {boolean} True if it is an empty changeset.
 */
const isEmptyChangeSet = function(in_changeSet) {
  return in_changeSet === undefined ||
         (_.isObject(in_changeSet) &&
         (_.isEmpty(in_changeSet) || (_.size(in_changeSet) === 1  && _.has(in_changeSet, 'typeid'))));
};
module.exports = isEmptyChangeSet;
