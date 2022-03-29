/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview
 * Test data for property set template schema testing
 */
(function() {
    /**
     * @namespace property-changeset.Test
     * @alias badNestedProperties.js
     * Namespace containing all schema-related data for property set validation
     */
    var templateSchema = {
        'typeid': 'Adsk.Library:Colors.ColorPalette-1.0.0',
        'properties': [
            { 'id': 'colorsRef', 'typeid': 'Reference<Adsk.Core:Math.Color-1.0.0>', 'context': 'map' },
            { 'id': 'colors', 'typeid': 'Adsk.Core:Math.Color-1.0.0' },
            { 'id': 'testref', 'typeid': 'Reference', 'context': 'map' },
        ],
    };
    module.exports = templateSchema;
})();
