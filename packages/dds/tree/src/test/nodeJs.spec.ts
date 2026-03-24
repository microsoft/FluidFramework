/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// Created based on NodeJS v24.14.0. Reconfirmed in v25.8.1
// This does not reproduce in NodeJS v22.22.1.
describe("Node.js deepStrictEqual shared-reference bug", () => {
	// Node.js's `deepStrictEqual` (and `strict.deepEqual`) uses an internal
	// `detectCycles` function that starts with `memos = null` (no cycle
	// detection).  The first time a comparison throws during the null-memos
	// path — typically a stack overflow caused by comparing two circular
	// structures — `detectCycles` is permanently replaced by `innerDeepEqual`,
	// which passes a live `memos` object through every recursive call.
	//
	// In that memo-enabled mode the cycle-detection set (`memos.set`) is
	// seeded with the *current* val2 (`memos.d`) when it is first created.
	// That seed is never removed after the nested comparison returns, so when
	// the same expected object reference appears as val2 in a sibling
	// comparison, `set.add(sharedRef)` is a no-op.  The invariant
	// `originalSize === set.size - 2` then fails (only one new item was added
	// instead of two), and Node.js incorrectly concludes the structures are
	// not equal.
	//
	// This test is self-contained: it forces the detectCycles switch via an
	// explicit circular comparison before exercising the buggy path, so it
	// does not depend on other tests having run first.
	it("deepStrictEqual rejects structurally equal arrays when expected has a shared reference and cycle detection is active", () => {
		// Step 1 — activate cycle-detection mode permanently in this process
		// by comparing two isomorphic circular objects.  The first attempt
		// with null memos causes a stack overflow; the catch handler replaces
		// detectCycles with innerDeepEqual for all future calls.
		const circA: Record<string, unknown> = { x: 1 };
		circA.self = circA;
		const circB: Record<string, unknown> = { x: 1 };
		circB.self = circB;
		assert.deepStrictEqual(circA, circB); // triggers the permanent switch

		// Step 2 — demonstrate the bug.
		// `actual` has two *distinct* objects with identical content.
		// `expected` reuses the *same* object reference at both positions.
		const sharedExpected = { type: "baz", value: { Handle: "fullPath" } };
		const actualValues = [
			{ type: "baz", value: { Handle: "fullPath" } },
			{ type: "baz", value: { Handle: "fullPath" } },
		];
		const expectedValues = [sharedExpected, sharedExpected];

		// Individual element comparisons always pass …
		assert.deepStrictEqual(actualValues[0], expectedValues[0]);
		assert.deepStrictEqual(actualValues[1], expectedValues[1]);

		// … but the combined comparison incorrectly fails because Node.js's
		// cycle-detection set still contains `sharedExpected` from the first
		// element's comparison when the second element is evaluated.
		assert.throws(
			() => assert.deepStrictEqual(actualValues, expectedValues),
			(err: unknown) =>
				err instanceof assert.AssertionError &&
				err.message.includes("same structure but are not reference-equal"),
			"Expected deepEqual to fail due to the Node.js shared-reference bug",
		);

		// A workaround: use a factory so each position gets a fresh object.
		const makeExpected = (): object => ({
			type: "baz",
			value: { Handle: "fullPath" },
		});
		assert.deepStrictEqual(actualValues, [makeExpected(), makeExpected()]);
	});

	// Failing version
	// Confirmed to fail in Node.JS v24.14.0 and v25.8.1
	// Regressed from v22.22.1 which works as expected.
	it("deepStrictEqual allows structurally equal arrays when expected has a shared reference and cycle detection is active", () => {
		// `actual` has two *distinct* objects with identical content.
		// `expected` reuses the *same* object reference at both positions.
		const sharedExpected = { outer: { inner: 0 } };
		const actualValues = [{ outer: { inner: 0 } }, { outer: { inner: 0 } }];
		const expectedValues = [sharedExpected, sharedExpected];

		// Works, but only if no cycles have been processed before running this test.
		assert.deepStrictEqual(actualValues, expectedValues);

		// Activate cycle-detection mode permanently in this process
		// by comparing two isomorphic circular objects.
		// The first attempt with null memos causes a stack overflow;
		// the catch handler replaces detectCycles with innerDeepEqual for all future calls.
		const circA: Record<string, unknown> = {};
		circA.self = circA;
		const circB: Record<string, unknown> = {};
		circB.self = circB;
		assert.deepStrictEqual(circA, circB); // triggers the permanent switch

		// Individual element comparisons always pass …
		assert.deepStrictEqual(actualValues[0], expectedValues[0]);
		assert.deepStrictEqual(actualValues[1], expectedValues[1]);

		// The combined comparison now fails because Node.js's
		// cycle-detection set still contains `sharedExpected` from the first
		// element's comparison when the second element is evaluated.
		assert.deepStrictEqual(actualValues, expectedValues);
	});
});
