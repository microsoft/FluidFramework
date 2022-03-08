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
        'properties': [{
                'id': 'r',
                'typeid': 'Float32',
            },
            {
                'id': 'g',
                'typeid': 'Float32',
            },
            {
                'id': 'b',
                'typeid': 'Float32',
            },
            {
                'id': 'nest',
                'properties': [
                    { 'id': 'x', 'typeid': 'Float32' },
                    { 'id': 'y', 'typeid': 'Float32' },
                    { 'id': 'reftype', 'typeid': 'Reference<NS.NS2:Core.Adsk.RefType-1.0.0>' },
                    {
                        'id': 'nestedAgain',
                        'properties': [
                            { 'id': 'a', 'typeid': 'Int32' },
                            { 'id': 'b', 'typeid': 'Flob' },
                        ],
                    },
                ],
            },
        ],
        'typeid': 'TeamLeoValidation2:NestedTest-1.0.0',
    };
    module.exports = templateSchema;
})();
