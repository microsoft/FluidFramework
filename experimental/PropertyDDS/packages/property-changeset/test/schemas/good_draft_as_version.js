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
   * @alias good_draft_as_version.js
   * Namespace containing all schema-related data for property set validation
   */
  var templateSchema = {
    'typeid': 'autodesk:GoodDraftAsVersion-draft',
    'properties': [
      { 'id': 'int', 'typeid': 'Int32'}
    ]
  };
  module.exports = templateSchema;
})();
