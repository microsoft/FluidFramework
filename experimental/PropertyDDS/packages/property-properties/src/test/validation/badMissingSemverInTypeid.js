/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview
 * Test data for property set template semver testing
 */

/**
   * @namespace property-propertiesTest.Test
   * @alias bad_nested_properties.js
   * Namespace containing all schema-related data for property set validation
   */
var templateSchema = {
    'properties': [
        {
            'id': 'position',
            'properties': [
                {
                    'id': 'x',
                    'typeid': 'Float32'
                },
                {
                    'id': 'y',
                    'typeid': 'Float32'
                },
                {
                    'id': 'z',
                    'typeid': 'Float32'
                }
            ]
        },
        {
            'id': 'color',
            'typeid': 'TeamLeoValidation2:ColorID-1.0.0'
        },
        {
            'id': 'normal',
            'typeid': 'Float32',
            'context': 'array',
            'length': 3
        }
    ],
    'typeid': 'TeamLeoValidation2:PointID'
};

module.exports = templateSchema;
