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
     * @alias goodDraftAsVersion.js
     * Namespace containing all schema-related data for property set validation
     */
    var templateSchema = {
        'typeid': 'autodesk:GoodDraftAsVersion-draft',
        'properties': [
            { 'id': 'int', 'typeid': 'Int32' },
        ],
    };
    module.exports = templateSchema;
})();
