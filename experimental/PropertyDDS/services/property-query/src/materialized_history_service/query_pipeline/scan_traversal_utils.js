/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');

/**
 * A utility class to determine if traversal should continue, when gathering values for paging or filtering
 */
class ScanTraversalUtils {
  /**
   * Determines whether the current context should stop traversal
   * @param {String} tokenizedPagingPath - Prefix on which to select
   * @param {Object} tokenizedFieldsToGather -
   *   Object whose keys correspond to the keys of each item to gather
   * @param {Number} depthLimit - Maximum depth to traverse from tokenizedPagingPat
   * @param {Object} context - Traversal context
   * @return {Boolean} - Whether to stop traversing
   */
  static shouldStopTraversing(tokenizedPagingPath, tokenizedFieldsToGather, depthLimit, context) {
    // Root context, keep moving
    if (context._parentStack.length === 0) {
      return false;
    }

    // In one parent of the tokenize paging path
    if (tokenizedPagingPath.length >= context._parentStack.length) {
      let tppSlicedToDepth = tokenizedPagingPath.slice(0, context._parentStack.length);
      if (!_.isEqual(tppSlicedToDepth, context._parentStack)) {
        return true;
      }
    // Down here, we are in some child of the tokenizedPagingPath, but is it the right one?
    } else {
      // Direct child of the tokenizedPaging path, keep on kind sir.
      if (tokenizedPagingPath.length + depthLimit >= context._parentStack.length) {
        return false;
      // So we are in one child of the properties we want to filter on.
      // Did we go too far than what we need to capture?
      } else {
        for (let tokenizedSubPath of tokenizedFieldsToGather) {
          const len = Math.min(
            context._parentStack.length, tokenizedPagingPath.length + depthLimit
            ) + tokenizedSubPath.length;
          // Current path is shorter than the matching path
          if (len >= context._parentStack.length) {
            let comparable = context._parentStack.slice(0, tokenizedPagingPath.length + depthLimit)
                                                  .concat(tokenizedSubPath)
                                                  .slice(0, context._parentStack.length);

            // We are in one of the parent of a sub path, move on
            if (_.isEqual(comparable, context._parentStack)) {
              return false;
            }
          } else {
            // Here, it means this path is longer than the one we are comparing.
            // This means we are out of bound for this iteration.  Once all iterations are completed
            // and we know none of them matched, we know we can break,
            // hence the return true below.
          }
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Filters the traversal contexts to identify if a property is to be filtered/paged
   * @param {String} tokenizedPagingPath - Prefix on which to select
   * @param {Number} depthLimit - Maximum depth to traverse from tokenizedPagingPath
   * @param {Object} context - Traversal context
   * @return {Boolean} - Whether this represent the property to sort upon
   */
  static isItemContext(tokenizedPagingPath, depthLimit, context) {
    const expectedStackLength = tokenizedPagingPath.length + depthLimit;
    if (expectedStackLength < context._parentStack.length ||
       tokenizedPagingPath.length >= context._parentStack.length) {
      return false;
    }

    const beginPart = context._parentStack.slice(0, tokenizedPagingPath.length);
    return _.isEqual(beginPart, tokenizedPagingPath);
  }
}

module.exports = ScanTraversalUtils;
