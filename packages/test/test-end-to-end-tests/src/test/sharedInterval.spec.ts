/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import { ISummaryBlob } from "@fluidframework/driver-definitions";
import type { ISharedMap } from "@fluidframework/map/internal";
import { DetachedReferencePosition, PropertySet } from "@fluidframework/merge-tree/internal";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";
import type {
	ISequenceIntervalCollection,
	ISequenceOverlappingIntervalsIndex,
	SequenceInterval,
	SharedString,
} from "@fluidframework/sequence/internal";
// This is not in sequence's public API, but an e2e test in this file sniffs the summary.
// eslint-disable-next-line import/no-internal-modules
import type { ISerializedIntervalCollectionV2 } from "@fluidframework/sequence/internal/test/intervalCollection";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
} from "@fluidframework/test-utils/internal";

const assertSequenceIntervals = (
	sharedString: SharedString,
	intervalCollection: ISequenceIntervalCollection,
	overlappingIntervalsIndex: ISequenceOverlappingIntervalsIndex,
	expected: readonly { start: number; end: number }[],
	validateOverlapping: boolean = true,
) => {
	const actual = Array.from(intervalCollection);
	if (validateOverlapping && sharedString.getLength() > 0) {
		const overlapping = overlappingIntervalsIndex.findOverlappingIntervals(
			0,
			sharedString.getLength() - 1,
		);
		assert.deepEqual(actual, overlapping, "Interval search returned inconsistent results");
	}
	assert.strictEqual(
		actual.length,
		expected.length,
		`findOverlappingIntervals() must return the expected number of intervals`,
	);

	const actualPos = actual.map((interval) => {
		assert(interval);
		const start = sharedString.localReferencePositionToPosition(interval.start);
		const end = sharedString.localReferencePositionToPosition(interval.end);
		return { start, end };
	});
	assert.deepEqual(actualPos, expected, "intervals are not as expected");
};

function testIntervalOperations(intervalCollection: ISequenceIntervalCollection) {
	const intervalArray: SequenceInterval[] = [];
	let interval: SequenceInterval | undefined;
	let id;

	intervalArray[0] = intervalCollection.add({ start: 0, end: 0 });
	intervalArray[1] = intervalCollection.add({ start: 0, end: 0 });
	assert.notStrictEqual(intervalArray[0], intervalArray[1], "Unique intervals not added");

	id = intervalArray[0].getIntervalId();
	assert.notStrictEqual(id, undefined, "ID not created");

	intervalCollection.removeIntervalById(id);
	interval = intervalCollection.getIntervalById(id);
	assert.strictEqual(interval, undefined, "Interval not removed");

	id = intervalArray[1].getIntervalId();
	assert.notStrictEqual(id, undefined, "ID not created");
	interval = intervalCollection.getIntervalById(id);
	assert.notStrictEqual(interval, undefined, "Wrong interval removed?");

	intervalCollection.removeIntervalById(id);
	interval = intervalCollection.getIntervalById(id);
	assert.strictEqual(interval, undefined, "Interval not removed");

	intervalArray[0] = intervalCollection.add({ start: 0, end: 0 });
	intervalArray[1] = intervalCollection.add({ start: 0, end: 1 });
	intervalArray[2] = intervalCollection.add({ start: 0, end: 2 });
	intervalArray[3] = intervalCollection.add({ start: 1, end: 0 });
	intervalArray[4] = intervalCollection.add({ start: 1, end: 1 });
	intervalArray[5] = intervalCollection.add({ start: 1, end: 2 });
	intervalArray[6] = intervalCollection.add({ start: 2, end: 0 });
	intervalArray[7] = intervalCollection.add({ start: 2, end: 1 });
	intervalArray[8] = intervalCollection.add({ start: 2, end: 2 });

	let i: number;
	let result;
	let tempArray: SequenceInterval[] = [];
	let iterator = intervalCollection.CreateForwardIteratorWithStartPosition(1);
	tempArray[0] = intervalArray[3];
	tempArray[1] = intervalArray[4];
	tempArray[2] = intervalArray[5];
	for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
		interval = result.value;
		assert.strictEqual(
			interval,
			tempArray[i],
			"Mismatch in forward iteration with start position",
		);
	}
	assert.strictEqual(
		i,
		tempArray.length,
		"Interval omitted from forward iteration with start position",
	);

	iterator = intervalCollection.CreateForwardIteratorWithEndPosition(2);
	tempArray = [];
	tempArray[0] = intervalArray[2];
	tempArray[1] = intervalArray[5];
	tempArray[2] = intervalArray[8];
	for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
		interval = result.value;
		assert.strictEqual(
			interval,
			tempArray[i],
			"Mismatch in forward iteration with start position",
		);
	}
	assert.strictEqual(
		i,
		tempArray.length,
		"Interval omitted from forward iteration with start position",
	);

	iterator = intervalCollection.CreateBackwardIteratorWithStartPosition(0);
	tempArray = [];
	tempArray[0] = intervalArray[2];
	tempArray[1] = intervalArray[1];
	tempArray[2] = intervalArray[0];
	for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
		interval = result.value;
		assert.strictEqual(
			interval,
			tempArray[i],
			"Mismatch in backward iteration with start position",
		);
	}
	assert.strictEqual(
		i,
		tempArray.length,
		"Interval omitted from backward iteration with start position",
	);

	iterator = intervalCollection.CreateForwardIteratorWithEndPosition(2);
	tempArray = [];
	tempArray[0] = intervalArray[2];
	tempArray[1] = intervalArray[5];
	tempArray[2] = intervalArray[8];
	for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
		interval = result.value;
		assert.strictEqual(
			interval,
			tempArray[i],
			"Mismatch in forward iteration with end position",
		);
	}
	assert.strictEqual(
		i,
		tempArray.length,
		"Interval omitted from forward iteration with end position",
	);

	iterator = intervalCollection.CreateBackwardIteratorWithEndPosition(1);
	tempArray = [];
	tempArray[0] = intervalArray[7];
	tempArray[1] = intervalArray[4];
	tempArray[2] = intervalArray[1];
	for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
		interval = result.value;
		assert.strictEqual(
			interval,
			tempArray[i],
			"Mismatch in backward iteration with end position",
		);
	}
	assert.strictEqual(
		i,
		tempArray.length,
		"Interval omitted from backward iteration with end position",
	);

	iterator = intervalCollection.CreateForwardIteratorWithStartPosition(-1);
	for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
		assert(false, "Iterator with OOB position should not produce a result");
	}

	iterator = intervalCollection.CreateForwardIteratorWithEndPosition(99999);
	for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
		assert(false, "Iterator with OOB position should not produce a result");
	}

	iterator = intervalCollection.CreateForwardIteratorWithStartPosition(-1);
	for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
		assert(false, "Iterator with OOB position should not produce a result");
	}

	iterator = intervalCollection.CreateForwardIteratorWithEndPosition(99999);
	for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
		assert(false, "Iterator with OOB position should not produce a result");
	}

	i = 0;
	for (interval of intervalCollection) {
		assert.strictEqual(
			interval,
			intervalArray[i],
			"Mismatch in for...of iteration of collection",
		);
		i++;
	}
	assert.strictEqual(i, intervalArray.length, "Interval omitted from for...of iteration");

	id = intervalArray[0].getIntervalId();
	interval = intervalCollection.getIntervalById(id);
	assert.strictEqual(interval, intervalArray[0]);
	interval = intervalCollection.removeIntervalById(id);
	assert.strictEqual(interval, intervalArray[0]);
	interval = intervalCollection.getIntervalById(id);
	assert.strictEqual(interval, undefined);
	interval = intervalCollection.removeIntervalById(id);
	assert.strictEqual(interval, undefined);

	id = intervalArray[intervalArray.length - 1].getIntervalId();
	interval = intervalCollection.getIntervalById(id);
	assert.strictEqual(interval, intervalArray[intervalArray.length - 1]);
	interval = intervalCollection.removeIntervalById(id);
	assert.strictEqual(interval, intervalArray[intervalArray.length - 1]);
	interval = intervalCollection.getIntervalById(id);
	assert.strictEqual(interval, undefined);
	interval = intervalCollection.removeIntervalById(id);
	assert.strictEqual(interval, undefined);

	for (interval of intervalArray) {
		id = interval.getIntervalId();
		intervalCollection.removeIntervalById(id);
	}
}
describeCompat("SharedInterval", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap, SharedString } = apis.dds;
	const { createOverlappingIntervalsIndex } = apis.dataRuntime.packages.sequence;
	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});
	describe("one client", () => {
		const stringId = "stringKey";

		let sharedString: SharedString;
		let intervals: ISequenceIntervalCollection;
		let overlappingIntervalsIndex: ISequenceOverlappingIntervalsIndex;
		let dataObject: ITestFluidObject & IFluidLoadable;

		const assertIntervals = (expected: readonly { start: number; end: number }[]) => {
			assertSequenceIntervals(sharedString, intervals, overlappingIntervalsIndex, expected);
		};

		beforeEach("setup", async () => {
			const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
			const testContainerConfig: ITestContainerConfig = {
				fluidDataObjectType: DataObjectFactoryType.Test,
				registry,
				runtimeOptions: {
					flushMode: FlushMode.Immediate,
				},
			};
			const container = await provider.makeTestContainer(testContainerConfig);
			dataObject = (await container.getEntryPoint()) as ITestFluidObject;
			sharedString = await dataObject.getSharedObject<SharedString>(stringId);
			sharedString.insertText(0, "012");

			intervals = sharedString.getIntervalCollection("intervals");
			overlappingIntervalsIndex = createOverlappingIntervalsIndex(sharedString);
			intervals.attachIndex(overlappingIntervalsIndex);
			testIntervalOperations(intervals);
		});

		afterEach(() => {
			intervals.detachIndex(overlappingIntervalsIndex);
		});

		it("replace all is included", async () => {
			sharedString.insertText(3, ".");
			intervals.add({ start: 0, end: 3 });
			assertIntervals([{ start: 0, end: 3 }]);

			sharedString.replaceText(0, 3, `xxx`);
			assertIntervals([{ start: 0, end: 3 }]);
		});

		it("remove all yields empty range", async () => {
			const len = sharedString.getLength();
			intervals.add({ start: 0, end: len - 1 });
			assertIntervals([{ start: 0, end: len - 1 }]);

			sharedString.removeRange(0, len);
			await provider.ensureSynchronized();
			assertIntervals([{ start: DetachedReferencePosition, end: DetachedReferencePosition }]);
		});

		it("replace before is excluded", async () => {
			intervals.add({ start: 1, end: 2 });
			assertIntervals([{ start: 1, end: 2 }]);

			sharedString.replaceText(0, 1, `x`);
			assertIntervals([{ start: 1, end: 2 }]);
		});

		it("insert at first position is excluded", async () => {
			intervals.add({ start: 0, end: 2 });
			assertIntervals([{ start: 0, end: 2 }]);

			sharedString.insertText(0, ".");
			assertIntervals([{ start: 1, end: 3 }]);
		});

		it("replace first is included", async () => {
			sharedString.insertText(0, "012");
			intervals.add({ start: 0, end: 2 });
			assertIntervals([{ start: 0, end: 2 }]);

			sharedString.replaceText(0, 1, `x`);
			assertIntervals([{ start: 0, end: 2 }]);
		});

		it("replace last is included", async () => {
			sharedString.insertText(0, "012");
			intervals.add({ start: 0, end: 2 });
			assertIntervals([{ start: 0, end: 2 }]);

			sharedString.replaceText(1, 2, `x`);
			assertIntervals([{ start: 0, end: 2 }]);
		});

		it("insert at last position is included", async () => {
			intervals.add({ start: 0, end: 2 });
			assertIntervals([{ start: 0, end: 2 }]);

			sharedString.insertText(2, ".");
			assertIntervals([{ start: 0, end: 3 }]);
		});

		it("insert after last position is excluded", async () => {
			intervals.add({ start: 0, end: 2 });
			assertIntervals([{ start: 0, end: 2 }]);

			sharedString.insertText(3, ".");
			assertIntervals([{ start: 0, end: 2 }]);
		});

		it("replace after", async () => {
			intervals.add({ start: 0, end: 1 });
			assertIntervals([{ start: 0, end: 1 }]);

			sharedString.replaceText(1, 2, `x`);
			assertIntervals([{ start: 0, end: 1 }]);
		});

		it("repeated replacement", async () => {
			sharedString.insertText(0, "012");
			intervals.add({ start: 0, end: 2 });
			assertIntervals([{ start: 0, end: 2 }]);

			for (let j = 0; j < 3; j++) {
				for (let i = 0; i < 5; i++) {
					sharedString.replaceText(0, 1, `x`);
					assertIntervals([{ start: 0, end: 2 }]);

					sharedString.replaceText(1, 2, `x`);
					assertIntervals([{ start: 0, end: 2 }]);

					sharedString.replaceText(2, 3, `x`);
					assertIntervals([{ start: 0, end: 2 }]);
				}

				await provider.ensureSynchronized();
			}
		});
	});

	describe("multiple clients", () => {
		it("propagates", async () => {
			const stringId = "stringKey";
			const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
			const testContainerConfig: ITestContainerConfig = {
				fluidDataObjectType: DataObjectFactoryType.Test,
				registry,
			};

			// Create a Container for the first client.
			const container1 = await provider.makeTestContainer(testContainerConfig);
			const dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
			const sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);

			sharedString1.insertText(0, "0123456789");
			const intervals1 = sharedString1.getIntervalCollection("intervals");
			intervals1.add({ start: 1, end: 7 });

			const overlappingIntervalsIndex1 = createOverlappingIntervalsIndex(sharedString1);
			intervals1.attachIndex(overlappingIntervalsIndex1);

			assertSequenceIntervals(sharedString1, intervals1, overlappingIntervalsIndex1, [
				{ start: 1, end: 7 },
			]);

			// Load the Container that was created by the first client.
			const container2 = await provider.loadTestContainer(testContainerConfig);
			const dataObject2 = (await container2.getEntryPoint()) as ITestFluidObject;

			await provider.ensureSynchronized();

			const sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);
			const intervals2 = sharedString2.getIntervalCollection("intervals");

			const overlappingIntervalsIndex2 = createOverlappingIntervalsIndex(sharedString2);
			intervals2.attachIndex(overlappingIntervalsIndex2);

			assertSequenceIntervals(sharedString2, intervals2, overlappingIntervalsIndex2, [
				{ start: 1, end: 7 },
			]);

			sharedString2.removeRange(4, 5);
			assertSequenceIntervals(sharedString2, intervals2, overlappingIntervalsIndex2, [
				{ start: 1, end: 6 },
			]);

			sharedString2.insertText(4, "x");
			assertSequenceIntervals(sharedString2, intervals2, overlappingIntervalsIndex2, [
				{ start: 1, end: 7 },
			]);

			await provider.ensureSynchronized();
			assertSequenceIntervals(sharedString1, intervals1, overlappingIntervalsIndex1, [
				{ start: 1, end: 7 },
			]);

			intervals1.detachIndex(overlappingIntervalsIndex1);
			intervals2.detachIndex(overlappingIntervalsIndex2);
		});

		it("multi-client interval ops", async () => {
			const stringId = "stringKey";
			const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
			const testContainerConfig: ITestContainerConfig = {
				fluidDataObjectType: DataObjectFactoryType.Test,
				registry,
			};

			// Create a Container for the first client.
			const container1 = await provider.makeTestContainer(testContainerConfig);
			const dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
			const sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);

			sharedString1.insertText(0, "012");
			const intervals1 = sharedString1.getIntervalCollection("intervals");
			const intervalArray: any[] = [];
			let interval: SequenceInterval;

			intervalArray[0] = intervals1.add({ start: 0, end: 0 });
			intervalArray[1] = intervals1.add({ start: 0, end: 1 });
			intervalArray[2] = intervals1.add({ start: 0, end: 2 });
			intervalArray[3] = intervals1.add({ start: 1, end: 0 });
			intervalArray[4] = intervals1.add({ start: 1, end: 1 });
			intervalArray[5] = intervals1.add({ start: 1, end: 2 });
			intervalArray[6] = intervals1.add({ start: 2, end: 0 });
			intervalArray[7] = intervals1.add({ start: 2, end: 1 });
			intervalArray[8] = intervals1.add({ start: 2, end: 2 });

			// Load the Container that was created by the first client.
			const container2 = await provider.loadTestContainer(testContainerConfig);
			const dataObject2 = (await container2.getEntryPoint()) as ITestFluidObject;

			await provider.ensureSynchronized();

			const sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);
			const intervals2 = sharedString2.getIntervalCollection("intervals");

			const checkIdEquals = (a: SequenceInterval, b: SequenceInterval, s: string) => {
				assert.strictEqual(a.getIntervalId(), b.getIntervalId(), s);
			};
			let i: number;
			let result;
			let tempArray: SequenceInterval[] = [];
			let iterator = intervals2.CreateForwardIteratorWithStartPosition(1);
			tempArray[0] = intervalArray[3];
			tempArray[1] = intervalArray[4];
			tempArray[2] = intervalArray[5];
			for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
				checkIdEquals(
					result.value,
					tempArray[i],
					"Mismatch in forward iteration with start position",
				);
			}
			assert.strictEqual(
				i,
				tempArray.length,
				"Interval omitted from forward iteration with start position",
			);

			iterator = intervals2.CreateBackwardIteratorWithStartPosition(0);
			tempArray = [];
			tempArray[0] = intervalArray[2];
			tempArray[1] = intervalArray[1];
			tempArray[2] = intervalArray[0];
			for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
				checkIdEquals(
					result.value,
					tempArray[i],
					"Mismatch in backward iteration with start position",
				);
			}
			assert.strictEqual(
				i,
				tempArray.length,
				"Interval omitted from backward iteration with start position",
			);

			iterator = intervals2.CreateBackwardIteratorWithEndPosition(1);
			tempArray = [];
			tempArray[0] = intervalArray[7];
			tempArray[1] = intervalArray[4];
			tempArray[2] = intervalArray[1];
			for (i = 0, result = iterator.next(); !result.done; i++, result = iterator.next()) {
				checkIdEquals(
					result.value,
					tempArray[i],
					"Mismatch in backward iteration with end position",
				);
			}
			assert.strictEqual(
				i,
				tempArray.length,
				"Interval omitted from backward iteration with end position",
			);

			i = 0;
			for (const interval2 of intervals2) {
				assert(interval2);
				checkIdEquals(
					interval2,
					intervalArray[i],
					"Mismatch in for...of iteration of collection",
				);
				i++;
			}
			assert.strictEqual(i, intervalArray.length, "Interval omitted from for...of iteration");

			for (interval of intervalArray) {
				const id = interval.getIntervalId();
				intervals2.removeIntervalById(id);
			}

			await provider.ensureSynchronized();

			if (intervals1[Symbol.iterator]) {
				for (const _interval of intervals1) {
					assert(false, "intervals1 should be empty after emptying invervals2");
				}
			}
		});

		describe("Conflicting ops", () => {
			async function setupConflictingOps() {
				const stringId = "stringKey";
				const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
				const testContainerConfig: ITestContainerConfig = {
					fluidDataObjectType: DataObjectFactoryType.Test,
					registry,
				};

				const container1 = await provider.makeTestContainer(testContainerConfig);
				const dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
				const sharedString1 = await dataObject1.getSharedObject<SharedString>(stringId);
				sharedString1.insertText(0, "01234");
				const intervals1 = sharedString1.getIntervalCollection("intervals");

				const container2 = await provider.loadTestContainer(testContainerConfig);
				const dataObject2 = (await container2.getEntryPoint()) as ITestFluidObject;
				const sharedString2 = await dataObject2.getSharedObject<SharedString>(stringId);
				const intervals2 = sharedString2.getIntervalCollection("intervals");

				await provider.ensureSynchronized();
				return { sharedString1, sharedString2, intervals1, intervals2 };
			}

			it("conflicting adds are visible on both clients", async () => {
				const { intervals1, intervals2 } = await setupConflictingOps();
				const interval1 = intervals1.add({ start: 0, end: 0 });
				const id1 = interval1.getIntervalId();
				const interval2 = intervals2.add({ start: 0, end: 0 });
				const id2 = interval2.getIntervalId();
				await provider.ensureSynchronized();
				assert.notStrictEqual(
					intervals1.getIntervalById(id2),
					undefined,
					"Interval not added to collection 1",
				);
				assert.notStrictEqual(
					intervals1.getIntervalById(id2),
					interval1,
					"Unique interval not added",
				);
				assert.notStrictEqual(
					intervals2.getIntervalById(id1),
					undefined,
					"Interval not added to collection 2",
				);
				assert.notStrictEqual(
					intervals2.getIntervalById(id1),
					interval2,
					"Unique interval not added",
				);
			});

			it("conflicting removes are visible on both clients", async () => {
				const { intervals1, intervals2 } = await setupConflictingOps();
				const interval1 = intervals1.add({ start: 0, end: 0 });
				const id1 = interval1.getIntervalId();
				const interval2 = intervals2.add({ start: 0, end: 0 });
				const id2 = interval2.getIntervalId();
				await provider.ensureSynchronized();
				intervals1.removeIntervalById(id2);
				intervals2.removeIntervalById(id1);
				await provider.ensureSynchronized();
				assert.strictEqual(
					intervals1.getIntervalById(id1),
					undefined,
					"Interval not removed from other client",
				);
				assert.strictEqual(
					intervals2.getIntervalById(id2),
					undefined,
					"Interval not removed from other client",
				);
			});

			it("conflicting removes + add resolves to single interval", async () => {
				const { intervals1, intervals2 } = await setupConflictingOps();
				const interval1 = intervals1.add({ start: 1, end: 1 });
				let id1 = interval1.getIntervalId();
				const interval2 = intervals2.add({ start: 1, end: 1 });
				const id2 = interval2.getIntervalId();
				await provider.ensureSynchronized();
				intervals2.removeIntervalById(id1);
				intervals1.removeIntervalById(id2);
				const newInterval1 = intervals1.add({ start: 1, end: 1 });
				id1 = newInterval1.getIntervalId();
				await provider.ensureSynchronized();
				assert.strictEqual(
					newInterval1,
					intervals1.getIntervalById(id1),
					"Interval missing from collection 1",
				);
				for (const interval of intervals1) {
					assert.strictEqual(interval, newInterval1, "Oddball interval found in client 1");
				}
				const foundInterval2 = intervals2.getIntervalById(id1);
				assert.notStrictEqual(foundInterval2, undefined, "Interval missing from collection 2");
				for (const interval of intervals2) {
					assert.strictEqual(interval, foundInterval2, "Oddball interval found in client 2");
				}
			});

			it("conflicting changes are resolved consistently", async () => {
				const { intervals1, intervals2 } = await setupConflictingOps();
				const id1 = intervals1.add({ start: 1, end: 1 }).getIntervalId();
				await provider.ensureSynchronized();

				intervals1.change(id1, { start: 1, end: 2 });
				intervals2.change(id1, { start: 2, end: 1 });
				await provider.ensureSynchronized();
				const foundInterval2 = intervals2.getIntervalById(id1);
				assert.strictEqual(foundInterval2?.getIntervalId(), id1);
				for (const interval of intervals1) {
					const id: string = interval?.getIntervalId();
					assert.strictEqual(
						interval?.start.getOffset(),
						intervals2.getIntervalById(id)?.start.getOffset(),
						"Conflicting changes",
					);
					assert.strictEqual(
						interval?.end.getOffset(),
						intervals2.getIntervalById(id)?.end.getOffset(),
						"Conflicting changes",
					);
				}
				for (const interval of intervals2) {
					const id: string = interval?.getIntervalId();
					assert.strictEqual(
						interval?.start.getOffset(),
						intervals1.getIntervalById(id)?.start.getOffset(),
						"Conflicting changes",
					);
					assert.strictEqual(
						interval?.end.getOffset(),
						intervals1.getIntervalById(id)?.end.getOffset(),
						"Conflicting changes",
					);
				}
			});

			describe("conflicting property changes", () => {
				function verifyAndClearDeltas(
					actual: PropertySet[],
					expected: PropertySet[],
					message?: string,
				) {
					assert.deepEqual(actual.splice(0), expected, message);
				}
				function verifyIntervalProperties(
					properties1: PropertySet | undefined,
					properties2: PropertySet | undefined,
					expected: PropertySet,
				) {
					assert.deepStrictEqual(
						{ ...properties1 },
						{ ...expected },
						"properties1 does not match",
					);
					assert.deepStrictEqual(
						{ ...properties2 },
						{ ...expected },
						"properties2 does not match",
					);
				}

				it("change different properties", async () => {
					const { intervals1, intervals2 } = await setupConflictingOps();
					const interval1 = intervals1.add({ start: 1, end: 1 });
					const id = interval1.getIntervalId();
					await provider.ensureSynchronized();

					const deltaEvents1: PropertySet[] = [];
					const deltaEvents2: PropertySet[] = [];
					intervals1.on("propertyChanged", (_, delta) => deltaEvents1.push(delta));
					intervals2.on("propertyChanged", (_, delta) => deltaEvents2.push(delta));
					intervals1.change(id, { props: { prop1: "prop1" } });
					verifyAndClearDeltas(deltaEvents1, [{ prop1: null }]);
					verifyAndClearDeltas(deltaEvents2, []);
					await provider.opProcessingController.processOutgoing();
					intervals2.change(id, { props: { prop2: "prop2" } });
					verifyAndClearDeltas(deltaEvents1, []);
					verifyAndClearDeltas(deltaEvents2, [{ prop2: null }]);
					await provider.ensureSynchronized();
					verifyAndClearDeltas(deltaEvents1, [{ prop2: null }]);
					verifyAndClearDeltas(deltaEvents2, [{ prop1: null }]);
					verifyIntervalProperties(
						intervals1.getIntervalById(id)?.properties,
						intervals2.getIntervalById(id)?.properties,
						{ prop1: "prop1", prop2: "prop2" },
					);
				});
				it("change the same property", async () => {
					const { intervals1, intervals2 } = await setupConflictingOps();
					const interval1 = intervals1.add({ start: 1, end: 1 });
					const id = interval1.getIntervalId();

					await provider.ensureSynchronized();
					const deltaEvents1: PropertySet[] = [];
					const deltaEvents2: PropertySet[] = [];
					intervals1.on("propertyChanged", (_, delta) => deltaEvents1.push(delta));
					intervals2.on("propertyChanged", (_, delta) => deltaEvents2.push(delta));

					await provider.opProcessingController.processOutgoing();
					intervals2.change(id, { props: { prop1: "2" } });
					verifyAndClearDeltas(deltaEvents1, []);
					verifyAndClearDeltas(deltaEvents2, [{ prop1: null }]);

					await provider.ensureSynchronized();
					verifyAndClearDeltas(deltaEvents1, [{ prop1: null }]);
					verifyAndClearDeltas(deltaEvents2, []);
					assert.deepEqual(
						intervals1.getIntervalById(id)?.properties,
						intervals2.getIntervalById(id)?.properties,
					);
					intervals1.change(id, { props: { prop1: "1again" } });
					verifyAndClearDeltas(deltaEvents1, [{ prop1: "2" }]);
					verifyAndClearDeltas(deltaEvents2, []);

					await provider.opProcessingController.processOutgoing();
					intervals2.change(id, { props: { prop1: null } });
					verifyAndClearDeltas(deltaEvents1, []);
					verifyAndClearDeltas(deltaEvents2, [{ prop1: "2" }]);

					await provider.ensureSynchronized();
					verifyAndClearDeltas(deltaEvents1, [{ prop1: "1again" }]);
					verifyAndClearDeltas(deltaEvents2, []);
					verifyIntervalProperties(
						intervals1.getIntervalById(id)?.properties,
						intervals2.getIntervalById(id)?.properties,
						{},
					);
				});
			});

			it("conflicting removes after property changes remove interval from both clients", async () => {
				const { intervals1, intervals2 } = await setupConflictingOps();
				const interval1 = intervals1.add({ start: 1, end: 1 });
				const id1 = interval1.getIntervalId();
				await provider.ensureSynchronized();
				intervals1.removeIntervalById(id1);
				intervals2.removeIntervalById(id1);
				await provider.ensureSynchronized();
				for (const interval of intervals1) {
					assert.fail("Interval not removed from collection 1");
				}
				for (const interval of intervals2) {
					assert.fail("Interval not removed from collection 2");
				}
			});
		});
	});

	describe("Handles in value types", () => {
		const mapId = "mapKey";
		const stringId = "stringKey";

		const registry: ChannelFactoryRegistry = [
			[mapId, SharedMap.getFactory()],
			[stringId, SharedString.getFactory()],
		];
		const testContainerConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry,
		};

		let dataObject1: ITestFluidObject;
		let sharedMap1: ISharedMap;
		let sharedMap2: ISharedMap;
		let sharedMap3: ISharedMap;

		beforeEach("setupSharedMaps", async () => {
			// Create a Container for the first client.
			const container1 = await provider.makeTestContainer(testContainerConfig);
			dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
			sharedMap1 = await dataObject1.getSharedObject<ISharedMap>(mapId);

			// Load the Container that was created by the first client.
			const container2 = await provider.loadTestContainer(testContainerConfig);
			const dataObject2 = (await container2.getEntryPoint()) as ITestFluidObject;
			sharedMap2 = await dataObject2.getSharedObject<ISharedMap>(mapId);

			// Load the Container that was created by the first client.
			const container3 = await provider.loadTestContainer(testContainerConfig);
			const dataObject3 = (await container3.getEntryPoint()) as ITestFluidObject;
			sharedMap3 = await dataObject3.getSharedObject<ISharedMap>(mapId);
		});

		// This functionality is used in Word and FlowView's "add comment" functionality.
		it("Can store shared objects in a shared string's interval collection via properties", async () => {
			sharedMap1.set("outerString", SharedString.create(dataObject1.runtime).handle);
			await provider.ensureSynchronized();

			const outerString1 = await sharedMap1
				.get<IFluidHandle<SharedString>>("outerString")
				?.get();
			const outerString2 = await sharedMap2
				.get<IFluidHandle<SharedString>>("outerString")
				?.get();
			const outerString3 = await sharedMap3
				.get<IFluidHandle<SharedString>>("outerString")
				?.get();
			assert.ok(outerString1, "String did not correctly set as value in container 1's map");
			assert.ok(outerString2, "String did not correctly set as value in container 2's map");
			assert.ok(outerString3, "String did not correctly set as value in container 3's map");

			outerString1.insertText(0, "outer string");

			const intervalCollection1 = outerString1.getIntervalCollection("comments");
			await provider.ensureSynchronized();

			const intervalCollection2 = outerString2.getIntervalCollection("comments");
			const intervalCollection3 = outerString3.getIntervalCollection("comments");
			assert.ok(
				intervalCollection1,
				"Could not get the comments interval collection in container 1",
			);
			assert.ok(
				intervalCollection2,
				"Could not get the comments interval collection in container 2",
			);
			assert.ok(
				intervalCollection3,
				"Could not get the comments interval collection in container 3",
			);

			const comment1Text = SharedString.create(dataObject1.runtime);
			comment1Text.insertText(0, "a comment...");
			intervalCollection1.add({
				start: 0,
				end: 3,
				props: {
					story: comment1Text.handle,
				},
			});
			const comment2Text = SharedString.create(dataObject1.runtime);
			comment2Text.insertText(0, "another comment...");
			intervalCollection1.add({
				start: 5,
				end: 7,
				props: {
					story: comment2Text.handle,
				},
			});
			const nestedMap = SharedMap.create(dataObject1.runtime, "nestedMap");
			nestedMap.set("nestedKey", "nestedValue");
			intervalCollection1.add({ start: 8, end: 9, props: { story: nestedMap.handle } });
			await provider.ensureSynchronized();

			const serialized1 = Array.from(intervalCollection1);
			const serialized2 = Array.from(intervalCollection2);
			const serialized3 = Array.from(intervalCollection3);
			assert.equal(serialized1.length, 3, "Incorrect interval collection size in container 1");
			assert.equal(serialized2.length, 3, "Incorrect interval collection size in container 2");
			assert.equal(serialized3.length, 3, "Incorrect interval collection size in container 3");

			const interval1From3Properties = serialized3[0].properties;
			assert(interval1From3Properties);
			const comment1From3 = await (
				interval1From3Properties.story as IFluidHandle<SharedString>
			).get();
			assert.equal(
				comment1From3.getText(0, 12),
				"a comment...",
				"Incorrect text in interval collection's shared string",
			);
			const interval3From3Properties = serialized3[2].properties;
			assert(interval3From3Properties);
			const mapFrom3 = await (
				interval3From3Properties.story as IFluidHandle<ISharedMap>
			).get();
			assert.equal(
				mapFrom3.get("nestedKey"),
				"nestedValue",
				"Incorrect value in interval collection's shared map",
			);

			const summaryBlob = (await outerString2.summarize()).summary.tree.header as ISummaryBlob;
			// Since it's based on a map kernel, its contents parse as
			// an IMapDataObjectSerializable with the "comments" member we set
			const parsedContent = JSON.parse(summaryBlob.content as string);
			// LocalIntervalCollection serializes as ISerializedIntervalCollectionV2,
			// let's get the first comment
			const serializedInterval1FromSnapshotProperties = (
				parsedContent.comments.value as ISerializedIntervalCollectionV2
			).intervals[0][4];
			// The "story" is the ILocalValue of the handle pointing to the SharedString
			assert(serializedInterval1FromSnapshotProperties);
			const handleLocalValueFromSnapshot = serializedInterval1FromSnapshotProperties.story as {
				type: string;
			};
			assert.equal(
				handleLocalValueFromSnapshot.type,
				"__fluid_handle__",
				"Incorrect handle type in shared interval's summary",
			);
		});
	});
});
