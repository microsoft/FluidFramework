/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Definition of the reference array property class
 */
const ValueArrayProperty = require('./value_array_property').ValueArrayProperty;
const PathHelper = require('@fluid-experimental/property-changeset').PathHelper;
const BaseProperty = require('./base_property');
const TypeIdHelper = require('@fluid-experimental/property-changeset').TypeIdHelper;
const MSG = require('@fluid-experimental/property-common').constants.MSG;
const ConsoleUtils = require('@fluid-experimental/property-common').ConsoleUtils;
const DataArrays = require('@fluid-experimental/property-common').Datastructures.DataArrays;
const _ = require('lodash');
const ContainerProperty = require('./container_property');
const ReferenceProperty = require('./reference_property');


/**
 * An ArrayProperty which stores reference values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ArrayProperty
 * @alias property-properties.ReferenceArrayProperty
 * @category Arrays
 */
var ReferenceArrayProperty = function( in_params) {
  ValueArrayProperty.call( this, in_params );
};
ReferenceArrayProperty.prototype = Object.create( ValueArrayProperty.prototype );

ReferenceArrayProperty.prototype._typeid = 'Reference';

/**
 * Returns the typeid for the target of this reference
 *
 * Note: This is the type that is specified in the typeid of this reference and not the actual type
 * of the referenced object, which might inherit from that typeid.
 *
 * @return {string} The typeid of the nodes this reference may point to
 */
ReferenceArrayProperty.prototype.getReferenceTargetTypeId = function() {
  return TypeIdHelper.extractReferenceTargetTypeIdFromReference(this.getTypeid());
};

/**
 * Resolves the referenced property for the given key
 *
 * @param  {number|array<string|number>} in_ids the ID of the property or an array of IDs
 *     if an array is passed, the .get function will be performed on each id in sequence
 *     for example .get([0, 'position','x']) is equivalent to .get(0).get('position').get('x').
 *     If .get resolves to a ReferenceProperty, it will, by default, return the property that the ReferenceProperty
 *     refers to.
 * @param {Object} in_options - parameter object
 * @param {property-properties.BaseProperty.REFERENCE_RESOLUTION} [in_options.referenceResolutionMode=ALWAYS]
 *     How should this function behave during reference resolution?
 *
 * @return {property-properties.BaseProperty|undefined} The property object the reference points to or undefined if it
 *    could not be resolved
 */
ReferenceArrayProperty.prototype.get = function(in_ids, in_options) {
  in_options = in_options || {};
  in_options.referenceResolutionMode =
      in_options.referenceResolutionMode === undefined ? BaseProperty.REFERENCE_RESOLUTION.ALWAYS :
                                                         in_options.referenceResolutionMode;

  if (_.isArray(in_ids)) {
    // Forward handling of arrays to the ContainerProperty function
    return ContainerProperty.prototype.get.call(this, in_ids, in_options);
  } else {
    var value = this._dataArrayRef.getValue(in_ids);
    if (value === undefined ||
        value === '') {
      return undefined;
    }

    return this.getParent().resolvePath(value, in_options);
  }
};

/**
 * Checks whether the reference is valid. This is either the case when it is empty or when the referenced
 * property exists.
 *
 * @param {number} in_position the target index
 * @return {boolean} True if the reference is valid, otherwise false.
 */
ReferenceArrayProperty.prototype.isReferenceValid = function(in_position) {
  return ValueArrayProperty.prototype.get.call(this, in_position) === '' ||
         this.get(in_position) !== undefined;
};

/**
 * Sets the range in the array to point to the given property objects or to be equal to the given paths
 *
 * @param {number} in_offset - target start index
 * @param {Array<property-properties.BaseProperty|undefined|String>} in_array - contains the properties to be set or
 *   the paths to those properties. If undefined is passed, the reference will be set to an empty string to
 *   indicate an empty reference.
 * @throws if in_offset is smaller than zero, larger than the length of the array or not a number
 * @throws if in_array is not an array
 * @throws if one of the items in in_array is defined, but is not a property or a string.
 */
ReferenceArrayProperty.prototype.setRange = function(in_offset, in_array) {
  var arr = ReferenceArrayProperty._convertInputToPaths(in_array, 'setRange');
  ValueArrayProperty.prototype.setRange.call(this, in_offset, arr);
};

/**
 * Insert a range which points to the given property objects into the array
 *
 * @param {number} in_offset - target start index
 * @param {Array<property-properties.BaseProperty|undefined|String>} in_array  - contains the properties to be set or
 *   the paths to those properties. If undefined is passed, the reference will be set to an empty string to
 *   indicate an empty reference.
 * @throws if in_offset is smaller than zero, larger than the length of the array or not a number
 * @throws if in_array is not an array
 * @throws if one of the items in in_array is defined, but is not a property or a string.
 */
ReferenceArrayProperty.prototype.insertRange = function(in_offset, in_array) {
  var arr = ReferenceArrayProperty._convertInputToPaths(in_array, 'insertRange');
  ValueArrayProperty.prototype.insertRange.call(this, in_offset, arr);
};

/**
 * returns the path value of a reference.
 * @param {number} in_id the index of the property
 * @return {string} the path string
 */
ReferenceArrayProperty.prototype.getValue = function(in_id)  {
  return this._dataArrayRef.getValue(in_id);
};

/**
 * Returns an object with all the nested values contained in this property
 * @return {array<String>} an array of strings representing the paths listed in this array
 * for example: ['/path1', '/path2']
 */
ReferenceArrayProperty.prototype.getValues = function() {
  var result = [];
  var ids = this.getIds();
  for (var i = 0; i < ids.length; i++) {
    result.push(this.getValue(ids[i]));
  }
  return result;
};

/**
 * Removes the last element of the array
 * @throws if trying to modify a referenced property
 * @return {String} deleted element (string path)
 */
ReferenceArrayProperty.prototype.pop = function() {
  if (this._dataArrayRef.length > 0) {
    var item = this.getValue(this._dataArrayRef.length - 1);
    this.remove(this._dataArrayRef.length - 1);
    return item;
  } else {
    return undefined;
  }
};

/**
 * Removes an element of the array and shift remaining elements to the left
 * @param {number} in_position the index that will be removed
 * @throws if in_position is not a number
 * @throws if trying to remove an item with a parent
 * @throws if trying to remove something that does not exist
 * @return {String} the value that was removed (string path).
 */
ReferenceArrayProperty.prototype.remove = function(in_position) {
  var value = this.getValue(in_position);
  this.removeRange(in_position, 1);
  return value;
};

/**
 * Removes a given number of elements from the array and shifts remaining values to the left.
 * @param {number} in_offset target start index
 * @param {number} in_deleteCount number of elements to be deleted
 * @throws if in_offset is not a number
 * @throws if in_deleteCount is not a number
 * @throws if trying to remove an item with a parent
 * @throws if in_offset is smaller than zero or if in_offset + in_delete count is larger than the length of the array
 * @return {Array<String>} an array containing the values removed (string paths)
 */
ReferenceArrayProperty.prototype.removeRange = function(in_offset, in_deleteCount) {
  ConsoleUtils.assert(_.isNumber(in_offset),
   MSG.NOT_NUMBER + 'in_offset, method: ArrayProperty.removeRange or .remove');
  ConsoleUtils.assert(_.isNumber(in_deleteCount),
   MSG.NOT_NUMBER + 'in_deleteCount, method: ArrayProperty.removeRange or .remove');
  ConsoleUtils.assert(in_offset + in_deleteCount < this.length + 1 && in_offset >= 0 && in_deleteCount > 0,
    MSG.REMOVE_OUT_OF_BOUNDS + 'Cannot remove ' + in_deleteCount + ' items starting at index ' + in_offset);
  var result = [];
  for (var i = in_offset; i < in_offset + in_deleteCount; i++) {
    result.push(this.getValue(i));
  }
  this._checkIsNotReadOnly(true);
  this._removeRangeWithoutDirtying(in_offset, in_deleteCount);
  this._setDirty();
  return result;
};

/**
 * @inheritdoc
 */
ReferenceArrayProperty.prototype._resolvePathSegment = function(in_segment, in_segmentType) {

  // Array tokens are automatically resolved
  if (in_segmentType === PathHelper.TOKEN_TYPES.ARRAY_TOKEN) {
    return this.get(in_segment, {referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER});
  } else {
    // Everything else is handled by the implementation in the base property
    return ContainerProperty.prototype._resolvePathSegment.call(this, in_segment, in_segmentType);
  }
};

/**
 * Creates and initializes the data array
 * @param {Number} in_length      the initial length of the array
 */
ReferenceArrayProperty.prototype._dataArrayCreate = function(in_length) {
  this._dataArrayRef = new DataArrays.UniversalDataArray(in_length);
  for (var i = 0; i < in_length; i++) {
    this._dataArraySetValue(i, '');
  }
};

/**
 * Validates the array and returns a sanitized version of it containing only strings.
 *
 * @param {Array<property-properties.BaseProperty|undefined|String>} in_array  - contains the properties to be set or
 *   the paths to those properties. If undefined is passed, the reference will be set to an empty string to
 *   indicate an empty reference.
 * @param {String} in_callerName  - the name of the function that called, to make it appear in
 *   the error message if any
 * @return {Array<string>} the array of paths
 * @throws if in_array is not an array
 * @throws if one of the items in in_array is defined, but is not a property or a string.
 */
ReferenceArrayProperty._convertInputToPaths = function(in_array, in_callerName) {
  if (!_.isArray(in_array)) {
    throw new Error(MSG.IN_ARRAY_NOT_ARRAY + 'ReferenceArrayProperty.' + in_callerName);
  }
  var len = in_array.length;
  var arr = new Array(len);
  for (var i = 0; i < len; i++) {
    arr[i] = ReferenceProperty._convertInputToPath(in_array[i]);
  }
  return arr;
};

module.exports = ReferenceArrayProperty;
