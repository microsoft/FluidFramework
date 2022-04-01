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
        'typeid': 'Adsk.Core:UI.Border-1.0.0',
        'properties': [{
                'id': 'lineType',
                'typeid': 'Enum',
                'properties': [
                    { 'id': 'solid', 'value': 200, 'annotation': { 'description': 'solid line' } },
                    { 'id': 'dashed', 'value': 100, 'annotation': { 'description': 'dashed line' } },
                    { 'id': 'dotted', 'value': 300, 'annotation': { 'description': 'dotted line' } },
                ],
            },
            {
                'id': 'style',
                'properties': [{
                    'id': 'thickness',
                    'typeid': 'Uint32',
                    'annotation': {
                        'description': 'border thickness in Pixels',
                    },
                    'unit': 'Adsk.Core:Units.Imaging-1.0.0',
                }],
            },
        ],
    };
    module.exports = templateSchema;
})();
