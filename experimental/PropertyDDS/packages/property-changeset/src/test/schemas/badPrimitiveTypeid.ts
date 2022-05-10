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
                'typeid': 'Flob32',
            },
        ],
        'typeid': 'TeamLeoValidation2:ColorID-1.0.0',
    };
    module.exports = templateSchema;
})();
