/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const YIELD_EVERY_N = 1000;
const PropertyUtils = require('@fluid-experimental/property-changeset').Utils;
const PathHelper = require('@fluid-experimental/property-changeset').PathHelper;

/**
 * Provides in-memory filtering by type for a changeSet
 */
class InMemoryByType {
  /**
   * Trivial implementation to filter changeSets by path
   * that acts as an alternative to getChangesByType, since it doesn't return a valid changeSet.
   * @param {Object} from - From clause
   * @param {Object} changeSet - ChangeSet Object
   * @return {Object} - Filtered changeset
   */
  static async filterByType(from, changeSet) {
    const tokenizedPathPrefix = PathHelper.tokenizePathString(from.pathPrefix);
    let depthBumper = tokenizedPathPrefix.length + from.depthLimit;

    return new Promise((resolve) => {
      let paths = [];
      let counter = 0;
      PropertyUtils.traverseChangeSetRecursivelyAsync(changeSet, {
        preCallback: (context, cb) => {
          if (context._parentStack.length > depthBumper) {
            return cb('break');
          }
          if (context.getTypeid() === from.typeId) {
            paths.push(context._fullPath);
          }
          counter++;

          if (counter >= YIELD_EVERY_N) {
            setImmediate(cb);
            counter = 0;
          } else {
            cb();
          }
          return undefined;
        }
      }, () => {
        resolve({
          changeSet: PropertyUtils.getFilteredChangeSetByPaths(changeSet, paths),
          queryPaths: paths
        });
      });
    });
  }
}

module.exports = InMemoryByType;
