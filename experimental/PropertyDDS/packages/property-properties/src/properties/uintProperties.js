/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Definition of the Uint32Property class
 */

const { ValueProperty } = require('./valueProperty');
const { _castFunctors } = require('./primitiveTypeCasts');

/**
 * A primitive property for an unsigned 8 bit integer value.
 */
export class Uint8Property extends ValueProperty {
    /**
     * @param {Object=} in_params - the parameters
     * @constructor
     * @private
     * @extends property-properties.ValueProperty
     * @alias property-properties.Uint8Property
     * @category Value Properties
     */
    constructor(in_params) {
        super({  typeid: 'Uint8', ...in_params });
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
     * @param {Object=} in_params - the parameters
     * @constructor
     * @private
     * @extends property-properties.ValueProperty
     * @alias property-properties.Uint16Property
     * @category Value Properties
     */
    constructor(in_params) {
        super({  typeid: 'Uint16', ...in_params });
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
     * @param {Object=} in_params - the parameters
     * @constructor
     * @protected
     * @extends property-properties.ValueProperty
     * @alias property-properties.Uint32Property
     * @category Value Properties
     */
    constructor(in_params) {
        super({  typeid: 'Uint32', ...in_params });
        // default for this property type is '0'
        this._data = 0;
    };

    _castFunctor = _castFunctors.Uint32;
}
