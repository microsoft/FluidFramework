/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Helper function the divides a changeSet into chunks
 */

const _ = require('lodash');

/**
 * This function merges the chunks created by chunkChangeSet back into a
 * single changeset.
 *
 * TODO: This needs to treat arrays correctly
 *
 * @param {Array<HFDM.Property.SerializedChangeSet>} in_chunks -
 *     The chunks to be merged
 * @return {HFDM.Property.SerializedChangeSet}
 *     The merged changeset
 */
const mergeChunkedChangeSet = function(in_chunks) {
  let result = {};

  for (let i = 0; i < in_chunks.length; i++) {
    let chunk = in_chunks[i];

    // We have to perform a recursive traversal of the changeset
    // in the chunk to do a "deep merge"
    let stack = [{
      chunkCS: chunk,
      mergedCS: result
    }];

    while (stack.length !== 0) {
      let state = stack.pop();
      let keys = Object.keys(state.chunkCS);
      for (let j = 0; j < keys.length; j++) {
        let key = keys[j];

        let nestedCS = state.chunkCS[key];
        if (_.isObject(nestedCS)) {
          // If this is an object or an array, we have to recursively merge it
          let entry = state.mergedCS[key] || (_.isArray(nestedCS) ? [] : {});
          state.mergedCS[key] = entry;
          stack.push({
            chunkCS: nestedCS,
            mergedCS: entry,
            key: key
          });
        } else {
          if (state.key !== 'remove' || !_.isArray(state.mergedCS)) {
            // If this is a primitive type, insert it into the CS
            state.mergedCS[key] = nestedCS;
          } else {
            // We have two arrays with remove operations, we have to concatenate them
            if (!_.includes(state.mergedCS, nestedCS)) {
              state.mergedCS.push(nestedCS);
            }
          }
        }
      }
    }
  }

  return result;
};

module.exports =  { mergeChunkedChangeSet };
