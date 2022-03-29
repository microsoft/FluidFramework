/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const { MSG } = require('@fluid-experimental/property-common').constants;
const { TypeIdHelper } = require('@fluid-experimental/property-changeset');
const { BaseDataArray } = require('@fluid-experimental/property-common');
const _ = require('lodash');
const { ValueArrayProperty } = require('./valueArrayProperty');

/**
 * This class is a specialized version of the ArrayProperty for enums.
 * Since we internally represent enums as Int32Array this is much more
 * efficient and convenient. Additionally, we provide direct access
 * methods to the enums in the array, e.g. .getEnumString(3) directly
 * returns the enum string at position 3 of the array
 */
export class EnumArrayProperty extends ValueArrayProperty {
    /**
     * @param {Object}  in_params - the parameters
     * @param {Number=} [in_params.length=0] the length of the array, if applicable
     * @param {Object}  in_params._enumDictionary the value<->enum dictonary needed to convert the values
     * @constructor
     * @protected
     * @extends property-properties.ValueArrayProperty
     * @alias property-properties.EnumArrayProperty
     * @category Arrays
     */
    constructor(in_params) {
        super(in_params);
        // whenever an EnumProperty is created by the PropertyFactory, we get a
        // dictonary [value->enum] and [enum->value] to efficiently lookup
        // values/enums for the property.
        this._enumDictionary = in_params._enumDictionary;
    }

    /**
     * Since an enum can be identified by its value and its enum string,
     * we have to check/convert the type here. We also check if a value
     * is suitable for this enum type.
     * @param {number|string} in_value value to be checked/converted
     * @return {number} internal value for this enum type
     */
    _convertEnumToInternalValue(in_value) {
        // check if we've got a string
        if (_.isString(in_value)) {
            var internalEnum = this._enumDictionary.enumEntriesById[in_value];
            if (!internalEnum) {
                throw new Error(MSG.UNKNOWN_ENUM + in_value);
            }
            return internalEnum.value;
        } else {
            if (!this._enumDictionary.enumEntriesByValue[in_value]) {
                throw new Error(MSG.UNKNOWN_ENUM + in_value);
            } else {
                return in_value;
            }
        }
    }

    /**
     * inserts the content of a given array into the array property
     * @param {number} in_offset target index
     * @param {Array<*>} in_array the array to be inserted
     * @throws if in_array is not an array
     * @throws if in_position is not a number
     * @throws if a value to be inserted is an instance of BaseProperty
     * @throws if tyring to modify a referenced property.
     */
    insertRange(in_offset, in_array) {
        if (!_.isNumber(in_offset)) {
            throw new Error(MSG.NOT_NUMBER + 'in_offset, method: EnumArray.insertRange or .insert');
        }
        if (!_.isArray(in_array)) {
            throw new Error(MSG.IN_ARRAY_NOT_ARRAY + 'EnumArrayProperty.insertRange');
        }

        var internalValueArray = [];
        var that = this;
        _.each(in_array, function(element) {
            internalValueArray.push(that._convertEnumToInternalValue(element));
        });
        ValueArrayProperty.prototype.insertRange.call(this, in_offset, internalValueArray);
    }

    /**
     * Sets the content of an enum in an enum array
     * @param {number} in_index target index
     * @param {*} in_value the value to set
     * @throws if in_value is not a string or number
     * @throws if in_index is either smaller than zero, larger than the length of the array or not a number.
     */
    set(in_index, in_value) {
        if (!_.isNumber(in_value) && !_.isString(in_value)) {
            throw new Error(MSG.VALUE_STRING_OR_NUMBER + in_value);
        }
        this.setRange(in_index, [in_value]);
    }

    /**
     * Sets the content of an enum in an enum array. Alternative syntax to .set()
     * @param {number} in_index target index
     * @param {*} in_value the value to set
     * @throws if in_value is not a string or number
     * @throws if in_index is either smaller than zero, larger than the length of the array or not a number.
     */
    setEnumByString(in_index, in_value) {
        this.set(in_index, in_value);
    }

    /**
     * sets the array properties elements to the content of the given array
     * all changed elements must already exist
     * @param {number} in_offset target start index
     * @param {Array<*>} in_array contains the elements to be set
     * @throws if in_offset is not a number
     * @throws if in_array is not an array
     *
     */
    setRange(in_offset, in_array) {
        if (!_.isNumber(in_offset)) {
            throw new Error(MSG.NOT_NUMBER + 'in_offset, method: EnumArray.setRange or .set');
        }
        if (!_.isArray(in_array)) {
            throw new Error(MSG.IN_ARRAY_NOT_ARRAY + 'EnumArrayProperty.setRange');
        }

        var internalValueArray = [];
        var that = this;
        _.each(in_array, function(element) {
            internalValueArray.push(that._convertEnumToInternalValue(element));
        });
        ValueArrayProperty.prototype.setRange.call(this, in_offset, internalValueArray);
    }

    /**
     * get the array element at a given index
     * @param {number} in_position the target index
     * @throws if no entry exists at in_position
     * @return {string} the enum string at that index
     */
    getEnumString(in_position) {
        var internalValue = this._dataArrayRef.getValue(in_position);
        var resultEntry = this._enumDictionary.enumEntriesByValue[internalValue];
        if (!resultEntry) {
            throw new Error(MSG.UNKNOWN_ENUM + internalValue);
        } else {
            return resultEntry.id;
        }
    }

    /**
     * get an array of the enum strings starting at a given index
     * @param {number} in_offset the start index
     * @param {number} in_length how many should be read
     * @throws if in_offset or in_length are not numbers
     * @throws if no entry exists at one of the positions
     * @return {Array<string>} the enum strings we asked for
     */
    getEnumStrings(in_offset, in_length) {
        if (!_.isNumber(in_offset)) {
            throw new Error(MSG.NOT_NUMBER + 'in_offset, method: EnumArray.getEnumStrings');
        }
        if (!_.isNumber(in_length)) {
            throw new Error(MSG.NOT_NUMBER + 'in_length, method: EnumArray.getEnumStrings');
        }

        var result = [];
        for (var i = 0; i < in_length; i++) {
            result.push(this.getEnumString(i + in_offset));
        }
        return result;
    }

    /**
     * Returns the full property type identifier for the ChangeSet including the enum type id
     * @param  {boolean} [in_hideCollection=false] - if true the collection type (if applicable) will be omitted
     * @return {string} The typeid
     */
    getFullTypeid(in_hideCollection = false) {
        if (in_hideCollection) {
            return TypeIdHelper.createSerializationTypeId(this._typeid, '', true);
        } else {
            return TypeIdHelper.createSerializationTypeId(this._typeid, 'array', true);
        }
    }

    /**
     * @inheritdoc
     */
    getValues() {
        var result = [];
        for (var i = 0; i < this._dataArrayRef.length; i++) {
            var child = this._dataArrayRef.getValue(i);
            result.push(child);
        }
        return result;
    }

    /**
     * Creates and initializes the data array
     * @param {Number} in_length      the initial length of the array
     */
    _dataArrayCreate(in_length) {
        this._dataArrayRef = new BaseDataArray(Int32Array, in_length);
    }

    /**
     * let the user to query all valid entries of an enum array property
     * @return {{}} all valid (string) entries and their (int) values
     */
    getValidEnumList() {
        return this._enumDictionary.enumEntriesById;
    }
}
EnumArrayProperty.prototype._typeid = 'Enum';
