/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Definition of the reference map property class
 */
const StringMapProperty = require('./value_map_property').StringMapProperty;
const TypeIdHelper = require('@fluid-experimental/property-changeset').TypeIdHelper;
const PathHelper = require('@fluid-experimental/property-changeset').PathHelper;
const BaseProperty = require('./base_property');
const MSG = require('@fluid-experimental/property-common').constants.MSG;
const _ = require('lodash');
const ContainerProperty = require('./container_property');
const ReferenceProperty = require('./reference_property');


/**
 * A StringMapProperty which stores reference values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.StringMapProperty
 * @alias property-properties.ReferenceMapProperty
 * @category Maps
 */
var ReferenceMapProperty = function( in_params) {
  StringMapProperty.call( this, in_params );
};
ReferenceMapProperty.prototype = Object.create( StringMapProperty.prototype );

ReferenceMapProperty.prototype._typeid = 'Reference';

/**
 * Returns the typeid for the target of this reference
 *
 * Note: This is the type that is specified in the typeid of this reference and not the actual type
 * of the referenced object, which might inherit from that typeid.
 *
 * @return {string} The typeid of the nodes this reference may point to
 */
ReferenceMapProperty.prototype.getReferenceTargetTypeId = function() {
  return TypeIdHelper.extractReferenceTargetTypeIdFromReference(this.getTypeid());
};

/**
 * Resolves the referenced property for the given key
 *
 * @param  {string|array<string|number>} in_ids the ID of the property or an array of IDs
 *     if an array is passed, the .get function will be performed on each id in sequence
 *     for example .get(['position','x']) is equivalent to .get('position').get('x').
 *     If .get resolves to a ReferenceProperty, it will return the property that the ReferenceProperty
 *     refers to.
 * @param {Object} in_options - parameter object
 * @param {property-properties.BaseProperty.REFERENCE_RESOLUTION} [in_options.referenceResolutionMode=ALWAYS]
 *     How should this function behave during reference resolution?
 *
 * @return {property-properties.BaseProperty|undefined} The property object the reference points to or undefined if it
 *    could not be resolved
 */
ReferenceMapProperty.prototype.get = function(in_ids, in_options) {
  in_options = in_options || {};
  in_options.referenceResolutionMode =
      in_options.referenceResolutionMode === undefined ? BaseProperty.REFERENCE_RESOLUTION.ALWAYS :
                                                         in_options.referenceResolutionMode;

  if (_.isArray(in_ids)) {
    // Forward handling of arrays to the BaseProperty function
    return ContainerProperty.prototype.get.call(this, in_ids, in_options);
  } else {

    var value = this._entries[in_ids];
    if (value === undefined ||
        value === '') {
      return undefined;
    }
    return this.getParent().resolvePath(value, in_options);
  }
};

/**
 * Removes the entry with the given key from the map
 *
 * @param {string} in_key - The key of the entry to remove from the map
 * @throws if trying to remove an entry that does not exist
 * @return {String} the item removed (a string path)
 */
ReferenceMapProperty.prototype.remove = function(in_key) {
  var item = this.getValue(in_key);
  this._removeByKey(in_key, true);
  return item;
};

/**
 * Returns an object with all the nested path values
 * @return {object} an object representing the values of your property
 * for example: {
      'firstPath': '/path',
      'secondPath': '/path2'
    }
 */
ReferenceMapProperty.prototype.getValues = function() {
  var ids = this.getIds();
  var result = {};
  for (var i = 0; i < ids.length; i++) {
    result[ids[i]] = this.getValue(ids[i]);
  }
  return result;
};

/**
 * Sets or inserts the reference to point to the given property object or to be equal to the given path string.
 *
 * @param {string} in_key - The key under which the entry is stored
 * @param {property-properties.BaseProperty|undefined|String} in_value - The property to assign to the reference or
 *   the path to this property. If undefined is passed, the reference will be set to an empty string to
 *   indicate an empty reference.
 * @throws if in_key is not a string
 * @throws if in_value is defined, but is not a property or a string.
 * @throws if map is read only
 */
ReferenceMapProperty.prototype.set = function(in_key, in_value) {
  if (!_.isString(in_key)) {
    throw new Error(MSG.KEY_NOT_STRING + in_key);
  }
  var value = ReferenceProperty._convertInputToPath(in_value);
  StringMapProperty.prototype.set.call(this, in_key, value);
};

let setValueDeprecatedWarning = false;

/**
 * Sets or inserts the reference to point to the given property object or to be equal to the given path string.
 *
 * @param {string} in_key - The key under which the entry is stored
 * @param {property-properties.BaseProperty|undefined|String} in_value - The property to assign to the reference or
 *   the path to this property. If undefined is passed, the reference will be set to an empty string to
 *   indicate an empty reference.
 * @throws if in_key is not a string
 * @throws if in_value is defined, but is not a property or a string.
 * @deprecated
 */
ReferenceMapProperty.prototype.setValue = function(in_key, in_value) {
  if (!setValueDeprecatedWarning) {
    console.warn(MSG.DEPRECATED_FUNCTION, 'setValue');
    setValueDeprecatedWarning = true;
  }
  this.set(in_key, in_value);
};

/**
 * Inserts the reference to point to the given property object or to be equal to the given path string.
 *
 * @param {string} in_key - The key under which the entry is stored
 * @param {property-properties.BaseProperty|undefined|String} in_value - The property to assign to the reference or
 *   the path to this property. If undefined is passed, the reference will be set to an empty string to
 *   indicate an empty reference.
 * @throws if there is already an entry under in_key
 * @throws if in_value is defined, but is not a property or a string.
 */
ReferenceMapProperty.prototype.insert = function(in_key, in_value) {
  var value = ReferenceProperty._convertInputToPath(in_value);
  this._insert(in_key, value, true);
};

/**
 * Checks whether the reference is valid. This is either the case when it is empty or when the referenced
 * property exists.
 *
 * @param {string} in_key - key of the entry to check
 * @return {boolean} True if the reference is valid, otherwise false.
 */
ReferenceMapProperty.prototype.isReferenceValid = function(in_key) {
  return this.has(in_key) &&
         (this.getValue(in_key) === '' ||
         this.get(in_key) !== undefined);
};

/**
 * Returns the string value stored in the map
 * @param {string} in_key the key of the reference
 * @return {string} the path string
 */
ReferenceMapProperty.prototype.getValue = function(in_key) {
  return this._getValue(in_key);
};

/**
 * @inheritdoc
 */
ReferenceMapProperty.prototype._resolvePathSegment = function(in_segment, in_segmentType) {

  // Array tokens are automatically resolved
  if (in_segmentType === PathHelper.TOKEN_TYPES.ARRAY_TOKEN) {
    return this.get(in_segment, {referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER});
  } else {
    // Everything else is handled by the implementation in the base property
    return ContainerProperty.prototype._resolvePathSegment.call(this, in_segment, in_segmentType);
  }
};

module.exports = ReferenceMapProperty;
