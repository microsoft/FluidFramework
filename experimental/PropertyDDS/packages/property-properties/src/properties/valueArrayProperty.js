/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable new-cap */
/**
 * @fileoverview Definition of the valuearray property class
 */

const _ = require('lodash');
const { MSG } = require('@fluid-experimental/property-common').constants;
const {
    BaseDataArray,
    UniversalDataArray,
    BoolDataArray,
    Uint64,
    Int64,
} = require('@fluid-experimental/property-common');
const { Int64Property, Uint64Property } = require('../properties/intProperties');
const { _castFunctors } = require('./primitiveTypeCasts');
const { ArrayProperty } = require('./arrayProperty');

/**
 * An array property which stores primitive values
 */
export class ValueArrayProperty extends ArrayProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     * @constructor
     * @protected
     * @extends property-properties.ArrayProperty
     * @alias property-properties.ValueArrayProperty
     */
    constructor(in_params) {
        super(in_params, true);
    }

    /**
     * Returns the value at in_position for a primitive array
     * @param {number} in_position - The array index
     * @return {*} the value
     */
    _getValue(in_position) {
        return this._dataArrayRef.getValue(in_position);
    }

    /**
     * returns the array of primitive values.
     * @return {Array<*>} the array of values.
     * For example: ['string1', 'string2']
     */
    getValues() {
        var result = [];
        var ids = this.getIds();
        for (var i = 0; i < ids.length; i++) {
            result.push(this.get(ids[i]));
        }
        return result;
    }

    /**
     * Resolves a direct child node based on the given path segment
     *
     * @param {String} in_segment - The path segment to resolve
     * @param {property-properties.PathHelper.TOKEN_TYPES} in_segmentType - The type of segment in the tokenized path
     *
     * @return {property-properties.BaseProperty|undefined} The child property that has been resolved
     * @protected
     */
    _resolvePathSegment(in_segment, in_segmentType) {
        return this.get(in_segment);
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
        return in_obj;
    }

    /**
     * Function to serialize arrays of special primitive types.
     * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
     * special treatment on serialization. For supported types, we can just return the input here.
     *
     * @param {Array} in_array - The array of special objects to be serialized
     * @return {Array<property-properties.SerializedChangeSet>} the serialized object
     */
    _serializeArray(in_array) {
        return in_array;
    }

    /**
     * Function to deserialize arrays of special primitive types.
     * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
     * special treatment on deserialization. For supported types, we can just return the input here.
     *
     * @param {Array<property-properties.SerializedChangeSet>} in_serializedObj - The serialized object
     * @return {Array} in_array - The array of special objects that were deserialized
     */
    _deserializeArray(in_serializedObj) {
        return in_serializedObj;
    }
}
ValueArrayProperty.prototype._isPrimitive = true;

/**
 * An ArrayProperty which stores Float32 values
 */
export class Float32ArrayProperty extends ValueArrayProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueArrayProperty
     * @alias property-properties.Float32ArrayProperty
     * @category Arrays
     */
    constructor(in_params) {
        super(in_params);
    }

    /**
     * Creates and initializes the data array
     * @param {Number} in_length - The initial length of the array
     */
    _dataArrayCreate(in_length) {
        this._dataArrayRef = new BaseDataArray(Float32Array, in_length);
    }
}
Float32ArrayProperty.prototype._typeid = 'Float32';

/**
 * An ArrayProperty which stores Float64 values
 */
export class Float64ArrayProperty extends ValueArrayProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueArrayProperty
     * @alias property-properties.Float64ArrayProperty
     * @category Arrays
     */
    constructor(in_params) {
        super(in_params);
    }

    /**
     * Creates and initializes the data array
     * @param {Number} in_length - The initial length of the array
     */
    _dataArrayCreate(in_length) {
        this._dataArrayRef = new BaseDataArray(Float64Array, in_length);
    }
}
Float64ArrayProperty.prototype._typeid = 'Float64';

/**
 * An ArrayProperty which stores Uint8 values
 */
export class Uint8ArrayProperty extends ValueArrayProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueArrayProperty
     * @alias property-properties.Uint8ArrayProperty
     * @category Arrays
     */
    constructor(in_params) {
        super(in_params);
    }

    /**
     * Creates and initializes the data array
     * @param {Number} in_length - The initial length of the array
     */
    _dataArrayCreate(in_length) {
        this._dataArrayRef = new BaseDataArray(Uint8Array, in_length);
    }
}
Uint8ArrayProperty.prototype._typeid = 'Uint8';

/**
 * An ArrayProperty which stores Int8 values
 *
*/
export class Int8ArrayProperty extends ValueArrayProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueArrayProperty
     * @alias property-properties.Int8ArrayProperty
     * @category Arrays
     */
    constructor(in_params) {
        super(in_params);
    }

    /**
     * Creates and initializes the data array
     * @param {Number} in_length - The initial length of the array
     */
    _dataArrayCreate(in_length) {
        this._dataArrayRef = new BaseDataArray(Int8Array, in_length);
    }
}
Int8ArrayProperty.prototype._typeid = 'Int8';

/**
 * An ArrayProperty which stores Uint16 values
 */
export class Uint16ArrayProperty extends ValueArrayProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueArrayProperty
     * @alias property-properties.Uint16ArrayProperty
     * @category Arrays
     */
    constructor(in_params) {
        super(in_params);
    }

    /**
     * Creates and initializes the data array
     * @param {Number} in_length - The initial length of the array
     */
    _dataArrayCreate(in_length) {
        this._dataArrayRef = new BaseDataArray(Uint16Array, in_length);
    }
}
Uint16ArrayProperty.prototype._typeid = 'Uint16';

/**
 * An ArrayProperty which stores Int16 values
 */
export class Int16ArrayProperty extends ValueArrayProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueArrayProperty
     * @alias property-properties.Int16ArrayProperty
     * @category Arrays
     */
    constructor(in_params) {
        super(in_params);
    }

    /**
     * Creates and initializes the data array
     * @param {Number} in_length - The initial length of the array
     */
    _dataArrayCreate(in_length) {
        this._dataArrayRef = new BaseDataArray(Int16Array, in_length);
    }
}
Int16ArrayProperty.prototype._typeid = 'Int16';

/**
 * An ArrayProperty which stores Uint32 values
 */
export class Uint32ArrayProperty extends ValueArrayProperty {
    /** @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueArrayProperty
     * @alias property-properties.Uint32ArrayProperty
     * @category Arrays
     */
    constructor(in_params) {
        super(in_params);
    }

    /**
     * Creates and initializes the data array
     * @param {Number} in_length - The initial length of the array
     */
    _dataArrayCreate(in_length) {
        this._dataArrayRef = new BaseDataArray(Uint32Array, in_length);
    }
}
Uint32ArrayProperty.prototype._typeid = 'Uint32';

/**
 * An ArrayProperty which stores Int32 values
 */
export class Int32ArrayProperty extends ValueArrayProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueArrayProperty
     * @alias property-properties.Int32ArrayProperty
     * @category Arrays
     */
    constructor(in_params) {
        super(in_params);
    }

    /**
     * Creates and initializes the data array
     * @param {Number} in_length - The initial length of the array
     */
    _dataArrayCreate(in_length) {
        this._dataArrayRef = new BaseDataArray(Int32Array, in_length);
    }
}
Int32ArrayProperty.prototype._typeid = 'Int32';

/**
 * An ArrayProperty which stores Int64 values
 */
export class Integer64ArrayProperty extends ValueArrayProperty {
    /** @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueArrayProperty
     * @alias property-properties.Integer64ArrayProperty
     * @category Arrays
     */
    constructor(in_params) {
        super(in_params);
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
        if (in_obj instanceof Int64 || in_obj instanceof Uint64) {
            return [in_obj.getValueLow(), in_obj.getValueHigh()];
        }
        return in_obj;
    }

    /**
     * Function to serialize arrays of special primitive types.
     * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
     * special treatment on serialization. For supported types, we can just return the input here.
     *
     * @param {Array} in_array - The array of special objects to be serialized
     * @return {Array<property-properties.SerializedChangeSet>} the serialized object
     */
    _serializeArray(in_array) {
        var result = [];
        for (var i = 0; i < in_array.length; i++) {
            result.push(this._serializeValue(in_array[i]));
        }
        return result;
    }

    /**
     * Function to deserialize arrays of special primitive types.
     * Some primitive types (e.g. Int64, which is not natively supported by javascript) require
     * special treatment on deserialization. For supported types, we can just return the input here.
     *
     * @param {Array<property-properties.SerializedChangeSet>} in_serializedObj - The serialized object
     * @return {Array} in_array - The array of special objects that were deserialized
     */
    _deserializeArray(in_serializedObj) {
        var result = [];
        for (var i = 0; i < in_serializedObj.length; i++) {
            result.push(this._deserializeValue(in_serializedObj[i]));
        }
        return result;
    }

    /**
     * @inheritdoc
     */
    _prettyPrint(indent, externalId, printFct) {
        printFct(indent + externalId + this.getId() + ' (Array of ' + this.getTypeid() + '): [');
        var childIndent = indent + '  ';
        var int64Prop;
        for (var i = 0; i < this._dataArrayGetLength(); i++) {
            // TODO: The 'toString()' function is defined on Integer64Property, so we need to create
            // such object to use it. It would be better to have it in Integer64.prototype.toString
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
    }
}
/**
 * An ArrayProperty which stores Int64 values
 */
export class Int64ArrayProperty extends Integer64ArrayProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.Integer64ArrayProperty
     * @alias property-properties.Int64ArrayProperty
     * @category Arrays
     */
    constructor(in_params) {
        super(in_params);
    }

    /**
     * Sets the array properties elements to the content of the given array
     * All changed elements must already exist. This will overwrite existing elements.
     * @param {number} in_offset - Target start index
     * @param {Array<*>|Array<property-properties.BaseProperty>} in_array - contains the elements to be set
     * @throws if in_offset is not a number
     * @throws if in_offset is smaller than zero or higher than the length of the array
     */
    setRange(in_offset, in_array) {
        if (!_.isArray(in_array)) {
            throw new TypeError(MSG.IN_ARRAY_NOT_ARRAY + 'Int64ArrayProperty.setRange');
        }
        var out_array = in_array.map((element) => {
            return _castFunctors.Int64(element);
        });
        ArrayProperty.prototype.setRange.call(this, in_offset, out_array);
    }

    /**
     * Inserts the content of a given array into the array property
     * It will not overwrite the existing values but push them to the right instead.
     * E.g. [1, 2, 3] .insertRange(1, [9, 8]) => [1, 9, 8, 2, 3]
     * @param {number} in_offset - Target index
     * @param {Array<*>} in_array - The array to be inserted
     * @throws if in_offset is smaller than zero, larger than the length of the array or not a number.
     * @throws if trying to insert a property that already has a parent.
     * @throws if tyring to modify a referenced property.
     */
    insertRange(in_offset, in_array) {
        var out_array = in_array.map((element) => {
            return _castFunctors.Int64(element);
        });
        ArrayProperty.prototype.insertRange.call(this, in_offset, out_array);
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

    /**
     * Creates and initializes the data array
     * @param {Number} in_length - The initial length of the array
     */
    _dataArrayCreate(in_length) {
        this._dataArrayRef = new UniversalDataArray(in_length);
        for (var i = 0; i < in_length; i++) {
            this._dataArraySetValue(i, new Int64());
        }
    }
}
Int64ArrayProperty.prototype._typeid = 'Int64';

/**
 * An ArrayProperty which stores Uint64 values
 */
export class Uint64ArrayProperty extends Integer64ArrayProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.Integer64ArrayProperty
     * @alias property-properties.Uint64ArrayProperty
     * @category Arrays
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

    /**
     * Sets the array properties elements to the content of the given array
     * All changed elements must already exist. This will overwrite existing elements.
     * @param {number} in_offset - Target start index
     * @param {Array<*>|Array<property-properties.BaseProperty>} in_array - contains the elements to be set
     * @throws if in_offset is not a number
     * @throws if in_offset is smaller than zero or higher than the length of the array
     */
    setRange(in_offset, in_array) {
        if (!_.isArray(in_array)) {
            throw new TypeError(MSG.IN_ARRAY_NOT_ARRAY + 'Uint64ArrayProperty.setRange');
        }
        var out_array = in_array.map((element) => {
            return _castFunctors.Uint64(element);
        });
        ArrayProperty.prototype.setRange.call(this, in_offset, out_array);
    }

    /**
     * Inserts the content of a given array into the array property
     * It will not overwrite the existing values but push them to the right instead.
     * E.g. [1, 2, 3] .insertRange(1, [9, 8]) => [1, 9, 8, 2, 3]
     * @param {number} in_offset - Target index
     * @param {Array<*>} in_array - The array to be inserted
     * @throws if in_offset is smaller than zero, larger than the length of the array or not a number.
     * @throws if trying to insert a property that already has a parent.
     * @throws if tyring to modify a referenced property.
     */
    insertRange(in_offset, in_array) {
        var out_array = in_array.map((element) => {
            return _castFunctors.Uint64(element);
        });
        ArrayProperty.prototype.insertRange.call(this, in_offset, out_array);
    }

    /**
     * Creates and initializes the data array
     * @param {Number} in_length - The initial length of the array
     */
    _dataArrayCreate(in_length) {
        this._dataArrayRef = new UniversalDataArray(in_length);
        for (var i = 0; i < in_length; i++) {
            this._dataArraySetValue(i, new Uint64());
        }
    }
}
Uint64ArrayProperty.prototype._typeid = 'Uint64';

/**
 * An ArrayProperty which stores String values
 */
export class StringArrayProperty extends ValueArrayProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueArrayProperty
     * @alias property-properties.StringArrayProperty
     * @category Arrays
     */
    constructor(in_params) {
        super(in_params);
    }

    /**
     * Creates and initializes the data array
     * @param {Number} in_length - The initial length of the array
     */
    _dataArrayCreate(in_length) {
        this._dataArrayRef = new UniversalDataArray(in_length);
        for (var i = 0; i < in_length; i++) {
            this._dataArraySetValue(i, '');
        }
    }
}
StringArrayProperty.prototype._typeid = 'String';

/**
 * An ArrayProperty which stores Boolean values
 */
export class BoolArrayProperty extends ValueArrayProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     *
     * @constructor
     * @protected
     * @extends property-properties.ValueArrayProperty
     * @alias property-properties.BoolArrayProperty
     * @category Arrays
     */
    constructor(in_params) {
        super(in_params, Array, true);
    }

    /**
     * Creates and initializes the data array
     * @param {Number} in_length - The initial length of the array
     */
    _dataArrayCreate(in_length) {
        this._dataArrayRef = new BoolDataArray(in_length);
        for (var i = 0; i < in_length; i++) {
            this._dataArraySetValue(i, false);
        }
    }
}
BoolArrayProperty.prototype._typeid = 'Bool';
