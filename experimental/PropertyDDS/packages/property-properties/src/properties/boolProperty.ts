/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Definition of the BooleanProperty class
 */

import { ValueProperty } from './valueProperty';
import { _castFunctors } from './primitiveTypeCasts';

/**
 * A primitive property for a boolean value
 */
export class BoolProperty extends ValueProperty<Boolean> {

    /**
     * @param in_params - the parameters
     */
    constructor(in_params) {
        super({ ...in_params, typeid: 'Bool' });
        // default for this property type is 'false'
        this._data = false;
    };

    _castFunctor = _castFunctors.Boolean;

}



