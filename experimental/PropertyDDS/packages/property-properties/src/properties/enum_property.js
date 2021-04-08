/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Definition of the EnumProperty classes
 */

const Int32Property = require('./int_properties').Int32Property;
const _castFunctors = require('./primitive_type_casts');
const ValueProperty = require('./value_property');
const MSG = require('@fluid-experimental/property-common').constants.MSG;
const _ = require('lodash');
const TypeIdHelper = require('@fluid-experimental/property-changeset').TypeIdHelper;
const ConsoleUtils = require('@fluid-experimental/property-common').ConsoleUtils;

/**
 * A primitive property for enums.
 * @param {Object=} in_params - the parameters
 * @constructor
 * @protected
 * @extends property-properties.Int32Property
 * @alias property-properties.EnumProperty
 * @category Value Properties
 */
var EnumProperty = function(in_params) {
  Int32Property.call( this, in_params );
  // whenever an EnumProperty is created by the PropertyFactory, we get a
  // dictionary [value->enum] and [enum->value] to efficiently lookup
  // values/enums for the property.
  this._enumDictionary = in_params._enumDictionary;
  // default for this property type is '0' if it exists to keep backward compatibility
  this._data = this._enumDictionary ? this._enumDictionary.defaultValue : 0;
};
EnumProperty.prototype = Object.create(Int32Property.prototype);

EnumProperty.prototype._typeid = 'Enum';
EnumProperty.prototype._castFunctor = _castFunctors.Int32;

/**
 * Evaluates enum properties as primitives.
 * @return {boolean} true since Enum properties are primitives.
 */
EnumProperty.prototype.isPrimitiveType = function() {
  return true;
};

/**
 * Returns the current enum string
 * @return {string} the string value of the property
 * @throws if no entry exists
 */
EnumProperty.prototype.getEnumString = function() {
  var resultEntry = this._enumDictionary.enumEntriesByValue[this._data];
  if (!resultEntry) {
    throw new Error(MSG.UNKNOWN_ENUM + this._data);
  } else {
    return resultEntry.id;
  }
};

/**
 * Sets the (internal, integer) value of the property
 *
 * @param {Number|string} in_value the new integer value - it must be a valid enum integer for this property
 *                                 or
 *                                 the new enum value in form of a valid enum string for this EnumProperty
 * @throws if no entry exists for in_value
 *
 */
EnumProperty.prototype.setValue = function(in_value) {
  this._checkIsNotReadOnly(true);

  // check if we've got a string
  if (_.isString(in_value)) {
    this.setEnumByString(in_value);
  } else if (!this._enumDictionary.enumEntriesByValue[in_value]) {
    throw new Error(MSG.UNKNOWN_ENUM + in_value);
  } else {
    ValueProperty.prototype.setValue.call(this, in_value);
  }
};

/**
 * Sets the property by an enum string
 *
 * @param {string} in_stringId the enum string we want to switch to
 * @throws if in_stringId is not a string
 * @throws if no entry is found for in_stringId
 */
EnumProperty.prototype.setEnumByString = function(in_stringId) {
  ConsoleUtils.assert(_.isString(in_stringId), MSG.STRING_ID_MUST_BE_STRING + in_stringId);
  var internalEnum = this._enumDictionary.enumEntriesById[in_stringId];
  if (!internalEnum) {
    throw new Error(MSG.UNKNOWN_ENUM + in_stringId);
  } else {
    var internalValue = internalEnum.value;
    this.setValue(internalValue);
  }
};

/**
 * Returns the full property type identifier for the ChangeSet including the enum type id
 * @param  {boolean} [in_hideCollection=false] - if true the collection type (if applicable) will be omitted
 *                since that is not aplicable here, this param is ignored
 * @return {string} The typeid
 */
EnumProperty.prototype.getFullTypeid = function(in_hideCollection) {
  return TypeIdHelper.createSerializationTypeId(this._typeid, 'single', true);
};

/**
 * let the user to query all valid entries of an enum
 * @return {{}} all valid (string) entries and their (int) values
 */
EnumProperty.prototype.getValidEnumList = function() {
  return this._enumDictionary.enumEntriesById;
};

module.exports = EnumProperty;
