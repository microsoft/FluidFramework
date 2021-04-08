/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Definition of the valuemap property class
 */

const _ = require('lodash');
const MSG = require('@fluid-experimental/property-common').constants.MSG;
const _castFunctors = require('./primitive_type_casts');
const BaseProperty = require('./base_property');
const MapProperty = require('./map_property');
const Int64 = require('@fluid-experimental/property-common').Datastructures.Int64;
const Uint64 = require('@fluid-experimental/property-common').Datastructures.Uint64;
const Int64Property = require('../properties/int_properties').Int64Property;
const Uint64Property = require('../properties/int_properties').Uint64Property;

/**
 * A ValueMapProperty is a collection class that can contain an dictionary that maps from strings to primitive types.
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.MapProperty
 * @alias property-properties.ValueMapProperty
 * @category Maps
 */
var ValueMapProperty = function( in_params ) {
  MapProperty.call( this, in_params );
};

ValueMapProperty.prototype = Object.create(MapProperty.prototype);

// The value map contains primitive types
ValueMapProperty.prototype._containsPrimitiveTypes = true;

/**
 * Inserts a value into the map. Using insert with a key that already exists will throw an error.
 *
 * @param {string}                      in_key      - The key under which the entry is added
 * @param {*}       in_value    - The primitive type value to set
 * @throws if a value already exists for in_key
 */
ValueMapProperty.prototype.insert = function(in_key, in_value) {
  var castedValue = this._castFunctor ? this._castFunctor(in_value) : in_value;
  this._insert(in_key, castedValue, true);
};

/**
 * Returns an object with all the nested values contained in this property
 * @return {object} an object representing the values of your property
 * for example: {
      'firstString': 'test1',
      'secondString': 'test2'
    }
  */
ValueMapProperty.prototype.getValues = function() {
  var ids = this.getIds();
  var result = {};
  for (var i = 0; i < ids.length; i++) {
    result[ids[i]] = this.get(ids[i]);
  }
  return result;
};

/**
 * Return a JSON representation of the map and its items.
 * @return {object} A JSON representation of the map and its items.
 * @private
 */
ValueMapProperty.prototype._toJson = function() {
  return {
    id: this.getId(),
    context: this._context,
    typeid: this.getTypeid(),
    isConstant: this._isConstant,
    value: this.getValues()
  };
};

/**
 * Repeatedly calls back the given function with human-readable string
 * representations of the property's sub-properties.
 * @param {string} indent - Leading spaces to create the tree representation
 * @param {function} printFct - Function to call for printing each property
 */
ValueMapProperty.prototype._prettyPrintChildren = function(indent, printFct) {
  indent += '  ';
  var prefix = '';
  var suffix = '';
  if (this.getTypeid() === 'String') {
    prefix = '"';
    suffix = '"';
  }
  _.mapValues(this._entries, function(val, key) {
    printFct(indent + key + ': ' + prefix + val + suffix);
  });
};

/**
 * Sets the value of a property into the map.
 *
 * @param {string} in_key the key under which the entry is set
 * @param {*} in_value the value to be set
 */
ValueMapProperty.prototype.set = function(in_key, in_value) {
  this._checkIsNotReadOnly(true);
  var castedValue = this._castFunctor ? this._castFunctor(in_value) : in_value;
  if (this._entries[in_key] !== castedValue) {
    this._checkIsNotReadOnly(true);
    if (this._entries[in_key] !== undefined) {
      this._removeByKey(in_key, false);
    }
    this._insert(in_key, castedValue, false);
    // Make one final report
    this._reportDirtinessToView();
  }
};

ValueMapProperty.prototype._getValue = function(in_key) {
  return this._entries[in_key];
};

/**
 * @inheritdoc
 */
ValueMapProperty.prototype._reapplyDirtyFlags = function(in_pendingChangeSet, in_dirtyChangeSet) {
  BaseProperty.prototype._reapplyDirtyFlags.call(this, in_pendingChangeSet, in_dirtyChangeSet);

  var i, j, keys, key;

  // Remove existing entries
  // (we remove before we add, so that a remove+add operation in effect becomes a replace)
  if (in_pendingChangeSet.remove) {
    if (_.isArray(in_pendingChangeSet.remove)) {
      for (i = 0; i < in_pendingChangeSet.remove.length; i++) {
        key = in_pendingChangeSet.remove[i];
        this._pendingChanges.remove[key] = true;
      }
    } else {
      // handle remove is an object case:
      keys = Object.keys(in_pendingChangeSet.remove);
      for (j = 0; j < keys.length; j++) {
        this._pendingChanges.remove[keys[j]] = true;
      }
    }
  }

  // Inserted entries
  if (in_pendingChangeSet.insert) {
    keys = Object.keys(in_pendingChangeSet.insert);
    for (i = 0; i < keys.length; i++) {
      if (this._entries[keys[i]] !== undefined) {
        this._pendingChanges.insert[keys[i]] = true;
      } else {
        throw new Error(`${MSG.CANT_DIRTY_MISSING_PROPERTY}${keys[i]}`);
      }
    }
  }

  // Modify entries
  if (in_pendingChangeSet.modify) {
    var modifiedPendingEntries = in_pendingChangeSet ? in_pendingChangeSet.modify || {} : {};
    var modifiedDirtyEntries = in_dirtyChangeSet ? in_dirtyChangeSet.modify || {} : {};
    keys = Object.keys(modifiedPendingEntries).concat(Object.keys(modifiedDirtyEntries));
    for (i = 0; i < keys.length; i++) {
      key = keys[i];
      if (this._entries[key] !== undefined) {
        if (modifiedPendingEntries[key]) {
          if (!this._pendingChanges.insert[key]) {
            this._pendingChanges.modify[key] = true;
          }
        }
        if (modifiedDirtyEntries[key]) {
          if (!this._dirtyChanges.insert[key]) {
            this._dirtyChanges.modify[key] = true;
          }
        }
      } else {
        throw new Error(MSG.MODIFY_NON_EXISTING_ENTRY + key);
      }
    }
  }

  // If working with primitive types, we have to update the dirty flag, when one of the entries
  // was changed
  this._setDirty(false);
};

/**
 * A ValueMapProperty which stores Float32 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueMapProperty
 * @alias property-properties.Float32MapProperty
 * @category Maps
 */
var Float32MapProperty = function( in_params) {
  ValueMapProperty.call( this, in_params );
};
Float32MapProperty.prototype = Object.create( ValueMapProperty.prototype );
Float32MapProperty.prototype._typeid = 'Float32';
Float32MapProperty.prototype._castFunctor = _castFunctors.Float32;

/**
 * A ValueMapProperty which stores Float64 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueMapProperty
 * @alias property-properties.Float64MapProperty
 * @category Maps
 */
var Float64MapProperty = function( in_params) {
  ValueMapProperty.call( this, in_params );
};
Float64MapProperty.prototype = Object.create( ValueMapProperty.prototype );
Float64MapProperty.prototype._typeid = 'Float64';
Float64MapProperty.prototype._castFunctor = _castFunctors.Float64;

/**
 * A ValueMapProperty which stores Uint32 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueMapProperty
 * @alias property-properties.Uint32MapProperty
 * @category Maps
 */
var Uint32MapProperty = function( in_params) {
  ValueMapProperty.call( this, in_params );
};
Uint32MapProperty.prototype = Object.create( ValueMapProperty.prototype );
Uint32MapProperty.prototype._typeid = 'Uint32';
Uint32MapProperty.prototype._castFunctor = _castFunctors.Uint32;

/**
 * A ValueMapProperty which stores Uint16 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueMapProperty
 * @alias property-properties.Uint16MapProperty
 * @category Maps
 */
var Uint16MapProperty = function( in_params) {
  ValueMapProperty.call( this, in_params );
};
Uint16MapProperty.prototype = Object.create( ValueMapProperty.prototype );
Uint16MapProperty.prototype._typeid = 'Uint16';
Uint16MapProperty.prototype._castFunctor = _castFunctors.Uint16;

/**
 * A ValueMapProperty which stores Uint8 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueMapProperty
 * @alias property-properties.Uint8MapProperty
 * @category Maps
 */
var Uint8MapProperty = function( in_params) {
  ValueMapProperty.call( this, in_params );
};
Uint8MapProperty.prototype = Object.create( ValueMapProperty.prototype );
Uint8MapProperty.prototype._typeid = 'Uint8';
Uint8MapProperty.prototype._castFunctor = _castFunctors.Uint8;

/**
 * A ValueMapProperty which stores Int32 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueMapProperty
 * @alias property-properties.Int32MapProperty
 * @category Maps
 */
var Int32MapProperty = function( in_params) {
  ValueMapProperty.call( this, in_params );
};
Int32MapProperty.prototype = Object.create( ValueMapProperty.prototype );
Int32MapProperty.prototype._typeid = 'Int32';
Int32MapProperty.prototype._castFunctor = _castFunctors.Int32;

/**
 * An abstract base class for 64 bit integer map properties
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueMapProperty
 * @alias property-properties.Integer64MapProperty
 * @category Maps
 */
var Integer64MapProperty = function( in_params) {
  ValueMapProperty.call( this, in_params );
};
Integer64MapProperty.prototype = Object.create( ValueMapProperty.prototype );


/**
 * Sets the entry with the given key to the value passed in
 *
 * Note: this will overwrite an already existing value
 *
 * @param {string}                                  in_key    - The key under which the entry is stored
 * @param {Int64|Uint64|string|number}              in_value  - The value or property to store in the map
 */
Integer64MapProperty.prototype.set = function(in_key, in_value) {
  var castedValue = this._castFunctor ? this._castFunctor(in_value) : in_value;
  var myValue = this._entries[in_key];
  if (myValue === undefined) {
    this._insert(in_key, castedValue, true);
  } else if (myValue.getValueHigh() !== castedValue.getValueHigh() ||
      myValue.getValueLow() !== castedValue.getValueLow()) {
    this._removeByKey(in_key, false);
    this._insert(in_key, castedValue, false);
    // Make one final report
    this._reportDirtinessToView();
  }
};

/**
 * Function to serialize special primitive types.
 * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
 * special treatment on serialization. For supported types, we can just return the input here.
 *
 * @param {*} in_obj - The object to be serialized
 * @return {property-properties.SerializedChangeSet} the serialized object
 */
Integer64MapProperty.prototype._serializeValue = function(in_obj) {
  return [in_obj.getValueLow(), in_obj.getValueHigh()];
};

/**
 * @inheritdoc
 */
Integer64MapProperty.prototype._prettyPrintChildren = function(indent, printFct) {
  indent += '  ';
  var int64Prop;
  _.mapValues(this._entries, function(val, key) {
    // TODO: The 'toString()' function is defined on Integer64Property, so we need to create
    //       such object to use it. It would be better to have it in HfdmUtils Integer64.prototype.toString
    if (val instanceof Int64) {
      int64Prop = new Int64Property({});
    } else {
      int64Prop = new Uint64Property({});
    }
    int64Prop.setValueLow(val.getValueLow());
    int64Prop.setValueHigh(val.getValueHigh());
    printFct(indent + key + ': ' + int64Prop);
  });
};

/**
 * A ValueMapProperty which stores Int64 Properties
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends Integer64MapProperty
 * @alias property-properties.Int64MapProperty
 * @category Maps
 */
var Int64MapProperty = function( in_params) {
  Integer64MapProperty.call( this, in_params );
};
Int64MapProperty.prototype = Object.create( Integer64MapProperty.prototype );
Int64MapProperty.prototype._typeid = 'Int64';
Int64MapProperty.prototype._castFunctor = _castFunctors.Int64;

/**
 * Specialized function to deserialize Int64 primitive types.
 * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
 * special treatment on deserialization. For supported types, we can just return the input here.
 *
 * @param {property-properties.SerializedChangeSet} in_serializedObj - The object to be deserialized
 * @return {Int64} the deserialized value
 */
Int64MapProperty.prototype._deserializeValue = function(in_serializedObj) {
  return new Int64(in_serializedObj[0], in_serializedObj[1]);
};

/**
 * A ValueMapProperty which stores Uint64 Properties
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends Integer64MapProperty
 * @alias property-properties.Uint64MapProperty
 * @category Maps
 */
var Uint64MapProperty = function( in_params) {
  Integer64MapProperty.call( this, in_params );
};
Uint64MapProperty.prototype = Object.create( Integer64MapProperty.prototype );
Uint64MapProperty.prototype._typeid = 'Uint64';
Uint64MapProperty.prototype._castFunctor = _castFunctors.Uint64;

/**
 * Specialized function to deserialize Uint64 primitive types.
 * Some primitive types (e.g. Uint64, which is not natively supported by javascript) require
 * special treatment on deserialization. For supported types, we can just return the input here.
 *
 * @param {property-properties.SerializedChangeSet} in_serializedObj - The object to be deserialized
 * @return {Uint64} the deserialized value
 */
Uint64MapProperty.prototype._deserializeValue = function(in_serializedObj) {
  return new Uint64(in_serializedObj[0], in_serializedObj[1]);
};

/**
 * A ValueMapProperty which stores Int16 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueMapProperty
 * @alias property-properties.Int16MapProperty
 * @category Maps
 */
var Int16MapProperty = function( in_params) {
  ValueMapProperty.call( this, in_params );
};
Int16MapProperty.prototype = Object.create( ValueMapProperty.prototype );
Int16MapProperty.prototype._typeid = 'Int16';
Int16MapProperty.prototype._castFunctor = _castFunctors.Int16;

/**
 * A ValueMapProperty which stores Int8 values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueMapProperty
 * @alias property-properties.Int8MapProperty
 * @category Maps
 */
var Int8MapProperty = function( in_params) {
  ValueMapProperty.call( this, in_params );
};
Int8MapProperty.prototype = Object.create( ValueMapProperty.prototype );
Int8MapProperty.prototype._typeid = 'Int8';
Int8MapProperty.prototype._castFunctor = _castFunctors.Int8;

/**
 * A ValueMapProperty which stores string values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueMapProperty
 * @alias property-properties.StringMapProperty
 * @category Maps
 */
var StringMapProperty = function( in_params) {
  ValueMapProperty.call( this, in_params );
};
StringMapProperty.prototype = Object.create( ValueMapProperty.prototype );
StringMapProperty.prototype._typeid = 'String';
StringMapProperty.prototype._castFunctor = _castFunctors.String;

/**
 * A ValueMapProperty which stores boolean values
 *
 * @param {Object} in_params - Input parameters for property creation
 *
 * @constructor
 * @protected
 * @extends property-properties.ValueMapProperty
 * @alias property-properties.BoolMapProperty
 * @category Maps
 */
var BoolMapProperty = function( in_params) {
  ValueMapProperty.call( this, in_params );
};
BoolMapProperty.prototype = Object.create( ValueMapProperty.prototype );
BoolMapProperty.prototype._typeid = 'Bool';
BoolMapProperty.prototype._castFunctor = _castFunctors.Boolean;

module.exports = {
  'ValueMapProperty': ValueMapProperty,
  'Float64MapProperty': Float64MapProperty,
  'Float32MapProperty': Float32MapProperty,
  'Uint32MapProperty': Uint32MapProperty,
  'Uint16MapProperty': Uint16MapProperty,
  'Uint64MapProperty': Uint64MapProperty,
  'Uint8MapProperty': Uint8MapProperty,
  'Int32MapProperty': Int32MapProperty,
  'Int16MapProperty': Int16MapProperty,
  'Int64MapProperty': Int64MapProperty,
  'Int8MapProperty': Int8MapProperty,
  'StringMapProperty': StringMapProperty,
  'BoolMapProperty': BoolMapProperty
};
