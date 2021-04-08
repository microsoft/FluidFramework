/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview
 * Test data for property set template schema testing
 */
(function() {
  /**
   * @namespace FORGE.HFDMSchemaValidator.Test
   * @alias bad_both_properties_and_typeid.js
   * Namespace containing all schema-related data for property set validation
   */
  var templateSchema = {
    'properties':
    [
      {
        'id': 'r',
        'typeid': 'Float32',
        'properties': [
          {'typeid': 'Int32', 'id': 'ri'}
        ]
      }
    ],
    'typeid': 'TeamLeoValidation2:ColorID-1.0.0'
  };
  module.exports = templateSchema;
})();
