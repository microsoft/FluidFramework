/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Definition of the Uint32Property class
 */

import { ValueProperty } from './valueProperty';
import { _castFunctors } from './primitiveTypeCasts';
import { IBasePropertyParams } from './baseProperty';

/**
 * A primitive property for an unsigned 8 bit integer value.
 */
export class Uint8Property extends ValueProperty {
    /**
     * @param in_params - the parameters
     */
    constructor(in_params: IBasePropertyParams) {
        super({ ...in_params, typeid: 'Uint8' });
        // default for this property type is '0'
        this._data = 0;
    };

    _castFunctor = _castFunctors.Uint8;
}

/**
 * A primitive property for an unsigned 16 bit integer value.
 */
export class Uint16Property extends ValueProperty {
    /**
     * @param in_params - the parameters
     */
    constructor(in_params: IBasePropertyParams) {
        super({ ...in_params, typeid: 'Uint16' });
        // default for this property type is '0'
        this._data = 0;
    };

    _castFunctor = _castFunctors.Uint16;
}

/**
 * A primitive property for an unsigned 32 bit integer value.
 */
export class Uint32Property extends ValueProperty {
    /**
     * @param in_params - the parameters
     */
    constructor(in_params: IBasePropertyParams) {
        super({ ...in_params, typeid: 'Uint32' });
        // default for this property type is '0'
        this._data = 0;
    };

    _castFunctor = _castFunctors.Uint32;
}
