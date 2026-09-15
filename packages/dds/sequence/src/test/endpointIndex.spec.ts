/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { EndpointIndex } from "../intervalIndex/index.js";
import type { SequenceInterval } from "../intervals/index.js";
import { SharedStringFactory } from "../sequenceFactory.js";
import { ISharedString, SharedStringClass } from "../sharedString.js";

import { createTestSequenceInterval } from "./intervalIndexTestUtils.js";

describe("EndpointIndex", () => {
	let endpointIndex: EndpointIndex;
	let createTestInterval: (p1: number, p2: number) => SequenceInterval;
	let sharedString: ISharedString;

	/**
	 * Asserts that `actual` is the same interval instance as `expected`, reporting
	 * endpoint positions on failure to make mismatches readable.
	 */
	function assertSameInterval(
		actual: SequenceInterval | undefined,
		expected: SequenceInterval | undefined,
		message: string,
	): void {
		const describeInterval = (interval: SequenceInterval | undefined): string | undefined =>
			interval === undefined
				? undefined
				: `[${sharedString.localReferencePositionToPosition(
						interval.start,
					)}, ${sharedString.localReferencePositionToPosition(interval.end)}] (id ${interval.getIntervalId()})`;

		assert.equal(describeInterval(actual), describeInterval(expected), message);
	}

	beforeEach(() => {
		const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: "1" });
		sharedString = new SharedStringClass(
			dataStoreRuntime,
			"test-string",
			SharedStringFactory.Attributes,
		);
		Array.from({ length: 10 }).forEach(() => sharedString.insertText(0, "0123456789"));
		endpointIndex = new EndpointIndex(sharedString);
		createTestInterval = (p1, p2) => createTestSequenceInterval(sharedString, p1, p2);
	});

	describe("previousInterval", () => {
		it("returns undefined when the index is empty", () => {
			assert.equal(endpointIndex.previousInterval(5), undefined);
		});

		it("returns the interval ending exactly at the queried position", () => {
			const interval = createTestInterval(1, 5);
			endpointIndex.add(interval);

			assertSameInterval(
				endpointIndex.previousInterval(5),
				interval,
				"expected the interval ending at the queried position",
			);
		});

		it("returns the nearest interval ending at or before the queried position", () => {
			const near = createTestInterval(1, 5);
			const far = createTestInterval(1, 2);
			endpointIndex.add(near);
			endpointIndex.add(far);

			assertSameInterval(
				endpointIndex.previousInterval(7),
				near,
				"expected the greatest end position not exceeding the query",
			);
		});

		it("returns undefined when every interval ends after the queried position", () => {
			endpointIndex.add(createTestInterval(5, 8));
			endpointIndex.add(createTestInterval(6, 9));

			assert.equal(endpointIndex.previousInterval(3), undefined);
		});
	});

	describe("nextInterval", () => {
		it("returns undefined when the index is empty", () => {
			assert.equal(endpointIndex.nextInterval(5), undefined);
		});

		it("returns the interval ending exactly at the queried position", () => {
			const interval = createTestInterval(1, 5);
			endpointIndex.add(interval);

			assertSameInterval(
				endpointIndex.nextInterval(5),
				interval,
				"expected the interval ending at the queried position",
			);
		});

		it("returns the nearest interval ending at or after the queried position", () => {
			const near = createTestInterval(1, 5);
			const far = createTestInterval(1, 8);
			endpointIndex.add(near);
			endpointIndex.add(far);

			assertSameInterval(
				endpointIndex.nextInterval(3),
				near,
				"expected the least end position not preceding the query",
			);
		});

		it("returns undefined when every interval ends before the queried position", () => {
			endpointIndex.add(createTestInterval(1, 2));
			endpointIndex.add(createTestInterval(1, 3));

			assert.equal(endpointIndex.nextInterval(7), undefined);
		});
	});

	describe("removal", () => {
		it("no longer returns a removed interval", () => {
			const interval = createTestInterval(1, 5);
			endpointIndex.add(interval);
			endpointIndex.remove(interval);

			assert.equal(endpointIndex.previousInterval(5), undefined);
			assert.equal(endpointIndex.nextInterval(5), undefined);
		});

		it("retains intervals ending at other positions", () => {
			const removed = createTestInterval(1, 5);
			const retained = createTestInterval(1, 8);
			endpointIndex.add(removed);
			endpointIndex.add(retained);
			endpointIndex.remove(removed);

			assertSameInterval(
				endpointIndex.nextInterval(5),
				retained,
				"expected the surviving interval",
			);
		});

		it("tolerates removing an interval that was never added", () => {
			const added = createTestInterval(1, 5);
			endpointIndex.add(added);
			endpointIndex.remove(createTestInterval(2, 8));

			assertSameInterval(
				endpointIndex.previousInterval(5),
				added,
				"expected the added interval to be unaffected",
			);
		});
	});

	// EndpointIndex orders intervals by end position alone, which is only a partial
	// order: two distinct intervals sharing an end position (and end side) compare
	// equal. Identity must therefore be tracked separately from ordering so that such
	// intervals remain individually addressable.
	describe("with multiple intervals sharing an end position", () => {
		it("retains every interval ending at that position", () => {
			const first = createTestInterval(1, 5);
			const second = createTestInterval(3, 5);
			endpointIndex.add(first);
			endpointIndex.add(second);

			// Removing one interval must not evict the other from the index.
			endpointIndex.remove(second);

			assertSameInterval(
				endpointIndex.previousInterval(5),
				first,
				"expected the interval that was never removed to remain indexed",
			);
		});

		it("keeps the position queryable until all such intervals are removed", () => {
			const first = createTestInterval(1, 5);
			const second = createTestInterval(3, 5);
			const third = createTestInterval(4, 5);
			endpointIndex.add(first);
			endpointIndex.add(second);
			endpointIndex.add(third);

			endpointIndex.remove(first);
			assert.notEqual(
				endpointIndex.nextInterval(5),
				undefined,
				"two intervals still end at position 5",
			);

			endpointIndex.remove(second);
			assert.notEqual(
				endpointIndex.nextInterval(5),
				undefined,
				"one interval still ends at position 5",
			);

			endpointIndex.remove(third);
			assert.equal(endpointIndex.nextInterval(5), undefined, "no intervals end at position 5");
		});

		it("does not strand an interval that was never removed", () => {
			const shorter = createTestInterval(1, 5);
			const longer = createTestInterval(2, 5);
			endpointIndex.add(shorter);
			endpointIndex.add(longer);
			endpointIndex.remove(longer);

			// `shorter` is still live, so querying at its end position must find it.
			assert.notEqual(
				endpointIndex.previousInterval(5),
				undefined,
				"expected the remaining interval to still be indexed",
			);
		});
	});
});
