/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Definition of the Uint32Property class
 */

const ValueProperty = require('./value_property');
const _castFunctors = require('./primitive_type_casts');

/**
 * A primitive property for an unsigned 8 bit integer value.
 * @param {Object=} in_params - the parameters
 * @constructor
 * @private
 * @extends property-properties.ValueProperty
 * @alias property-properties.Uint8Property
 * @category Value Properties
 */
var Uint8Property = function( in_params ) {
  ValueProperty.call( this, in_params );
  // default for this property type is '0'
  this._data = 0;
};
Uint8Property.prototype = Object.create(ValueProperty.prototype);
Uint8Property.prototype._typeid = 'Uint8';
Uint8Property.prototype._castFunctor = _castFunctors.Uint8;



/**
 * A primitive property for an unsigned 16 bit integer value.
 * @param {Object=} in_params - the parameters
 * @constructor
 * @private
 * @extends property-properties.ValueProperty
 * @alias property-properties.Uint16Property
 * @category Value Properties
 */
var Uint16Property = function( in_params ) {
  ValueProperty.call( this, in_params );
  // default for this property type is '0'
  this._data = 0;
};
Uint16Property.prototype = Object.create(ValueProperty.prototype);
Uint16Property.prototype._typeid = 'Uint16';
Uint16Property.prototype._castFunctor = _castFunctors.Uint16;



/**
 * A primitive property for an unsigned 32 bit integer value.
 * @param {Object=} in_params - the parameters
 * @constructor
 * @protected
 * @extends property-properties.ValueProperty
 * @alias property-properties.Uint32Property
 * @category Value Properties
 */
var Uint32Property = function( in_params ) {
  ValueProperty.call( this, in_params );
  // default for this property type is '0'
  this._data = 0;
};
Uint32Property.prototype = Object.create(ValueProperty.prototype);
Uint32Property.prototype._typeid = 'Uint32';
Uint32Property.prototype._castFunctor = _castFunctors.Uint32;

module.exports = {
  'Uint8Property': Uint8Property,
  'Uint16Property': Uint16Property,
  'Uint32Property': Uint32Property
};
