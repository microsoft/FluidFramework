/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable new-cap*/
/**
 * @fileoverview Definition of the valuearray property class
 */

const _ = require('lodash');
const MSG = require('@fluid-experimental/property-common').constants.MSG;
const _castFunctors = require('./primitive_type_casts');
const Int64 = require('@fluid-experimental/property-common').Datastructures.Int64;
const Uint64 = require('@fluid-experimental/property-common').Datastructures.Uint64;
const DataArrays = require('@fluid-experimental/property-common').Datastructures.DataArrays;
const ArrayProperty = require('./array_property');
const Int64Property = require('../properties/int_properties').Int64Property;
const Uint64Property = require('../properties/int_properties').Uint64Property;

/**
 * An array property which stores primitive values
 *
 * @param {Object} in_params - Input parameters for property creation
 * @constructor
 * @protected
 * @extends property-properties.ArrayProperty
 * @alias property-properties.ValueArrayProperty
 */
var ValueArrayProperty = function(in_params) {
  ArrayProperty.call(this, in_params, true);
};
ValueArrayProperty.prototype = Object.create( ArrayProperty.prototype );
ValueArrayProperty.prototype._isPrimitive = true;

/**
 * returns the value at in_position for a primitive array
 * @param {number} in_position the array index
 * @return {*} the value
 */
ValueArrayProperty.prototype._getValue = function(in_position) {
  return this._dataArrayRef.getValue(in_position);
};

/**
 * returns the array of primitive values.
 * @return {Array<*>} the array of values.
 * For example: ['string1', 'string2']
 */
ValueArrayProperty.prototype.getValues = function() {
  var result = [];
  var ids = this.getIds();
  for (var i = 0; i < ids.length; i++) {
    result.push(this.get(ids[i]));
  }
  return result;
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
ValueArrayProperty.prototype._resolvePathSegment = function(in_segment, in_segmentType) {
  return this.get(in_segment);
};

/**
 * Function to serialize special primitive types.
 * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
 * special treatment on serialization. For supported types, we can just return the input here.
 *
 * @param {*} in_obj - The object to be serialized
 * @return {property-properties.SerializedChangeSet} the serialized object
 */
ValueArrayProperty.prototype._serializeValue = function(in_obj) {
  return in_obj;
};

/**
 * Function to serialize arrays of special primitive types.
 * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
 * special treatment on serialization. For supported types, we can just return the input here.
 *
 * @param {Array} in_array - The array of special objects to be serialized
 * @return {Array<property-properties.SerializedChangeSet>} the serialized object
 */
ValueArrayProperty.prototype._serializeArray = function(in_array) {
  return in_array;
};

/**
 * Function to deserialize arrays of special primitive types.
 * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
 * special treatment on deserialization. For supported types, we can just return the input here.
 *
 * @param {Array<property-properties.SerializedChangeSet>} in_serializedObj the serialized object
 * @return {Array} in_array - The array of special objects that were deserialized
 */
ValueArrayProperty.prototype._deserializeArray = function(in_serializedObj) {
  return in_serializedObj;
};

/**
 * An ArrayProperty which stores Float32 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueArrayProperty
 * @alias property-properties.Float32ArrayProperty
 * @category Arrays
 */
var Float32ArrayProperty = function( in_params) {
  ValueArrayProperty.call( this, in_params );
};
Float32ArrayProperty.prototype = Object.create( ValueArrayProperty.prototype );
Float32ArrayProperty.prototype._typeid = 'Float32';

/**
 * Creates and initializes the data array
 * @param {Number} in_length      the initial length of the array
 */
Float32ArrayProperty.prototype._dataArrayCreate = function(in_length) {
  this._dataArrayRef = new DataArrays.BaseDataArray(Float32Array, in_length);
};


/**
 * An ArrayProperty which stores Float64 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueArrayProperty
 * @alias property-properties.Float64ArrayProperty
 * @category Arrays
 */
var Float64ArrayProperty = function( in_params) {
  ValueArrayProperty.call( this, in_params );
};
Float64ArrayProperty.prototype = Object.create( ValueArrayProperty.prototype );
Float64ArrayProperty.prototype._typeid = 'Float64';

/**
 * Creates and initializes the data array
 * @param {Number} in_length      the initial length of the array
 */
Float64ArrayProperty.prototype._dataArrayCreate = function(in_length) {
  this._dataArrayRef = new DataArrays.BaseDataArray(Float64Array, in_length);
};

/**
 * An ArrayProperty which stores Uint8 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueArrayProperty
 * @alias property-properties.Uint8ArrayProperty
 * @category Arrays
 */
var Uint8ArrayProperty = function( in_params) {
  ValueArrayProperty.call( this, in_params );
};
Uint8ArrayProperty.prototype = Object.create( ValueArrayProperty.prototype );
Uint8ArrayProperty.prototype._typeid = 'Uint8';

/**
 * Creates and initializes the data array
 * @param {Number} in_length      the initial length of the array
 */
Uint8ArrayProperty.prototype._dataArrayCreate = function(in_length) {
  this._dataArrayRef = new DataArrays.BaseDataArray(Uint8Array, in_length);
};

/**
 * An ArrayProperty which stores Int8 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueArrayProperty
 * @alias property-properties.Int8ArrayProperty
 * @category Arrays
 */
var Int8ArrayProperty = function( in_params) {
  ValueArrayProperty.call( this, in_params );
};
Int8ArrayProperty.prototype = Object.create( ValueArrayProperty.prototype );
Int8ArrayProperty.prototype._typeid = 'Int8';

/**
 * Creates and initializes the data array
 * @param {Number} in_length      the initial length of the array
 */
Int8ArrayProperty.prototype._dataArrayCreate = function(in_length) {
  this._dataArrayRef = new DataArrays.BaseDataArray(Int8Array, in_length);
};

/**
 * An ArrayProperty which stores Uint16 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueArrayProperty
 * @alias property-properties.Uint16ArrayProperty
 * @category Arrays
 */
var Uint16ArrayProperty = function( in_params) {
  ValueArrayProperty.call( this, in_params );
};
Uint16ArrayProperty.prototype = Object.create( ValueArrayProperty.prototype );
Uint16ArrayProperty.prototype._typeid = 'Uint16';

/**
 * Creates and initializes the data array
 * @param {Number} in_length      the initial length of the array
 */
Uint16ArrayProperty.prototype._dataArrayCreate = function(in_length) {
  this._dataArrayRef = new DataArrays.BaseDataArray(Uint16Array, in_length);
};

/**
 * An ArrayProperty which stores Int16 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueArrayProperty
 * @alias property-properties.Int16ArrayProperty
 * @category Arrays
 */
var Int16ArrayProperty = function( in_params) {
  ValueArrayProperty.call( this, in_params );
};
Int16ArrayProperty.prototype = Object.create( ValueArrayProperty.prototype );
Int16ArrayProperty.prototype._typeid = 'Int16';

/**
 * Creates and initializes the data array
 * @param {Number} in_length      the initial length of the array
 */
Int16ArrayProperty.prototype._dataArrayCreate = function(in_length) {
  this._dataArrayRef = new DataArrays.BaseDataArray(Int16Array, in_length);
};

/**
 * An ArrayProperty which stores Uint32 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueArrayProperty
 * @alias property-properties.Uint32ArrayProperty
 * @category Arrays
 */
var Uint32ArrayProperty = function( in_params) {
  ValueArrayProperty.call( this, in_params );
};
Uint32ArrayProperty.prototype = Object.create( ValueArrayProperty.prototype );
Uint32ArrayProperty.prototype._typeid = 'Uint32';

/**
 * Creates and initializes the data array
 * @param {Number} in_length      the initial length of the array
 */
Uint32ArrayProperty.prototype._dataArrayCreate = function(in_length) {
  this._dataArrayRef = new DataArrays.BaseDataArray(Uint32Array, in_length);
};

/**
 * An ArrayProperty which stores Int32 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueArrayProperty
 * @alias property-properties.Int32ArrayProperty
 * @category Arrays
 */
var Int32ArrayProperty = function( in_params) {
  ValueArrayProperty.call( this, in_params );
};
Int32ArrayProperty.prototype = Object.create( ValueArrayProperty.prototype );
Int32ArrayProperty.prototype._typeid = 'Int32';

/**
 * Creates and initializes the data array
 * @param {Number} in_length      the initial length of the array
 */
Int32ArrayProperty.prototype._dataArrayCreate = function(in_length) {
  this._dataArrayRef = new DataArrays.BaseDataArray(Int32Array, in_length);
};

/**
 * An ArrayProperty which stores Int64 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueArrayProperty
 * @alias property-properties.Integer64ArrayProperty
 * @category Arrays
 */
var Integer64ArrayProperty = function( in_params) {
  ValueArrayProperty.call( this, in_params );
};
Integer64ArrayProperty.prototype = Object.create( ValueArrayProperty.prototype );

/**
 * Function to serialize special primitive types.
 * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
 * special treatment on serialization. For supported types, we can just return the input here.
 *
 * @param {*} in_obj - The object to be serialized
 * @return {property-properties.SerializedChangeSet} the serialized object
 */
Integer64ArrayProperty.prototype._serializeValue = function(in_obj) {
  if (in_obj instanceof Int64 || in_obj instanceof Uint64) {
    return [in_obj.getValueLow(), in_obj.getValueHigh()];
  }
  return in_obj;
};


/**
 * Function to serialize arrays of special primitive types.
 * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
 * special treatment on serialization. For supported types, we can just return the input here.
 *
 * @param {Array} in_array - The array of special objects to be serialized
 * @return {Array<property-properties.SerializedChangeSet>} the serialized object
 */
Integer64ArrayProperty.prototype._serializeArray = function(in_array) {
  var result = [];
  for (var i = 0; i < in_array.length; i++) {
    result.push(this._serializeValue(in_array[i]));
  }
  return result;
};

/**
 * Function to deserialize arrays of special primitive types.
 * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
 * special treatment on deserialization. For supported types, we can just return the input here.
 *
 * @param {Array<property-properties.SerializedChangeSet>} in_serializedObj the serialized object
 * @return {Array} in_array - The array of special objects that were deserialized
 */
Integer64ArrayProperty.prototype._deserializeArray = function(in_serializedObj) {
  var result = [];
  for (var i = 0; i < in_serializedObj.length; i++) {
    result.push(this._deserializeValue(in_serializedObj[i]));
  }
  return result;
};

/**
 * @inheritdoc
 */
Integer64ArrayProperty.prototype._prettyPrint = function(indent, externalId, printFct) {

  printFct(indent + externalId + this.getId() + ' (Array of ' + this.getTypeid() + '): [');
  var childIndent = indent + '  ';
  var int64Prop;
  for (var i = 0; i < this._dataArrayGetLength(); i++) {
    // TODO: The 'toString()' function is defined on Integer64Property, so we need to create
    //       such object to use it. It would be better to have it in HfdmUtils Integer64.prototype.toString
    if (this._dataArrayGetValue(i) instanceof Int64) {
      int64Prop = new Int64Property({});
    } else {
      int64Prop = new Uint64Property({});
    }
    int64Prop.setValueLow(this._dataArrayGetValue(i).getValueLow());
    int64Prop.setValueHigh(this._dataArrayGetValue(i).getValueHigh());
    printFct(childIndent + i + ': ' + int64Prop);
  }
  printFct(indent + ']');
};

/**
 * An ArrayProperty which stores Int64 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.Integer64ArrayProperty
 * @alias property-properties.Int64ArrayProperty
 * @category Arrays
 */
var Int64ArrayProperty = function( in_params) {
  Integer64ArrayProperty.call( this, in_params );
};
Int64ArrayProperty.prototype = Object.create( Integer64ArrayProperty.prototype );
Int64ArrayProperty.prototype._typeid = 'Int64';

/**
 * Sets the array properties elements to the content of the given array
 * All changed elements must already exist. This will overwrite existing elements.
 * @param {number} in_offset target start index
 * @param {Array<*>|Array<property-properties.BaseProperty>} in_array contains the elements to be set
 * @throws if in_offset is not a number
 * @throws if in_offset is smaller than zero or higher than the length of the array
 */
Int64ArrayProperty.prototype.setRange = function(in_offset, in_array) {
  if (!_.isArray(in_array)) {
    throw new Error(MSG.IN_ARRAY_NOT_ARRAY + 'Int64ArrayProperty.setRange');
  }
  var out_array = in_array.map((element) => {
    return _castFunctors.Int64(element);
  });
  ArrayProperty.prototype.setRange.call(this, in_offset, out_array);
};

/**
 * Inserts the content of a given array into the array property
 * It will not overwrite the existing values but push them to the right instead.
 * E.g. [1, 2, 3] .insertRange(1, [9, 8]) => [1, 9, 8, 2, 3]
 * @param {number} in_offset target index
 * @param {Array<*>} in_array the array to be inserted
 * @throws if in_offset is smaller than zero, larger than the length of the array or not a number.
 * @throws if trying to insert a property that already has a parent.
 * @throws if tyring to modify a referenced property.
 */
Int64ArrayProperty.prototype.insertRange = function(in_offset, in_array) {
  var out_array = in_array.map((element) => {
    return _castFunctors.Int64(element);
  });
  ArrayProperty.prototype.insertRange.call(this, in_offset, out_array);
};

/**
 * Specialized function to deserialize Int64 primitive types.
 * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
 * special treatment on deserialization. For supported types, we can just return the input here.
 *
 * @param {property-properties.SerializedChangeSet} in_serializedObj - The object to be deserialized
 * @return {Int64} the deserialized value
 */
Int64ArrayProperty.prototype._deserializeValue = function(in_serializedObj) {
  return new Int64(in_serializedObj[0], in_serializedObj[1]);
};

/**
 * Creates and initializes the data array
 * @param {Number} in_length      the initial length of the array
 */
Int64ArrayProperty.prototype._dataArrayCreate = function(in_length) {
  this._dataArrayRef = new DataArrays.UniversalDataArray(in_length);
  for (var i = 0; i < in_length; i++) {
    this._dataArraySetValue(i, new Int64());
  }
};

/**
 * An ArrayProperty which stores Uint64 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.Integer64ArrayProperty
 * @alias property-properties.Uint64ArrayProperty
 * @category Arrays
 */
var Uint64ArrayProperty = function( in_params) {
  Integer64ArrayProperty.call( this, in_params );
};
Uint64ArrayProperty.prototype = Object.create( Integer64ArrayProperty.prototype );
Uint64ArrayProperty.prototype._typeid = 'Uint64';

/**
 * Specialized function to deserialize Uint64 primitive types.
 * Some primitive types (e.g. Uint64, which is not natively supported by javascript) require
 * special treatment on deserialization. For supported types, we can just return the input here.
 *
 * @param {property-properties.SerializedChangeSet} in_serializedObj - The object to be deserialized
 * @return {Uint64} the deserialized value
 */
Uint64ArrayProperty.prototype._deserializeValue = function(in_serializedObj) {
  return new Uint64(in_serializedObj[0], in_serializedObj[1]);
};

/**
 * Sets the array properties elements to the content of the given array
 * All changed elements must already exist. This will overwrite existing elements.
 * @param {number} in_offset target start index
 * @param {Array<*>|Array<property-properties.BaseProperty>} in_array contains the elements to be set
 * @throws if in_offset is not a number
 * @throws if in_offset is smaller than zero or higher than the length of the array
 */
Uint64ArrayProperty.prototype.setRange = function(in_offset, in_array) {
  if (!_.isArray(in_array)) {
    throw new Error(MSG.IN_ARRAY_NOT_ARRAY + 'Uint64ArrayProperty.setRange');
  }
  var out_array = in_array.map((element) => {
    return _castFunctors.Uint64(element);
  });
  ArrayProperty.prototype.setRange.call(this, in_offset, out_array);
};

/**
 * Inserts the content of a given array into the array property
 * It will not overwrite the existing values but push them to the right instead.
 * E.g. [1, 2, 3] .insertRange(1, [9, 8]) => [1, 9, 8, 2, 3]
 * @param {number} in_offset target index
 * @param {Array<*>} in_array the array to be inserted
 * @throws if in_offset is smaller than zero, larger than the length of the array or not a number.
 * @throws if trying to insert a property that already has a parent.
 * @throws if tyring to modify a referenced property.
 */
Uint64ArrayProperty.prototype.insertRange = function(in_offset, in_array) {
  var out_array = in_array.map((element) => {
    return _castFunctors.Uint64(element);
  });
  ArrayProperty.prototype.insertRange.call(this, in_offset, out_array);
};

/**
 * Creates and initializes the data array
 * @param {Number} in_length      the initial length of the array
 */
Uint64ArrayProperty.prototype._dataArrayCreate = function(in_length) {
  this._dataArrayRef = new DataArrays.UniversalDataArray(in_length);
  for (var i = 0; i < in_length; i++) {
    this._dataArraySetValue(i, new Uint64());
  }
};

/**
 * An ArrayProperty which stores String values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueArrayProperty
 * @alias property-properties.StringArrayProperty
 * @category Arrays
 */
var StringArrayProperty = function( in_params) {
  ValueArrayProperty.call( this, in_params );
};
StringArrayProperty.prototype = Object.create( ValueArrayProperty.prototype );
StringArrayProperty.prototype._typeid = 'String';

/**
 * Creates and initializes the data array
 * @param {Number} in_length      the initial length of the array
 */
StringArrayProperty.prototype._dataArrayCreate = function(in_length) {
  this._dataArrayRef = new DataArrays.UniversalDataArray(in_length);
  for (var i = 0; i < in_length; i++) {
    this._dataArraySetValue(i, '');
  }
};

/**
 * An ArrayProperty which stores Boolean values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueArrayProperty
 * @alias property-properties.BoolArrayProperty
 * @category Arrays
 */
var BoolArrayProperty = function( in_params) {
  ValueArrayProperty.call( this, in_params, Array, true );
};
BoolArrayProperty.prototype = Object.create( ValueArrayProperty.prototype );
BoolArrayProperty.prototype._typeid = 'Bool';

/**
 * Creates and initializes the data array
 * @param {Number} in_length      the initial length of the array
 */
BoolArrayProperty.prototype._dataArrayCreate = function(in_length) {
  this._dataArrayRef = new DataArrays.BoolDataArray(in_length);
  for (var i = 0; i < in_length; i++) {
    this._dataArraySetValue(i, false);
  }
};

module.exports = {
  'ValueArrayProperty': ValueArrayProperty,
  'Float32ArrayProperty': Float32ArrayProperty,
  'Float64ArrayProperty': Float64ArrayProperty,
  'Uint8ArrayProperty': Uint8ArrayProperty,
  'Int8ArrayProperty': Int8ArrayProperty,
  'Uint16ArrayProperty': Uint16ArrayProperty,
  'Int16ArrayProperty': Int16ArrayProperty,
  'Uint32ArrayProperty': Uint32ArrayProperty,
  'Int32ArrayProperty': Int32ArrayProperty,
  'Int64ArrayProperty': Int64ArrayProperty,
  'Uint64ArrayProperty': Uint64ArrayProperty,
  'StringArrayProperty': StringArrayProperty,
  'BoolArrayProperty': BoolArrayProperty
};
