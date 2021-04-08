/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview In this file, we will test template syntax.
 */

(function() {
  describe('Simple Template Validation', function() {
    const SchemaValidator = require('../schema_validator');
    const schemaValidator = new SchemaValidator();

    it('should validate a simple file', function() {
      var testFile1 = require('../schemas/good_point_id');

      var result = schemaValidator.validate(testFile1);

      expect(result.errors.length).to.equal(0);
      expect(result.unresolvedTypes.length).to.be.greaterThan(0);
    });

    it('should fail a file with a bad versioned typeid in it', function() {
      var testFile2 = require('../schemas/bad_versioned_typeid');
      var result = schemaValidator.validate(testFile2);

      expect(result.isValid).to.equal(false);
      expect(result.errors.length).to.equal(1);
    });

    it('should fail a file with a bad primitive typeid in it', function() {
      var testFile2 = require('../schemas/bad_primitive_typeid');
      var result = schemaValidator.validate(testFile2);

      expect(result.isValid).to.equal(false);
      expect(result.errors.length).to.be.greaterThan(0);
    });

    it('should fail when both properties and typeid/id are specified', function() {
      var testFile3 = require('../schemas/bad_both_properties_and_typeid');
      var result = schemaValidator.validate(testFile3);

      expect(result.isValid).to.equal(false);
      expect(result.errors.length).to.be.greaterThan(0);
    });

    it('Should permit declaration of enums inline', function() {
      var testFile4 = require('../schemas/good_ui_border');
      var result = schemaValidator.validate(testFile4);

      expect(result.isValid).to.equal(true);
      expect(result.errors.length).to.equal(0);
      expect(result.unresolvedTypes.length).to.equal(0); // Only simple types
    });

    it('Should support both kinds of reference types', function() {
      var testFile5 = require('../schemas/good_color_palette');
      var result = schemaValidator.validate(testFile5);

      expect(result.isValid).to.equal(true);
      expect(result.errors.length).to.equal(0);
      expect(result.unresolvedTypes.length).to.be.greaterThan(0);
    });

    it('Should find errors down in nested types', function() {
      var testFile6 = require('../schemas/bad_nested_properties');
      var result = schemaValidator.validate(testFile6);

      expect(result.isValid).to.equal(false);
      expect(result.errors.length).to.be.greaterThan(0);
      expect(result.unresolvedTypes.length).to.equal(2);
    });

    it('Should extract typeids from references', function() {
      var testFile7 = require('../schemas/good_reference_and_regular');
      var result = schemaValidator.validate(testFile7);

      expect(result.isValid).to.equal(true);
      expect(result.errors.length).to.equal(0);
      expect(result.unresolvedTypes.length).to.equal(1);
    });

    it('should validate a typeid with reserved type Ids', function() {
      var testFile8 = require('../schemas/good_reserved_types');
      var result = schemaValidator.validate(testFile8);

      expect(result.isValid).to.equal(true);
      expect(result.errors.length).to.equal(0);
      expect(result.unresolvedTypes.length).to.be.greaterThan(0);
    });

    it('should validate a typeid with draft as version', function() {
      var testFile9 = require('../schemas/good_draft_as_version');
      var result = schemaValidator.validate(testFile9, testFile9, false, true, true);

      expect(result.isValid).to.equal(true);
      expect(result.errors.length).to.equal(0);
      expect(result.unresolvedTypes.length).to.be.equal(0);
    });

    it('should validate a typeid with draft as version', function() {
      var testFile9 = require('../schemas/good_draft_as_version');
      var result = schemaValidator.validate(testFile9, testFile9, false, true, false);

      expect(result.isValid).to.equal(false);
      expect(result.errors.length).to.equal(1);
      expect(result.unresolvedTypes.length).to.be.equal(0);
    });
  });
})();
