/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "assert";

import { assert, fail } from "@fluidframework/core-utils/internal";

import { shortCodeMap } from "../assertionShortCodesMap.js";
import { validateAssertionError } from "../validateAssertionError.js";

describe("validateAssertionError", () => {
	it("untagged", () => {
		strict.throws(
			() => {
				assert(false, "X");
			},
			(e: Error) => validateAssertionError(e, "X"),
		);
		strict.throws(
			() => {
				fail("X");
			},
			(e: Error) => validateAssertionError(e, "X"),
		);
		strict.throws(
			() => {
				assert(false, "X", () => "Extra");
			},
			(e: Error) => validateAssertionError(e, "X\nDebug Message: Extra"),
		);
		strict.throws(
			() => {
				fail("X", () => "Extra");
			},
			(e: Error) => validateAssertionError(e, "X\nDebug Message: Extra"),
		);
	});

	it("tagged", () => {
		// We do not do assert tagging on test packages, and we also don't have a way to select a different shortCodeMap.
		// Therefore these tests depend on some existing assert from elsewhere in the codebase.

		const [tag, expanded] = Object.entries(shortCodeMap)[0] ?? strict.fail();

		strict.throws(
			() => {
				assert(false, tag);
			},
			(e: Error) => validateAssertionError(e, expanded),
		);
		strict.throws(
			() => {
				fail(tag);
			},
			(e: Error) => validateAssertionError(e, expanded),
		);
		strict.throws(
			() => {
				assert(false, tag, () => "Extra");
			},
			(e: Error) => validateAssertionError(e, `${expanded}\nDebug Message: Extra`),
		);
		strict.throws(
			() => {
				fail(tag, () => "Extra");
			},
			(e: Error) => validateAssertionError(e, `${expanded}\nDebug Message: Extra`),
		);
	});
});
