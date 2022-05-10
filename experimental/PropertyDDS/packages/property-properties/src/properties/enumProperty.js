/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Definition of the EnumProperty classes
 */

const { TypeIdHelper } = require('@fluid-experimental/property-changeset');
const { MSG } = require('@fluid-experimental/property-common').constants;
const { ConsoleUtils } = require('@fluid-experimental/property-common');
const _ = require('lodash');
const { Int32Property } = require('./intProperties');
const { _castFunctors } = require('./primitiveTypeCasts');
const { ValueProperty } = require('./valueProperty');

/**
 * A primitive property for enums.
 */
export class EnumProperty extends Int32Property {
    /**
    * @param {Object=} in_params - the parameters
    * @constructor
    * @protected
    * @extends property-properties.Int32Property
    * @alias property-properties.EnumProperty
    * @category Value Properties
    */
    constructor(in_params) {
        super({ typeid: 'Enum', ...in_params });
        // whenever an EnumProperty is created by the PropertyFactory, we get a
        // dictionary [value->enum] and [enum->value] to efficiently lookup
        // values/enums for the property.
        this._enumDictionary = in_params._enumDictionary;
        // default for this property type is '0' if it exists to keep backward compatibility
        this._data = this._enumDictionary ? this._enumDictionary.defaultValue : 0;
    }

    /**
     * Evaluates enum properties as primitives.
     * @return {boolean} true since Enum properties are primitives.
     */
    isPrimitiveType() {
        return true;
    }

    /**
     * Returns the current enum string
     * @return {string} the string value of the property
     * @throws if no entry exists
     */
    getEnumString() {
        var resultEntry = this._enumDictionary.enumEntriesByValue[this._data];
        if (!resultEntry) {
            throw new Error(MSG.UNKNOWN_ENUM + this._data);
        } else {
            return resultEntry.id;
        }
    }

    /**
     * Sets the (internal, integer) value of the property
     *
     * @param {Number|string} in_value the new integer value - it must be a valid enum integer for this property
     *                                 or
     *                                 the new enum value in form of a valid enum string for this EnumProperty
     * @throws if no entry exists for in_value
     *
     */
    setValue(in_value) {
        this._checkIsNotReadOnly(true);

        // check if we've got a string
        if (_.isString(in_value)) {
            this.setEnumByString(in_value);
        } else if (!this._enumDictionary.enumEntriesByValue[in_value]) {
            throw new Error(MSG.UNKNOWN_ENUM + in_value);
        } else {
            ValueProperty.prototype.setValue.call(this, in_value);
        }
    }

    /**
     * Sets the property by an enum string
     *
     * @param {string} in_stringId the enum string we want to switch to
     * @throws if in_stringId is not a string
     * @throws if no entry is found for in_stringId
     */
    setEnumByString(in_stringId) {
        ConsoleUtils.assert(_.isString(in_stringId), MSG.STRING_ID_MUST_BE_STRING + in_stringId);
        var internalEnum = this._enumDictionary.enumEntriesById[in_stringId];
        if (!internalEnum) {
            throw new Error(MSG.UNKNOWN_ENUM + in_stringId);
        } else {
            var internalValue = internalEnum.value;
            this.setValue(internalValue);
        }
    }

    /**
     * Returns the full property type identifier for the ChangeSet including the enum type id
     * @param  {boolean} [in_hideCollection=false] - if true the collection type (if applicable) will be omitted
     *                since that is not aplicable here, this param is ignored
     * @return {string} The typeid
     */
    getFullTypeid(in_hideCollection = false) {
        return TypeIdHelper.createSerializationTypeId(this._typeid, 'single', true);
    }

    /**
     * let the user to query all valid entries of an enum
     * @return {{}} all valid (string) entries and their (int) values
     */
    getValidEnumList() {
        return this._enumDictionary.enumEntriesById;
    }
}
EnumProperty.prototype._typeid = 'Enum';
EnumProperty.prototype._castFunctor = _castFunctors.Int32;
