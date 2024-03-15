/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview In this file, we will test template syntax.
 */

import { expect } from "chai";
import { SchemaValidator } from "../schemaValidator.js";
// Good or bad none of the templateSchema in these imports actually conform to
// PropertySchema type. Perhaps the type is inaccurate. Common incompatibilities
// are missing properties of `context` and `values`.
import {
	badBothPropertiesAndTypeid,
	badNestedProperties,
	badPrimitiveTypeid,
	badVersionedTypeid,
	goodColorPalette,
	goodDraftAsVersion,
	goodPointId,
	goodReferenceAndRegular,
	goodReservedTypes,
	goodUIBorder,
} from "../schemas/index.js";
import type { PropertySchema } from "../../templateValidator.js";

(function () {
	describe("Simple Template Validation", function () {
		const schemaValidator = new SchemaValidator();

		it("should validate a simple file", function () {
			const result = schemaValidator.validate(
				goodPointId.templateSchema as unknown as PropertySchema,
			);

			expect(result.errors.length).to.equal(0);
			expect(result.unresolvedTypes.length).to.be.greaterThan(0);
		});

		it("should fail a file with a bad versioned typeid in it", function () {
			const result = schemaValidator.validate(
				badVersionedTypeid.templateSchema as unknown as PropertySchema,
			);

			expect(result.isValid).to.equal(false);
			expect(result.errors.length).to.equal(1);
		});

		it("should fail a file with a bad primitive typeid in it", function () {
			const result = schemaValidator.validate(
				badPrimitiveTypeid.templateSchema as unknown as PropertySchema,
			);

			expect(result.isValid).to.equal(false);
			expect(result.errors.length).to.be.greaterThan(0);
		});

		it("should fail when both properties and typeid/id are specified", async function () {
			const result = schemaValidator.validate(
				badBothPropertiesAndTypeid.templateSchema as unknown as PropertySchema,
			);

			expect(result.isValid).to.equal(false);
			expect(result.errors.length).to.be.greaterThan(0);
		});

		it("Should permit declaration of enums inline", function () {
			const result = schemaValidator.validate(
				goodUIBorder.templateSchema as unknown as PropertySchema,
			);

			expect(result.isValid).to.equal(true);
			expect(result.errors.length).to.equal(0);
			expect(result.unresolvedTypes.length).to.equal(0); // Only simple types
		});

		it("Should support both kinds of reference types", function () {
			const result = schemaValidator.validate(
				goodColorPalette.templateSchema as unknown as PropertySchema,
			);

			expect(result.isValid).to.equal(true);
			expect(result.errors.length).to.equal(0);
			expect(result.unresolvedTypes.length).to.be.greaterThan(0);
		});

		it("Should find errors down in nested types", function () {
			const result = schemaValidator.validate(
				badNestedProperties.templateSchema as unknown as PropertySchema,
			);

			expect(result.isValid).to.equal(false);
			expect(result.errors.length).to.be.greaterThan(0);
			expect(result.unresolvedTypes.length).to.equal(2);
		});

		it("Should extract typeids from references", function () {
			const result = schemaValidator.validate(
				goodReferenceAndRegular.templateSchema as unknown as PropertySchema,
			);

			expect(result.isValid).to.equal(true);
			expect(result.errors.length).to.equal(0);
			expect(result.unresolvedTypes.length).to.equal(1);
		});

		it("should validate a typeid with reserved type Ids", function () {
			const result = schemaValidator.validate(
				goodReservedTypes.templateSchema as unknown as PropertySchema,
			);

			expect(result.isValid).to.equal(true);
			expect(result.errors.length).to.equal(0);
			expect(result.unresolvedTypes.length).to.be.greaterThan(0);
		});

		it("should validate a typeid with draft as version", async function () {
			const testFile9 = goodDraftAsVersion.templateSchema;
			const result = schemaValidator.validate(
				testFile9 as PropertySchema,
				testFile9 as PropertySchema,
				false,
				true,
				true,
			);

			expect(result.isValid).to.equal(true);
			expect(result.errors.length).to.equal(0);
			expect(result.unresolvedTypes.length).to.be.equal(0);
		});

		it("should validate a typeid with draft as version", function () {
			const testFile9 = goodDraftAsVersion.templateSchema;
			const result = schemaValidator.validate(
				testFile9 as PropertySchema,
				testFile9 as PropertySchema,
				false,
				true,
				false,
			);

			expect(result.isValid).to.equal(false);
			expect(result.errors.length).to.equal(1);
			expect(result.unresolvedTypes.length).to.be.equal(0);
		});
	});
})();
