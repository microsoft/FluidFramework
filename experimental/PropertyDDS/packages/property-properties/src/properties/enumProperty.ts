/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Definition of the EnumProperty classes
 */

import _ from 'lodash';
import { TypeIdHelper } from '@fluid-experimental/property-changeset';
import { constants } from '@fluid-experimental/property-common';
import { ConsoleUtils } from '@fluid-experimental/property-common';
import { Int32Property } from './intProperties';
import { _castFunctors } from './primitiveTypeCasts';
import { ValueProperty } from './valueProperty';
import { IBasePropertyParams } from './baseProperty';

const { MSG } = constants;

type EnumValue = {
    id: string,
    value: number
}

type EnumDictionary = {
    defaultValue: number
    enumEntriesByValue: Record<number, EnumValue>
    enumEntriesById: Record<string, EnumValue>
}

export interface IEnumPropertyParams extends IBasePropertyParams {
    _enumDictionary: EnumDictionary
}

/**
 * A primitive property for enums.
 */
export class EnumProperty extends Int32Property {
    _enumDictionary: EnumDictionary;

    constructor(in_params: IEnumPropertyParams) {
        super({ typeid: 'Enum', ...in_params });
        // whenever an EnumProperty is created by the PropertyFactory, we get a
        // dictionary [value->enum] and [enum->value] to efficiently lookup
        // values/enums for the property.
        this._enumDictionary = in_params._enumDictionary;
        // default for this property type is '0' if it exists to keep backward compatibility
        this._data = this._enumDictionary ? this._enumDictionary.defaultValue : 0;
    };

    _castFunctor = _castFunctors.Int32;

    /**
     * Evaluates enum properties as primitives.
     * @returns true since Enum properties are primitives.
     */
    isPrimitiveType(): boolean {
        return true;
    };

    /**
     * Returns the current enum string
     * @returns the string value of the property
     * @throws if no entry exists
     */
    getEnumString(): string {
        const resultEntry = this._enumDictionary.enumEntriesByValue[this._data];
        if (!resultEntry) {
            throw new Error(MSG.UNKNOWN_ENUM + this._data);
        } else {
            return resultEntry.id;
        }
    };

    /**
     * Sets the (internal, integer) value of the property
     *
     * @param in_value - the new integer value - it must be a valid enum integer for this property
     *                                 or
     *                                 the new enum value in form of a valid enum string for this EnumProperty
     * @throws if no entry exists for in_value
     *
     */
    setValue(in_value: number | string) {
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
     * @param in_stringId - the enum string we want to switch to
     * @throws if in_stringId is not a string
     * @throws if no entry is found for in_stringId
     */
    setEnumByString(in_stringId: string) {
        ConsoleUtils.assert(_.isString(in_stringId), MSG.STRING_ID_MUST_BE_STRING + in_stringId);
        const internalEnum = this._enumDictionary.enumEntriesById[in_stringId];
        if (!internalEnum) {
            throw new Error(MSG.UNKNOWN_ENUM + in_stringId);
        } else {
            const internalValue = internalEnum.value;
            this.setValue(internalValue);
        }
    };

    /**
     * Returns the full property type identifier for the ChangeSet including the enum type id
     * @param in_hideCollection - if true the collection type (if applicable) will be omitted
     *                since that is not applicable here, this param is ignored
     * @returns The typeid
     */
    getFullTypeid(in_hideCollection = false): string {
        return TypeIdHelper.createSerializationTypeId(this._typeid, 'single', true);
    };

    /**
     * let the user to query all valid entries of an enum
     * @returns all valid (string) entries and their (int) values
     */
    getValidEnumList() {
        return this._enumDictionary.enumEntriesById;
    };
}
