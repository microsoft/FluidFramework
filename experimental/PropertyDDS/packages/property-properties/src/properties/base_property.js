/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint accessor-pairs: [2, { "getWithoutSet": false }] */
const _ = require('lodash');
const PathHelper = require('@fluid-experimental/property-changeset').PathHelper;
const MSG = require('@fluid-experimental/property-common').constants.MSG;
const ConsoleUtils = require('@fluid-experimental/property-common').ConsoleUtils;
const TypeIdHelper = require('@fluid-experimental/property-changeset').TypeIdHelper;
const ChangeSet = require('@fluid-experimental/property-changeset').ChangeSet;
const Property = require('./lazy_loaded_properties');


var BREAK_TRAVERSAL = 'BREAK';
const PROPERTY_PATH_DELIMITER = require('@fluid-experimental/property-common').constants.PROPERTY_PATH_DELIMITER;

/**
 * Determines in which cases a reference will automatically be resolved
 * @enum {number}
 * @alias property-properties.BaseProperty.REFERENCE_RESOLUTION
 */
var REFERENCE_RESOLUTION = {
  /** The resolution will always automatically follow references */
  ALWAYS: 0,
  /** If a reference is the last entry during the path resolution, it will not automatically be resolved */
  NO_LEAFS: 1,
  /** References are never automatically resolved */
  NEVER: 2
};

/**
 * Used to indicate the state of a property. These flags can be connected via OR.
 * @enum {number}
 * @alias property-properties.BaseProperty.MODIFIED_STATE_FLAGS
 */
var MODIFIED_STATE_FLAGS = {
  /** No changes to this property at the moment */
  CLEAN: 0,
  /** The property is marked as changed in the currently pending ChangeSet */
  PENDING_CHANGE: 1,
  /** The property has been modified and the result has not yet been reported to the application for scene updates */
  DIRTY: 2
};

/**
 * Token Types
 * @enum Object
 * Type of the token in the path string
 */
var PATH_TOKENS = {
  /** A / at the beginning of the path */
  ROOT: {'token': 'ROOT'},
  /** A * that indicates a dereferencing operation */ // note: reversed!
  REF: {'token': 'REF'},
  /** A ../ that indicates one step above the current path */
  UP: {'token': 'UP'}
};

/**
 * The options to selectively create only a subset of a property.
 *
 * For now the filtering options are propagated by many functions, but are actually used only by
 * functions that create properties from schemas. It is then possible to create only a subset of
 * the properties of a schema by providing a restricted list of paths.
 *
 * Thus, with the filtering options, it is NOT possible to prevent a part of a ChangeSet from being
 * processed (in `applyChangeSet()` for example), it is NOT possible to prevent a property from being
 * created by a direct call to a function like `deserialize()` or `createProperty()`.
 *
 * @typedef {Object} BaseProperty.PathFilteringOptions
 * @property {string} basePath The canonical path of the property we are about to create.
 * @property {array<string>} paths The canonical paths of the properties we are allowed to create.
 */

/**
 * Default constructor for BaseProperty
 * @param {object} in_params List of parameters
 * @param {string} in_params.id id of the property
 * @param {string=} [in_params.typeid='BaseProperty'] The type unique identifier
 * @param {number=} [in_params.length=1] The length of the property. Only valid if
 *   the property is an array, otherwise the length defaults to 1
 * @param {string=} [in_params.context='single'] The type of property this template represents
 *   i.e. single, array, map, set.
 * @param {Array.<object>} in_params.properties List of property templates that
 *   are used to define children properties -- UNUSED PARAMETER ??
 * @param {Array.<string>} in_params.inherits List of property template typeids that this
 *   PropertyTemplate inherits from -- UNUSED PARAMETER ??
 * @abstract
 * @constructor
 * @protected
 * @alias property-properties.BaseProperty
 * @category Properties
 */
var BaseProperty = function(in_params) {
  // Pre-conditions
  ConsoleUtils.assert(in_params, MSG.PROP_CONSTRUCTOR_EXPECTS_OBJECTS);

  in_params = in_params || {};

  if (this._id !== in_params.id) {
    this._id = in_params.id;
  }

  // Makes sure context value is fine
  ConsoleUtils.assert(!in_params.context || in_params.context === this._context,
      MSG.CONTEXT_NOT_AS_EXPECTED + this._context + ' != ' + in_params.context);

  // Sets typeid if default value is not fine
  if (in_params.typeid && in_params.typeid !== this._typeid) {
    this._typeid = in_params.typeid;
  }

  this._parent = undefined;

  // internal management
  if (!this._noDirtyInBase) {
    this._dirty = MODIFIED_STATE_FLAGS.CLEAN;
  }
};

BaseProperty.MODIFIED_STATE_FLAGS = MODIFIED_STATE_FLAGS;
BaseProperty.prototype.MODIFIED_STATE_FLAGS = MODIFIED_STATE_FLAGS;

BaseProperty.REFERENCE_RESOLUTION = REFERENCE_RESOLUTION;
BaseProperty.prototype.REFERENCE_RESOLUTION = REFERENCE_RESOLUTION;

BaseProperty.PATH_TOKENS = PATH_TOKENS;
BaseProperty.prototype.PATH_TOKENS = PATH_TOKENS;

// Default values. Hide them per instance if required.
BaseProperty.prototype._typeid = 'BaseProperty';
BaseProperty.prototype._context = 'single';
BaseProperty.prototype._isConstant = false;

/**
 * @return {string} - The typeid of this property
 */
BaseProperty.prototype.getTypeid = function() {
  return this._typeid;
};

/**
 * @return {string} - The context of this property
 */
BaseProperty.prototype.getContext = function() {
  return this._context;
};

/**
 * Get the scope to which this property belongs to.
 * @return {string|undefined} The guid representing the scope in which the
 * property belongs to
 * @private
 */
BaseProperty.prototype._getScope = function() {
  if (this._parent) {
    return this.getRoot()._getScope();
  } else {
    return undefined;
  }
};

/**
 * Returns the full property type identifier for the ChangeSet including the enum type id
 * @param  {boolean} [in_hideCollection=false] - if true the collection type (if applicable) will be omitted
 *                since that is not aplicable here, this param is ignored
 * @return {string} The typeid
 */
BaseProperty.prototype.getFullTypeid = function(in_hideCollection) {
  return this._typeid;
};

/**
 * Updates the parent for the property
 *
 * @param {property-properties.BaseProperty} in_property - The parent property
 * @private
 */
BaseProperty.prototype._setParent = function( in_property ) {
  this._parent = in_property;

  // If the property is dirty but not its parent, dirty the parent. In cases like named properties
  //   and default values, a parent is set after a value is set; we get a case where the
  //   property is dirty but not its parent and the change is not included in a changeSet.
  if (this._parent && this._isDirty() && !this._parent._isDirty()) {
    this._parent._setDirty(false, this);
  }
};

/**
 * Is this property the root of the property set tree?
 *
 * @return {boolean} True if it is a root, otherwise false.
 */
BaseProperty.prototype.isRoot = function() {
  // This checks, whether this is the root of a CheckOutView
  // (all other properties should have a parent property)
  return this._parent === undefined;
};

/**
 * Is this property the ancestor of in_otherProperty?
 * Note: A property is not considered an ancestor of itself
 * @param {property-properties.BaseProperty} in_otherProperty possible descendant
 * @throws if in_otherProperty is not defined.
 * @return {boolean} True if it is a ancestor, otherwise false.
 */
BaseProperty.prototype.isAncestorOf = function(in_otherProperty) {
  ConsoleUtils.assert(in_otherProperty, MSG.MISSING_IN_OTHERPROP);
  var parent = in_otherProperty.getParent();
  while (parent) {
    if (parent === this ) {
      return true;
    } else {
      parent = parent.getParent();
    }
  }
  return false;
};

/**
 * Is this property the descendant of in_otherProperty?
 * Note: A property is not considered a descendant of itself
 * @param {property-properties.BaseProperty} in_otherProperty possible ancestor
 * @throws if in_otherProperty is not defined.
 * @return {boolean} True if it is a descendant, otherwise false.
 */
BaseProperty.prototype.isDescendantOf = function(in_otherProperty) {
  ConsoleUtils.assert(in_otherProperty, MSG.MISSING_IN_OTHERPROP);
  return in_otherProperty.isAncestorOf(this);
};

/**
 * Is this property a leaf node with regard to flattening?
 *
 * TODO: Which semantics should flattening have? It stops at primitive types and collections?
 *
 * @return {boolean} True if it is a leaf with regard to flattening
 */
BaseProperty.prototype._isFlattenLeaf = function() {
  return false;
};

/**
 * Get the parent of this property
 *
 * @return {property-properties.BaseProperty|undefined} The parent of this property (or undefined if none exist)
 */
BaseProperty.prototype.getParent = function() {
  return this._parent;
};

/**
 * checks whether the property is dynamic (only properties inherting from NodeProperty are)
 * @return {boolean} True if it is a dynamic property.
 */
BaseProperty.prototype.isDynamic = function() { return false; };

/**
 * Sets the property as dirty and/or pending. This will add one or both flags if not already set and will
 * do the same for its parent. This does not clear any flag, it only sets.
 *
 * @param {boolean} [in_reportToView = true] - By default, the dirtying will always be reported to the checkout view
 *                                             and trigger a modified event there. When batching updates, this
 *                                             can be prevented via this flag.
 * @param {property-properties.BaseProperty} [in_callingChild] - The child which is dirtying its parent
 * @param {Number} [in_flags = DIRTY | PENDING_CHANGE] The flags to set.
 * @private
 */
BaseProperty.prototype._setDirty = function(in_reportToView, in_callingChild, in_flags) {
  if (in_flags === undefined) {
    in_flags = MODIFIED_STATE_FLAGS.DIRTY | MODIFIED_STATE_FLAGS.PENDING_CHANGE;
  }
  var reportToView = in_reportToView;
  if (reportToView === undefined) {
    reportToView = true;
  }
  // We only update the flags upwards in the tree, when the corresponding nodes are not already flagged
  var oldFlags = this._getDirtyFlags();
  if ((oldFlags & in_flags) !== in_flags) { // only dirty once until clean.
    this._setDirtyFlags(oldFlags | in_flags);

    // Report dirtiness upwards in the hierarchy
    if (this._parent) {
      this._parent._setDirty(reportToView, this, in_flags);
      reportToView = false;
    }
  }
  if (reportToView) {
    this._reportDirtinessToView();
  }
};

/**
 * Sets the dirty flags for this property
 * @param {Number} in_flags The dirty flags
 */
BaseProperty.prototype._setDirtyFlags = function(in_flags) {
  this._dirty = in_flags;
};

/**
 * Gets the dirty flags for this property
 * @return {Number} The dirty flags
 */
BaseProperty.prototype._getDirtyFlags = function() {
  return this._dirty;
};

/**
 * Helper function, which reports the fact that a property has been dirtied to the checkout view
 * @private
 */
// TODO: Cleaner way to make the property tree aware of the DDS hosting it.
// Currently, this._tree is set in SharedPropertyTree constructor.
BaseProperty.prototype._reportDirtinessToView = function _reportDirtinessToView() {
	// eslint-disable-next-line @typescript-eslint/no-this-alias
	let currentNode = this;

	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
	while (currentNode._parent) {
		currentNode = currentNode._parent;
	}

	if (
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		currentNode._tree &&
		currentNode._tree.notificationDelayScope === 0 &&
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		currentNode._isDirty(BaseProperty.MODIFIED_STATE_FLAGS.DIRTY)
	) {
		currentNode._tree._reportDirtinessToView();
	}
};

/**
 * Modifies the property according to the given changeset
 *
 * @param {property-properties.SerializedChangeSet} in_changeSet - The changeset to apply
 * @param {property-properties.BaseProperty.PathFilteringOptions} [in_filteringOptions]
 *    The filtering options to consider while applying the ChangeSet.
 * @throws if in_changeSet is invalid.
 */
BaseProperty.prototype.applyChangeSet = function(in_changeSet, in_filteringOptions) {
  this._checkIsNotReadOnly(false);

  // We just forward the call to the internal function
  this._applyChangeset(in_changeSet, true, in_filteringOptions);
};

/**
 * Modifies the property according to the given changeset
 *
 * Internal function.
 *
 * @param {property-properties.SerializedChangeSet} in_changeSet - The changeset to apply
 * @param {boolean} [in_reportToView = true] - By default, the dirtying will always be reported to the checkout view
 *                                             and trigger a modified event there. When batching updates, this
 *                                             can be prevented via this flag.
 * @param {property-properties.BaseProperty.PathFilteringOptions} [in_filteringOptions]
 *    The filtering options to consider while applying the ChangeSet. For now it is only used to
 *    control property creation, to prevent properties from being created outside the checked out
 *    paths. It does not validate that a value inside the ChangeSet is outside those paths.
 */
BaseProperty.prototype._applyChangeset = function(in_changeSet, in_reportToView, in_filteringOptions) {
  var typeids = _.keys(in_changeSet);
  for (var i = 0; i < typeids.length; i++) {
    var typeid = typeids[i];
    if (ChangeSet.isReservedKeyword(typeid)) {
      continue; // Ignore the special keys
    }

    var paths = _.keys(in_changeSet[typeid]);
    for (var j = 0; j < paths.length; j++) {
      var path = paths[j];
      var property = this.resolvePath(path,
        {referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER});
      if (property) {
        property._applyChangeset(in_changeSet[typeid][path], false);
      } else {
        throw new Error(MSG.INVALID_PATH + path);
      }
    }
  }

  if (in_reportToView) {
    this._reportDirtinessToView();
  }
};

/**
 * Re-apply dirty flags from changesets
 *
 * Internal function.
 *
 * @param {property-properties.SerializedChangeSet} [in_pendingChangeSet] - The pending changeset to apply
 * @param {property-properties.SerializedChangeSet} [in_dirtyChangeSet] - The dirty changeset to apply
 * @throws if changeset arguments are invalid.
 */
BaseProperty.prototype._reapplyDirtyFlags = function(in_pendingChangeSet, in_dirtyChangeSet) {
  this._checkIsNotReadOnly(false);
  // Here we must walk both changesets in parallell. Sometimes there will be only an entry in one
  // changeset, sometimes only one in the other changeset, sometimes one in both.
  const typeids = _.keys(in_pendingChangeSet).concat(_.keys(in_dirtyChangeSet));
  for (let i = 0; i < typeids.length; i++) {
    let typeid = typeids[i];
    if (ChangeSet.isReservedKeyword(typeid)) {
      continue; // Ignore the special keys
    }
    const pendingChangeSet = in_pendingChangeSet && in_pendingChangeSet[typeid];
    const dirtyChangeSet = in_dirtyChangeSet && in_dirtyChangeSet[typeid];

    const  paths = _.keys(pendingChangeSet).concat(_.keys(dirtyChangeSet));
    for (let j = 0; j < paths.length; j++) {
      let path = paths[j];
      let property = this.resolvePath(path);
      if (property) {
        property._reapplyDirtyFlags(
          pendingChangeSet && pendingChangeSet[path],
          dirtyChangeSet && dirtyChangeSet[path]);
      } else {
        throw new Error(MSG.INVALID_PATH + path);
      }
    }
  }
};

/**
 * Removes the dirtiness flag from this property
 * @param {property-properties.BaseProperty.MODIFIED_STATE_FLAGS} [in_flags] - The flags to clean, if none are supplied all
 *                                                                       will be removed
 * @private
 */
BaseProperty.prototype._cleanDirty = function(in_flags) {
  this._setDirtyFlags(in_flags === undefined ? MODIFIED_STATE_FLAGS.CLEAN :
                                              (this._getDirtyFlags() & ~in_flags));
};


/**
 * Removes the dirtiness flag from this property and recursively from all of its children
 *
 * @param {property-properties.BaseProperty.MODIFIED_STATE_FLAGS} [in_flags] - The flags to clean, if none are supplied all
 *                                                                       will be removed
 */
BaseProperty.prototype.cleanDirty = function(in_flags) {
  var dirtyChildren = this._getDirtyChildren(in_flags);
  var child;
  for (var i = 0; i < dirtyChildren.length; i++) {
    child = this.get(dirtyChildren[i],
      {referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER});
    child.cleanDirty(in_flags);
    child._cleanDirty(in_flags);
  }

  // after all paths are clean, we are also clean!
  this._cleanDirty(in_flags);
};

/**
 * Indicates that the property has been modified and a corresponding modified call has not yet been sent to the
 * application for runtime scene updates.
 *
 * @param {property-properties.BaseProperty.MODIFIED_STATE_FLAGS} [in_dirtinessType] -
 *     The type of dirtiness to check for. By default this is DIRTY
 * @return {boolean} Is the property dirty?
 * @private
 */
BaseProperty.prototype._isDirty = function(in_dirtinessType) {
  in_dirtinessType = in_dirtinessType === undefined ? MODIFIED_STATE_FLAGS.DIRTY : in_dirtinessType;
  return !!(this._getDirtyFlags() & in_dirtinessType);
};

/**
 * Indicates that the property has been modified and a corresponding modified call has not yet been sent to the
 * application for runtime scene updates.
 *
 * @return {boolean} True if the property is dirty. False otherwise.
 */
BaseProperty.prototype.isDirty = function() {
  return this._isDirty();
};

/**
 * The property has pending changes in the current ChangeSet.
 * @return {boolean} True if the property has pending changes. False otherwise.
 */
BaseProperty.prototype.hasPendingChanges = function() {
  return this._isDirty(MODIFIED_STATE_FLAGS.PENDING_CHANGE);
};

/**
 * Returns the ChangeSet of all sub-properties
 *
 * @return {property-properties.ChangeSet} The serialized changes
 */
BaseProperty.prototype.getPendingChanges = function() {
  var serialized = this._serialize(true, false, BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE);
  return new ChangeSet(serialized);
};

/**
 * Get the id of this property
 *
 * @return {string|undefined} The id of the property
 */
BaseProperty.prototype.getId = function() {
  return this._id;
};

/**
 * Sets the checkedOutRepositoryInfo.
 * @param {property-properties.CheckoutView~CheckedOutRepositoryInfo} value - The checkedOut repository info.
 * @protected
 */
BaseProperty.prototype._setCheckedOutRepositoryInfo = function(value) {
  this._checkedOutRepositoryInfo = value;
};

/**
 * Returns the checkoutView
 * @return {property-properties.CheckoutView} - the checkout view
 */
BaseProperty.prototype._getCheckoutView = function() {
  let checkedOutRepositoryInfo = this._getCheckedOutRepositoryInfo();
  return checkedOutRepositoryInfo ? checkedOutRepositoryInfo.getCheckoutView() : undefined;
};

/**
 * Returns the checkedOutRepositoryInfo.
 * @return {property-properties.CheckoutView~CheckedOutRepositoryInfo} The checkedOut repository info.
 * @protected
 */
BaseProperty.prototype._getCheckedOutRepositoryInfo = function() {
  if (!this._parent) {
    return this._checkedOutRepositoryInfo;
  } else {
    return this.getRoot() ? this.getRoot()._getCheckedOutRepositoryInfo() : undefined;
  }
};

/**
 * Returns the Workspace
 * @return {property-properties.Workspace|undefined} The workspace containing the property.
 */
BaseProperty.prototype.getWorkspace = function() {
  var checkoutView = this._getCheckoutView();
  if (checkoutView) {
    return checkoutView._getWorkspace();
  } else {
    return undefined;
  }
};

/**
 * Returns the path segment for a child
 *
 * @param {property-properties.BaseProperty} in_childNode - The child for which the path is returned
 *
 * @return {string} The path segment to resolve the child property under this property
 * @protected
 */
BaseProperty.prototype._getPathSegmentForChildNode = function(in_childNode) {
  return PROPERTY_PATH_DELIMITER + PathHelper.quotePathSegmentIfNeeded(in_childNode.getId());
};

/**
 * Resolves a direct child node based on the given path segment
 *
 * @param {String} in_segment                                   - The path segment to resolve
 * @param {property-properties.PathHelper.TOKEN_TYPES} in_segmentType - The type of segment in the tokenized path
 *
 * @return {property-properties.BaseProperty|undefined} The child property that has been resolved
 * @protected
 */
BaseProperty.prototype._resolvePathSegment = function(in_segment, in_segmentType) {
  // Base Properties only support paths separated via dots
  if (in_segmentType !== PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN) {
    throw new Error(MSG.INVALID_PATH_TOKEN + in_segment);
  }

  return this.get(in_segment, {referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER});
};

/**
 * Set the id of this property
 *
 * @param {string} in_id - The id for this property
 *
 * @return {string} the new id
 * @private
 */
BaseProperty.prototype._setId = function(in_id) {
  if (!_.isString(in_id) && !_.isNumber(in_id)) {
    throw new Error(MSG.ID_STRING_OR_NUMBER + in_id);
  }

  if (this._parent !== undefined) {
    throw new Error(MSG.ID_CHANGE_FOR_PROPERTY_WITH_PARENT + this._id + ' to id: ' + in_id);
  }

  this._id = String(in_id);

  // flush caches
  this._setDirty();

  return in_id;
};

/**
 * Return a clone of this property
 * @return {BaseProperty} The cloned property
 */
BaseProperty.prototype.clone = function() {
  const PropertyFactory = Property.PropertyFactory;
  var clone = PropertyFactory._createProperty(this.getFullTypeid(), null, undefined, this._getScope());

  // TODO: this is not very efficient. Clone should be overriden
  // by the child classes
  clone.deserialize(this._serialize());
  clone.cleanDirty(
    BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE |
    BaseProperty.MODIFIED_STATE_FLAGS.DIRTY
  );
  return clone;
};

/**
 * Returns true if the property is a primitive type
 * @return {boolean} true if the property is a primitive type
 */
BaseProperty.prototype.isPrimitiveType = function() {
  return TypeIdHelper.isPrimitiveType(this._typeid);
};

/**
 * Get a flattened, tree like representation of this object and all of it's
 * descendants. The flattening will stop at primitive properties and collections.
 *
 * For non-leaf nodes, it is possible to access the corresponding node object itself via the
 * propertyNode member of the flattened representation (warning, this will overwrite a
 * property of this name).
 * TODO: Do we want to have this feature or is it to dangerous?
 *
 * @return {Object} the flat representation
 * @private
 */
BaseProperty.prototype._flatten = function() {
  return {propertyNode: this};
};

/**
 * Repeatedly calls back the given function with human-readable string representations
 * of the property and of its sub-properties. By default it logs to the console.
 * If printFct is not a function, it will default to console.log
 * @param {function} [printFct=console.log] - Function to call for printing each property
 */
BaseProperty.prototype.prettyPrint = function(printFct) {
  if (typeof printFct !== 'function') {
    printFct = console.log;
  }
  this._prettyPrint('', '', printFct);
};

/**
 * Return a JSON representation of the properties and its children.
 * @return {object} A JSON representation of the properties and its children.
 * @private
 */
BaseProperty.prototype._toJson = function() {
  var json = {
    id: this.getId(),
    context: this._context,
    typeid: this.getTypeid(),
    isConstant: this._isConstant,
    value: []
  };

  var ids = this.getIds();
  for (var i = 0; i < ids.length; i++) {
    json.value.push(
      this.get(ids[i], {referenceResolutionMode: this.REFERENCE_RESOLUTION.NEVER})._toJson()
    );
  }

  return json;
};

/**
 * Repeatedly calls back the given function with human-readable string
 * representations of the property and of its sub-properties.
 * @param {string} indent - Leading spaces to create the tree representation
 * @param {string} externalId - Name of the current property at the upper level.
 *                              Used for arrays.
 * @param {function} printFct - Function to call for printing each property
 */
BaseProperty.prototype._prettyPrint = function(indent, externalId, printFct) {
  var context = '';
  switch (this._context) {
    case 'map': context = 'Map of '; break;
    case 'set': context = 'Set of '; break;
    default: break;
  }
  printFct(indent + externalId + this.getId() + ' (' + context + this.getTypeid() + '):');
  this._prettyPrintChildren(indent, printFct);
};

/**
 * Repeatedly calls back the given function with human-readable string
 * representations of the property's sub-properties.
 * @param {string} indent - Leading spaces to create the tree representation
 * @param {function} printFct - Function to call for printing each property
 */
BaseProperty.prototype._prettyPrintChildren = function(indent, printFct) {
  indent += '  ';
  var ids = this.getIds();
  for (var i = 0; i < ids.length; i++) {
    this.get(ids[i], {referenceResolutionMode: this.REFERENCE_RESOLUTION.NEVER})._prettyPrint(indent, '', printFct);
  }
};

/**
 * Returns the possible paths from the given from_property to this property. If multiple paths
 * through multiple repository references are possible, returns more than one path.
 *
 * @param {property-properties.BaseProperty} in_fromProperty - The node from which the
 *     path is computed
 * @return {Array<string | undefined>} The paths between from_property and this property
 * will return an empty array if trying to get the path from a child repo to a parent repo.
 * @private
 */
BaseProperty.prototype._getPathsThroughRepoRef = function(in_fromProperty) {
  var paths = [];
  var that = this;
  var referenceProps = [];
  // get all reference properties in the referenceProps array
  this._getCheckoutView()._forEachCheckedOutRepository(function(repoInfo) {
    var keys = _.keys(repoInfo._referencedByPropertyInstanceGUIDs);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i]) {
        var repoRef = repoInfo._referencedByPropertyInstanceGUIDs[keys[i]]
          ._repositoryReferenceProperties[keys[i]].property;
        if (that.getRoot() === repoRef.getReferencedRepositoryRoot()) {
          referenceProps.push(repoRef);
        }
      }
    }
  });

  // if no repo references point to the root of 'this', we can assume that 'this' is in the
  // parent repo, which cannot return a useful path.
  if (referenceProps.length === 0) {
    console.warn(MSG.NO_PATH_FROM_CHILD_REPO);
    return [];
  }

  // path from root of the child repo to 'this'
  var pathInChildRepo = this._getDirectPath(this.getRoot());

  // find possible paths from in_fromProperty to the referenceProps
  // concatenate each with pathInChildRepo
  for (var i = 0; i < referenceProps.length; i++) {
    var pathInParentRepo = referenceProps[i].getRelativePath(in_fromProperty);
    if (pathInParentRepo) {
      if (pathInChildRepo.length > 0) {
        paths.push(pathInParentRepo + '.' + pathInChildRepo);
      } else {
        paths.push(pathInParentRepo);
      }
    }
  }
  if (paths.length > 0) {
    return paths;
  }
  return [];
};

/**
 * Returns the possible paths from the given in_fromProperty to this property. If no direct paths
 * exist, it returns an indirect path between the two properties.
 *
 * @param {property-properties.BaseProperty} in_fromProperty - The node from which the
 *     path is computed
 * @return {string} The path between the given in_fromProperty and this property
 * @private
 */
BaseProperty.prototype._getIndirectPath = function(in_fromProperty) {
  var path = [];
  var that = this;
  var foundPath = undefined;

  foundPath = in_fromProperty.traverseUp(function(in_node) {
    path.push('../');
    if (in_node === that) {
      return BREAK_TRAVERSAL;
    }
    var directPath = that._getDirectPath(in_node);
    if (directPath) {
      path.push(directPath);
      return BREAK_TRAVERSAL;
    }
    return undefined;
  });
  if (foundPath === BREAK_TRAVERSAL) {
    return path.join('');
  } else {
    return undefined;
  }
};

/**
 * Returns the path from the given in_fromProperty to this property if a direct path
 * exists between the two properties. Otherwise returns undefined.
 *
 * @param {property-properties.BaseProperty} in_fromProperty - The node from which the
 *     path is computed
 * @return {string} The path between the given in_fromProperty and this property
 * @private
 */
BaseProperty.prototype._getDirectPath = function(in_fromProperty) {
  var path = [];
  var foundAncestor = undefined;
  if (in_fromProperty === this) {
    foundAncestor = BREAK_TRAVERSAL;
  } else {
    if (this.getParent()) {
      path.push(this.getParent()._getPathSegmentForChildNode(this));

      foundAncestor = this.traverseUp( function( in_node ) {
        // break where we meet the relative reference
        if (in_node === in_fromProperty) {
          return BREAK_TRAVERSAL;
        }

        if (in_node.getParent()) {
          path.push(in_node.getParent()._getPathSegmentForChildNode(in_node));
        }

        return undefined;
      });
    }
  }

  if (foundAncestor === BREAK_TRAVERSAL) {
    var result = path.reverse().join('');

    // We don't use a PROPERTY_PATH_DELIMITER at the start of the path
    if (result[0] === PROPERTY_PATH_DELIMITER) {
      result = result.substr(1);
    }
    return result;
  } else {
    return undefined;
  }
};

/**
 * Returns the possible paths from the given in_fromProperty to this property.
 *
 * @param {property-properties.BaseProperty} in_fromProperty - The node from which the
 *     path is computed
 * @return {Array<string>} The paths between the given in_fromProperty and this property
 * @private
 */
BaseProperty.prototype._getAllRelativePaths = function(in_fromProperty) {
  if (this.getRoot() !== in_fromProperty.getRoot()) {
    // if this and in_fromProperty have different roots, go through a repo ref
    // this is the case where we might have more than one path
    return this._getPathsThroughRepoRef(in_fromProperty);
  } else {
    var directPath = this._getDirectPath(in_fromProperty);
    if (directPath !== undefined) {
      return [directPath];
    } else {
      return [this._getIndirectPath(in_fromProperty)];
    }
  }
};

/**
 * Returns the path from the given fron_property to this node if such a path exists.
 * If more than one paths exist (as might be the case with multiple repository references
 * pointing to the same repository), it will return the first valid path found.
 * For example, if you have this structure:
 * <code>prop1
 * --prop2
 * ----prop3</code>
 * and call: <code>prop1.getRelativePath(prop3);</code>
 * You will get the path from prop3 to prop1, which would be '../../'
 * @param {property-properties.BaseProperty} in_fromProperty - The property from which the
 *     path is computed
 * @return {string} The path between the given in_fromProperty and this property
 * @throws if in_fromProperty is not a property
 */
BaseProperty.prototype.getRelativePath = function( in_fromProperty ) {
  ConsoleUtils.assert(in_fromProperty instanceof BaseProperty, MSG.IN_FROMPROPERTY_MUST_BE_PROPERTY);
  var paths = this._getAllRelativePaths(in_fromProperty) || [];
  if (paths.length === 0) {
    console.warn(MSG.NO_PATH_BETWEEN +
      in_fromProperty.getAbsolutePath() +
      ' and ' +
      this.getAbsolutePath());
  } else if (paths.length > 1) {
    console.warn(MSG.MORE_THAN_ONE_PATH + in_fromProperty.getAbsolutePath() +
      ' and ' + this.getAbsolutePath());
  }
  return paths[0];
};

/**
 * Returns the path from the root of the workspace to this node
 * (including a slash at the beginning)
 *
 * @return {string} The path from the root
 */
BaseProperty.prototype.getAbsolutePath = function() {
  var that = this;
  var referenceProps = [];
  // get all reference properties pointing to the root the repository containing 'this'
  if (this._getCheckoutView()) {
    this._getCheckoutView()._forEachCheckedOutRepository(function(repoInfo) {
      var keys = _.keys(repoInfo._referencedByPropertyInstanceGUIDs);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i]) {
          let repoRef = repoInfo._referencedByPropertyInstanceGUIDs[keys[i]];
          let refProperty = undefined;

          if (repoRef) {
            refProperty = repoRef._repositoryReferenceProperties[keys[i]] ?
              repoRef._repositoryReferenceProperties[keys[i]].property : undefined;
          }

          let refRoot;
          try {
            refRoot = refProperty ? refProperty.getReferencedRepositoryRoot() : undefined;
          } catch (e) {
            console.warn(e.message);
          }

          if (that.getRoot() === refRoot) {
            referenceProps.push(refProperty);
            break;
          }
        }
      }
    });
  }

  var path = this.isRoot() ? [] : [this.getParent()._getPathSegmentForChildNode(this)];
  this.traverseUp( function( in_node ) {
    if (in_node.getParent()) {
      path.push(in_node.getParent()._getPathSegmentForChildNode(in_node));
    } else if (referenceProps.length > 0) {
      // recursively call getAbsolutePath, removing the '/' at the beginning of the path
      path.push(referenceProps[0].getAbsolutePath(referenceProps[0].getRoot()).slice(1));
    }
  });
  var absolutePath = path.reverse().join('');

  // We don't use the property path separator at the start of the path
  if (absolutePath[0] === PROPERTY_PATH_DELIMITER) {
    absolutePath = absolutePath.substr(1);
  }
  absolutePath = '/' + absolutePath;

  return absolutePath;
};

/**
 * Traverses the property hierarchy upwards until the a node without parent is reached
 *
 * @param {Function} in_callback - Callback to invoke for each of the parents. The traversal can be stopped
 *                                 by returning BaseProperty.BREAK_TRAVERSAL
 * @throws if in_callback is not a function.
 * @return {string|undefined} Returns BaseProperty.BREAK_TRAVERSAL, if the traversal didn't reach the root,
 *                            otherwise undefined
 */
BaseProperty.prototype.traverseUp = function( in_callback ) {
  ConsoleUtils.assert(_.isFunction(in_callback), MSG.CALLBACK_NOT_FCT);
  if (this._parent) {
    var result = in_callback( this._parent );
    if ( result !== BREAK_TRAVERSAL) {
      return this._parent.traverseUp( in_callback );
    } else {
      return BREAK_TRAVERSAL;
    }
  }

  return undefined;
};

/**
 * @type {string} Constant to stop the traversal in traverseUp and traverseDown functions
 */
BaseProperty.BREAK_TRAVERSAL = BREAK_TRAVERSAL;

/**
 * Returns all children which are dirty (this only returns direct children, it does not travers recursively)
 *
 * @param {property-properties.BaseProperty.MODIFIED_STATE_FLAGS} in_flags - Which types of dirtiness are we looking for?
 *                                                                     If none is given, all types are regarded as
 *                                                                     dirty
 * @return {Array.<String>} The list of keys identifying the dirty children
 * @private
 */
BaseProperty.prototype._getDirtyChildren = function(in_flags) {
  return [];
};

/**
 * Returns the root of the property hierarchy
 * @return {property-properties.NodeProperty} The root property
 */
BaseProperty.prototype.getRoot = function() {
  var root;
  if (!this._parent) {
    root = this;
  } else {
    root = this._parent.getRoot();
  }
  return root;
};

/**
 * Traverses all children in the child hierarchy
 * TODO: How should this behave for collections?
 *
 * @param {function} in_callback             - Callback to invoke for every child
 * @param {string} in_pathFromTraversalStart - Path from the root of the traversal to this node
 * @return {string|undefined} Returns BaseProperty.BREAK_TRAVERSAL if the traversal has been interrupted,
 *                            otherwise undefined
 * @private
 */
BaseProperty.prototype._traverse = function( in_callback, in_pathFromTraversalStart ) {
  return undefined;
};

/**
 * Deserialize takes a currently existing property and sets it to the hierarchy described in the normalized
 * ChangeSet passed as parameter. It will return a ChangeSet that describes the difference between the
 * current state of the property and the passed in normalized property
 *
 * @param {property-properties.SerializedChangeSet} in_serializedObj - The serialized changeset to apply to this node. This
 *     has to be a normalized change-set (only containing insertions and property assignments. Deletes and Modify
 *     must not appear)
 * @param {property-properties.BaseProperty.PathFilteringOptions} [in_filteringOptions]
 *    The filtering options to consider while deserializing the property.
 * @throws if called on a read-only property.
 * @return {property-properties.SerializedChangeSet} ChangeSet with the changes that actually were performed during the
 *     deserialization
 */
BaseProperty.prototype.deserialize = function( in_serializedObj, in_filteringOptions ) {
  this._checkIsNotReadOnly(false);
  return this._deserialize(in_serializedObj, true, in_filteringOptions);
};

/**
 * Sets the property to the state in the given normalized changeset
 *
 * @param {property-properties.SerializedChangeSet} in_serializedObj - The serialized changeset to apply. This
 *     has to be a normalized change-set (only containing inserts. Removes and Modifies are forbidden).
 * @param {boolean} in_reportToView - Usually the dirtying should be reported to the checkout view
 *     and trigger a modified event there. When batching updates, this can be prevented via this flag.
 * @param {property-properties.BaseProperty.PathFilteringOptions} [in_filteringOptions]
 *    The filtering options to consider while deserializing the property.
 * @return {property-properties.SerializedChangeSet} ChangeSet with the changes that actually were performed during the
 *     deserialization
 */
BaseProperty.prototype._deserialize = function(in_serializedObj, in_reportToView, in_filteringOptions) {
  return {};
};

/**
 * Serialize the property into a changeSet
 *
 * @param {boolean} in_dirtyOnly -
 *     Only include dirty entries in the serialization
 * @param {boolean} in_includeRootTypeid -
 *     Include the typeid of the root of the hierarchy
 * @param {property-properties.BaseProperty.MODIFIED_STATE_FLAGS} [in_dirtinessType] -
 *     The type of dirtiness to use when reporting dirty changes. By default this is
 *     PENDING_CHANGE
 * @param {boolean} [in_includeReferencedRepositories=false] - If this is set to true, the serialize
 *     function will descend into referenced repositories. WARNING: if there are loops in the references
 *     this can result in an infinite loop
 *
 * @return {Object} The serialized representation of this property
 * @private
 */
BaseProperty.prototype._serialize = function( in_dirtyOnly,
                                              in_includeRootTypeid,
                                              in_dirtinessType,
                                              in_includeReferencedRepositories ) {
  return {};
};

/**
 * Serialize the property
 *
 * @param {Object} in_options -
 *     Options for the serialization
 * @param {boolean} [in_options.dirtyOnly=false] -
 *     Only include dirty entries in the serialization
 * @param {boolean} [in_options.includeRootTypeid=false] -
 *     Include the typeid of the root of the hierarchy
 * @param {property-properties.BaseProperty.MODIFIED_STATE_FLAGS} [in_options.dirtinessType=PENDING_CHANGE] -
 *     The type of dirtiness to use when reporting dirty changes.
 * @param {boolean} [in_options.includeReferencedRepositories=false] - If this is set to true, the serialize
 *     function will descend into referenced repositories. WARNING: if there are loops in the references
 *     this can result in an infinite loop
 * @throws if in_options is defined but is not an object.
 * @return {Object} The serialized representation of this property
 */
BaseProperty.prototype.serialize = function( in_options ) {
  var opts = {
    'dirtyOnly': false,
    'includeRootTypeid': false,
    'dirtinessType': MODIFIED_STATE_FLAGS.PENDING_CHANGE,
    'includeReferencedRepositories': false
  };
  if (in_options !== undefined) {
    if (typeof in_options !== 'object') {
      throw new Error(MSG.SERIALIZE_TAKES_OBJECT);
    }
    Object.assign(opts, in_options);
  }

  return this._serialize( opts.dirtyOnly, opts.includeRootTypeid,
    opts.dirtinessType, opts.includeReferencedRepositories );
};

/**
 * Indicate that all static members have been added to the property
 *
 * This function is invoked by the PropertyFactory once all static members have been added to the template
 * @protected
 */
BaseProperty.prototype._signalAllStaticMembersHaveBeenAdded = function() {
};

/**
 * Tests whether this property may be modified
 * @param {checkConstant} in_checkConstant - Check if is readonly constant property
 */
BaseProperty.prototype._checkIsNotReadOnly = function(in_checkConstant) {
  if (this._isConstant && in_checkConstant) {
    throw new Error(MSG.MODIFICATION_OF_CONSTANT_PROPERTY);
  }

  var root = this.getRoot();
  if (root && root._getCheckedOutRepositoryInfo) {
    var repositoryInfo = root._getCheckedOutRepositoryInfo();

    if (repositoryInfo && repositoryInfo._isReadOnly()) {
      throw new Error(MSG.MODIFICATION_OF_REFERENCED_PROPERTY);
    }
  }
};

/**
 * Set a property and its children as constants (readonly properties)
 */
BaseProperty.prototype._setAsConstant = function() {
  this._isConstant = true;

  if (this instanceof Property.ContainerProperty) {
  // Set all children properties as constants
    this.traverseDown(function(prop) {
      prop._isConstant = true;
    });
  }
};

/**
 * Unsets a property and its children as constants
 */
BaseProperty.prototype._unsetAsConstant = function() {
  // Deleting this property will make the object
  // fall back to the entry in the prototype (false)
  delete this._isConstant;

  if (this instanceof Property.ContainerProperty) {
    // Unset all children properties as constants
    this.traverseDown(function(prop) {
      // Deleting this property will make the object
      // fall back to the entry in the prototype (false)
      delete prop._isConstant;
    });
  }
};

/**
 * Dirties this node and all of its children
 *
 * @param {boolean} [in_reportToView = true] - By default, the dirtying will always be reported to the checkout view
 *                                             and trigger a modified event there. When batching updates, this
 *                                             can be prevented via this flag.
 * @private
 */
BaseProperty.prototype._setDirtyTree = function(in_reportToView) {
  this._traverse(function(node) {
    // Set all nodes to dirty, but prevent recursive updates up to the repository for the individual changes
    node._setDirty(false);
  }, '');
  // Now make one report
  if (in_reportToView) {
    this._reportDirtinessToView();
  }
};

/**
 * Determines whether a property can be inserted as a child of another property
 * This does NOT validate if the parent can accept the child property, it only validates if
 * the child property can be inserted in the parent.
 * @param {property-properties.BaseProperty} in_targetParent - The parent property
 * @param {string} in_childId - The id of the child property
 * @throws if the property can not be inserted
 * @private
 */
BaseProperty.prototype._validateInsertIn = function(in_targetParent, in_childId) {
  // Already a child?
  if (this._parent !== undefined) {
    throw new Error(MSG.INSERTED_ENTRY_WITH_PARENT);
  }
  // A root?
  if (this._getCheckedOutRepositoryInfo() !== undefined) {
    throw new Error(MSG.INSERTED_ROOT_ENTRY);
  }
  // Would create a cycle?
  let parent = in_targetParent;
  while (parent !== undefined) {
    if (parent === this) {
      throw new Error(MSG.INSERTED_IN_OWN_CHILDREN);
    }
    parent = parent._parent;
  }
  // Outside the checked out paths?
  const repositoryInfo = in_targetParent._getCheckedOutRepositoryInfo();
  if (repositoryInfo && !repositoryInfo._allCoveredByCheckout(in_targetParent.getAbsolutePath(), in_childId, this)) {
    throw new Error(MSG.INSERTED_OUTSIDE_PATHS);
  }
};


/**
 * Validates if the property and all its children are covered by the given list of paths.
 *
 * This function is expected to be used before inserting the property into its parent. That is the
 * reason for asking for the base path. This is the full path expected for this property.
 *
 * This function uses the canonical representation of the property paths.
 *
 * @param {string} in_basePath - The property's absolute path in canonical form
 * @param {Array<string>} in_paths - The array of paths that we wonder if it covers the property and its children
 * @return {Bool} If the property and all its children are included in the paths
 * @private
 */
BaseProperty.prototype._coveredByPaths = function(in_basePath, in_paths) {
  // First, get the coverage of the base property
  const coverage = PathHelper.getPathCoverage(in_basePath, in_paths);

  if (coverage.coverageExtent === PathHelper.CoverageExtent.FULLY_COVERED) {
    return true;
  } else if (coverage.coverageExtent === PathHelper.CoverageExtent.PARTLY_COVERED) {
    // We know that part of the property is covered, if we don't find any actual children not covered
    // by the paths it's because we're fully covered.
    let childrenIds, childPath, child;
    if (this.isPrimitiveType()) {
      // primitive
      if (this.getContext() === 'single') {
        // no children
        childrenIds = [];
      } else {
        childrenIds = this.getIds();
      }
      for (let i = 0; i < childrenIds.length; i++) {
        child = this.get(childrenIds[i]);
        childPath = PathHelper.getChildAbsolutePathCanonical(in_basePath, childrenIds[i]);
        if (PathHelper.getPathCoverage(childPath, coverage.pathList) === PathHelper.CoverageExtent.UNCOVERED) {
          // this children is outside the list of paths
          return false;
        }
      }
    } else {
      childrenIds = this.getIds();
      for (let i = 0; i < childrenIds.length; i++) {
        child = this.get(childrenIds[i]);
        childPath = PathHelper.getChildAbsolutePathCanonical(in_basePath, childrenIds[i]);
        if (!child._coveredByPaths(childPath, coverage.pathList)) {
          return false;
        }
      }
    }
    return true;
  }

  return false;
};

/**
 * Check if a property has a fixed id during insert
 * @private
 * @return {boolean} has fixed id
 */
BaseProperty.prototype._hasFixedId = function() {
  return false;
};

Object.defineProperty(
  BaseProperty.prototype,
  '_properties',
  {
    get: function() {
      return this._flatten();
    }
  }
);

module.exports = BaseProperty;
