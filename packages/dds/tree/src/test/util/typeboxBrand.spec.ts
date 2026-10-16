/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { Static } from "@sinclair/typebox";

import { extractJsonValidator } from "../../codec/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import {
	brandedIntegerType,
	brandedNumberType,
	type Brand,
	type areSafelyAssignable,
	type requireTrue,
} from "../../util/index.js";

describe("brandedIntegerType", () => {
	it("preserves the static brand and rejects non-integers", () => {
		type Id = Brand<number, "test.IntegerId">;
		const schema = brandedIntegerType<Id>();
		type _Brand = requireTrue<areSafelyAssignable<Static<typeof schema>, Id>>;
		const validator = extractJsonValidator(FormatValidatorBasic).compile(schema);

		for (const value of [-1, -0, 0, 1, Number.MAX_SAFE_INTEGER, 1e100]) {
			assert.equal(validator.check(value), true);
		}
		for (const value of [
			0.5,
			1e-11,
			1 - 1e-11,
			1 + 1e-11,
			-1 - 1e-11,
			Number.NaN,
			Infinity,
			-Infinity,
			"1",
			undefined,
		]) {
			assert.equal(validator.check(value), false);
		}
		assert.deepEqual(structuredClone(schema), { type: "integer" });
	});

	it("preserves numeric bounds", () => {
		const schema = brandedIntegerType({
			minimum: -1,
			maximum: Number.MAX_SAFE_INTEGER,
		});
		const validator = extractJsonValidator(FormatValidatorBasic).compile(schema);
		for (const value of [-1, 0, Number.MAX_SAFE_INTEGER]) {
			assert.equal(validator.check(value), true);
		}
		for (const value of [-2, Number.MAX_SAFE_INTEGER + 1]) {
			assert.equal(validator.check(value), false);
		}
		assert.deepEqual(structuredClone(schema), {
			type: "integer",
			minimum: -1,
			maximum: Number.MAX_SAFE_INTEGER,
		});
	});

	it("does not restrict general branded numbers to integers", () => {
		const validator = extractJsonValidator(FormatValidatorBasic).compile(brandedNumberType());
		assert.equal(validator.check(0.5), true);
	});
});
