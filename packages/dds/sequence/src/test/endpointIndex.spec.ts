/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { makeRandom } from "@fluid-private/stochastic-test-utils";
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

	// Storage is ordered by (end position, interval id), a total order, so intervals
	// sharing an end position each occupy their own entry and stay individually
	// addressable. Endpoint probes deliberately ignore the id and compare end positions
	// alone, so previousInterval/nextInterval remain well defined across such a group.
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

		it("ignores a second add of an interval already stored under the same id", () => {
			const original = createTestInterval(1, 5);
			endpointIndex.add(original);

			// Same id and end position, so the set treats it as already present. Adding it
			// must not replace the stored instance, nor create a second entry for it.
			const duplicate = createTestSequenceInterval(sharedString, 2, 5);
			duplicate.getIntervalId = () => original.getIntervalId();
			endpointIndex.add(duplicate);

			assert.equal(
				endpointIndex.previousInterval(5),
				original,
				"expected the originally stored instance, not the duplicate",
			);

			endpointIndex.remove(original);
			assert.equal(
				endpointIndex.previousInterval(5),
				undefined,
				"expected no second entry to have been created",
			);
		});
	});

	describe("agrees with a brute force scan", () => {
		/**
		 * End positions are drawn from a range far smaller than the interval count so that
		 * many intervals share an end, which is the case the ordering has to get right.
		 */
		const intervalCount = 300;
		const maxEnd = 40;

		it("over random adds and removes", () => {
			const random = makeRandom(0x5eed);
			const live = new Set<SequenceInterval>();
			const created: SequenceInterval[] = [];

			const endOf = (interval: SequenceInterval): number =>
				sharedString.localReferencePositionToPosition(interval.end);

			const checkAgainstBruteForce = (): void => {
				const liveEnds = [...live].map((interval) => endOf(interval));
				for (let pos = 0; pos <= maxEnd + 1; pos++) {
					const endsAtOrBefore = liveEnds.filter((end) => end <= pos);
					const endsAtOrAfter = liveEnds.filter((end) => end >= pos);

					const previous = endpointIndex.previousInterval(pos);
					if (endsAtOrBefore.length === 0) {
						assert.equal(previous, undefined, `expected no interval ending at or before ${pos}`);
					} else {
						assert(previous !== undefined, `expected an interval ending at or before ${pos}`);
						assert(live.has(previous), "previousInterval returned a removed interval");
						assert.equal(
							endOf(previous),
							Math.max(...endsAtOrBefore),
							`previousInterval(${pos}) did not return the greatest end at or before it`,
						);
					}

					const next = endpointIndex.nextInterval(pos);
					if (endsAtOrAfter.length === 0) {
						assert.equal(next, undefined, `expected no interval ending at or after ${pos}`);
					} else {
						assert(next !== undefined, `expected an interval ending at or after ${pos}`);
						assert(live.has(next), "nextInterval returned a removed interval");
						assert.equal(
							endOf(next),
							Math.min(...endsAtOrAfter),
							`nextInterval(${pos}) did not return the least end at or after it`,
						);
					}
				}
			};

			for (let round = 0; round < 20; round++) {
				const addCount = random.integer(1, intervalCount / 20);
				for (let i = 0; i < addCount; i++) {
					const end = random.integer(1, maxEnd);
					const interval = createTestInterval(random.integer(0, end), end);
					created.push(interval);
					live.add(interval);
					endpointIndex.add(interval);
				}

				// Remove a random subset, so the set both grows and shrinks over the run.
				const removable = created.filter((interval) => live.has(interval));
				const removeCount = random.integer(0, Math.floor(removable.length / 3));
				for (let i = 0; i < removeCount; i++) {
					const interval = removable[random.integer(0, removable.length - 1)];
					if (live.delete(interval)) {
						endpointIndex.remove(interval);
					}
				}

				checkAgainstBruteForce();
			}

			// Drain it, checking the whole way down.
			for (const interval of [...live]) {
				live.delete(interval);
				endpointIndex.remove(interval);
			}
			checkAgainstBruteForce();
		});
	});
});
