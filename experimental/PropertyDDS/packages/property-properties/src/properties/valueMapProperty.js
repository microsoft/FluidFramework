/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Definition of the valuemap property class
 */

const _ = require('lodash');
const { MSG } = require('@fluid-experimental/property-common').constants;
const { Int64, Uint64 } = require('@fluid-experimental/property-common');
const { Int64Property, Uint64Property } = require('../properties/intProperties');
const { validationsEnabled } = require('../enableValidations');
const { _castFunctors } = require('./primitiveTypeCasts');
const { BaseProperty } = require('./baseProperty');
const { MapProperty } = require('./mapProperty');

/**
 * A ValueMapProperty is a collection class that can contain an dictionary that maps from strings to primitive types.
 */
export class ValueMapProperty extends MapProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.MapProperty
     * @alias property-properties.ValueMapProperty
     * @category Maps
     */
    constructor(in_params) {
        super(in_params);
    }

    /**
     * Inserts a value into the map. Using insert with a key that already exists will throw an error.
     *
     * @param {string}                      in_key      - The key under which the entry is added
     * @param {*}       in_value    - The primitive type value to set
     * @throws if a value already exists for in_key
     */
    insert(in_key, in_value) {
        var castedValue = this._castFunctor ? this._castFunctor(in_value) : in_value;
        this._insert(in_key, castedValue, true);
    }

    /**
     * Returns an object with all the nested values contained in this property
     * @return {object} an object representing the values of your property
     * for example: {
          'firstString': 'test1',
          'secondString': 'test2'
        }
      */
    getValues() {
        var ids = this.getIds();
        var result = {};
        for (var i = 0; i < ids.length; i++) {
            result[ids[i]] = this.get(ids[i]);
        }
        return result;
    }

    /**
     * Return a JSON representation of the map and its items.
     * @return {object} A JSON representation of the map and its items.
     * @private
     */
    _toJson() {
        return {
            id: this.getId(),
            context: this._context,
            typeid: this.getTypeid(),
            isConstant: this._isConstant,
            value: this.getValues(),
        };
    }

    /**
     * Repeatedly calls back the given function with human-readable string
     * representations of the property's sub-properties.
     * @param {string} indent - Leading spaces to create the tree representation
     * @param {function} printFct - Function to call for printing each property
     */
    _prettyPrintChildren(indent, printFct) {
        indent += '  ';
        var prefix = '';
        var suffix = '';
        if (this.getTypeid() === 'String') {
            prefix = '"';
            suffix = '"';
        }
        _.mapValues(this._dynamicChildren, function(val, key) {
            printFct(indent + key + ': ' + prefix + val + suffix);
        });
    }

    /**
     * Sets the value of a property into the map.
     *
     * @param {string} in_key the key under which the entry is set
     * @param {*} in_value the value to be set
     */
    set(in_key, in_value) {
        if (validationsEnabled.enabled) {
            this._checkIsNotReadOnly(true);
        }
            var castedValue = this._castFunctor ? this._castFunctor(in_value) : in_value;
        if (this._dynamicChildren[in_key] !== castedValue) {
            if (validationsEnabled.enabled) {
                this._checkIsNotReadOnly(true);
            }
            if (this._dynamicChildren[in_key] !== undefined) {
                this._removeByKey(in_key, false);
            }
            this._insert(in_key, castedValue, false);
            // Make one final report
            this._reportDirtinessToView();
        }
    }

    _getValue(in_key) {
        return this._dynamicChildren[in_key];
    }

    /**
     * @inheritdoc
     */
    _reapplyDirtyFlags(in_pendingChangeSet, in_dirtyChangeSet) {
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
                if (this._dynamicChildren[keys[i]] !== undefined) {
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
                if (this._dynamicChildren[key] !== undefined) {
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
    }
}
// The value map contains primitive types
ValueMapProperty.prototype._containsPrimitiveTypes = true;

/**
 * A ValueMapProperty which stores Float32 values
 */
export class Float32MapProperty extends ValueMapProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueMapProperty
     * @alias property-properties.Float32MapProperty
     * @category Maps
     */
    constructor(in_params) {
        super(in_params);
    }
}
Float32MapProperty.prototype._typeid = 'Float32';
Float32MapProperty.prototype._castFunctor = _castFunctors.Float32;

/**
 * A ValueMapProperty which stores Float64 values
 */
export class Float64MapProperty extends ValueMapProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueMapProperty
     * @alias property-properties.Float64MapProperty
     * @category Maps
     */
    constructor(in_params) {
        super(in_params);
    }
}
Float64MapProperty.prototype._typeid = 'Float64';
Float64MapProperty.prototype._castFunctor = _castFunctors.Float64;

/**
 * A ValueMapProperty which stores Uint32 values
 */
export class Uint32MapProperty extends ValueMapProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueMapProperty
     * @alias property-properties.Uint32MapProperty
     * @category Maps
     */
    constructor(in_params) {
        super(in_params);
    }
}
Uint32MapProperty.prototype._typeid = 'Uint32';
Uint32MapProperty.prototype._castFunctor = _castFunctors.Uint32;

/**
 * A ValueMapProperty which stores Uint16 values
 */
export class Uint16MapProperty extends ValueMapProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueMapProperty
     * @alias property-properties.Uint16MapProperty
     * @category Maps
     */
    constructor(in_params) {
        super(in_params);
    }
}
Uint16MapProperty.prototype._typeid = 'Uint16';
Uint16MapProperty.prototype._castFunctor = _castFunctors.Uint16;

/**
 * A ValueMapProperty which stores Uint8 values
 */
export class Uint8MapProperty extends ValueMapProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueMapProperty
     * @alias property-properties.Uint8MapProperty
     * @category Maps
     */
    constructor(in_params) {
        super(in_params);
    }
}
Uint8MapProperty.prototype._typeid = 'Uint8';
Uint8MapProperty.prototype._castFunctor = _castFunctors.Uint8;

/**
 * A ValueMapProperty which stores Int32 values
 */
export class Int32MapProperty extends ValueMapProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueMapProperty
     * @alias property-properties.Int32MapProperty
     * @category Maps
     */
    constructor(in_params) {
        super(in_params);
    }
}
Int32MapProperty.prototype._typeid = 'Int32';
Int32MapProperty.prototype._castFunctor = _castFunctors.Int32;

/**
 * An abstract base class for 64 bit integer map properties
 */
export class Integer64MapProperty extends ValueMapProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueMapProperty
     * @alias property-properties.Integer64MapProperty
     * @category Maps
     */
    constructor(in_params) {
        super(in_params);
    }

    /**
     * Sets the entry with the given key to the value passed in
     *
     * Note: this will overwrite an already existing value
     *
     * @param {string}                                  in_key    - The key under which the entry is stored
     * @param {Int64|Uint64|string|number}              in_value  - The value or property to store in the map
     */
    set(in_key, in_value) {
        var castedValue = this._castFunctor ? this._castFunctor(in_value) : in_value;
        var myValue = this._dynamicChildren[in_key];
        if (myValue === undefined) {
            this._insert(in_key, castedValue, true);
        } else if (myValue.getValueHigh() !== castedValue.getValueHigh() ||
            myValue.getValueLow() !== castedValue.getValueLow()) {
            this._removeByKey(in_key, false);
            this._insert(in_key, castedValue, false);
            // Make one final report
            this._reportDirtinessToView();
        }
    }

    /**
     * Function to serialize special primitive types.
     * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
     * special treatment on serialization. For supported types, we can just return the input here.
     *
     * @param {*} in_obj - The object to be serialized
     * @return {property-properties.SerializedChangeSet} the serialized object
     */
    _serializeValue(in_obj) {
        return [in_obj.getValueLow(), in_obj.getValueHigh()];
    }

    /**
     * @inheritdoc
     */
    _prettyPrintChildren(indent, printFct) {
        indent += '  ';
        var int64Prop;
        _.mapValues(this._dynamicChildren, function(val, key) {
            // TODO: The 'toString()' function is defined on Integer64Property, so we need to create
            //       such object to use it. It would be better to have it in Utils Integer64.prototype.toString
            if (val instanceof Int64) {
                int64Prop = new Int64Property({});
            } else {
                int64Prop = new Uint64Property({});
            }
            int64Prop.setValueLow(val.getValueLow());
            int64Prop.setValueHigh(val.getValueHigh());
            printFct(indent + key + ': ' + int64Prop);
        });
    }
}

/**
 * A ValueMapProperty which stores Int64 Properties
 */
export class Int64MapProperty extends Integer64MapProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends Integer64MapProperty
     * @alias property-properties.Int64MapProperty
     * @category Maps
     */
    constructor(in_params) {
        super(in_params);
    }

    /**
     * Specialized function to deserialize Int64 primitive types.
     * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
     * special treatment on deserialization. For supported types, we can just return the input here.
     *
     * @param {property-properties.SerializedChangeSet} in_serializedObj - The object to be deserialized
     * @return {Int64} the deserialized value
     */
    _deserializeValue(in_serializedObj) {
        return new Int64(in_serializedObj[0], in_serializedObj[1]);
    }
}
Int64MapProperty.prototype._typeid = 'Int64';
Int64MapProperty.prototype._castFunctor = _castFunctors.Int64;

/**
 * A ValueMapProperty which stores Uint64 Properties
 */
export class Uint64MapProperty extends Integer64MapProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends Integer64MapProperty
     * @alias property-properties.Uint64MapProperty
     * @category Maps
     */
    constructor(in_params) {
        super(in_params);
    }

    /**
     * Specialized function to deserialize Uint64 primitive types.
     * Some primitive types (e.g. Uint64, which is not natively supported by javascript) require
     * special treatment on deserialization. For supported types, we can just return the input here.
     *
     * @param {property-properties.SerializedChangeSet} in_serializedObj - The object to be deserialized
     * @return {Uint64} the deserialized value
     */
    _deserializeValue(in_serializedObj) {
        return new Uint64(in_serializedObj[0], in_serializedObj[1]);
    }
}
Uint64MapProperty.prototype._typeid = 'Uint64';
Uint64MapProperty.prototype._castFunctor = _castFunctors.Uint64;

/**
 * A ValueMapProperty which stores Int16 values
 */
export class Int16MapProperty extends ValueMapProperty {
    /** @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueMapProperty
     * @alias property-properties.Int16MapProperty
     * @category Maps
     */
    constructor(in_params) {
        super(in_params);
    }
}
Int16MapProperty.prototype._typeid = 'Int16';
Int16MapProperty.prototype._castFunctor = _castFunctors.Int16;

/**
 * A ValueMapProperty which stores Int8 values
 */
export class Int8MapProperty extends ValueMapProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueMapProperty
     * @alias property-properties.Int8MapProperty
     * @category Maps
     */
    constructor(in_params) {
        super(in_params);
    }
}
Int8MapProperty.prototype._typeid = 'Int8';
Int8MapProperty.prototype._castFunctor = _castFunctors.Int8;

/**
 * A ValueMapProperty which stores string values
 */
export class StringMapProperty extends ValueMapProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueMapProperty
     * @alias property-properties.StringMapProperty
     * @category Maps
     */
    constructor(in_params) {
        super(in_params);
    }
}
StringMapProperty.prototype._typeid = 'String';
StringMapProperty.prototype._castFunctor = _castFunctors.String;

/**
 * A ValueMapProperty which stores boolean values
 */
export class BoolMapProperty extends ValueMapProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueMapProperty
     * @alias property-properties.BoolMapProperty
     * @category Maps
     */
    constructor(in_params) {
        super(in_params);
    }
}
BoolMapProperty.prototype._typeid = 'Bool';
BoolMapProperty.prototype._castFunctor = _castFunctors.Boolean;
