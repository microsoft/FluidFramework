/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "node:assert";

import {
	assert,
	configureDebugAsserts,
	debugAssert,
	nonProductionConditionalsIncluded,
	onAssertionFailure,
} from "../assert.js";

describe("assert", () => {
	it("Validate Shortcode Format", () => {
		// short codes should be hex, and at least 3 chars
		for (const shortCode of ["0x000", "0x03a", "0x200", "0x4321"]) {
			try {
				assert(false, Number.parseInt(shortCode, 16));
			} catch (error: unknown) {
				strict(error instanceof Error, "not an error");
				strict.strictEqual(error.message, shortCode, "incorrect short code format");
			}
		}
	});

	it("debugAssert", () => {
		strict.equal(nonProductionConditionalsIncluded(), true);

		// debugAsserts are disabled by default
		debugAssert(() => {
			throw new Error("Should not run");
		});

		strict.equal(configureDebugAsserts(true), false);

		debugAssert(() => true);
		debugAssert(() => true);
		strict.throws(() => debugAssert(() => "test"), /Debug assert failed: test/);
		strict.throws(() => debugAssert(() => false), /Debug assert failed/);

		strict.equal(configureDebugAsserts(true), true);
		strict.equal(configureDebugAsserts(false), true);
		strict.equal(configureDebugAsserts(false), false);

		debugAssert(() => {
			throw new Error("Should not run");
		});
	});

	it("onAssertionFailure", () => {
		const log: string[] = [];
		const handler = (error: Error): void => {
			log.push(error.message);
		};
		const removeListener = onAssertionFailure(handler);
		strict.throws(() => assert(false, "A"));

		const removeListener2 = onAssertionFailure(handler);

		strict.throws(() => assert(false, "B"));
		removeListener();
		strict.throws(() => assert(false, "C"));
		removeListener2();
		strict.throws(() => assert(false, "D"));

		strict.deepEqual(log, ["A", "B", "B", "C"]);
	});
});
