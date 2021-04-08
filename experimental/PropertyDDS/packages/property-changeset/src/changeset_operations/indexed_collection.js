/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Helper functions and classes to work with ChangeSets with indexed collections (sets and maps)
 */

const _ = require('lodash');
const MSG = require('@fluid-experimental/property-common').constants.MSG;
const ConflictType = require('./changeset_conflict_types');
const isEmptyChangeSet = require('./is_empty_changeset');
const TypeIdHelper = require('../helpers/typeid_helper');
const deepCopy = _.cloneDeep;
const joinPaths = require('@fluid-experimental/property-common').Strings.joinPaths;
const PROPERTY_PATH_DELIMITER = require('@fluid-experimental/property-common').constants.PROPERTY_PATH_DELIMITER;
const PathHelper = require('../path_helper');

/**
 * @namespace property-changeset.ChangeSetOperations.IndexedCollectionOperations
 * @alias property-changeset.ChangeSetOperations.IndexedCollectionOperations
 * Helper functions and classes to perform operations on ChangeSets with indexed collections (sets and maps)
 */

/**
 * Checks whether an object is empty (has no keys)
 * This function should be a bit faster than the _.isEmpty from
 * underscore. Unfortunately, at least on Chrome, it is still in
 * O(n)
 *
 * @param {Object} in_object  - The object to check
 * @return {boolean} Is it empty?
 * @private
 */
var _fastIsEmptyObject = function(in_object) {
  if (!in_object || _.isArray(in_object) || !_.isObject(in_object)) {
    return _.isEmpty(in_object);
  }

  for (var key in in_object) { // eslint-disable-line
    return false;
  }

  return true;
};

var ChangeSetIndexedCollectionFunctions = {
  /**
   * Applies a ChangeSet to a given indexed collection property (recursively). The ChangeSet is assumed to be relative
   * to the same property root and it will be applied behind the base ChangeSet (assuming that the changes are
   * relative to the state after the base ChangeSet has been applied. It will change the base ChangeSet.
   *
   * @param {property-changeset.SerializedChangeSet} io_basePropertyChanges    - The ChangeSet describing the initial state
   * @param {property-changeset.SerializedChangeSet} in_appliedPropertyChanges - The ChangeSet to apply to this state
   * @param {string}                            in_typeid                 - The typeid of the contents collection
   *                                                                        (without the collection type)
   * @param {Object} [in_options] - Optional additional parameters
   * @param {Map} [in_options.applyAfterMetaInformation] - Additional meta information which help later to obtain
   *                                                       more compact changeset during the apply operation
   *
   * @private
   */
  _performApplyAfterOnPropertyIndexedCollection: function(io_basePropertyChanges, // eslint-disable-line complexity
                                                          in_appliedPropertyChanges,
                                                          in_typeid,
                                                          in_options) {
    var isPrimitiveType = TypeIdHelper.isPrimitiveType(in_typeid);

    // Handle remove entry operations
    if (in_appliedPropertyChanges.remove) {
      // Get and initialize the corresponding entries in the existing collection
      var removedEntries = in_appliedPropertyChanges.remove;

      io_basePropertyChanges = io_basePropertyChanges || {};
      io_basePropertyChanges.remove = io_basePropertyChanges.remove ||
                                      (_.isArray(in_appliedPropertyChanges.remove) ? [] : {});
      var baseInserted   = io_basePropertyChanges.insert || {};
      var baseRemoved = io_basePropertyChanges.remove;
      var baseModified = io_basePropertyChanges.modify;
      var done = false;

      if (!_.isArray(removedEntries)) {
        if (isPrimitiveType) {
          removedEntries = Object.keys(removedEntries);
        } else {
          // this is a reversible change set of templated types
          var removedTypes = Object.keys(removedEntries);
          for (var t = 0; t < removedTypes.length; t++) {
            var removedKeys = Object.keys(removedEntries[removedTypes[t]]);
            for (var i = 0; i < removedKeys.length; i++) {
              if (baseInserted[removedTypes[t]] &&
                baseInserted[removedTypes[t]][removedKeys[i]] !== undefined) {
                delete baseInserted[removedTypes[t]][removedKeys[i]];

                // If all entries for a typeid have been removed, we can remove
                // the whole typeid from the inserted section
                if (baseInserted && _.isEmpty(baseInserted[removedTypes[t]])) {
                  delete baseInserted[removedTypes[t]];
                }
              } else {
                if (baseModified && baseModified[removedTypes[t]] &&
                      baseModified[removedTypes[t]][removedKeys[i]] !== undefined) {
                  delete baseModified[removedTypes[t]][removedKeys[i]];

                  // If all entries for a typeid have been removed, we can remove
                  // the whole typeid from the inserted section
                  if (baseModified && _.isEmpty(baseModified[removedTypes[t]])) {
                    delete baseModified[removedTypes[t]];
                  }
                }
                if (_.isArray(baseRemoved)) {
                  baseRemoved.push(removedKeys[i]);
                } else {
                  if (!baseRemoved[removedTypes[t]]) {
                    baseRemoved[removedTypes[t]] = {};
                  }
                  baseRemoved[removedTypes[t]][removedKeys[i]] = removedEntries[removedTypes[t]][removedKeys[i]];
                }
              }
            }
          }
          done = true;
        }
      }

      if (!done) {
        if (isPrimitiveType) {
          for (var i = 0; i < removedEntries.length; i++) {
            var key = removedEntries[i];

            // If there is an insert for this key, we just remove it
            if (baseInserted[key] !== undefined) {
              delete baseInserted[key];
            } else {
              // There could be a modify entry for this key, which we have to remove
              if (baseModified && baseModified[key] !== undefined) {
                delete baseModified[key];
              }

              // Otherwise we add it to the remove list
              if (_.isArray(baseRemoved)) {
                baseRemoved.push(key);
              } else {
                baseRemoved[key] = in_appliedPropertyChanges.remove[key];
              }
            }
          }
        } else {
          var baseInsertedTypeids = _.keys(baseInserted);
          for (var i = 0; i < removedEntries.length; i++) {
            var key = removedEntries[i];
            var foundInTypeid = undefined;

            // Since we only have a flat remove list (without typeid) in the changeset, we have
            // to check all inserts
            for (var j = 0; j < baseInsertedTypeids.length; j++) {
              if (baseInserted[baseInsertedTypeids[j]] &&
                      baseInserted[baseInsertedTypeids[j]][key] !== undefined) {
                foundInTypeid = baseInsertedTypeids[j];
                break;
              }
            }

            if (foundInTypeid) {
              // If this key was inserted by this ChangeSet, we just remove it from the inserted list
              delete baseInserted[foundInTypeid][key];

              // If all entries for a typeid have been removed, we can remove
              // the whole typeid from the inserted or modified section
              if (baseInserted && _.isEmpty(baseInserted[foundInTypeid])) {
                delete baseInserted[foundInTypeid];
              }
              if (baseModified && _.isEmpty(baseModified[foundInTypeid])) {
                delete baseModified[foundInTypeid];
              }

            } else {
              // There could be a modify entry for this key, which we have to remove
              var baseModifiedTypeids = _.keys(baseModified);
              for (var j = 0; j < baseModifiedTypeids.length; j++) {
                if (baseModified[baseModifiedTypeids[j]][key]) {
                  foundInTypeid = baseModifiedTypeids[j];
                  delete baseModified[foundInTypeid][key];
                  break;
                }
              }

              // Otherwise we add it to the remove list
              baseRemoved.push(key);
            }
          }
        }
      }
    }

    // Apply insert operations
    if (in_appliedPropertyChanges.insert) {
      // Get and initialize the corresponding entries from the existing collection
      io_basePropertyChanges = io_basePropertyChanges || {};
      io_basePropertyChanges.insert = io_basePropertyChanges.insert || {};
      var baseInserted = io_basePropertyChanges.insert;
      var baseRemoved = io_basePropertyChanges.remove;

      // Insert the inserted entries

      // If no typeids are included, we just use a placeholder for the iteration below
      var insertedTypeids = isPrimitiveType ? [undefined] : _.keys(in_appliedPropertyChanges.insert);
      for (var i = 0; i < insertedTypeids.length; i++) {
        var typeid = insertedTypeids[i];
        const insertedEntries = isPrimitiveType ?
          in_appliedPropertyChanges.insert : in_appliedPropertyChanges.insert[typeid];
        var insertedKeys = _.keys(insertedEntries);
        var removalCS = undefined;
        if (baseRemoved) {
          removalCS = isPrimitiveType ? baseRemoved : baseRemoved[typeid];
        }
        for (var j = 0; j < insertedKeys.length; j++) {
          var key = insertedKeys[j];
          var deeplyEqualCS = false;

          // If we have a complex type in the collection, we need to do a deep comparison of the two
          // ChangeSets to determine, whether they are equal
          // TODO: We should actually compute a diff between the two and recursively convert portions to modifies
          // Instead, right now, we only handle the case where the two keys cancel each out perfectly, i.e.,
          // the insert is reinserting exactly what was removed.
          if (!isPrimitiveType && removalCS && _.isObject(removalCS) && removalCS[key] !== undefined) {
            // Split out the two parts: all the keys other than remove/insert should match exactly.
            // The contents 'remove' and 'insert', if they exist, should also match.
            deeplyEqualCS = !!insertedEntries[key].insert === !!removalCS[key].remove;

            // If there are 'insert' and 'remove', see if the removed data matches the inserted data
            if (deeplyEqualCS && insertedEntries[key].insert) {
              deeplyEqualCS = _.isEqual(
                insertedEntries[key].insert,
                removalCS[key].remove
              );
            }

            // Finally, check if the data being inserted matches the data that was removed
            let insertedEntry = _.isObject(insertedEntries[key]) ? _.without(insertedEntries[key], 'insert') : insertedEntries[key];
            let removedEntry = _.isObject(removalCS[key]) ? _.without(removalCS[key], 'remove') : removalCS[key];
            deeplyEqualCS = deeplyEqualCS && _.isEqual(insertedEntry, removedEntry);
          }

          if ((isPrimitiveType || TypeIdHelper.isPrimitiveType(typeid) || deeplyEqualCS) &&
              removalCS &&
              ((_.isArray(removalCS) && _.includes(baseRemoved, key)) || removalCS[key] !== undefined)) {
            // A remove and insert are combined into a modify for primitive types

            // Remove the old remove command
            var oldValueMatches = false;
            if (_.isArray(removalCS)) {
              if (isPrimitiveType) {
                io_basePropertyChanges.remove = _.without(io_basePropertyChanges.remove, key);
              } else {
                io_basePropertyChanges.remove[typeid] = _.without(io_basePropertyChanges.remove[typeid], key);
              }
            } else {
              oldValueMatches = deeplyEqualCS || (removalCS[key] === insertedEntries[key]);
              delete removalCS[key];
            }

            // Insert a modify command instead
            if (!oldValueMatches) {
              io_basePropertyChanges.modify = io_basePropertyChanges.modify || {};
              if (isPrimitiveType) {
                io_basePropertyChanges.modify[key] = insertedEntries[key];
              } else {
                io_basePropertyChanges.modify[typeid] = io_basePropertyChanges.modify[typeid] || {};
                io_basePropertyChanges.modify[typeid][key] = deepCopy(insertedEntries[key]);
              }
            }
          } else if (isPrimitiveType && baseInserted[key] === undefined) {
            baseInserted[key] = insertedEntries[key];
          } else if (!isPrimitiveType && (!baseInserted[typeid] || baseInserted[typeid][key] === undefined)) {
            baseInserted[typeid] = baseInserted[typeid] || {};
            baseInserted[typeid][key] = deepCopy(insertedEntries[key]);
          } else {
            throw new Error(MSG.ALREADY_EXISTING_ENTRY + key);
          }
        }
      }
    }

    // Handle modification operations
    if (in_appliedPropertyChanges.modify) {
      // Get and initialize the corresponding entries from the existing collection
      var modifiedEntries = in_appliedPropertyChanges.modify;
      io_basePropertyChanges = io_basePropertyChanges || {};
      io_basePropertyChanges.modify = io_basePropertyChanges.modify || {};
      var baseModified = io_basePropertyChanges.modify;
      var baseInserted    = io_basePropertyChanges.insert || {};

      // Process the modifications

      // If no typeids are included, we just use a placeholder for the iteration below
      var modifiedTypeids = isPrimitiveType ? [undefined] : _.keys(modifiedEntries);
      for (var i = 0; i < modifiedTypeids.length; i++) {
        var typeid = modifiedTypeids[i];

        var modifyKeys = _.keys(isPrimitiveType ? modifiedEntries : modifiedEntries[typeid]);
        for (var j = 0; j < modifyKeys.length; j++) {
          var key = modifyKeys[j];

          if (isPrimitiveType) {
            var newValue = modifiedEntries[key];
            if (newValue && newValue.hasOwnProperty('value')) {
              newValue = newValue.value;
            }
            if (baseInserted[key] !== undefined) {
              // If this entry was added by this ChangeSet, we modify the insert operation according to the
              // new ChangeSet
              baseInserted[key] = newValue;
            } else {
              if (baseModified[key] && baseModified[key].hasOwnProperty('value')) {
                baseModified[key].value = newValue;
              } else {
                baseModified[key] = newValue;
              }
            }
          } else {
            // If this is a polymorphic collection, we can still have individual entries with
            // primitive types
            var isEntryPrimitiveType = TypeIdHelper.isPrimitiveType(typeid);

            if (baseInserted[typeid] && baseInserted[typeid][key] !== undefined) {
              // If this entry was added by this ChangeSet, we modify the insert operation according to the
              // new ChangeSet
              if (isEntryPrimitiveType && typeid !== 'String') {
                var newValue = modifiedEntries[typeid][key];
                if (newValue && newValue.hasOwnProperty('value')) {
                  newValue = modifiedEntries[typeid][key].value;
                }

                // In the case of Int64 or Uint64 we copy the array so that
                // both ChangeSets don't point to the same instance
                if (typeid === 'Int64' || typeid === 'Uint64') {
                  newValue = newValue.slice();
                }

                if (baseInserted[typeid][key] && baseInserted[typeid][key].hasOwnProperty('value')) {
                  baseInserted[typeid][key].value = newValue;
                } else {
                  baseInserted[typeid][key] = newValue;
                }
              } else {
                this._performApplyAfterOnPropertyWithTypeid(key,
                                                            baseInserted[typeid],
                                                            modifiedEntries[typeid],
                                                            typeid,
                                                            false,
                                                            in_options);
              }
            } else if (baseModified[typeid] && baseModified[typeid][key] !== undefined) {
              // If there was a previous modification operation, we have to merge the two
              if (isEntryPrimitiveType && typeid !== 'String') {
                // Primitive types can simply be overwritten, however we have an exception for
                // 64 bit integers (until javascript natively supports them)
                if (typeid === 'Int64' || typeid === 'Uint64') {
                  var appliedVal = modifiedEntries[typeid][key];
                  if (appliedVal && appliedVal.hasOwnProperty('value')) {
                    appliedVal = appliedVal.value;
                  }
                  baseModified[typeid][key] = appliedVal.slice();
                } else {
                  baseModified[typeid][key] = modifiedEntries[typeid][key];
                }
              } else {
                this._performApplyAfterOnPropertyWithTypeid(key,
                                                            baseModified[typeid],
                                                            modifiedEntries[typeid],
                                                            typeid,
                                                            true,
                                                            in_options);

              }
            } else {
              baseModified[typeid] = baseModified[typeid] || {};
              baseModified[typeid][key] = deepCopy(modifiedEntries[typeid][key]);
            }
          }
        }
      }
    }

    // Remove unnecessary entries from the ChangeSet
    this._cleanIndexedCollectionChangeSet(io_basePropertyChanges, !isPrimitiveType);
  },

  /**
   * Performs the rebase operation for set and map collections
   *
   * @param {property-changeset.SerializedChangeSet} in_ownPropertyChangeSet -
   *     The ChangeSet for this collection
   * @param {property-changeset.SerializedChangeSet} io_rebasePropertyChangeSet -
   *     The ChangeSet for the collection to be rebased
   * @param {string} in_basePath -
   *     Base path to get to the property processed by this function
   * @param {string} in_typeid -
   *     The typeid of the contents collection (without the collection type)
   * @param {boolean} in_useSquareBracketsInPath -
   *     If set to true, paths will be created using the angular brackets syntax (for
   *     arrays), otherwise dots will be used (for NodeProperties)
   * @param {Array.<property-changeset.ChangeSet.ConflictInfo>} out_conflicts -
   *     A list of paths that resulted in conflicts together with the type of the conflict
   * @param {Object} [in_options] - Optional additional parameters
   * @param {Map} [in_options.applyAfterMetaInformation] - Additional meta information which help later to obtain
   *                                                       more compact changeset during the apply operation
   *
   * @private
   */
  _rebaseIndexedCollectionChangeSetForProperty: function(in_ownPropertyChangeSet, // eslint-disable-line complexity
                                                          io_rebasePropertyChangeSet,
                                                          in_basePath,
                                                          in_typeid,
                                                          in_useSquareBracketsInPath,
                                                          out_conflicts,
                                                          in_options) {
    var isPrimitiveType = TypeIdHelper.isPrimitiveType(in_typeid);

    var changesByKeys = {};
    // Helper function which stores the changes indexed by key in the changesByKeys array to
    // make it easier to compare the related changes in the two ChangeSets
    var addChanges = function(in_collection, in_changeIdentifier, in_changePrefix, in_typeidChange) {
      // Collection didn't exist in this ChangeSet
      if (in_collection === undefined) {
        return;
      }

      // For remove operations, the ChangeSet is only an array of keys, otherwise it is a map, so we have to
      // distinguish the two cases here
      var keys = _.isArray(in_collection) ? in_collection : _.keys(in_collection);

      // Add all entries indexed with the key
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];

        // Store the type of the change
        changesByKeys[key] = changesByKeys[key] || {};
        changesByKeys[key][in_changePrefix] = changesByKeys[key][in_changePrefix] ?
                                                changesByKeys[key][in_changePrefix] + '_' + in_changeIdentifier :
                                                in_changeIdentifier;

        // If applicable store the typeid of the change
        if (in_typeidChange) {
          changesByKeys[key][in_changePrefix + 'Typeid'] = in_typeidChange;
        }

        // Store the ChangeSet
        if (in_changePrefix === 'other') {
          if ( !_.isArray(in_collection) ) {
            changesByKeys[key].change = in_collection[key];
          } else {
            changesByKeys[key].change = key;
          }
        }
      }
    };

    // Helper function which adds the Changes for a ChangeSet that is ordered by typeid
    var addChangesWithTypeids = function(in_collection, in_changeIdentifier, in_changePrefix) {
      if (in_collection === undefined) {
        return;
      }
      // Iterate over the typeids (or use dummy entry for the iteration
      var addedKeyTypeids = _.keys(in_collection);
      for (var i = 0; i < addedKeyTypeids.length; i++) {
        var Typeid = addedKeyTypeids[i];
        addChanges(in_collection[Typeid], in_changeIdentifier, in_changePrefix, Typeid);
      }
    };

    // Insert all changes from the ChangeSet into the lookup map
    if ( _.isArray(in_ownPropertyChangeSet.remove) ) {
      addChanges(in_ownPropertyChangeSet.remove,             'remove',  'own');
    } else {
      if (isPrimitiveType) {
        addChanges(in_ownPropertyChangeSet.remove,             'remove',  'own');
      } else {
        addChangesWithTypeids(in_ownPropertyChangeSet.remove,    'remove',  'own');
      }
    }

    if ( _.isArray(io_rebasePropertyChangeSet.remove) ) {
      addChanges(io_rebasePropertyChangeSet.remove,          'remove',  'other');
    } else {
      if (isPrimitiveType) {
        addChanges(io_rebasePropertyChangeSet.remove,          'remove',  'other');
      } else {
        addChangesWithTypeids(io_rebasePropertyChangeSet.remove, 'remove',  'other');
      }
    }

    if (isPrimitiveType) {
      addChanges(in_ownPropertyChangeSet.insert,    'insert',  'own');
      addChanges(in_ownPropertyChangeSet.modify,    'modify',  'own');
      addChanges(io_rebasePropertyChangeSet.insert, 'insert',  'other');
      addChanges(io_rebasePropertyChangeSet.modify, 'modify',  'other');
    } else {
      addChangesWithTypeids(in_ownPropertyChangeSet.insert,    'insert',  'own');
      addChangesWithTypeids(in_ownPropertyChangeSet.modify,    'modify',  'own');
      addChangesWithTypeids(io_rebasePropertyChangeSet.insert, 'insert',  'other');
      addChangesWithTypeids(io_rebasePropertyChangeSet.modify, 'modify',  'other');
    }

    // Check for modifications that affect the same object
    var changedKeys = _.keys(changesByKeys);
    for (var i = 0; i < changedKeys.length; i++) {
      var key = changedKeys[i];
      var newPath = in_useSquareBracketsInPath ?
                        in_basePath + '[' + PathHelper.quotePathSegmentIfNeeded(key) + ']' :
                        joinPaths(in_basePath, PathHelper.quotePathSegmentIfNeeded(key), PROPERTY_PATH_DELIMITER);

      var modification = changesByKeys[key];
      if (modification.own && modification.other) {
        /*
         We found a key that was changed by both ChangeSets at the same time
         We now have to handle the conflicting changes. The changes we do, are summarized in this table:

         <START REBASE HANDLING TABLE>
         +-------+-----------------+------------------+-------------------+-------------------------------------+
         |   \Own|    insert       |       modify     |     remove        |    remove+insert                    |
         |    \  |                 |                  |                   |                                     |
         |other\ |                 |                  |                   |                                     |
         +=======+=================+==================+===================+=====================================+
         |       | conflicting     | incompatible     | incompatible      | incompatible                        |
         |insert | inserts         | psets            | psets             | psets                               |
         |       |                 |                  |                   |                                     |
         +-------+-----------------+------------------+-------------------+-------------------------------------+
         |       | incompatible    | merge recursively| conflict          | conflict                            |
         |modify | psets           | (conflicting  on |                   | (modify can not be applied due to   |
         |       |                 | leaf)            | - delete modify   | to incompatible base)               |
         |       |                 |                  |   in other        |                                     |
         |       |                 |                  |                   | - delete modify in other            |
         +-------+-----------------+------------------+-------------------+-------------------------------------+
         |       | incompatible    | non-conflicting  | non-conflicting   | incompatible                        |
         |remove | psets           | change           | change            | psets                               |
         |       |                 |                  |                   |                                     |
         |       |                 |                  | - rem dupl. remove|                                     |
         +-------+-----------------+------------------+-------------------+-------------------------------------+
         |       | incompatible    | non-conflicting  | non-conflicting   | conflict                            |
         |remove+| psets           | change           | change            |                                     |
         |insert |                 |                  |                   | - remove conflicting insert         |
         |       |                 |                  | - rem dupl. remove|                                     |
         +-------+-----------------+------------------+-------------------+-------------------------------------+
         <END REBASE HANDLING TABLE>
        */

        // A key was modified after it had been removed
        if (modification.own === 'modify' && modification.other === 'modify') {

          if (isPrimitiveType ||
              (TypeIdHelper.isPrimitiveType(modification.ownTypeid) && modification.ownTypeid !== 'String')) {
            // We have two modification operations that affect the same entry for a base type.
            // This is a legal operation, the second one will overwrite the first one, but we
            // report it as a possible conflict
            var ownModify = in_ownPropertyChangeSet.modify;
            var rebasedModify = io_rebasePropertyChangeSet.modify;
            if (modification.otherTypeid) {
              ownModify = ownModify[modification.otherTypeid];
              rebasedModify = rebasedModify[modification.otherTypeid];
            }

            var conflict = {
              path: newPath,
              type: ConflictType.COLLIDING_SET,
              conflictingChange: ownModify[key]
            };
            out_conflicts.push(conflict);
            // If value is the same, delete the entry
            var ownValue = ownModify[key];
            if (typeof ownValue === 'object' && ownValue.hasOwnProperty('value')) {
              ownValue = ownValue.value;
            }
            var rebaseValue = rebasedModify[key];
            if (typeof rebaseValue === 'object' && rebaseValue.hasOwnProperty('value')) {
              rebaseValue = rebaseValue.value;
            }
            if (modification.ownTypeid === 'Int64' || modification.ownTypeid === 'Uint64' || ownValue.length === 2) {
              // For (u)int64, values are arrays of 2 elements
              if (ownValue[0] === rebaseValue[0] && ownValue[1] === rebaseValue[1]) {
                delete rebasedModify[key];
              }
            } else {
              if (ownValue === rebaseValue) {
                delete rebasedModify[key];
              }
            }
          } else {
            this._rebaseChangeSetForPropertyEntryWithTypeid(key,
                in_ownPropertyChangeSet.modify[modification.ownTypeid],
                io_rebasePropertyChangeSet.modify[modification.otherTypeid],
                modification.ownTypeid,
                newPath,
                true,
                out_conflicts,
                in_options);
          }
        } else if (modification.own === 'remove' && modification.other === 'modify') {
          var modifyMap = modification.otherTypeid ? io_rebasePropertyChangeSet.modify[modification.otherTypeid] :
                                                      io_rebasePropertyChangeSet.modify;

          // Create the conflict information
          var conflict = {
            path: newPath,
            type: ConflictType.ENTRY_MODIFIED_AFTER_REMOVE,
            conflictingChange: modifyMap[key]
          };
          out_conflicts.push(conflict);

          // Delete the modification from the rebased ChangeSet
          delete modifyMap[key];

        } else if (modification.own === 'remove_insert' && modification.other === 'modify') {
          // We have a conflicting change. A node was removed and inserted (replaced) in the original
          // ChangeSet and then modified by the rebased ChangeSet. Since the base of the modification
          // can have been changed significantly by this operation, we don't know whether we can
          // apply the modification

          // Create the conflict information
          var conflict = {
            path: newPath,
            type: ConflictType.ENTRY_MODIFICATION_AFTER_REMOVE_INSERT,
            conflictingChange: io_rebasePropertyChangeSet.modify[modification.otherTypeid][key]
          };
          out_conflicts.push(conflict);

          // Delete the modification from the rebased ChangeSet
          delete io_rebasePropertyChangeSet.modify[key];
        } else if ((modification.own === 'modify' || modification.own === 'remove') &&
                    (modification.other === 'remove' || modification.other === 'remove_insert')) {
          if (modification.own === 'modify') {
            var modifyMap = modification.ownTypeid ? in_ownPropertyChangeSet.modify[modification.ownTypeid] :
                                                      in_ownPropertyChangeSet.modify;

            // Create the conflict information
            var conflict = {
              path: newPath,
              type: ConflictType.REMOVE_AFTER_MODIFY,
              conflictingChange: modifyMap[key]
            };
            out_conflicts.push(conflict);
          }

          // If we have a duplicated delete, we remove it from the new ChangeSet
          if (modification.own === 'remove') {
            if (_.isArray(io_rebasePropertyChangeSet.remove)) {
              io_rebasePropertyChangeSet.remove = _.without(io_rebasePropertyChangeSet.remove, key);
            } else {
              if (isPrimitiveType) {
                delete io_rebasePropertyChangeSet.remove[key];
              } else {
                delete io_rebasePropertyChangeSet.remove[modification.otherTypeid][key];
              }
            }
          }
        } else if (modification.own === 'insert' && modification.other === 'insert') {
          if (isPrimitiveType ||
              (TypeIdHelper.isPrimitiveType(modification.ownTypeid))) {
            var insertMap = modification.otherTypeid ? io_rebasePropertyChangeSet.insert[modification.otherTypeid] :
                                                        io_rebasePropertyChangeSet.insert;

            // We have two insert operations that affect the same key for a primitive type.
            // This is a legal operation, the second one will overwrite the first one, but we
            // report it as a possible conflicting set
            var conflict = {
              path: newPath,
              type: ConflictType.COLLIDING_SET,
              conflictingChange: insertMap[key]
            };
            out_conflicts.push(conflict);

            // Convert to modify
            var oldValue;
            if (modification.otherTypeid) {
              io_rebasePropertyChangeSet.modify = io_rebasePropertyChangeSet.modify || {};
              io_rebasePropertyChangeSet.modify[modification.otherTypeid] =
                  io_rebasePropertyChangeSet.modify[modification.otherTypeid] || {};
              modifyMap = io_rebasePropertyChangeSet.modify[modification.otherTypeid];
              oldValue = in_ownPropertyChangeSet.insert[modification.ownTypeid][key];
            } else {
              io_rebasePropertyChangeSet.modify = io_rebasePropertyChangeSet.modify || {};
              modifyMap = io_rebasePropertyChangeSet.modify;
              oldValue = in_ownPropertyChangeSet.insert[key];
            }

            modifyMap[key] = { value: insertMap[key], oldValue: oldValue };
            delete insertMap[key];
          } else {
            // Here we have two insert operations for objects. Since these affect a whole sub-tree and not
            // just a single value, we cannot easily convert it into a modify and instead report it as invalid

            var insertMap = modification.otherTypeid ? io_rebasePropertyChangeSet.insert[modification.otherTypeid] :
                                                        io_rebasePropertyChangeSet.insert;

            // Create the conflict information
            var conflict = {
              path: newPath,
              type: ConflictType.INSERTED_ENTRY_WITH_SAME_KEY,
              conflictingChange: insertMap[key]
            };
            out_conflicts.push(conflict);

            // Delete the modification from the rebased ChangeSet
            delete insertMap[key];
          }
        } else if (modification.own === 'remove_insert' && modification.other === 'remove_insert') {
          var insertMap = modification.otherTypeid ? io_rebasePropertyChangeSet.insert[modification.otherTypeid] :
                                                      io_rebasePropertyChangeSet.insert;

          // Raise the duplicate inserts as a conflict
          var conflict = {
            path: newPath,
            type: ConflictType.COLLIDING_SET,
            conflictingChange: insertMap[key]
          };
          out_conflicts.push(conflict);
        } else {
          // All other operations are conflicting changes, which only occur for ChangeSets that are relative
          // to different bases

          // Create the conflict information
          var conflict = {
            path: newPath,
            type: ConflictType.INVALID_CHANGESET_BASE,
            conflictingChange: modification.change
          };
          out_conflicts.push(conflict);

          // Remove the change from the ChangeSet
          if (modification.other !== 'remove') {
            if (modification.otherTypeid !== undefined) {
              delete io_rebasePropertyChangeSet[modification.other][modification.otherTypeid][key];
            } else {
              delete io_rebasePropertyChangeSet[modification.other][key];
            }
          } else {
            // Remove remove operations from the ChangeSet
            if (_.isArray(io_rebasePropertyChangeSet[modification.other])) {
              io_rebasePropertyChangeSet[modification.other] =
                  _.without(io_rebasePropertyChangeSet[modification.other], key);
            } else {
              delete io_rebasePropertyChangeSet[modification.other][key];
            }
          }

          console.error('Rebase operation with conflicting ChangeSets. Probably incorrect bases.');
        }
      }
    }

    // Remove unnecessary entries from the ChangeSet
    this._cleanIndexedCollectionChangeSet(io_rebasePropertyChangeSet, !isPrimitiveType);
  },

  /**
   * Removes empty entries from the .children collection of the ChangeSet
   *
   * @param {property-changeset.SerializedChangeSet} in_propertyChanges - The ChangeSet to clean up
   * @param {boolean}                           in_containsTypeids - Does this ChangeSet contain typeids
   * @private
   */
  _cleanIndexedCollectionChangeSet: function(in_propertyChanges, in_containsTypeids) {
    var changes = in_propertyChanges;
    // Clean inserts

    // First remove unused typeid sections
    if (in_containsTypeids) {
      var typeidList = _.keys(changes['insert']);
      for (var j = 0; j < typeidList.length; j++) {
        if (_fastIsEmptyObject(changes['insert'][typeidList[j]])) {
          delete changes['insert'][typeidList[j]];
        }
      }
    }

    // Remove add group if no operations are present
    if (_fastIsEmptyObject(changes.insert)) {
      delete changes['insert'];
    }

    // First remove unused typeid sections
    if (in_containsTypeids) {
      var typeidList = _.keys(changes['remove']);
      for (var j = 0; j < typeidList.length; j++) {
        if (_fastIsEmptyObject(changes['remove'][typeidList[j]])) {
          delete changes['remove'][typeidList[j]];
        }
      }
    }
    // Remove remove group if no operations are present
    if (_fastIsEmptyObject(changes.remove)) {
      delete changes['remove'];
    }

    // Clean modifies

    // First remove unused typeid sections
    if (in_containsTypeids) {
      var typeidList = _.keys(changes['modify']);
      for (var j = 0; j < typeidList.length; j++) {
        var modifies = changes['modify'][typeidList[j]];
        var modifyKeys = _.keys(modifies);
        for (var k = 0; k < modifyKeys.length; k++) {
          if (isEmptyChangeSet(modifies[modifyKeys[k]])) {
            delete modifies[modifyKeys[k]];
          }
        }
        if (_fastIsEmptyObject(changes['modify'][typeidList[j]])) {
          delete changes['modify'][typeidList[j]];
        }
      }
    }

    // Remove modify group if no operations are present
    if (_fastIsEmptyObject(changes.modify)) {
      delete changes['modify'];
    }
  }
};

module.exports = ChangeSetIndexedCollectionFunctions;
