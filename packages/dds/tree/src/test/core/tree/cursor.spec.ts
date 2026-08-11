/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	CursorLocationType,
	forEachNodeSubsequence,
	type TreeNodeSchemaIdentifier,
} from "../../../core/index.js";
import { cursorForJsonableTreeField } from "../../../feature-libraries/index.js";
import { numberSchema } from "../../../simple-tree/index.js";
import { brand } from "../../../util/index.js";

/** Creates a cursor in Fields mode over nodes with values 0 through length - 1. */
function makeFieldCursor(length: number) {
	const numberType = brand<TreeNodeSchemaIdentifier>(numberSchema.identifier);
	const cursor = cursorForJsonableTreeField(
		Array.from({ length }, (_, i) => ({ type: numberType, value: i })),
	);
	assert.equal(cursor.mode, CursorLocationType.Fields);
	return cursor;
}

describe("cursor", () => {
	describe("forEachNodeSubsequence", () => {
		/**
		 * Validates that forEachNodeSubsequence visits exactly the nodes at indices
		 * [startIndex, endIndex) and leaves the cursor in Fields mode afterward.
		 */
		function checkSubsequence(length: number, startIndex: number, endIndex: number): void {
			const cursor = makeFieldCursor(length);
			const visited: number[] = [];
			forEachNodeSubsequence(cursor, startIndex, endIndex, (c) => {
				visited.push(c.value as number);
			});
			const expected = Array.from({ length: endIndex - startIndex }, (_, i) => startIndex + i);
			assert.deepEqual(visited, expected);
			assert.equal(cursor.mode, CursorLocationType.Fields);
		}

		it("visits all nodes when range covers entire field", () => {
			checkSubsequence(3, 0, 3);
		});

		it("visits a middle subsequence", () => {
			checkSubsequence(5, 1, 4);
		});

		it("visits only the first node", () => {
			checkSubsequence(3, 0, 1);
		});

		it("visits only the last node", () => {
			checkSubsequence(3, 2, 3);
		});

		it("visits nothing for empty range (startIndex === endIndex)", () => {
			checkSubsequence(3, 1, 1);
		});

		it("visits nothing for zero-length range at end of field", () => {
			checkSubsequence(2, 2, 2);
		});

		it("visits nothing when field is empty and range is [0, 0)", () => {
			checkSubsequence(0, 0, 0);
		});

		it("throws for negative startIndex", () => {
			const cursor = makeFieldCursor(2);
			assert.throws(
				() => forEachNodeSubsequence(cursor, -1, 1, () => {}),
				validateAssertionError(/invalid startIndex/),
			);
		});

		it("throws when endIndex is less than startIndex", () => {
			const cursor = makeFieldCursor(2);
			assert.throws(
				() => forEachNodeSubsequence(cursor, 2, 1, () => {}),
				validateAssertionError(/invalid endIndex/),
			);
		});

		it("throws when endIndex is out of bounds", () => {
			const cursor = makeFieldCursor(2);
			assert.throws(
				() => forEachNodeSubsequence(cursor, 0, 3, () => {}),
				validateAssertionError(/requested endIndex is out of bounds/),
			);
		});
	});
});
