/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Definition of the Float*Property classes
 */

const { ValueProperty } = require('./valueProperty');
const { _castFunctors } = require('./primitiveTypeCasts');

/**
 * A primitive property for a 32 bit floating point value.
 */
export class Float32Property extends ValueProperty {
    /**
     * @param {Object=} in_params - the parameters
     * @constructor
     * @protected
     * @extends property-properties.ValueProperty
     * @alias property-properties.Float32Property
     * @category Value Properties
     */
    constructor(in_params) {
        super({ ...in_params, typeid: 'Float32' });
        // default for this property type is '0'
        this._data = 0;
    };
    _castFunctor = _castFunctors.Float32;
}

/**
 * A primitive property for a 64 bit floating point value.
 */

export class Float64Property extends ValueProperty {
    /**
     * @param {Object=} in_params - the parameters
     * @constructor
     * @protected
     * @extends property-properties.ValueProperty
     * @alias property-properties.Float64Property
     * @category Value Properties
     */
    constructor(in_params) {
        super({ ...in_params, typeid: 'Float64' });
        // default for this property type is '0'
        this._data = 0;
    };

    _castFunctor = _castFunctors.Float64;
}
