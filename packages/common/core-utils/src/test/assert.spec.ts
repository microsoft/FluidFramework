/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "node:assert";

import {
	assert,
	configureDebugAsserts,
	debugAssert,
	emulateProductionBuild,
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

		const log: string[] = [];
		// debugAsserts are enabled by default
		debugAssert(() => {
			log.push("A");
			return true;
		});
		strict.deepEqual(log, ["A"]);
		strict.throws(() => debugAssert(() => "test"), /Debug assert failed: test/);
		strict.throws(() => debugAssert(() => false), /Debug assert failed/);

		strict.equal(configureDebugAsserts(false), true);

		debugAssert(() => {
			throw new Error("Should not run");
		});

		strict.equal(configureDebugAsserts(true), false);
		strict.equal(configureDebugAsserts(false), true);
		strict.equal(configureDebugAsserts(true), false);

		debugAssert(() => {
			log.push("B");
			return true;
		});

		emulateProductionBuild(true);
		debugAssert(() => {
			log.push("C");
			return false;
		});
		emulateProductionBuild(false);

		strict.deepEqual(log, ["A", "B"]);
	});

	it("assert", () => {
		assert(true, "message", () => {
			throw new Error("Should not run");
		});
		strict.throws(() => assert(false, "message", () => "test"), "message\ntest");

		strict.equal(configureDebugAsserts(false), true);

		const log: string[] = [];
		emulateProductionBuild(true);
		strict.throws(
			() =>
				assert(false, "message", () => {
					log.push("X");
					return "X";
				}),
			"Error: message",
		);
		emulateProductionBuild(false);

		strict.deepEqual(log, []);
	});

	it("onAssertionFailure", () => {
		const log: string[] = [];
		const handler = (error: Error): void => {
			log.push(error.message);
		};
		const removeListener = onAssertionFailure(handler);
		strict.throws(() => assert(false, "A", () => "Extra"));

		const removeListener2 = onAssertionFailure(handler);

		strict.throws(() => assert(false, "B"));
		removeListener();
		strict.throws(() => assert(false, "C"));
		removeListener2();
		strict.throws(() => assert(false, "D"));

		strict.deepEqual(log, ["A\nDebug Message:Extra", "B", "B", "C"]);
	});
});
