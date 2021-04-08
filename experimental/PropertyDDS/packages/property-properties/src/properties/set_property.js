/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Definition of the set property class
 */
const BaseProperty = require('./base_property');
const ContainerProperty = require('./container_property');
const NamedProperty = require('./named_property');
const NamedNodeProperty = require('./named_node_property');
const IndexedCollectionBaseProperty = require('./indexed_collection_base_property');
const TypeIdHelper = require('@fluid-experimental/property-changeset').TypeIdHelper;
const _ = require('lodash');
const PathHelper = require('@fluid-experimental/property-changeset').PathHelper;
const MSG = require('@fluid-experimental/property-common').constants.MSG;
const Property = require('./lazy_loaded_properties');

var PATH_TOKENS = BaseProperty.PATH_TOKENS;
/**
 * A SetProperty is a collection class that can contain an unordered set of properties. These properties
 * must derive from NamedProperty and their URN is used to identify them within the set.
 *
 * @param {Object} in_params - Input parameters for property creation
 * @param {string|undefined} in_scope - The scope in which the map typeid is defined
 *
 * @constructor
 * @protected
 * @extends property-properties.IndexedCollectionBaseProperty
 * @alias property-properties.SetProperty
 * @category Other Collections
 */
var SetProperty = function( in_params, in_scope ) {
  IndexedCollectionBaseProperty.call( this, in_params );

  this._scope = in_scope;

  /** Contains the actual entries of the set, indexed by their GUID */
  this._entries = {};
};

SetProperty.prototype = Object.create(IndexedCollectionBaseProperty.prototype);

SetProperty.prototype._context = 'set';
// A set property falls back to NamedProperty, if none is specified
SetProperty.prototype._typeid = 'NamedProperty';

/**
 * Is this property a leaf node with regard to flattening?
 *
 * TODO: Which semantics should flattening have? It stops at primitive types and collections?
 *
 * @return {boolean} Is it a leaf with regard to flattening?
 */
SetProperty.prototype._isFlattenLeaf = function() {
  return true;
};

  /**
 * Returns an object with all the nested values contained in this property
 * @return {object} an object representing the values of your property
 * for example: {
 *   position: {
 *    x: 2,
 *    y: 5
 *   }
 * }
 */
SetProperty.prototype.getValues = function() {
  var ids = this.getIds();
  var result = {};
  for (var i = 0; i < ids.length; i++) {
    var child = this.get(ids[i]);
    if (child instanceof Property.ValueProperty || child instanceof Property.StringProperty) {
      result[ids[i]] = this.get(ids[i]).getValue();
    } else {
      result[ids[i]] = child.getValues();
    }
  }
  return result;
};

/**
 * Returns the full property type identifier for the ChangeSet including the enum type id
 * @param  {boolean} [in_hideCollection=false] - if true the collection type (if applicable) will be omitted
 * @return {string} The typeid
 */
SetProperty.prototype.getFullTypeid = function(in_hideCollection) {
  if (in_hideCollection) {
    return this._typeid;
  } else {
    return TypeIdHelper.createSerializationTypeId(this._typeid, 'set');
  }
};

/**
 * Returns the path segment for a child
 *
 * @param {property-properties.NamedProperty} in_childNode - The child for which the path is returned
 *
 * @return {string} The path segment to resolve the child property under this property
 * @protected
 */
SetProperty.prototype._getPathSegmentForChildNode = function(in_childNode) {
  return '[' + in_childNode.getGuid() + ']';
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
SetProperty.prototype._resolvePathSegment = function(in_segment, in_segmentType) {
  // Base Properties only support paths separated via dots
  if (in_segmentType === PathHelper.TOKEN_TYPES.ARRAY_TOKEN) {
    return this._entries[in_segment];
  } else {
    return ContainerProperty.prototype._resolvePathSegment.call(this, in_segment, in_segmentType);
  }
};

/**
 * Inserts a property into the set
 *
 * @param {property-properties.NamedProperty} in_property - The property to insert
 * @throws if trying to insert non-named properties
 * @throws if trying to insert a property that has a parent
 * @throws if a property already exists with the same guid as in_property
 */
SetProperty.prototype.insert = function(in_property) {
  if (in_property instanceof NamedProperty ||
      in_property instanceof NamedNodeProperty) {
    var guid = in_property.getGuid();
    this._insert(guid, in_property, true);
  } else {
    throw new Error( MSG.CANT_INSERT_NON_NAMED_PROPERTIES );
  }
};

/**
 * Adds a property to the set
 * - If the property's key exists, the entry is replaced with new one.
 * - If the property's key does not exist, the property is appended.*
 *
 * @param {NamedProperty|NamedNodeProperty|Object} in_property - The property to add to the list
 */
SetProperty.prototype.set = function(in_property) {
  this._checkIsNotReadOnly(true);

  if (in_property instanceof NamedProperty || in_property instanceof NamedNodeProperty) {
    var guid = in_property.getGuid();
    if (this.has(guid)) {
      this.remove(guid);
    }

    this.insert(in_property);
  } else {
    throw new Error(MSG.CANT_INSERT_NON_NAMED_PROPERTIES);
  }
};

/**
 * Removes the given property from the set
 *
 * @param {property-properties.NamedProperty|string} in_entry - The property or its URN to remove from the set
 * @return {property-properties.NamedProperty} the property that was removed.
 * @throws if trying to remove an entry that does not exist
 */
SetProperty.prototype.remove = function(in_entry) {
  if (_.isString(in_entry)) {
    var item = this.get(in_entry);
    this._removeByKey(in_entry, true);
    return item;
  } else {
    this._removeByKey(in_entry.getGuid(), true);
    return in_entry;
  }
};

/**
 * Returns an Object with all the entries of the set.
 *
 * WARNING: This is a direct access to the internal data-structure and the collection MUST NOT be modified.
 * It is read only for fast access and iteration. Insertion and deletion MUST be done via the insert and
 * remove functions of this class.
 *
 * @return {Object<String, property-properties.NamedProperty>} The map with all entries in the set.
 */
SetProperty.prototype.getEntriesReadOnly = function() {
  return this._entries;
};

/**
 * Returns the name of all the sub-properties of this property.
 *
 * @return {Array.<string>} An array of all the property ids
 */
SetProperty.prototype.getIds = function() {
  return Object.keys( this._entries );
};

/**
 * Returns the collection entry with the given ID
 *
 * @param {string|array<string|number>} in_ids - key of the entry to return or an array of keys
 *     if an array is passed, the .get function will be performed on each id in sequence
 *     for example .get(['position','x']) is equivalent to .get('position').get('x').
 *     If .get resolves to a ReferenceProperty, it will return the property that the ReferenceProperty
 *     refers to.
 * @param {Object} in_options - parameter object
 * @param {property-properties.BaseProperty.REFERENCE_RESOLUTION} [in_options.referenceResolutionMode=ALWAYS]
 *     How should this function behave during reference resolution?
 *
 * @return {property-properties.NamedProperty|undefined} The entry in the collection or undefined if none could be found
 */
SetProperty.prototype.get = function(in_ids, in_options) {
  if (_.isArray(in_ids)) {
    // Forward handling of arrays to the BaseProperty function
    return ContainerProperty.prototype.get.call(this, in_ids, in_options);
  } else {
    var prop = this;
    in_options = in_options || {};
    in_options.referenceResolutionMode =
        in_options.referenceResolutionMode === undefined ? BaseProperty.REFERENCE_RESOLUTION.ALWAYS :
                                                           in_options.referenceResolutionMode;
    if (in_ids === PATH_TOKENS.ROOT) {
      prop = prop.getRoot();
    } else if (in_ids === PATH_TOKENS.UP) {
      prop = prop.getParent();
    } else if (in_ids === PATH_TOKENS.REF) {
      throw new Error(MSG.NO_GET_DEREFERENCE_ONLY);
    } else {
      prop = prop._entries[in_ids];
    }

    return prop;
  }
};

/**
 * Checks whether a property with the given name exists
 *
 * @param {string} in_id - Name of the property
 * @return {boolean} True if the property exists, otherwise false.
 */
SetProperty.prototype.has = function(in_id) {
  return this._entries[in_id] !== undefined;
};

/**
 * Adds a list of properties to the set.
 * @see {setValues}
 * @param {NamedProperty[]|NamedNodeProperty[]|Object[]} in_properties - The list of properties to add to the list
 * @param {Boolean} in_typed - If the set's items have a typeid and a value then create the
 *   properties with that typeid, else use the set's typeid (support polymorphic items).
 * @private
 */
SetProperty.prototype._setValuesInternal = function(in_properties, in_typed) {
  this._checkIsNotReadOnly(true);

  var that = this;
  _.each(in_properties, function(property) {
    if (property instanceof BaseProperty) {
      that.set(property);
    } else {
      // If value is a JSON object (i.e: passed through a default value), create the property and add it to the set.
      if (in_typed) {
        that.set(Property.PropertyFactory._createProperty(
          property.typeid || that._typeid, null, property.value, that._getScope()));
      } else {
        that.set(Property.PropertyFactory._createProperty(
          that._typeid, null, property, that._getScope()));
      }
    }
  });
};

/**
 * Adds a list of properties to the set.
 * @see {setValues}
 * @param {NamedProperty[]|NamedNodeProperty[]|Object[]} in_properties - The list of properties to add to the list
 * @param {Boolean} in_typed - If the set's items have a typeid and a value then create the
 *   properties with that typeid, else use the set's typeid (support polymorphic items).
 * @param {Bool} in_initial  - Whether we are setting default/initial values
 *   or if the function is called directly with the values to set.
 * @override
 */
SetProperty.prototype._setValues = function(in_properties, in_typed, in_initial) {
  if (in_initial) {
    this.clear();
  }

  this._setValuesInternal(in_properties, in_typed);
};

/**
 * Adds a list of properties to the set.
 * - If the property's key exists, the entry is replaced with new one.
 * - If the property's key does not exist, the property is appended.
 * @param {NamedProperty[]|NamedNodeProperty[]|Object[]} in_properties - The list of properties to add to the list
 * @override
 */
SetProperty.prototype.setValues = function(in_properties) {
  var checkoutView = this._getCheckoutView();
  if (checkoutView !== undefined) {
    checkoutView.pushNotificationDelayScope();
    SetProperty.prototype._setValues.call(this, in_properties, false, false);
    checkoutView.popNotificationDelayScope();
  } else {
    SetProperty.prototype._setValues.call(this, in_properties, false, false);
  }
};

/**
 * Returns all entries of the set as an array.
 *
 * NOTE: This function creates a copy and thus is less efficient as getEntriesReadOnly.
 *
 * @return {Array.<property-properties.NamedProperty>} Array with all entries of the set. This array is a shallow copy
 * which can be modified by the caller without effects on the set.
 */
SetProperty.prototype.getAsArray = function() {
  return _.values(this._entries);
};

/**
 * Get the scope to which this property belongs to.
 * @return {string|undefined} The guid representing the scope in which the
 * set belongs to. If there is a workspace scope return it, else return the scope of this set.
 * @override
 * @private
 */
SetProperty.prototype._getScope = function() {
  var scope = IndexedCollectionBaseProperty.prototype._getScope.call(this);

  if (scope !== undefined) {
    return scope;
  } else {
    return this._scope;
  }
};

/**
 * Delete all values from Set
 */
SetProperty.prototype.clear = function() {
  var that = this;
  this.getIds().forEach(function(id) {
    that.remove(id);
  });
};

module.exports = SetProperty;
