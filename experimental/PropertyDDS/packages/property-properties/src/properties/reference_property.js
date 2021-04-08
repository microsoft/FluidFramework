/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Definition of the ReferenceProperty class
 */

const ValueProperty = require('./value_property');
const TypeIdHelper = require('@fluid-experimental/property-changeset').TypeIdHelper;
const PathHelper = require('@fluid-experimental/property-changeset').PathHelper;
const BaseProperty = require('./base_property');
const ContainerProperty = require('./container_property');
const _castFunctors = require('./primitive_type_casts');
const MSG = require('@fluid-experimental/property-common').constants.MSG;
const _ = require('lodash');


/**
 * This class serves as a view to read, write and listen to changes in an
 * object's value field. To do this we simply keep a pointer to the object and
 * it's associated data field that we are interested in. If no data field is
 * present this property will have an undefined value.
 * @param {Object=} in_params - the parameters
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueProperty
 * @alias property-properties.ReferenceProperty
 * @category Properties
 */
var ReferenceProperty = function( in_params ) {
  ValueProperty.call( this, in_params );
  // default for this property type is an empty string
  this._data = '';
};
ReferenceProperty.prototype = Object.create(ValueProperty.prototype);
ReferenceProperty.prototype._typeid = 'Reference';
ReferenceProperty.prototype._castFunctor = _castFunctors.String;

/**
 * Evaluates Reference properties as primitives.
 * @return {boolean} true since Reference properties are primitives.
 */
ReferenceProperty.prototype.isPrimitiveType = function() {
  return true;
};

/**
 * Returns the typeid for the target of this reference
 *
 * Note: This is the type that is specified in the typeid of this reference and not the actual type
 * of the referenced object, which might inherit from that typeid.
 *
 * @return {string} The typeid of the nodes this reference may point to
 */
ReferenceProperty.prototype.getReferenceTargetTypeId = function() {
  return TypeIdHelper.extractReferenceTargetTypeIdFromReference(this.getTypeid());
};

/**
 * Resolves the referenced property
 *
 * @param  {string|number|array<string|number>} in_ids the ID of the property or an array of IDs
 *     if an array is passed, the .get function will be performed on each id in sequence
 *     for example .get(['position','x']) is equivalent to .get('position').get('x').
 *     If .get resolves to a ReferenceProperty, it will return the property that the ReferenceProperty
 *     refers to.
 * @param {Object} in_options - parameter object
 * @param {property-properties.BaseProperty.REFERENCE_RESOLUTION} [in_options.referenceResolutionMode=ALWAYS]
 *     How should this function behave during reference resolution?
 * @return {property-properties.BaseProperty|undefined} The property object the reference points to or undefined if it
 *    could not be resolved
 */
ReferenceProperty.prototype.get = function(in_ids, in_options) {
  in_options = in_options || {};
  in_options.referenceResolutionMode =
      in_options.referenceResolutionMode === undefined ? BaseProperty.REFERENCE_RESOLUTION.ALWAYS :
                                                          in_options.referenceResolutionMode;

  if (_.isArray(in_ids) && in_ids.length === 0) {
    return this;
  }

  // Since this is a reference property, we return undefined, if reference resolution is disabled
  if (in_options.referenceResolutionMode !== BaseProperty.REFERENCE_RESOLUTION.ALWAYS) {
    return undefined;
  }

  if (this.value === '') {
    return undefined;
  }

  if (this.getParent() === undefined) {
    return undefined;
  }
  var resolvedProperty = this.getParent().resolvePath(this.value,
    {referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.ALWAYS});

  if (resolvedProperty !== undefined && _.isArray(in_ids)) {
    // Forward handling of arrays to the BaseProperty function
    return resolvedProperty.get(in_ids, in_options);
  } else {
    return resolvedProperty;
  }
};

/**
 * Expand a path returning the value or property at the end.
 *
 * @param {string} in_path the path
 * @param {Object} in_options - parameter object
 * @param {property-properties.BaseProperty.REFERENCE_RESOLUTION} [in_options.referenceResolutionMode=ALWAYS]
 *     How should this function behave during reference resolution?
 * @return {property-properties.BaseProperty|undefined} resolved path
 * @throws if the path resolves to a primitive value
 * @throws if in_path is not a valid path
 */
ReferenceProperty.prototype.resolvePath = function(in_path, in_options) {
  if (in_options && in_options.referenceResolutionMode &&
    in_options.referenceResolutionMode === BaseProperty.REFERENCE_RESOLUTION.NEVER) {
    return undefined;
  }
  return ContainerProperty.prototype.resolvePath.call(this, in_path, in_options);
};

/**
 * Checks whether the reference is valid. This is either the case when it is empty or when the referenced
 * property exists.
 *
 * @return {boolean} True if the reference is valid, otherwise false.
 */
ReferenceProperty.prototype.isReferenceValid = function() {
  return this.value === '' || this.ref !== undefined;
};

/**
 * Sets the reference to point to the given property object or to be equal to the given path string.
 *
 * @param {property-properties.BaseProperty|undefined|String} in_value - The property to assign to the reference or
 *   the path to this property. If undefined is passed, the reference will be set to an empty string to
 *   indicate an empty reference.
 * @throws if property is read only
 * @throws if in_value is defined, but is not a property or a string.
 */
ReferenceProperty.prototype.setValue = function(in_value) {
  this._checkIsNotReadOnly(true);
  var value = ReferenceProperty._convertInputToPath(in_value);
  // Forward the call to setValue
  ValueProperty.prototype.setValue.call(this, value);
};

/**
 * Sets the reference to point to the given property object or to be equal to the given path string.
 *
 * @param {property-properties.BaseProperty|undefined|String} in_value - The property to assign to the reference or
 *   the path to this property. If undefined is passed, the reference will be set to an empty string to
 *   indicate an empty reference.
 * @throws if property is read only
 * @throws if in_value is defined but is not a property or a string.
 */
ReferenceProperty.prototype.set = ReferenceProperty.prototype.setValue;

/**
 * @inheritdoc
 */
ReferenceProperty.prototype._resolvePathSegment = function(in_segment, in_segmentType) {

  // path segments and array tokens are no longer automatically forwarded to the referenced node
  if (in_segmentType === PathHelper.TOKEN_TYPES.ARRAY_TOKEN ||
      in_segmentType === PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN) {
    return undefined;
  } else {
    return ContainerProperty.prototype._resolvePathSegment.call(this, in_segment, in_segmentType);
  }
};

// Define a property to simplify accessing the referenced path
Object.defineProperty(
  ReferenceProperty.prototype,
  'ref',
  {
    get: function() {
      return this.get.apply(this, arguments);
    },
    set: function() {
      this.set.apply(this, arguments);
    }
  }
);

/**
 * Validates the input and does as much as possible to return a string representing a path.
 *
 * @param {property-properties.BaseProperty|undefined|String} in_value  - contains the property to be set or
 *  the path to this property. If undefined is passed, the reference will be set to an empty string to
 *  indicate an empty reference.
 * @return {string} the path
 * @throws if in_value is defined, but is not a property or a string.
 */
ReferenceProperty._convertInputToPath = function(in_value) {
  var path;
  if (typeof in_value === 'string') {
    path = in_value;
  } else if (in_value === undefined) {
    path = '';
  } else if (in_value instanceof BaseProperty) {
    // TODO: Check whether this is still the correct path once we start to support repository references
    path = in_value.getAbsolutePath();
  } else if (in_value instanceof String) {
    path = String(in_value);
  } else {
    throw new Error(MSG.PROPERTY_OR_UNDEFINED + '(' + typeof in_value + ') ' + in_value);
  }
  return path;
};

module.exports = ReferenceProperty;
