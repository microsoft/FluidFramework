/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Definition of the Float*Property classes
 */

const ValueProperty = require('./value_property');
const _castFunctors = require('./primitive_type_casts');

/**
 * A primitive property for a 32 bit floating point value.
 * @param {Object=} in_params - the parameters
 * @constructor
 * @protected
 * @extends property-properties.ValueProperty
 * @alias property-properties.Float32Property
 * @category Value Properties
 */
var Float32Property = function( in_params ) {
  ValueProperty.call(this, in_params);
  // default for this property type is '0'
  this._data = 0;
};
Float32Property.prototype = Object.create(ValueProperty.prototype);
Float32Property.prototype._typeid = 'Float32';
Float32Property.prototype._castFunctor = _castFunctors.Float32;


  /**
 * A primitive property for a 64 bit floating point value.
 * @param {Object=} in_params - the parameters
 * @constructor
 * @protected
 * @extends property-properties.ValueProperty
 * @alias property-properties.Float64Property
 * @category Value Properties
 */
var Float64Property = function( in_params ) {
  ValueProperty.call(this, in_params);
  // default for this property type is '0'
  this._data = 0;
};
Float64Property.prototype = Object.create(ValueProperty.prototype);
Float64Property.prototype._typeid = 'Float64';
Float64Property.prototype._castFunctor = _castFunctors.Float64;
module.exports = {
  'Float32Property': Float32Property,
  'Float64Property': Float64Property
};
