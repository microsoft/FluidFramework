/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Definition of the BooleanProperty class
 */

const ValueProperty = require('./valueProperty');
const _castFunctors = require('./primitiveTypeCasts');

/**
 * A primitive property for a boolean value
 * @param {Object=} in_params - the parameters
 * @constructor
 * @protected
 * @extends property-properties.ValueProperty
 * @alias property-properties.BoolProperty
 * @category Value Properties
 */
var BoolProperty = function (in_params) {
    ValueProperty.call(this, in_params);
    // default for this property type is 'false'
    this._data = false;
};
BoolProperty.prototype = Object.create(ValueProperty.prototype);

BoolProperty.prototype._typeid = 'Bool';
BoolProperty.prototype._castFunctor = _castFunctors.Boolean;

module.exports = BoolProperty;
