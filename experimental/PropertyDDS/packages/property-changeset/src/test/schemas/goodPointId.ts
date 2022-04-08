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
                'id': 'position',
                'properties': [{
                        'id': 'x',
                        'typeid': 'Float32',
                    },
                    {
                        'id': 'y',
                        'typeid': 'Float32',
                    },
                    {
                        'id': 'z',
                        'typeid': 'Float32',
                    },
                ],
            },
            {
                'id': 'color',
                'typeid': 'TeamLeoValidation2:ColorID-1.0.0',
            },
            {
                'id': 'normal',
                'typeid': 'Float32',
                'context': 'array',
                'length': 3,
            },
        ],
        'typeid': 'TeamLeoValidation2:PointID-1.0.0',
    };
    module.exports = templateSchema;
})();
