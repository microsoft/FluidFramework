/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Definition of the BooleanProperty class
 */

const { ValueProperty } = require('./valueProperty');
const { _castFunctors } = require('./primitiveTypeCasts');

/**
 * A primitive property for a boolean value
 */
export class BoolProperty extends ValueProperty {
    /**
     * @param in_params - the parameters
     */
    constructor(in_params) {
        super(in_params);
        // default for this property type is 'false'
        this._data = false;
    }
}

BoolProperty.prototype._typeid = 'Bool';
BoolProperty.prototype._castFunctor = _castFunctors.Boolean;
