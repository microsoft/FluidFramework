/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { UnassignedSequenceNumber } from "../constants.js";
import * as opstampUtils from "../stamps.js";
import type { OperationStamp } from "../stamps.js";

function lessThan(a: OperationStamp, b: OperationStamp): boolean {
	const result = opstampUtils.lessThan(a, b);
	// Validate that this gives a consistent result with some other ways to compute the same thing
	const fromComparison = opstampUtils.compare(a, b) === -1;
	const fromGte = !opstampUtils.gte(a, b);
	assert.strictEqual(result, fromComparison);
	assert.strictEqual(result, fromGte);
	return result;
}

function greaterThan(a: OperationStamp, b: OperationStamp): boolean {
	const result = opstampUtils.greaterThan(a, b);
	// Validate that this gives a consistent result with some other ways to compute the same thing
	const fromComparison = opstampUtils.compare(a, b) === 1;
	const fromLte = !opstampUtils.lte(a, b);
	assert.strictEqual(result, fromComparison);
	assert.strictEqual(result, fromLte);
	return result;
}

/**
 * Validate that a list of operation stamps is in strictly increasing order in several different ways using the comparison
 * operation stamp utility methods.
 */
function expectStrictlyIncreasing(list: OperationStamp[]): void {
	for (let i = 0; i < list.length - 1; i++) {
		assert.ok(
			lessThan(list[i], list[i + 1]),
			`List not strictly increasing by lessThan:  ${JSON.stringify(list[i])} >= ${JSON.stringify(list[i + 1])}`,
		);
		assert.ok(
			greaterThan(list[i + 1], list[i]),
			`List not strictly increasing by greaterThan:  ${JSON.stringify(list[i + 1])} <= ${JSON.stringify(list[i])}`,
		);
	}
}

describe("opstampUtils", () => {
	const acked1: OperationStamp = { clientId: 1, seq: 1 };
	const acked2: OperationStamp = { clientId: 2, seq: 2 };
	const acked3: OperationStamp = { clientId: 1, seq: 3 };
	const local1: OperationStamp = { clientId: 1, seq: UnassignedSequenceNumber, localSeq: 1 };
	const local2: OperationStamp = { clientId: 1, seq: UnassignedSequenceNumber, localSeq: 2 };
	describe("equality", () => {
		it("returns true for reference equal stamps", () => {
			for (const stamp of [acked1, acked2, acked3, local1, local2]) {
				assert.ok(opstampUtils.equal(stamp, stamp));
			}
		});

		it("returns true for equal stamps", () => {
			for (const stamp of [acked1, acked2, acked3, local1, local2]) {
				assert.ok(opstampUtils.equal(stamp, { ...stamp }));
			}
		});

		it("returns false for different stamps", () => {
			assert.ok(!opstampUtils.equal(acked1, acked2));
			assert.ok(!opstampUtils.equal(acked1, acked3));
			assert.ok(!opstampUtils.equal(acked1, local1));
			assert.ok(!opstampUtils.equal(acked1, local2));
			assert.ok(!opstampUtils.equal(local1, local2));
		});
	});

	describe("comparison", () => {
		it("orders stamps correctly", () => {
			expectStrictlyIncreasing([acked1, acked2, acked3, local1, local2]);
		});

		it("compare can sort lists", () => {
			const list = [acked3, local1, acked1, local2, acked2];
			list.sort(opstampUtils.compare);
			assert.deepEqual(list, [acked1, acked2, acked3, local1, local2]);
		});
	});

	describe("spliceIntoList", () => {
		it("inserts unacked into empty list", () => {
			const list: OperationStamp[] = [];
			opstampUtils.spliceIntoList(list, local1);
			assert.deepStrictEqual(list, [local1]);
		});

		it("inserts acked into empty list", () => {
			const list: OperationStamp[] = [];
			opstampUtils.spliceIntoList(list, acked1);
			assert.deepStrictEqual(list, [acked1]);
		});

		it("inserts unacked after acked", () => {
			const list: OperationStamp[] = [acked1];
			opstampUtils.spliceIntoList(list, local1);
			assert.deepStrictEqual(list, [acked1, local1]);
		});

		it("inserts acked before unacked", () => {
			const list: OperationStamp[] = [acked1, acked2, local1];
			opstampUtils.spliceIntoList(list, acked3);
			assert.deepStrictEqual(list, [acked1, acked2, acked3, local1]);
		});

		it("inserts acked before single unacked", () => {
			const list: OperationStamp[] = [local1];
			opstampUtils.spliceIntoList(list, acked2);
			assert.deepStrictEqual(list, [acked2, local1]);
		});

		it("inserts local seqs at end", () => {
			const list: OperationStamp[] = [acked1, acked2];
			opstampUtils.spliceIntoList(list, local1);
			opstampUtils.spliceIntoList(list, local2);
			assert.deepStrictEqual(list, [acked1, acked2, local1, local2]);
		});
	});
});
