/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const TypeIdHelper = require('@fluid-experimental/property-changeset').TypeIdHelper;
const PropertyUtils = require('@fluid-experimental/property-changeset').Utils;
const _ = require('lodash');

/**
 * Strips the reversible ChangeSet
 */
function stripReversibleChangeSet() {
  // eslint-disable-next-line complexity
  let callback = function(in_context) {
    let opType = in_context.getOperationType();
    if (opType === 'remove' || opType === 'modify') {
      let type = in_context.getTypeid();
      if (!type) {
        return;
      }
      let splitType = in_context.getSplitTypeID();

      if (TypeIdHelper.isPrimitiveType(type)) {

        // remove old state
        let nestedChangeset = in_context.getNestedChangeSet();
        if (type === 'String' && !_.isString(nestedChangeset)) {
          // String is a special case

          if (nestedChangeset.modify) {
            for (let i = 0; i < nestedChangeset.modify.length; i++) {
              let entry = nestedChangeset.modify[i];
              entry.splice(2, 1);
            }
          }
          if (nestedChangeset.remove) {
            for (let i = 0; i < nestedChangeset.remove.length; i++) {
              let entry = nestedChangeset.remove[i];

              let removeRangeLength = entry[1];
              if (_.isString(removeRangeLength)) {
                removeRangeLength = entry[1].length;
              }
              entry[1] = removeRangeLength;
            }
          }
          if (nestedChangeset && nestedChangeset.hasOwnProperty('value')) {
            in_context.replaceNestedChangeSet(nestedChangeset.value);
          }
        } else if (nestedChangeset && nestedChangeset.hasOwnProperty('value')) {
          in_context.replaceNestedChangeSet(nestedChangeset.value);
        }
      } else if (splitType.context === 'array') {
        let nestedChangeset = in_context.getNestedChangeSet();
        if (nestedChangeset.modify) {
          for (let i = 0; i < nestedChangeset.modify.length; i++) {
            let entry = nestedChangeset.modify[i];
            entry.splice(2, 1);
          }
        }
        if (nestedChangeset.remove) {
          for (let i = 0; i < nestedChangeset.remove.length; i++) {
            let entry = nestedChangeset.remove[i];
            let removeRangeLength = entry[1];
            if (_.isArray(removeRangeLength)) {
              removeRangeLength = entry[1].length;
            }
            entry[1] = removeRangeLength;
          }
        }
      } else if (splitType.context === 'map' ||
                splitType.context === 'single') { // For NodeProperty / inserts at the root
        let nestedChangeset = in_context.getNestedChangeSet();
        if (TypeIdHelper.isPrimitiveType(splitType.typeid)) {
          if (nestedChangeset.modify) {
            let modifiedKeys = Object.keys(nestedChangeset.modify);
            for (let i = 0; i < modifiedKeys.length; i++) {
              let entry = nestedChangeset.modify[modifiedKeys[i]];
              if (entry.value) {
                entry = entry.value;
              }
              nestedChangeset.modify[modifiedKeys[i]] = entry;
            }
          }

          if (nestedChangeset.remove) {
            let removedKeys = nestedChangeset.remove;
            if (!_.isArray(removedKeys)) {
              removedKeys = Object.keys(removedKeys);
              nestedChangeset.remove = removedKeys;
            }
          }
        } else {
          nestedChangeset = in_context.getNestedChangeSet();
          if (nestedChangeset.modify) {
            // this case is handeled recursively
          }

          if (nestedChangeset.remove) {
            if (!_.isArray(nestedChangeset.remove)) {
              // we have a reversibleChangeSet and need to convert
              let newRemove = [];
              let removedTypes = Object.keys(nestedChangeset.remove);
              for (let t = 0; t < removedTypes.length; t++) {
                let removedKeys = Object.keys(nestedChangeset.remove[removedTypes[t]]);
                for (let i = 0; i < removedKeys.length; i++) {
                  newRemove.push(removedKeys[i]);
                }
              }
              nestedChangeset.remove = newRemove;
            }
          }
        }
      }
    }
  };

  if (_.isObject(this._changes) &&
      this._changes.oldValue !== undefined &&
      this._changes.value !== undefined) {
    this._changes = this._changes.value;
    return;
  }

  PropertyUtils.traverseChangeSetRecursively(this._changes, {
    preCallback: callback
  });
}

module.exports = stripReversibleChangeSet;
