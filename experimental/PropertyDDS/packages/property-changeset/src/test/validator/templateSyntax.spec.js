/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview In this file, we will test template syntax.
 */

(function() {
    describe("Simple Template Validation", function() {
        const SchemaValidator = require("../schemaValidator");
        const schemaValidator = new SchemaValidator();

        it("should validate a simple file", function() {
            const testFile1 = require("../schemas/goodPointId");

            const result = schemaValidator.validate(testFile1);

            expect(result.errors.length).to.equal(0);
            expect(result.unresolvedTypes.length).to.be.greaterThan(0);
        });

        it("should fail a file with a bad versioned typeid in it", function() {
            const testFile2 = require("../schemas/badVersionedTypeid");
            const result = schemaValidator.validate(testFile2);

            expect(result.isValid).to.equal(false);
            expect(result.errors.length).to.equal(1);
        });

        it("should fail a file with a bad primitive typeid in it", function() {
            const testFile2 = require("../schemas/badPrimitiveTypeid");
            const result = schemaValidator.validate(testFile2);

            expect(result.isValid).to.equal(false);
            expect(result.errors.length).to.be.greaterThan(0);
        });

        it("should fail when both properties and typeid/id are specified", function() {
            const testFile3 = require("../schemas/badBothPropertiesAndTypeid");
            const result = schemaValidator.validate(testFile3);

            expect(result.isValid).to.equal(false);
            expect(result.errors.length).to.be.greaterThan(0);
        });

        it("Should permit declaration of enums inline", function() {
            const testFile4 = require("../schemas/goodUIBorder");
            const result = schemaValidator.validate(testFile4);

            expect(result.isValid).to.equal(true);
            expect(result.errors.length).to.equal(0);
            expect(result.unresolvedTypes.length).to.equal(0); // Only simple types
        });

        it("Should support both kinds of reference types", function() {
            const testFile5 = require("../schemas/goodColorPalette");
            const result = schemaValidator.validate(testFile5);

            expect(result.isValid).to.equal(true);
            expect(result.errors.length).to.equal(0);
            expect(result.unresolvedTypes.length).to.be.greaterThan(0);
        });

        it("Should find errors down in nested types", function() {
            const testFile6 = require("../schemas/badNestedProperties");
            const result = schemaValidator.validate(testFile6);

            expect(result.isValid).to.equal(false);
            expect(result.errors.length).to.be.greaterThan(0);
            expect(result.unresolvedTypes.length).to.equal(2);
        });

        it("Should extract typeids from references", function() {
            const testFile7 = require("../schemas/goodReferenceAndRegular");
            const result = schemaValidator.validate(testFile7);

            expect(result.isValid).to.equal(true);
            expect(result.errors.length).to.equal(0);
            expect(result.unresolvedTypes.length).to.equal(1);
        });

        it("should validate a typeid with reserved type Ids", function() {
            const testFile8 = require("../schemas/goodReservedTypes");
            const result = schemaValidator.validate(testFile8);

            expect(result.isValid).to.equal(true);
            expect(result.errors.length).to.equal(0);
            expect(result.unresolvedTypes.length).to.be.greaterThan(0);
        });

        it("should validate a typeid with draft as version", function() {
            const testFile9 = require("../schemas/goodDraftAsVersion");
            const result = schemaValidator.validate(testFile9, testFile9, false, true, true);

            expect(result.isValid).to.equal(true);
            expect(result.errors.length).to.equal(0);
            expect(result.unresolvedTypes.length).to.be.equal(0);
        });

        it("should validate a typeid with draft as version", function() {
            const testFile9 = require("../schemas/goodDraftAsVersion");
            const result = schemaValidator.validate(testFile9, testFile9, false, true, false);

            expect(result.isValid).to.equal(false);
            expect(result.errors.length).to.equal(1);
            expect(result.unresolvedTypes.length).to.be.equal(0);
        });
    });
})();
