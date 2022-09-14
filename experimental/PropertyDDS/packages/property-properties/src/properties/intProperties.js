/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable new-cap */
/**
 * @fileoverview Definition of the Int*Property classes
 */

const _ = require('lodash');
const { ChangeSet } = require('@fluid-experimental/property-changeset');
const {
    ConsoleUtils,
    constants: { MSG },
    Uint64,
    Int64,
} = require('@fluid-experimental/property-common');
const { ValueProperty } = require('./valueProperty');
const { _castFunctors } = require('./primitiveTypeCasts');

const BIT32 = 4294967296;

export class Int8Property extends ValueProperty {
    /**
     * A primitive property for an signed 8 bit integer value.
     * @param {Object=} in_params - the parameters
     * @constructor
     * @protected
     * @extends property-properties.ValueProperty
     * @alias property-properties.Int8Property
     * @category Value Properties
     */
    constructor(in_params) {
        super(in_params);
        // default for this property type is '0'
        this._data = 0;
    }
}
Int8Property.prototype._typeid = 'Int8';
Int8Property.prototype._castFunctor = _castFunctors.Int8;

/**
 * A primitive property for an signed 16 bit integer value.
 */
export class Int16Property extends ValueProperty {
    /**
     * @param {Object=} in_params - the parameters
     * @constructor
     * @protected
     * @extends property-properties.ValueProperty
     * @alias property-properties.Int16Property
     * @category Value Properties
     */
    constructor(in_params) {
        super(in_params);
        // default for this property type is '0'
        this._data = 0;
    }
}
Int16Property.prototype._typeid = 'Int16';
Int16Property.prototype._castFunctor = _castFunctors.Int16;

/**
 * A primitive property for an signed 32 bit integer value.
 */
export class Int32Property extends ValueProperty {
    /**
     * @param {Object=} in_params - the parameters
     * @constructor
     * @protected
     * @extends property-properties.ValueProperty
     * @alias property-properties.Int32Property
     * @category Value Properties
     */
    constructor(in_params) {
        super(in_params);
        // default for this property type is '0'
        this._data = 0;
    }
}
Int32Property.prototype._typeid = 'Int32';
Int32Property.prototype._castFunctor = _castFunctors.Int32;

/**
 * A primitive property base class for big integer values.
 */
export class Integer64Property extends ValueProperty {
    /**
     * @param {Object=} in_params - the parameters
     * @constructor
     * @protected
     * @extends property-properties.ValueProperty
     * @alias property-properties.Integer64Property
     * @abstract
     * @category Value Properties
     */
    constructor(in_params, dataConstructor) {
        super(in_params);
        this.DataConstructor = dataConstructor;
        // default for this property type is '0, 0'
        this._data = new this.DataConstructor();
    }

    /**
     * Internal function to update the value of the Integer64Property
     *
     * @param {Int64|String|Number} in_value - The new value
     * @param {boolean} [in_reportToView = true] - By default, the dirtying will always be reported to the checkout view
     * and trigger a modified event there. When batching updates, this can be prevented via this flag.
     * @return {boolean} true if the value was actually changed
     * @throws If in_value is a string that contains characters other than numbers
     */
    _setValue(in_value, in_reportToView) {
        var oldLowValue = this._data.getValueLow();
        var oldHighValue = this._data.getValueHigh();

        in_value = this._castFunctor(in_value);

        var newHighValue = in_value.getValueHigh();
        var newLowValue = in_value.getValueLow();

        var changed = oldHighValue !== newHighValue || oldLowValue !== newLowValue;

        if (changed) {
            this._data = in_value.clone();
            this._setDirty(in_reportToView);
        }
        return changed;
    }

    /**
     * @return {number} the higher 32 bit integer part
     */
    getValueHigh() {
        return this._data.getValueHigh();
    }

    /**
     * @return {number} the lower 32 bit integer part
     */
    getValueLow() {
        return this._data.getValueLow();
    }

    /**
     * @param {number} in_high - Set the higher 32 bit integer part
     * @throws If in_high is not a number
     * @return {boolean} true if the value was actually changed
     */
    setValueHigh(in_high) {
        ConsoleUtils.assert(_.isNumber(in_high), MSG.IN_HIGH_MUST_BE_NUMBER + in_high);
        var changed = this._data.getValueHigh() !== in_high;

        if (changed) {
            var newData = new this.DataConstructor(this.getValueLow(), in_high);
            this._data = newData;
            this._setDirty();
        }
        return changed;
    }

    /**
     * @param {number} in_low - Set the lower 32 bit integer part
     * @throws If in_low is not a number
     * @return {boolean} true if the value was actually changed
     */
    setValueLow(in_low) {
        ConsoleUtils.assert(_.isNumber(in_low), MSG.IN_LOW_MUST_BE_NUMBER + in_low);
        var changed = this._data.getValueLow() !== in_low;

        if (changed) {
            var newData = new this.DataConstructor(in_low, this.getValueHigh());
            this._data = newData;
            this._setDirty();
        }
        return changed;
    }

    /**
     * @inheritdoc
     */
    _deserialize(in_serializedObj, in_reportToView,
                 in_filteringOptions, in_createChangeSet) {
        if (ChangeSet.isEmptyChangeSet(in_serializedObj)) {
            return undefined;
        } else {
            ConsoleUtils.assert(_.isArray(in_serializedObj) && in_serializedObj.length === 2, MSG.INVALID_INT64_CHANGESET);
            var readValue = new this.DataConstructor(in_serializedObj[0], in_serializedObj[1]);
            var changed = this._setValue(readValue, in_reportToView);
            return changed ? this.serialize() : undefined;
        }
    }

    /**
     * @inheritdoc
     */
    _applyChangeset(in_changeSet, in_reportToView, in_filteringOptions) {
        if (!ChangeSet.isEmptyChangeSet(in_changeSet)) {
            if (!_.isArray(in_changeSet)) {
                in_changeSet = in_changeSet.value;
            }
            ConsoleUtils.assert(_.isArray(in_changeSet) && in_changeSet.length === 2, MSG.INVALID_INT64_CHANGESET);
            var newVal = new this.DataConstructor(in_changeSet[0], in_changeSet[1]);
            this._setValue(newVal, in_reportToView);
        }
    }

    /**
     * Serialize the property
     *
     * @param {boolean} in_dirtyOnly -
     *     Only include dirty entries in the serialization
     * @param {boolean} in_includeRootTypeid -
     *     Include the typeid of the root of the hierarchy - has no effect for value properties
     * @param {property-properties.BaseProperty.MODIFIED_STATE_FLAGS} [in_dirtinessType] -
     *     The type of dirtiness to use when reporting dirty changes. By default this is
     *     PENDING_CHANGE   * @return {*} The serialized representation of this property
     * @param {boolean} [in_includeReferencedRepositories=false] - If this is set to true, the serialize
     *     function will descend into referenced repositories. WARNING: if there are loops in the references
     *     this can result in an infinite loop
     * @return {*} The serialized representation of this property
     * @private
     */
    _serialize(in_dirtyOnly, in_includeRootTypeid,
        in_dirtinessType, in_includeReferencedRepositories) {
        if (in_dirtyOnly) {
            if (this._isDirty(in_dirtinessType)) {
                return [this._data.getValueLow(), this._data.getValueHigh()];
            } else {
                return {};
            }
        } else {
            return [this._data.getValueLow(), this._data.getValueHigh()];
        }
    }

    /**
     * The toString() method returns a string representing the specified Integer64 object.
     *
     * @param {number} [in_radix = 10] - An integer between 2 and 36 specifying
     *      the base to use for representing numeric values.
     * @return {string} A string representing the specified Integer64 object.
     */
    toString(in_radix) {
        return this._data.toString(in_radix);
    }

    /**
     * The Integer64.fromString() method parses a string argument updates object's lower and higher 32 bit integer parts.
     *
     * @param {string} in_string - The value to parse. Leading whitespace in the string argument is ignored.
     * @param {number} [in_radix = 10] - An integer between 2 and 36 that represents the
     * radix (the base in mathematical numeral systems) of the above mentioned string.
     * @throws if in_string is not a string
     * @throws if in_radix is entered but is not a number between 2 and 36
     * @throws if the property is a Uint64 property and in_string is a negative number
     * @throws if in_string contains characters other than numbers
     */
    fromString(in_string, in_radix) {
        ConsoleUtils.assert(_.isString(in_string), MSG.IN_STRING_MUST_BE_STRING + in_string);
        var int = this._castFunctor(in_string, in_radix);

        this.setValueHigh(int.getValueHigh());
        this.setValueLow(int.getValueLow());
    }
}

/**
 * A primitive property class for big signed integer values.
 */
export class Int64Property extends Integer64Property {
    /**
     * @param {Object=} in_params - the parameters
     * @constructor
     * @protected
     * @extends property-properties.Integer64Property
     * @alias property-properties.Int64Property
     * @category Value Properties
     */
    constructor(in_params) {
        super(in_params, Int64);
    }
}
Int64Property.prototype._typeid = 'Int64';
Int64Property.prototype._castFunctor = _castFunctors.Int64;

/**
 * A primitive property class for big unsingned integer values.
 */
export class Uint64Property extends Integer64Property {
    /**
     * @param {Object=} in_params - the parameters
     * @constructor
     * @protected
     * @extends property-properties.Integer64Property
     * @alias property-properties.Uint64Property
     * @category Value Properties
     */
    constructor(in_params) {
        super(in_params, Uint64);
    }
}
Uint64Property.prototype._typeid = 'Uint64';
Uint64Property.prototype._castFunctor = _castFunctors.Uint64;
