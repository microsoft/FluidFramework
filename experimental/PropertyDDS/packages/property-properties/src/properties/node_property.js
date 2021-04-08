/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview This file contains the implementation of the NodeProperty class
 */
const _ = require('lodash');
const IndexedCollectionBaseProperty = require('./indexed_collection_base_property');
const PathHelper = require('@fluid-experimental/property-changeset').PathHelper;
const PROPERTY_PATH_DELIMITER = require('@fluid-experimental/property-common').constants.PROPERTY_PATH_DELIMITER;
const MSG = require('@fluid-experimental/property-common').constants.MSG;
const BaseProperty = require('./base_property');
const ConsoleUtils = require('@fluid-experimental/property-common').ConsoleUtils;
const ContainerProperty = require('./container_property');


// This cache is used to store the static keys of templated types to accelerate the traversal over static members
var _staticChildrenCache = {
  NodeProperty: [],
  NamedNodeProperty: ['guid']
};

/**
 * A property object that allows to add child properties dynamically.
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.IndexedCollectionBaseProperty
 * @alias property-properties.NodeProperty
 * @category Other Collections
 */
var NodeProperty = function( in_params ) {

  IndexedCollectionBaseProperty.call( this, in_params );

  // There can be a this._checkedOutRepositoryInfo in this object, but we don't initialize it in the constructor
  // since most node properties won't need that member and this should reduce memory consumption

  this._staticChildrenCache = undefined;

  // An indexed collection shares the same array for children and entries
  if (this._typeid === 'NodeProperty') {
    this._entries = this._children;
  } else {
    this._entries = {};
  }
};

NodeProperty.prototype = Object.create(IndexedCollectionBaseProperty.prototype);

NodeProperty.prototype._typeid = 'NodeProperty';

/**
 * @return {boolean} True if this a dynamic property (only properties inheriting from NodeProperty are)
 */
NodeProperty.prototype.isDynamic = function() { return true; };

/**
 * Appends a property
 *
 * @param {String} [in_id]                         - The id under which the property is added. This parameter is
 *                                                   optional. For NamedProperties it can be omitted. In that case
 *                                                   the GUID of the named property will be used.
 *
 * @param {property-properties.BaseProperty} in_property - The property to add
 * @throws if in_id is not a string or a number
 * @throws if there is already an entry for in_id
 * @throws if in_property is not a property
 * @throws if in_property does not have an id
 * @throws if in_property has a parent
 */
NodeProperty.prototype.insert = function(in_id, in_property) {
  if (in_property === undefined) {
    // If no id is passed, the property is passed as first parameter
    in_property = in_id;
    ConsoleUtils.assert(in_property instanceof BaseProperty, 'insert error: ' + MSG.NOT_A_PROPERTY);
  } else {
    ConsoleUtils.assert(in_property instanceof BaseProperty, 'insert error: ' + MSG.NOT_A_PROPERTY);
    ConsoleUtils.assert(!in_property._hasFixedId(),
      'insert error: ' + MSG.CUSTOM_ID_NOT_ALLOWED + in_property._typeid);
    ConsoleUtils.assert(_.isString(in_id) || _.isNumber(in_id), MSG.ID_STRING_OR_NUMBER);
    ConsoleUtils.assert(!_.isString(in_id) || !_.isEmpty(in_id), MSG.ID_SHOULD_NOT_BE_EMPTY_STRING);
    if (this._entries[in_id] !== undefined) {
      throw new Error( MSG.PROPERTY_ALREADY_EXISTS + in_id);
    }
    in_property._validateInsertIn(this, in_id);

    // If an id is passed, it is stored in the child property object
    in_property._setId(in_id);
  }

  if (in_property.getId() === undefined ||
      in_property.getId() === null) {
    throw new Error(MSG.ADDED_CHILD_WITHOUT_ID);
  }

  // Add the child property to the dynamic properties
  this._insert(in_property.getId(), in_property, true);
};

/**
 * @override
 * @inheritdoc
 */
NodeProperty.prototype._getScope = function() {
  if (this._parent) {
    return this.getRoot()._getScope();
  } else {
    if (this._checkedOutRepositoryInfo) {
      return this._checkedOutRepositoryInfo.getScope();
    } else {
      return undefined;
    }
  }
};

/**
 * Removes the given property
 *
 * @param {string|property-properties.BaseProperty} in_property - The property to remove
 *                                                          (either its id or the whole property).
 * @throws if trying to remove an entry that does not exist
 * @return {property-properties.BaseProperty} the property removed.
 */
NodeProperty.prototype.remove = function(in_property) {
  var id = in_property;
  var returnValue;
  if (id instanceof BaseProperty) {
    returnValue = id;
    id = id.getId();
  } else {
    returnValue = this.get(id);
  }
  this._removeByKey(id);
  return returnValue;
};

/**
 * Removes all dynamic children
 * @throws if node property is read-only
 */
NodeProperty.prototype.clear = function() {
  this._checkIsNotReadOnly(true);
  _.each(this._entries, this.remove.bind(this));
};

/**
 * Inserts a property into the collection
 *
 * @param {string}                      in_key      -
 *     Key of the entry in the collection
 * @param {property-properties.NamedProperty} in_property -
 *     The property to insert
 * @param {boolean}                     in_reportToView -
 *     By default, the dirtying will always be reported to the checkout view and trigger a modified event there.
 *     When batching updates, this can be prevented via this flag.
 */
NodeProperty.prototype._insert = function(in_key, in_property, in_reportToView) {
  this._checkIsNotReadOnly(true);

  // Add the child property to the dynamic properties
  IndexedCollectionBaseProperty.prototype._insert.call(this, in_key, in_property, false);

  if (this._typeid !== 'NodeProperty') {
    // If this is not a NodeProperty (where children and entries are the same), we insert
    // it into the children
    this._append(in_property, false);
  }

  // We postponed the report above, to make sure the child property has actually been appended to this
  // node, before the report is forwarded to the view
  if (in_reportToView) {
    this._reportDirtinessToView();
  }
};

/**
 * Removes an entry with the given key
 *
 * @param {string} in_key - key of the entry
 * @param {boolean} in_reportToView -
 *     By default, the dirtying will always be reported to the checkout view and trigger a modified event there.
 *     When batching updates, this can be prevented via this flag.
 */
NodeProperty.prototype._removeByKey = function(in_key, in_reportToView) {
  this._checkIsNotReadOnly(true);

  if (this._children[in_key]) {
    if (this._typeid !== 'NodeProperty') {
      // If this is not a NodeProperty (where children and entries are the same), we remove
      // it from the children
      this._remove(in_key);
    }

    // Remove from the indexed collection
    IndexedCollectionBaseProperty.prototype._removeByKey.call(this, in_key, in_reportToView);
  } else {
    console.error(MSG.REMOVING_NON_EXISTING_KEY + in_key );
  }
};

/**
 * Traverses all static properties (properties declared in the template and not added dynamically) in the
 * hierarchy below this node
 *
 * @param {function} in_callback               - Callback to invoke for every property
 * @param {string?}  in_pathFromTraversalStart - Path from the root of the traversal to this node
 * @protected
 */
NodeProperty.prototype._traverseStaticProperties = function(in_callback, in_pathFromTraversalStart ) {
  in_pathFromTraversalStart = in_pathFromTraversalStart || '';

  var propertyKeys = this._staticChildrenCache;
  for ( var i = 0; i < propertyKeys.length; i++) {
    var property = this._children[propertyKeys[i]];
    var childPath = in_pathFromTraversalStart +
                    (in_pathFromTraversalStart.length !== 0 ? PROPERTY_PATH_DELIMITER : '') +
                    PathHelper.quotePathSegmentIfNeeded(property.getId());

    // We only process this property, if it is not part of the entries list
    if (!this._entries[property.getId()]) {
      // We only recursively traverse ContainerProperties, since these are used to define the hierarchy within
      // one template
      if (property.getTypeid() === 'ContainerProperty' && property.getContext() === 'single') {
        property._traverseStaticProperties( in_callback, childPath);
      }
      in_callback( property, childPath);
    }
  }
};

/**
 * Stores the information to which CheckedOutRepositoryInfo object this root property belongs.
 * Note: these functions should only be used internally (within the PropertySets library)
 *
 * @param {property-properties.CheckoutView~CheckedOutRepositoryInfo} in_checkedOutRepositoryInfo -
 * The checked out repository info this root property belongs to.
 * @protected
 */
NodeProperty.prototype._setCheckedOutRepositoryInfo = function(in_checkedOutRepositoryInfo) {
  this._checkedOutRepositoryInfo = in_checkedOutRepositoryInfo;
};

/**
 * Stores the information to which CheckedOutRepositoryInfo object this root property belongs.
 * Note: these functions should only be used internally (within the PropertySets library)
 *
 * @return {property-properties.CheckoutView~CheckedOutRepositoryInfo|undefined} If this is the root of the checked out
 *     hierarchy, this will return the checkout
 * @protected
 */
NodeProperty.prototype._getCheckedOutRepositoryInfo = function() {
  if (!this._parent) {
    return this._checkedOutRepositoryInfo;
  } else {
    return this.getRoot() ? this.getRoot()._getCheckedOutRepositoryInfo() : undefined;
  }
};

/**
 * Returns the name of all the static sub-properties of this property.
 *
 * @return {Array.<string>} An array of all the static property ids
 */
NodeProperty.prototype.getStaticIds = function() {
  /* TODO: For an unknown (maybe good) reason, the dynamic '_entries' are also
     inserted in the '_children' static. */
  var all = Object.keys( this._children );
  var dynamic = Object.keys( this._entries );
  for ( var i = 0; i < dynamic.length; i++ ) {
    all.splice(all.indexOf(dynamic[i]), 1);
  }
  return all;
};

/**
 * Returns the name of all the dynamic sub-properties of this property.
 *
 * @return {Array.<string>} An array of all the dynamic property ids
 */
NodeProperty.prototype.getDynamicIds = function() {
  return Object.keys( this._entries );
};

 /**
 * Returns an Object with all the dynamic children of this node property.
 *
 * WARNING: This is a direct access to the internal data-structure and the collection MUST NOT be modified. It is
 * read only for fast access and iteration. Insertion and deletion MUST be done via the insert and remove functions
 * of this class.
 *
 * @return {Object<String, property-properties.MapProperty~MapValueType>} The map with all entries in the map.
 */
NodeProperty.prototype._getDynamicChildrenReadOnly = function() {
  return this._entries;
};

/**
 * Given an object that mirrors a PSet Template, assign the properties
 * @see {setValues}
 * @param {object} in_properties The properties you would like to assign
 * @param {Bool} in_initial  - Whether we are setting default/initial values
 *   or if the function is called directly with the values to set.
 * @private
 */
NodeProperty.prototype._setValues = function(in_properties, in_initial) {
  // We currently forward this to the base property, which should also work for a node property
  // It is currently not possible to insert new dynamic properties via this interface
  ContainerProperty.prototype.setValues.call(this, in_properties);
};

/**
 * Given an object that mirrors a PSet Template, assign the properties
 * eg.
 * <pre>
 * Templates = {
 *   properties: [
 *     { id: 'foo', typeid: 'String' },
 *     { id: 'bar', properties: [{id: 'baz', typeid: 'Uint32'}] }
 *   ]
 * }
 * </pre>
 * You would update the values like
 * `baseProperty.setValues({foo: 'hello', bar: {baz: 1}});`
 * WARNING: not completely impemented for all types
 * @param {object} in_properties The properties you would like to assign
 * @private
 */
NodeProperty.prototype.setValues = function(in_properties) {
  NodeProperty.prototype._setValues.call(this, in_properties, false);
};

/**
 * Returns all children which are dirty (this only returns direct children, it does not travers recursively)
 *
 * @param {property-properties.BaseProperty.MODIFIED_STATE_FLAGS} in_flags - Which types of dirtiness are we looking for?
 *                                                                     If none is given, all types are regarded as
 *                                                                     dirty
 * @return {Array.<String>} The list of keys identifying the dirty children
 * @private
 */
NodeProperty.prototype._getDirtyChildren = function(in_flags) {
  var flags = in_flags === undefined ? ~BaseProperty.MODIFIED_STATE_FLAGS.CLEAN : in_flags;
  var rtn = [];
  var childKeys = this._staticChildrenCache;
  for (var i = 0; i < childKeys.length; i++) {
    if ((this._children[childKeys[i]]._isDirty(flags)) !== 0 ) {
      rtn.push(childKeys[i]);
    }
  }

  return rtn;
};

/**
 * @inheritdoc
 */
NodeProperty.prototype._signalAllStaticMembersHaveBeenAdded = function(in_scope) {
  // Since the BaseProperty implementation does nothing, we'll not call it.
  // BaseProperty.prototype._signalAllStaticMembersHaveBeenAdded.call(this);

  // Create a unique key per scope
  var lookupKey = (in_scope ? in_scope + ':' : '') + this.getTypeid();

  // Store the keys of the static children in the cache (if needed)
  if (!_staticChildrenCache[lookupKey]) {
    var children = _.keys(this._children);
    _staticChildrenCache[lookupKey] = children;
  }

  this._staticChildrenCache = _staticChildrenCache[lookupKey];
};

/**
 * Cleans the cache of static children per typeid. Calling this should only be necessary if a template has been
 * reregistered.
 *
 * @protected
 */
NodeProperty._cleanStaticChildrenCache = function() {
  _staticChildrenCache = {};
};
module.exports = NodeProperty;
