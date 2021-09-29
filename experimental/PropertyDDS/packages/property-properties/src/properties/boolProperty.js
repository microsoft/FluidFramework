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
     * @param {Object=} in_params - the parameters
     * @constructor
     * @protected
     * @extends property-properties.ValueProperty
     * @alias property-properties.BoolProperty
     * @category Value Properties
     */
    constructor(in_params) {
        super({ typeid: 'Bool', ...in_params });
        // default for this property type is 'false'
        this._data = false;
    };

    _castFunctor = _castFunctors.Boolean;

}



