/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Serialized representation of the changes in a repository
 */

const _ = require('lodash');

const deepCopy = _.cloneDeep;
const joinPaths = require('@fluid-experimental/property-common').Strings.joinPaths;
const ConsoleUtils = require('@fluid-experimental/property-common').ConsoleUtils;
const Chronometer = require('@fluid-experimental/property-common').Chronometer;

const TypeIdHelper = require('./helpers/typeid_helper');
const TemplateValidator = require('./template_validator');

const PROPERTY_PATH_DELIMITER = require('@fluid-experimental/property-common').constants.PROPERTY_PATH_DELIMITER;
const MSG = require('@fluid-experimental/property-common').constants.MSG;

const Utils = require('./utils');
const ArrayChangeSetIterator = require('./changeset_operations/array_changeset_iterator');
const ConflictType = require('./changeset_operations/changeset_conflict_types');
const isEmptyChangeSet = require('./changeset_operations/is_empty_changeset');
const isReservedKeyword = require('./is_reseved_keyword');

/**
 * @typedef {Object} property-changeset.SerializedChangeSet
 * The plain serialization data structure used to encode a ChangeSet.
 */

/**
 * The ChangeSet represents an operation to be done (or that was done) on the data. It encapsulate one or
 * many addition/insertion and deletion of properties. The ChangeSetObject also provides functionality
 * to merge and swap change sets.
 *
 * @param {property-changeset.SerializedChangeSet|string|property-changeset.ChangeSet} [in_changes] - The serialized changes
 *                                                                  to store in this change set
 *                                                                  If a string is supplied, we assume it to be a
 *                                                                  serialized JSON representation of the change set.
 *                                                                  If none is supplied, an empty changeset will be
 *                                                                  created
 * @constructor
 * @protected
 * @alias property-changeset.ChangeSet
 * @category HFDM
 */
var ChangeSet = function(in_changes) {
  if (in_changes === undefined || in_changes === null) {
    this._changes = {};
  } else if (_.isString(in_changes)) {
    this._changes = JSON.parse(in_changes);
  } else if (in_changes instanceof ChangeSet) {
    this._changes = deepCopy(in_changes._changes);
  } else {
    this._changes = in_changes;
  }

  this._isNormalized = false;
};

ChangeSet.ConflictType =  ConflictType;

/**
 * @typedef {Object} property-changeset.ChangeSet.ConflictInfo
 * @property {string|undefined}                               path      -
 *     Path to the position where the conflict occurred. If the conflicting change is of type
 *     MISMATCH_TEMPLATES then the path will be undefined.
 * @property {property-changeset.ChangeSet.ConflictType}           type      -
 *     Type of the conflict
 * @property {property-changeset.SerializedChangeSet|undefined}    conflictingChange -
 *     The ChangeSet whose application failed. Depending on the context, this can have different meanings:
 *
 *       * ENTRY_MODIFIED_AFTER_REMOVE            - The modification that was not applied as the child no longer
 *                                                  existed
 *       * COLLIDING_SET                          - The original value of the property that was overwritten by this
 *                                                  change
 *       * ENTRY_MODIFICATION_AFTER_REMOVE_INSERT - The modification that was not applied due to the conflict
 *       * INSERTED_ENTRY_WITH_SAME_KEY           - The normalized property set of the entry that could not be
 *                                                  inserted
 *       * REMOVE_AFTER_MODIFY                    - The original change that gets removed
 *       * MISMATCH_TEMPLATES                     - A changeset with an insertTemplates entry that only
 *                                                  contains the conflicting templates.
 */

/**
 * Creates a string representation of the change set
 * @return {string} JSON encoding of the changes in this change set
 */
ChangeSet.prototype.toString = function() {
  return JSON.stringify(this._changes);
};

/**
 * Returns the serialized changes.
 *
 * @return {property-changeset.SerializedChangeSet} The serialized changeset
 */
ChangeSet.prototype.getSerializedChangeSet = function() {
  return this._changes;
};

/**
 * Indicates whether this is a normalized ChangeSet. If this is set to true, squashes will not remove empty entries
 * from the ChangeSet.
 *
 * @param {Boolean} in_isNormalized - is this a normalized ChangeSet?
 */
ChangeSet.prototype.setIsNormalized = function(in_isNormalized) {
  this._isNormalized = in_isNormalized;
};

/**
 * Indicates whether this is a normalized ChangeSet. If this is set to true, squashes will not remove empty entries
 * from the ChangeSet.
 *
 * @return {Boolean} Is this a normalized ChangeSet?
 */
ChangeSet.prototype.getIsNormalized = function() {
  return this._isNormalized;
};

/**
 * Clones the ChangeSet
 *
 * @return {property-changeset.ChangeSet} The cloned ChangeSet
 */
ChangeSet.prototype.clone = function() {
  return new ChangeSet(deepCopy(this._changes));
};

/**
 * Updates this ChangeSet. The result will be the concatenation of the two ChangeSets. First the changes in this
 * ChangeSet are executed, then the changes in the supplied in_changeSet are applied. The result will be
 * stored in this ChangeSet. This function assumes that the second ChangeSet is relative to the state after
 * application of the first ChangeSet.
 *
 * @param {property-changeset.ChangeSet|property-changeset.SerializedChangeSet} in_changeSet - The changeset to apply
 * @param {Object} [in_options] - Optional additional parameters
 * @param {Map} [in_options.applyAfterMetaInformation] - Additional meta information which help later to obtain
 *                                                       more compact changeset during the apply operation
 */
ChangeSet.prototype.applyChangeSet = function(in_changeSet, in_options) {
  var chrono = new Chronometer();
  var changes = in_changeSet;
  if (in_changeSet instanceof ChangeSet) {
    changes = in_changeSet.getSerializedChangeSet();
  }

  if (!_.isObject(this._changes) || _.isArray(this._changes)) {
    var oldValue = _.isObject(changes) && changes.value !== undefined ? changes.value : changes;
    this._changes = _.isArray(oldValue) ? oldValue.slice() : oldValue;
  } else {
    this._performApplyAfterOnProperty(this._changes, changes, !this._isNormalized, in_options);
  }
};

/**
 * Applies a changeset to a given property (recursively). The ChangeSet is assumed to be relative to the same
 * property root and it will be applied behind the base ChangeSet (assuming that the changes are relative to the
 * state after the base ChangeSet has been applied. It will change the base ChangeSet.)
 *
 * @param {property-changeset.SerializedChangeSet} io_basePropertyChanges    - The ChangeSet describing the initial state
 * @param {property-changeset.SerializedChangeSet} in_appliedPropertyChanges - The ChangeSet to apply to this state
 * @param {Boolean}                           in_removeEmpty            - Should empty ChangeSets be removed?
 * @param {Object} [in_options] - Optional additional parameters
 * @param {Map} [in_options.applyAfterMetaInformation] - Additional meta information which help later to obtain
 *                                                       more compact changeset during the apply operation
 * @private
 */
ChangeSet.prototype._performApplyAfterOnProperty = function(io_basePropertyChanges,
  in_appliedPropertyChanges,
  in_removeEmpty,
  in_options) {
  // Apply dynamic property operations
  if (in_appliedPropertyChanges['insert'] ||
      in_appliedPropertyChanges['modify'] ||
      in_appliedPropertyChanges['remove']) {
    this._performApplyAfterOnPropertyIndexedCollection(io_basePropertyChanges,
      in_appliedPropertyChanges,
      'NodeProperty',
      in_options); // TODO: recursively propagate the typeid?
  }

  if (!_.isEmpty(in_appliedPropertyChanges.insertTemplates)) {
    io_basePropertyChanges.insertTemplates = io_basePropertyChanges.insertTemplates || {};
    _.extend(io_basePropertyChanges.insertTemplates, in_appliedPropertyChanges.insertTemplates);
  }

  // Apply ChangeSet to the properties
  var modifiedTypeids = _.keys(in_appliedPropertyChanges);
  for (var i = 0; i < modifiedTypeids.length; i++) {
    var typeid = modifiedTypeids[i];
    // The reserved keywords have already been handled above
    if (ChangeSet.isReservedKeyword(typeid)) {
      continue;
    }

    io_basePropertyChanges[typeid] = io_basePropertyChanges[typeid] || {};
    var baseChanges = io_basePropertyChanges[typeid];
    var changedKeys = _.keys(in_appliedPropertyChanges[typeid]);
    for (var j = 0; j < changedKeys.length; j++) {
      this._performApplyAfterOnPropertyWithTypeid(changedKeys[j],
        baseChanges,
        in_appliedPropertyChanges[typeid],
        typeid,
        in_removeEmpty,
        in_options);
    }
    // Remove the type when it no longer contains any changed keys
    if (in_removeEmpty && _.isEmpty(io_basePropertyChanges[typeid])) {
      delete io_basePropertyChanges[typeid];
    }
  }
};

/**
 * Helper function used to apply a new value to a given ChangeSet.
 * It is used to handle setting a primitive value, which might either be represented
 * via a literal or an object with a member value.
 * applies in_appliedValue to the io_baseChanges at the given in_baseKey
 * @param  {property-changeset.SerializedChangeSet} io_baseChanges - base changes (modified)
 * @param  {string} in_baseKey - key
 * @param  {property-changeset.SerializedChangeSet} in_appliedValue - applied changes to be applied
 * @private
 */
ChangeSet.prototype._applyValue = function(io_baseChanges, in_baseKey, in_appliedValue) {
  var newValue = (in_appliedValue && in_appliedValue.hasOwnProperty('value')) ?
    in_appliedValue.value : in_appliedValue;
  if (io_baseChanges[in_baseKey] && io_baseChanges[in_baseKey].hasOwnProperty('value')) {
    io_baseChanges[in_baseKey].value = newValue;
  } else {
    if (io_baseChanges[in_baseKey] === undefined &&
        in_appliedValue && in_appliedValue.hasOwnProperty('oldValue')) {
      io_baseChanges[in_baseKey] = {
        value: newValue,
        oldValue: in_appliedValue.oldValue
      };
    } else {
      io_baseChanges[in_baseKey] = newValue;
    }
  }
};

/**
 * Decides based on the given Typeid which applyAfter operation to perform.
 * Note: This function is not directly called on the ChangeSet but on the object containing it together with a key
 *       since it needs to be able to overwrite this entry
 *
 * @param {String}  in_changedKey             - The key of the entry in the object
 * @param {Object}  in_baseChanges            - The object containing the state before the applyAfter
 * @param {Object}  in_appliedPropertyChanges - The object containing the ChangeSet with the modification
 * @param {String}  in_typeid                 - The typeid of the property to modify
 * @param {Boolean} in_removeEmpty            - Should empty ChangeSets be removed?
 * @param {Object} [in_options] - Optional additional parameters
 * @param {Map} [in_options.applyAfterMetaInformation] - Additional meta information which help later to obtain
 *                                                       more compact changeset during the apply operation
 * @private
 */
ChangeSet.prototype._performApplyAfterOnPropertyWithTypeid = function(in_changedKey,
  in_baseChanges,
  in_appliedPropertyChanges,
  in_typeid,
  in_removeEmpty,
  in_options) {
  var splitTypeid = TypeIdHelper.extractContext(in_typeid);

  if (splitTypeid.context === 'set' ||
      splitTypeid.context === 'map') {
    in_baseChanges[in_changedKey] = in_baseChanges[in_changedKey] || {};
    this._performApplyAfterOnPropertyIndexedCollection(in_baseChanges[in_changedKey],
      in_appliedPropertyChanges[in_changedKey],
      splitTypeid.typeid,
      in_options);

    // Remove the key, when it no longer contains a changeset
    if (in_removeEmpty && _.isEmpty(in_baseChanges[in_changedKey])) {
      delete in_baseChanges[in_changedKey];
    }
  } else if (splitTypeid.context === 'array' || splitTypeid.typeid === 'String') {
    in_baseChanges[in_changedKey] = in_baseChanges[in_changedKey] !== undefined ? in_baseChanges[in_changedKey] : {};
    var baseIsSetChange = false;
    var oldValue;
    if (splitTypeid.typeid === 'String' &&
        (_.isString(in_baseChanges[in_changedKey]) ||
          (in_baseChanges[in_changedKey] && in_baseChanges[in_changedKey].hasOwnProperty('value')))) {

      oldValue = in_baseChanges[in_changedKey].oldValue;
      // we need to convert the format to allow the application of the changes
      // since _performApplyAfterOnPropertyArray only understands insert/modify/remove commands
      if (in_baseChanges[in_changedKey] && in_baseChanges[in_changedKey].hasOwnProperty('value')) {
        in_baseChanges[in_changedKey] = {insert: [ [0, in_baseChanges[in_changedKey].value] ]};
      } else {
        in_baseChanges[in_changedKey] = {insert: [ [0, in_baseChanges[in_changedKey]] ]};
      }
      baseIsSetChange = true;
    }
    var appliedChanges =  in_appliedPropertyChanges[in_changedKey];
    if (_.isObject(appliedChanges) && appliedChanges.hasOwnProperty('value')) {
      appliedChanges = appliedChanges.value;
    }

    if (splitTypeid.typeid === 'String' && _.isString(appliedChanges)) {
      // we've got a 'set' command and just overwrite the changes
      if (baseIsSetChange && oldValue !== undefined) {
        in_baseChanges[in_changedKey] = {
          value: appliedChanges,
          oldValue: oldValue
        };
      } else {
        in_baseChanges[in_changedKey] = appliedChanges;
      }
    } else {
      // we have incremental changes (or a standard array)
      this._performApplyAfterOnPropertyArray(in_baseChanges[in_changedKey],
        in_appliedPropertyChanges[in_changedKey],
        splitTypeid.typeid,
        in_options);
      if (baseIsSetChange) {
        // we have to convert back to a string, if it had been converted before
        var newValue;
        if (_.isEmpty(in_baseChanges[in_changedKey])) {
          newValue = '';
        } else {
          newValue = in_baseChanges[in_changedKey].insert[0][1];
        }
        if (oldValue !== undefined) {
          in_baseChanges[in_changedKey] = {
            value: newValue,
            oldValue: oldValue
          };
        } else {
          in_baseChanges[in_changedKey] = newValue;
        }
      }
    }

    // Remove the key, when it no longer contains a changeset
    if (in_removeEmpty && ChangeSet.isEmptyChangeSet(in_baseChanges[in_changedKey])) {
      delete in_baseChanges[in_changedKey];
    }
  } else if (splitTypeid.isEnum) {
    // Enum types can simply be overwritten
    this._applyValue(in_baseChanges, in_changedKey, in_appliedPropertyChanges[in_changedKey]);
  } else if (splitTypeid.context === 'single') {
    if (TypeIdHelper.isPrimitiveType(splitTypeid.typeid)) {
      // Primitive types can simply be overwritten, however we have an exception for
      // 64 bit integers (until javascript natively supports them)
      if (splitTypeid.typeid === 'Int64' || splitTypeid.typeid === 'Uint64') {
        var appliedVal = in_appliedPropertyChanges[in_changedKey];
        if (appliedVal && appliedVal.hasOwnProperty('value')) {
          appliedVal = appliedVal.value;
        }
        this._applyValue(in_baseChanges, in_changedKey, appliedVal.slice());
      } else {
        this._applyValue(in_baseChanges, in_changedKey, in_appliedPropertyChanges[in_changedKey]);
      }
    } else {
      if (in_baseChanges[in_changedKey]) {
        // Otherwise we have to continue the merging recursively
        this._performApplyAfterOnProperty(in_baseChanges[in_changedKey],
          in_appliedPropertyChanges[in_changedKey],
          false,
          in_options);
      } else {
        // If the key doesn't exist, yet, we can just copy it
        in_baseChanges[in_changedKey] = deepCopy(in_appliedPropertyChanges[in_changedKey]);
      }
    }
  } else {
    throw new Error(MSG.UNKNOWN_CONTEXT + splitTypeid.context);
  }
};

/**
 * Rebases a given ChangeSet behind the current ChangeSet.
 *
 * This function takes a ChangeSet which is assumed to be relative to the same base state as the ChangeSet stored in
 * this class and transforms it in such a way that it can be applied after this ChangeSet. The function will modify
 * the supplied ChangeSet
 *
 * @param {property-changeset.SerializedChangeSet}     io_changeSet   -
 *     The ChangeSet that is rebased behind the state obtained by application of this ChangeSet
 * @param {Array.<property-changeset.ChangeSet.ConflictInfo>} out_conflicts
 *     A list of paths that resulted in conflicts together with the type of the conflict
 * @param {Object} [in_options] - Optional additional parameters
 * @param {Map} [in_options.applyAfterMetaInformation] - Additional meta information which help later to obtain
 *                                                       more compact changeset during the apply operation
 * @param {Bool} [in_options.throwOnTemplateMismatch]  - Throw error for template definition mismatches.
 * @return {property-changeset.SerializedChangeSet} The rebased ChangeSet (the same object as io_changeSet, it will be
 *     modified in place)
 */
ChangeSet.prototype._rebaseChangeSet = function(io_changeSet, out_conflicts, in_options) {
  // We actually only pass this request to the recursive internal function
  return this._rebaseChangeSetForProperty(this._changes, io_changeSet, '', out_conflicts, in_options);
};

/**
 * Internal helper function that performs a rebase on a single property
 *
 * @param {property-changeset.SerializedChangeSet} in_ownPropertyChangeSet -
 *     The ChangeSet for the property stored in this class
 * @param {property-changeset.SerializedChangeSet} io_rebasePropertyChangeSet -
 *     The ChangeSet for the property to be rebased
 * @param {string} in_basePath -
 *     Base path to get to the property processed by this function
 * @param {Array.<property-changeset.ChangeSet.ConflictInfo>} out_conflicts -
 *     A list of paths that resulted in conflicts together with the type of the conflict
 * @param {Object} [in_options] - Optional additional parameters
 * @param {Map} [in_options.applyAfterMetaInformation] - Additional meta information which help later to obtain
 *                                                       more compact changeset during the apply operation
 * @param {Bool} [in_options.throwOnTemplateMismatch]  - Throw error for template definition mismatches.
 * @return  {property-changeset.SerializedChangeSet} The rebased ChangeSet for this property
 * @private
 */
ChangeSet.prototype._rebaseChangeSetForProperty = function(in_ownPropertyChangeSet,
  io_rebasePropertyChangeSet,
  in_basePath,
  out_conflicts,
  in_options) {
  // Process the children in this ChangeSet
  if ((in_ownPropertyChangeSet['insert'] ||
       in_ownPropertyChangeSet['modify'] ||
       in_ownPropertyChangeSet['remove']) &&
      (io_rebasePropertyChangeSet['insert'] ||
       io_rebasePropertyChangeSet['modify'] ||
       io_rebasePropertyChangeSet['remove'])) {
    this._rebaseIndexedCollectionChangeSetForProperty(in_ownPropertyChangeSet,
      io_rebasePropertyChangeSet,
      in_basePath,
      'NodeProperty', // TODO: recursively propagate the typeid?
      false,          // don't use square brackets (use dots instead)
      out_conflicts,
      in_options);
  }
  if (!_.isEmpty(io_rebasePropertyChangeSet.insertTemplates)) {
    var typeids = _.keys(io_rebasePropertyChangeSet.insertTemplates);

    var templateMismatchChangeSet = {insertTemplates: {}};

    var templateMismatchConflict = {
      type: ChangeSet.ConflictType.MISMATCH_TEMPLATES,
      conflictingChange: templateMismatchChangeSet
    };

    _.each(typeids, function(typeid) {
      var template = io_rebasePropertyChangeSet.insertTemplates[typeid];
      if (in_ownPropertyChangeSet.insertTemplates &&
          in_ownPropertyChangeSet.insertTemplates[typeid]) {
        var isEqual = TemplateValidator.Utils.psetDeepEquals(
          template,
          in_ownPropertyChangeSet.insertTemplates[template.typeid]
        );

        if (!isEqual) {
          if (in_options && in_options.throwOnTemplateMismatch) {
            throw new Error(MSG.TEMPLATE_MISMATCH + typeid);
          }

          templateMismatchChangeSet.insertTemplates[typeid] =
                                          in_ownPropertyChangeSet.insertTemplates[template.typeid];
          // TODO: Remove this warning message once we offer a conflict resolution API
          console.warn(MSG.TEMPLATE_MISMATCH + typeid);
        }

        delete io_rebasePropertyChangeSet.insertTemplates[typeid];
      }
    });

    // Remove insertTemplates key if it is empty
    if (_.isEmpty(io_rebasePropertyChangeSet.insertTemplates)) {
      delete io_rebasePropertyChangeSet.insertTemplates;
    }

    if (!_.isEmpty(templateMismatchConflict.conflictingChange.insertTemplates)) {
      out_conflicts.push(templateMismatchConflict);
    }
  }

  // Check for collisions in the property assignments
  var changedTypeids = _.keys(in_ownPropertyChangeSet);

  // We currently do not yet have any
  var changeSet = {};
  for (var i = 0; i < changedTypeids.length; i++) {
    var typeid = changedTypeids[i];
    var paths = _.keys(in_ownPropertyChangeSet[typeid]);

    // Update the oldValue of primitive property of a changeset
    // for simple changeset with 'modify', property type, name, value
    // find the oldValue of the property and update it
    if (typeid === 'modify' && 'modify' in io_rebasePropertyChangeSet) {
      for (var j = 0; j < paths.length; j++) {
        var tempTypeid = paths[i];
        if ((TypeIdHelper.isPrimitiveType(tempTypeid)) &&
          tempTypeid in io_rebasePropertyChangeSet['modify']) {
          var tempPaths = _.keys(in_ownPropertyChangeSet['modify'][tempTypeid]);
          for (var z = 0; z < tempPaths.length; z++) {
            if (tempPaths[z] in io_rebasePropertyChangeSet['modify'][tempTypeid]) {
              var rebasedPropContent = io_rebasePropertyChangeSet['modify'][tempTypeid][tempPaths[z]];
              if (_.isObject(rebasedPropContent) && 'oldValue' in rebasedPropContent) {
                rebasedPropContent.oldValue = in_ownPropertyChangeSet['modify'][tempTypeid][tempPaths[z]].value;
              }
            }
          }
        }
      }
    } else if (TypeIdHelper.isPrimitiveType(typeid)) {
      // for complex changeset, the function will be called recursively, when the function is at the level where
      // io_rebasePropertyChangeSet && in_ownPropertyChangeSet contain only property type, name and value, we update
      // oldValue of io_rebasePropertyChangeSet.
      for (var j = 0; j < paths.length; j++) {
        if (typeid in io_rebasePropertyChangeSet && paths[j] in io_rebasePropertyChangeSet[typeid]) {
          var rebasedPropContent = io_rebasePropertyChangeSet[typeid][paths[j]];
          if (_.isObject(rebasedPropContent) && 'oldValue' in rebasedPropContent) {
            // if oldValue already be update above, we don't need to update
            if (io_rebasePropertyChangeSet[typeid][paths[j]].oldValue !==
              in_ownPropertyChangeSet[typeid][paths[j]].value) {
              io_rebasePropertyChangeSet[typeid][paths[j]].oldValue = in_ownPropertyChangeSet[typeid][paths[j]].value;
            }
          }
        }
      }
    }

    // The reserved keywords have already been handled above and changes which are not present in
    // the other ChangeSet can be ignored
    if (ChangeSet.isReservedKeyword(typeid) ||
        !io_rebasePropertyChangeSet[typeid]) {
      continue;
    }

    // Check, whether we have a collision in a path update
    for (var j = 0; j < paths.length; j++) {
      if (io_rebasePropertyChangeSet[typeid][paths[j]] !== undefined ) {
        in_ownPropertyChangeSet[typeid] = in_ownPropertyChangeSet[typeid] || {};

        var newPath = joinPaths(in_basePath,
          paths[j],
          PROPERTY_PATH_DELIMITER);
        // Perform the rebase operation on the ChangeSet for this entry
        var setConflict = this._rebaseChangeSetForPropertyEntryWithTypeid(paths[j],
          in_ownPropertyChangeSet[typeid],
          io_rebasePropertyChangeSet[typeid],
          typeid,
          newPath,
          true,
          out_conflicts,
          in_options);

        // If there has been a non-recursive set collision we handle it here separately
        if (setConflict) {
          // If we have two writes to primitive types, this is a conflict
          changeSet[typeid] = changeSet[typeid] || {};

          // Store the change. Note: We make a deep copy here, as this is a reference into our
          // own internal ChangeSet and we want to be sure, nobody changes our internal data-structures
          changeSet[typeid][paths[j]] = deepCopy(in_ownPropertyChangeSet[typeid][paths[j]]);
        }

        // Remove the typeid, when it no longer contains any keys
        if (_.isEmpty(io_rebasePropertyChangeSet[typeid])) {
          delete io_rebasePropertyChangeSet[typeid];
        }
      }
    }
  }


  // If there were conflicts in the set operations, report them
  if (!_.isEmpty(changeSet)) {
    var conflict = {
      path: in_basePath,
      type: ChangeSet.ConflictType.COLLIDING_SET,
      conflictingChange: changeSet
    };
    out_conflicts.push(conflict);
  }

  return io_rebasePropertyChangeSet;
};

/**
 * Decides based on the given Typeid which rebase operation to perform
 * Note: This function is not directly called on the ChangeSet but on the object containing it together with a key
 *       since it needs to be able to overwrite this entry
 *
 * @param {string} in_key                          - The key of the entry in the object
 * @param {Object} in_ownPropertyChangeSet         - The object containing the ChangeSet for the property
 *                                                   stored in this class
 * @param {Object} io_rebasePropertyChangeSet      - The object containing the ChangeSet for the property to
 *                                                   be rebased
 * @param {string} in_typeid                       - The typeid of the property to rebase
 * @param {string} in_basePath                     - Base path to get to the property processed by this function
 * @param {Boolean} in_removeEmpty                 - Should empty ChangeSets be removed?
 * @param {Array.<property-changeset.ChangeSet.ConflictInfo>} out_conflicts - A list of paths that resulted in
 *                                                   conflicts together with the type of the conflict
 * @param {Object} [in_options] - Optional additional parameters
 * @param {Map} [in_options.applyAfterMetaInformation] - Additional meta information which help later to obtain
 *                                                       more compact changeset during the apply operation
 *
 * @return {boolean} Has there been a simple set collision? Those have to be handled separately
 *                   TODO: We should unify the handling of set collisions
 * @private
 */
ChangeSet.prototype._rebaseChangeSetForPropertyEntryWithTypeid = function(in_key,
  in_ownPropertyChangeSet,
  io_rebasePropertyChangeSet,
  in_typeid,
  in_basePath,
  in_removeEmpty,
  out_conflicts,
  in_options) {
  var splitTypeid = TypeIdHelper.extractContext(in_typeid);

  if (splitTypeid.context === 'set' ||
      splitTypeid.context === 'map') {
    this._rebaseIndexedCollectionChangeSetForProperty(in_ownPropertyChangeSet[in_key],
      io_rebasePropertyChangeSet[in_key],
      in_basePath,
      splitTypeid.typeid,
      true,          // use square brackets
      out_conflicts,
      in_options);

    // Remove the key, when it no longer contains a changeset
    if (in_removeEmpty && _.isEmpty(io_rebasePropertyChangeSet[in_key])) {
      delete io_rebasePropertyChangeSet[in_key];
    }
  } else if (splitTypeid.context === 'array') {
    this._rebaseArrayChangeSetForProperty(in_ownPropertyChangeSet[in_key],
      io_rebasePropertyChangeSet[in_key],
      in_basePath,
      out_conflicts,
      splitTypeid.typeid,
      in_options);
    // Remove the key, when it no longer contains a changeset
    if (in_removeEmpty && _.isEmpty(io_rebasePropertyChangeSet[in_key])) {
      delete io_rebasePropertyChangeSet[in_key];
    }
  } else if (splitTypeid.typeid === 'String') {
    this._rebaseChangeSetForString(in_ownPropertyChangeSet[in_key],
      io_rebasePropertyChangeSet, in_key,
      in_basePath,
      out_conflicts,
      in_options);
    // Remove the key, when it no longer contains a changeset
    if (in_removeEmpty && _.isEmpty(io_rebasePropertyChangeSet[in_key])) {
      delete io_rebasePropertyChangeSet[in_key];
    }
  } else if (splitTypeid.context === 'single') {
    // We only can have a conflict when the path exists in both ChangeSets
    if (in_ownPropertyChangeSet[in_key] !== undefined) {
      if (TypeIdHelper.isPrimitiveType(splitTypeid.typeid) || splitTypeid.isEnum) {
        return true;
      } else {
        // Otherwise, we have to continue recursively

        // Make sure the paths exist
        in_ownPropertyChangeSet[in_key] = in_ownPropertyChangeSet[in_key] || {};

        // And then perform the recursive rebase
        this._rebaseChangeSetForProperty(in_ownPropertyChangeSet[in_key],
          io_rebasePropertyChangeSet[in_key],
          in_basePath,
          out_conflicts,
          in_options);
      }
    }

  } else {
    throw new Error(MSG.UNKNOWN_CONTEXT + splitTypeid.context);
  }

  return false;
};

/**
 * Helper function which checks whether a given serialized changeSet is an empty changeSet.
 *
 * @param {property-changeset.SerializedChangeSet} in_changeSet - The changeset to test
 * @return {boolean} True if it is an empty changeset.
 */
ChangeSet.isEmptyChangeSet = isEmptyChangeSet;

/**
 * Checks whether the given key from a ChangeSet is not a typeid, but one of the
 * reserved keywords.
 *
 * @param {string} in_key - The key to check
 * @return {boolean} - True if it is a reserved keyword
 */
ChangeSet.isReservedKeyword = isReservedKeyword;

/**
 * recursive helper function for ChangeSet.prototype._toReversibleChangeSet
 * which converts a irreversible changeset to a reversible changeset
 * or updates the former state of a reversible changeset
 * @param  {{property-changeset.Utils.TraversalContext}} in_context the traversal context
 */
// eslint-disable-next-line complexity
ChangeSet.prototype._recursivelyBuildReversibleChangeSet = function(in_context) {
  var opType = in_context.getOperationType();
  if (opType === 'modify') {
    var type = in_context.getTypeid();
    var splitType = in_context.getSplitTypeID();
    var oldValue;
    var nestedChangeset = in_context.getNestedChangeSet();

    var current = in_context.getUserData().parallelState;
    if (in_context.getPropertyContainerType() === 'root') {
      current = in_context.getUserData().oldState;
    } else if (current) {
      if (in_context.getPropertyContainerType() !== 'template') {
        current = current['insert'];
      }

      if (in_context.getPropertyContainerType() !== 'array') {
        current = current && current[in_context.getTypeid()];
        current = current && current[in_context.getLastSegment()];
      } else {
        current = current && current[0][1][in_context.getLastSegment()];
      }
    }

    in_context.setUserData({
      parallelState: current,
      oldState: in_context.getUserData().oldState
    });

    if (TypeIdHelper.isPrimitiveType(type)) {
      if (current === undefined) {
        throw new Error(MSG.INVALID_PATH + in_context.getFullPath() + '. Making primitive value reversible.');
      }
      var oldValue = current;

      // store it in reversibleChangeSet
      if (type === 'String' && !_.isString(nestedChangeset)) {
        // String is a special case
        var oldString;
        if (_.isString(oldValue)) {
          oldString = oldValue;
        }
        if (nestedChangeset.modify) {
          for (var i = 0; i < nestedChangeset.modify.length; i++) {
            var entry = nestedChangeset.modify[i];
            var entryOffset = entry[0];
            var entryLength = entry[1].length;
            entry[2] = oldString.slice(entryOffset, entryOffset + entryLength);
          }
        }
        if (nestedChangeset.remove) {
          for (var i = 0; i < nestedChangeset.remove.length; i++) {
            var entry = nestedChangeset.remove[i];
            var entryOffset = entry[0];
            var oldEntries = [];

            var removeRangeLength = entry[1];
            if (_.isString(removeRangeLength)) {
              removeRangeLength = entry[1].length;
            }
            entry[1] = oldString.slice(entryOffset, entryOffset + removeRangeLength);
          }
        }
      } else {
        if (nestedChangeset && nestedChangeset.hasOwnProperty('value')) {
          nestedChangeset.oldValue = oldValue;
        } else {
          var newChangeSet = {
            value: nestedChangeset,
            oldValue: oldValue
          };
          in_context.replaceNestedChangeSet(newChangeSet);
        }
      }

    } else if (splitType.context === 'array') {
      if (current === undefined) {
        throw new Error(MSG.INVALID_PATH + in_context.getFullPath() + '. Making array value reversible.');
      }
      var oldValue = current.insert ? current.insert[0][1] : [];

      var nestedChangeset = in_context.getNestedChangeSet();
      if (nestedChangeset.modify) {
        if (TypeIdHelper.isPrimitiveType(splitType.typeid)) {
          for (var i = 0; i < nestedChangeset.modify.length; i++)  {
            var entry = nestedChangeset.modify[i];
            var entryOffset = entry[0];
            var oldEntries = [];
            for (var j = 0; j < entry[1].length; j++) {
              oldEntries.push(deepCopy(oldValue[entryOffset + j]));
            }
            entry[2] = oldEntries;
          }
        }
      }
      if (nestedChangeset.remove) {
        for (var i = 0; i < nestedChangeset.remove.length; i++) {
          var entry = nestedChangeset.remove[i];
          var entryOffset = entry[0];
          var oldEntries = [];

          var removeRangeLength = entry[1];
          if (_.isArray(removeRangeLength)) {
            removeRangeLength = entry[1].length;
          }

          for (var j = 0; j < removeRangeLength; j++) {
            oldEntries.push(deepCopy(oldValue[entryOffset + j]));
          }
          entry[1] = oldEntries;
        }
      }
    } else if (splitType.context === 'map' ||
        // node property test: (we have to do the test this way, because of inheritance)
        (nestedChangeset['insert'] ||
        nestedChangeset['modify'] ||
        nestedChangeset['remove'])) {

      // This prevents an error, if the changeset only contains an insert operation. In that case
      // we don't actually need the corresponding old state and thus do not need to throw an error
      // This type of situation can occur in the materialized history, if an insert happens right at a chunk boundary.
      if (_.keys(nestedChangeset).length === 1 &&
          nestedChangeset.insert) {
        in_context.stopTraversal();
        return;
      }
      if (current === undefined) {
        throw new Error(MSG.INVALID_PATH + in_context.getFullPath() + '. Making map value reversible.');
      }
      var oldValue = current.insert;

      if (TypeIdHelper.isPrimitiveType(splitType.typeid)) {
        if (nestedChangeset.modify) {
          var modifiedKeys = Object.keys(nestedChangeset.modify);
          for (var i = 0; i < modifiedKeys.length; i++) {
            var entry = nestedChangeset.modify[modifiedKeys[i]];
            if (typeof entry === 'object' && entry.hasOwnProperty('value')) {
              entry = entry.value;
            }
            nestedChangeset.modify[modifiedKeys[i]] = {
              value: entry,
              oldValue: deepCopy(oldValue[modifiedKeys[i]])
            };
          }
        }
        var newRemove = {};
        if (nestedChangeset.remove) {
          var removedKeys = nestedChangeset.remove;
          if (!_.isArray(removedKeys)) {
            removedKeys = Object.keys(removedKeys);
          }
          for (var i = 0; i < removedKeys.length; i++) {
            newRemove[removedKeys[i]] = deepCopy(oldValue[removedKeys[i]]);
          }
          nestedChangeset.remove = newRemove;
        }
      } else {
        var nestedChangeset = in_context.getNestedChangeSet();
        if (nestedChangeset.modify) {
          // this case is handeled recursively
        }
        var newRemove = {};
        if (nestedChangeset.remove) {
          if (_.isArray(nestedChangeset.remove)) {
            var removedKeys = nestedChangeset.remove;
            for (var i = 0; i < removedKeys.length; i++) {
              var searchedKey = removedKeys[i];
              // search for this key in the old keys:
              var oldTypeKeys = Object.keys(oldValue);
              for (var k = 0; k < oldTypeKeys.length; k++) {
                if (oldValue[oldTypeKeys[k]].hasOwnProperty(searchedKey)) {
                  var entry = oldValue[oldTypeKeys[k]][searchedKey];
                  if (!newRemove[oldTypeKeys[k]]) {
                    newRemove[oldTypeKeys[k]] = {};
                  }
                  newRemove[oldTypeKeys[k]][removedKeys[i]] = deepCopy(entry);
                }
              }
            }
            nestedChangeset.remove = newRemove;
          } else {
            // we already have a reversibleChangeSet and need to update the oldValues
            var removedTypes = Object.keys(nestedChangeset.remove);
            for (var t = 0; t < removedTypes.length; t++) {
              var removedKeys = Object.keys(nestedChangeset.remove[removedTypes[t]]);
              for (var i = 0; i < removedKeys.length; i++) {
                var searchedKey = removedKeys[i];
                var entry = oldValue[removedTypes[t]][searchedKey];
                nestedChangeset.remove[removedTypes[t]][removedKeys[i]] = entry;
              }
            }
          }
        }
      }
    }
  }
};


/**
 * Converts an irreversible changeset to a reversible changeset
 * or updates the former state of a reversible changeset
 * WARNING: This function is still experimental and needs more testing
 * and it's set to private for now. It will be converted to a public API function
 * in a later release.
 * @param  {property-changeset.SerializedChangeSet} in_oldSerializedState the old state
 * @private
 */
ChangeSet.prototype._toReversibleChangeSet = function(in_oldSerializedState) {
  ConsoleUtils.assert(in_oldSerializedState !== undefined,
    MSG.ASSERTION_FAILED + 'Missing function parameter "in_oldSerializedState" of "_toReversibleChangeSet".');

  if (!_.isObject(in_oldSerializedState) || _.isArray(in_oldSerializedState)) {
    if (!_.isObject(this._changes) || _.isArray(this._changes)) {
      this._changes = {
        oldValue: _.isArray(in_oldSerializedState) ? in_oldSerializedState.slice() : in_oldSerializedState,
        value: this._changes
      };
    } else {
      this._changes.oldValue = _.isArray(in_oldSerializedState) ? in_oldSerializedState.slice() :
        in_oldSerializedState;
    }
  } else {
    var workspace = {oldState: in_oldSerializedState};
    Utils.traverseChangeSetRecursively(this._changes, {
      preCallback: this._recursivelyBuildReversibleChangeSet,
      userData: workspace
    });
  }
};

/**
 * Converts a reversible changeset to an irreversible changeset
 * WARNING: This function is still experimental and needs more testing
 * and it's set to private for now. It will be converted to a public API function
 * in a later release.
 * @param {boolean} in_withoutRoot - Bypass a fix where the root of a changeset is cleaned
 * @private
 */
ChangeSet.prototype._stripReversibleChangeSet = function(in_withoutRoot) {
  // eslint-disable-next-line complexity
  var callback = function(in_context) {
    var opType = in_context.getOperationType();
    if (opType === 'remove' || opType === 'modify') {
      var type = in_context.getTypeid();
      if (!type) {
        return;
      }
      var splitType = in_context.getSplitTypeID();

      if (TypeIdHelper.isPrimitiveType(type)) {

        // remove old state
        var nestedChangeset = in_context.getNestedChangeSet();
        if (type === 'String' && !_.isString(nestedChangeset)) {
          // String is a special case

          if (nestedChangeset.modify) {
            for (var i = 0; i < nestedChangeset.modify.length; i++) {
              var entry = nestedChangeset.modify[i];
              entry.splice(2, 1);
            }
          }
          if (nestedChangeset.remove) {
            for (var i = 0; i < nestedChangeset.remove.length; i++) {
              var entry = nestedChangeset.remove[i];

              var removeRangeLength = entry[1];
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
        var nestedChangeset = in_context.getNestedChangeSet();
        if (nestedChangeset.modify) {
          for (var i = 0; i < nestedChangeset.modify.length; i++) {
            var entry = nestedChangeset.modify[i];
            entry.splice(2, 1);
          }
        }
        if (nestedChangeset.remove) {
          for (var i = 0; i < nestedChangeset.remove.length; i++) {
            var entry = nestedChangeset.remove[i];
            var removeRangeLength = entry[1];
            if (_.isArray(removeRangeLength)) {
              removeRangeLength = entry[1].length;
            }
            entry[1] = removeRangeLength;
          }
        }
        // TODO: Remove in_withoutRoot when it will not be used anymore
      } else if (splitType.context === 'map' ||
                 (!in_withoutRoot && splitType.context === 'single')) { // For NodeProperty / inserts at the root
        var nestedChangeset = in_context.getNestedChangeSet();
        if (TypeIdHelper.isPrimitiveType(splitType.typeid)) {
          if (nestedChangeset.modify) {
            var modifiedKeys = Object.keys(nestedChangeset.modify);
            for (var i = 0; i < modifiedKeys.length; i++) {
              var entry = nestedChangeset.modify[modifiedKeys[i]];
              if (typeof entry === 'object' && entry.hasOwnProperty('value')) {
                entry = entry.value;
              }
              nestedChangeset.modify[modifiedKeys[i]] = entry;
            }
          }
          var newRemove = [];
          if (nestedChangeset.remove) {
            var removedKeys = nestedChangeset.remove;
            if (!_.isArray(removedKeys)) {
              removedKeys = Object.keys(removedKeys);
              nestedChangeset.remove = removedKeys;
            }
          }
        } else {
          var nestedChangeset = in_context.getNestedChangeSet();
          if (nestedChangeset.modify) {
            // this case is handeled recursively
          }
          var newRemove = {};
          if (nestedChangeset.remove) {
            if (!_.isArray(nestedChangeset.remove)) {
              // we have a reversibleChangeSet and need to convert
              var newRemove = [];
              var removedTypes = Object.keys(nestedChangeset.remove);
              for (var t = 0; t < removedTypes.length; t++) {
                var removedKeys = Object.keys(nestedChangeset.remove[removedTypes[t]]);
                for (var i = 0; i < removedKeys.length; i++) {
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

  Utils.traverseChangeSetRecursively(this._changes, {
    preCallback: callback
  });
};

/**
 * Helper function to extract the first level paths from a given change set
 * @param {property-changeset.SerializedChangeSet} in_changeSet The ChangeSet to extract paths from
 * @return {Array<string>} List of paths found at the first level of the change set
 * @private
 */
var _extractFirstLevelPaths = function(in_changeSet) {
  var paths = [];
  _.each(in_changeSet, function(nestedChangeSet) {
    _.each(nestedChangeSet, function(nestedChangeSet2, path) {
      paths.push(path);
    });
  });

  return paths;
};

/**
 * recursive helper function for ChangeSet.prototype._toInverseChangeSet
 * @param  {{property-changeset.Utils.TraversalContext}} in_context the traversal context
 */
ChangeSet.prototype._recursivelyInvertReversibleChangeset = function(in_context) {
  in_context.setUserData(in_context.getUserData() || {});

  // Figure out if we have already visited this path by verifying that the full path
  // is contained within the list of processed deleted or inserted paths
  var isWithinInsertOrDelete = in_context.getUserData()[in_context.getFullPath()];

  if (isWithinInsertOrDelete && in_context.getOperationType() !== 'modify') {
    // We are within an insert or remove sub tree. Skip this iteration.
    in_context.stopTraversal();
    return;
  }

  if (in_context.getOperationType() === 'remove' ||
      in_context.getOperationType() === 'modify') {
    var type = in_context.getTypeid();
    var splitType = in_context.getSplitTypeID();

    if (!splitType) {
      ConsoleUtils.assert(false,
        MSG.ASSERTION_FAILED + 'Missing "splitType" in "in_context":' + JSON.stringify(in_context));
    }

    var nestedChangeset = in_context.getNestedChangeSet();

    if ((TypeIdHelper.isPrimitiveType(type) && type !== 'String') ||
        (type === 'String' && _.isString(nestedChangeset.oldValue))) {
      // check if we were called with an irreversible changeset
      if (in_context.getOperationType() === 'modify' &&
          (!_.isObject(nestedChangeset) || typeof nestedChangeset.oldValue === 'undefined')) {
        throw new Error(MSG.OLD_VALUE_NOT_FOUND);
      }

      // switch oldValue and value
      var tmp = nestedChangeset.oldValue;
      nestedChangeset.oldValue = nestedChangeset.value;
      nestedChangeset.value = tmp;
    } else if ( (type === 'String' && !_.isString(nestedChangeset.oldValue)) || splitType.context === 'array') {
      // String and Arrays need special treatment:
      var arrayIterator = new ArrayChangeSetIterator(nestedChangeset);
      var resultChangeset = {};
      if (nestedChangeset.modify) {
        resultChangeset.modify = [];
      }
      if (nestedChangeset.insert) {
        resultChangeset.remove = [];
      }
      if (nestedChangeset.remove) {
        resultChangeset.insert = [];
      }
      // Successively invert the changes from the changeSet
      while (!arrayIterator.atEnd()) {
        switch (arrayIterator.type) {
          case ArrayChangeSetIterator.types.INSERT:
            // Handle inserts
            resultChangeset.remove.push([
              arrayIterator.operation[0] + arrayIterator.offset,
              arrayIterator.operation[1]
            ]);
            break;
          case ArrayChangeSetIterator.types.REMOVE:
            // Handle removes
            resultChangeset.insert.push([
              arrayIterator.operation[0] + arrayIterator.offset,
              arrayIterator.operation[1]
            ]);
            break;
          case ArrayChangeSetIterator.types.MODIFY:
            // Handle modifies
            if (TypeIdHelper.isPrimitiveType(splitType.typeid)) {
              resultChangeset.modify.push([
                arrayIterator.operation[0] + arrayIterator.offset,
                arrayIterator.operation[2],
                arrayIterator.operation[1]
              ]);
            } else {
              resultChangeset.modify.push([
                arrayIterator.operation[0] + arrayIterator.offset,
                arrayIterator.operation[1]
              ]);
            }
            break;
          default:
            console.error('applyChangeset: ' + MSG.UNKNOWN_OPERATION + arrayIterator.type);
        }
        arrayIterator.next();
      }
      in_context.replaceNestedChangeSet(resultChangeset);
    } else {
      // Covers NodeProperty, Map and Set
      if (nestedChangeset.modify) {
        if (TypeIdHelper.isPrimitiveType(splitType.typeid) && splitType.context === 'map') {
          var modifiedKeys = Object.keys(nestedChangeset.modify);
          for (var i = 0; i < modifiedKeys.length; i++) {
            var entry = nestedChangeset.modify[modifiedKeys[i]];
            var tmp = entry.value;
            entry.value = entry.oldValue;
            entry.oldValue = tmp;
          }
        }
      }
      var oldInsert = nestedChangeset.insert;
      var replacedInsert = false;
      if (nestedChangeset.remove) {
        nestedChangeset.insert = nestedChangeset.remove;
        replacedInsert = true;
        nestedChangeset.remove = undefined;
        delete nestedChangeset.remove;
        _.each(_extractFirstLevelPaths(nestedChangeset.insert), function(path) {
          in_context.getUserData()[path] = true;
        });
      }
      if (oldInsert) {
        if (replacedInsert) {
          nestedChangeset.remove = deepCopy(oldInsert);
        } else {
          nestedChangeset.remove = oldInsert;
          nestedChangeset.insert = undefined;
          delete nestedChangeset.insert;
        }
        _.each(_extractFirstLevelPaths(nestedChangeset.remove), function(path) {
          let fullPath = joinPaths(in_context.getFullPath(), path, PROPERTY_PATH_DELIMITER);
          in_context.getUserData()[fullPath] = true;
        });
      }
    }
  }
};

/**
 * Inverts a reversible ChangeSets
 * WARNING: This function is still experimental and needs more testing
 * and it's set to private for now. It will be converted to a public API function
 * in a later release
 * @private
 */
ChangeSet.prototype._toInverseChangeSet = function() {
  if (this._changes.value !== undefined &&
      this._changes.oldValue !== undefined) {
    var tmp = this._changes.value;
    this._changes.value = this._changes.oldValue;
    this._changes.oldValue = tmp;
  } else {
    Utils.traverseChangeSetRecursively(this._changes, {
      preCallback: this._recursivelyInvertReversibleChangeset
    });
  }
};

// Extending ChangeSet class with array processing functions
const ChangeSetArrayFunctions = require('./changeset_operations/array');

ChangeSet.prototype._performApplyAfterOnPropertyArray = ChangeSetArrayFunctions._performApplyAfterOnPropertyArray;
ChangeSet.prototype._rebaseArrayChangeSetForProperty = ChangeSetArrayFunctions._rebaseArrayChangeSetForProperty;
ChangeSet.prototype._rebaseChangeSetForString = ChangeSetArrayFunctions._rebaseChangeSetForString;

// Add the indexed collection functions into the prototype of the ChangeSet
const ChangeSetIndexedCollectionFunctions = require('./changeset_operations/indexed_collection');
ChangeSet.prototype._performApplyAfterOnPropertyIndexedCollection =
    ChangeSetIndexedCollectionFunctions._performApplyAfterOnPropertyIndexedCollection;
ChangeSet.prototype._cleanIndexedCollectionChangeSet =
    ChangeSetIndexedCollectionFunctions._cleanIndexedCollectionChangeSet;
ChangeSet.prototype._rebaseIndexedCollectionChangeSetForProperty =
    ChangeSetIndexedCollectionFunctions._rebaseIndexedCollectionChangeSetForProperty;

module.exports = ChangeSet;
