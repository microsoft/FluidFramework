/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview
 * Test data for property set template schema testing
 * Tests reserved types: NamedProperty and NodeProperty
 */
(function() {
    /**
     * @namespace property-changeset.Test
     * @alias goodReservedTypes.js
     * Namespace containing all schema-related data for property set validation
     */
    var templateSchema = {
        'typeid': 'TeamLeoValidation2:Example-1.0.0',
        'inherits': 'NamedProperty',
        'properties': [{
                'id': 'exampleProperty1',
                'typeid': 'String',
            },
            {
                'id': 'exampleProperty2',
                'typeid': 'NodeProperty',
            },
        ],
    };
    module.exports = templateSchema;
})();
