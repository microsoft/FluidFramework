/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import {
	validateIndex,
	validateIndexRange,
	validatePositiveIndex,
	validateSafeInteger,
} from "../../util/index.js";

describe("arrayUtilities unit tests", () => {
	it("validateSafeInteger", () => {
		assert.doesNotThrow(() => validateSafeInteger(0, "test"));
		assert.doesNotThrow(() => validateSafeInteger(-0, "test"));
		assert.doesNotThrow(() => validateSafeInteger(1, "test"));
		assert.doesNotThrow(() => validateSafeInteger(-1, "test"));
		assert.doesNotThrow(() => validateSafeInteger(Number.MAX_SAFE_INTEGER, "test"));
		assert.doesNotThrow(() => validateSafeInteger(Number.MIN_SAFE_INTEGER, "test"));

		assert.throws(
			() => validateSafeInteger(1.5, "test"),
			validateUsageError(/Expected a safe integer passed to test, got 1.5/),
		);
		assert.throws(
			() => validateSafeInteger(Number.MAX_SAFE_INTEGER + 1, "test"),
			validateUsageError(/Expected a safe integer passed to test, got 9007199254740992/),
		);
		assert.throws(
			() => validateSafeInteger(Number.MIN_SAFE_INTEGER - 1, "test"),
			validateUsageError(/Expected a safe integer passed to test, got -9007199254740992/),
		);
		assert.throws(
			() => validateSafeInteger(Number.NaN, "test"),
			validateUsageError(/Expected a safe integer passed to test, got NaN/),
		);
		assert.throws(
			() => validateSafeInteger(Number.POSITIVE_INFINITY, "test"),
			validateUsageError(/Expected a safe integer passed to test, got Infinity/),
		);
		assert.throws(
			() => validateSafeInteger(Number.NEGATIVE_INFINITY, "test"),
			validateUsageError(/Expected a safe integer passed to test, got -Infinity/),
		);
	});

	it("validatePositiveIndex", () => {
		assert.doesNotThrow(() => validatePositiveIndex(0, "test"));
		assert.doesNotThrow(() => validatePositiveIndex(-0, "test"));
		assert.doesNotThrow(() => validatePositiveIndex(1, "test"));
		assert.doesNotThrow(() => validatePositiveIndex(Number.MAX_SAFE_INTEGER, "test"));

		assert.throws(
			() => validatePositiveIndex(-1, "test"),
			/Expected non-negative index passed to test, got -1/,
		);
		assert.throws(
			() => validatePositiveIndex(Number.MIN_SAFE_INTEGER, "test"),
			/Expected non-negative index passed to test, got -9007199254740991/,
		);

		assert.throws(
			() => validatePositiveIndex(1.5, "test"),
			validateUsageError(/Expected a safe integer passed to test, got 1.5/),
		);
		assert.throws(
			() => validatePositiveIndex(Number.MAX_SAFE_INTEGER + 1, "test"),
			validateUsageError(/Expected a safe integer passed to test, got 9007199254740992/),
		);
		assert.throws(
			() => validatePositiveIndex(Number.MIN_SAFE_INTEGER - 1, "test"),
			validateUsageError(/Expected a safe integer passed to test, got -9007199254740992/),
		);
		assert.throws(
			() => validatePositiveIndex(Number.NaN, "test"),
			validateUsageError(/Expected a safe integer passed to test, got NaN/),
		);
		assert.throws(
			() => validatePositiveIndex(Number.POSITIVE_INFINITY, "test"),
			validateUsageError(/Expected a safe integer passed to test, got Infinity/),
		);
		assert.throws(
			() => validatePositiveIndex(Number.NEGATIVE_INFINITY, "test"),
			validateUsageError(/Expected a safe integer passed to test, got -Infinity/),
		);
	});

	describe("validateIndex", () => {
		it("allowOnePastEnd: false", () => {
			const array = { length: 2 };

			assert.doesNotThrow(() => validateIndex(0, array, "test", false));
			assert.doesNotThrow(() => validateIndex(1, array, "test", false));

			assert.throws(
				() => validateIndex(2, array, "test", false),
				validateUsageError(
					/Index value passed to test is out of bounds. Expected at most 1, got 2./,
				),
			);
			assert.throws(
				() => validateIndex(-1, array, "test", false),
				validateUsageError(/Expected non-negative index passed to test, got -1/),
			);
			assert.throws(
				() => validateIndex(Number.NaN, array, "test", false),
				validateUsageError(/Expected a safe integer passed to test, got NaN/),
			);
		});

		it("allowOnePastEnd: true", () => {
			const array = { length: 2 };

			assert.doesNotThrow(() => validateIndex(0, array, "test", true));
			assert.doesNotThrow(() => validateIndex(1, array, "test", true));
			assert.doesNotThrow(() => validateIndex(2, array, "test", true));

			assert.throws(
				() => validateIndex(3, array, "test", true),
				validateUsageError(
					/Index value passed to test is out of bounds. Expected at most 2, got 3./,
				),
			);
			assert.throws(
				() => validateIndex(-1, array, "test", true),
				validateUsageError(/Expected non-negative index passed to test, got -1/),
			);
			assert.throws(
				() => validateIndex(Number.NaN, array, "test", true),
				validateUsageError(/Expected a safe integer passed to test, got NaN/),
			);
		});
	});

	it("validateRange", () => {
		const array = { length: 3 };

		assert.doesNotThrow(() => validateIndexRange(0, 2, array, "test"));

		// 1 past end is allowed
		assert.doesNotThrow(() => validateIndexRange(0, 3, array, "test"));
		assert.doesNotThrow(() => validateIndexRange(3, 3, array, "test"));

		assert.throws(
			() => validateIndexRange(-1, 2, array, "test"),
			validateUsageError(/Expected non-negative index passed to test, got -1/),
		);
		assert.throws(
			() => validateIndexRange(2, Number.NaN, array, "test"),
			validateUsageError(/Expected a safe integer passed to test, got NaN/),
		);
		assert.throws(
			() => validateIndexRange(0, 4, array, "test"),
			validateUsageError(
				/Index value passed to test is out of bounds. Expected at most 3, got 4./,
			),
		);
		assert.throws(
			() => validateIndexRange(2, 1, array, "test"),
			validateUsageError(
				/Malformed range passed to test. Start index 2 is greater than end index 1./,
			),
		);
	});
});
