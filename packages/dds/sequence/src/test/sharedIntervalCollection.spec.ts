/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { Client } from "@fluidframework/merge-tree/internal";
import {
	MockContainerRuntime,
	MockContainerRuntimeFactory,
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { IIntervalCollection } from "../intervalCollection.js";
import {
	IOverlappingIntervalsIndex,
	OverlappingIntervalsIndex,
} from "../intervalIndex/index.js";
import { Interval, intervalHelpers } from "../intervals/index.js";
import {
	SharedIntervalCollection,
	SharedIntervalCollectionFactory,
} from "../sharedIntervalCollection.js";

const assertIntervals = (
	intervalCollection: IIntervalCollection<Interval>,
	expected: readonly { start: number; end: number }[],
	overlappingIntervalsIndex?: IOverlappingIntervalsIndex<Interval>,
) => {
	const actual = Array.from(intervalCollection);
	if (overlappingIntervalsIndex) {
		const overlapping = overlappingIntervalsIndex.findOverlappingIntervals(
			Number.NEGATIVE_INFINITY,
			Number.POSITIVE_INFINITY,
		);
		assert.deepEqual(actual, overlapping, "Interval search returned inconsistent results");
	}
	assert.strictEqual(
		actual.length,
		expected.length,
		`the number of intervals must be consistent`,
	);

	const actualPos = actual.map((interval) => {
		assert(interval);
		return { start: interval.start, end: interval.end };
	});
	assert.deepEqual(actualPos, expected, "intervals are not as expected");
};

function createConnectedIntervalCollection(
	id: string,
	runtimeFactory: MockContainerRuntimeFactoryForReconnection,
): {
	intervals: SharedIntervalCollection;
	containerRuntime: MockContainerRuntimeForReconnection;
};
function createConnectedIntervalCollection(
	id: string,
	runtimeFactory: MockContainerRuntimeFactory,
): {
	intervals: SharedIntervalCollection;
	containerRuntime: MockContainerRuntime;
};
function createConnectedIntervalCollection(
	id: string,
	runtimeFactory: MockContainerRuntimeFactory | MockContainerRuntimeFactoryForReconnection,
) {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	const intervals = new SharedIntervalCollection(
		id,
		dataStoreRuntime,
		SharedIntervalCollectionFactory.Attributes,
	);
	const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(undefined),
	};
	intervals.connect(services);
	intervals.initializeLocal();
	return { intervals, containerRuntime };
}

describe("SharedIntervalCollection", () => {
	describe("In a connected state", () => {
		let runtimeFactory: MockContainerRuntimeFactory;
		let intervals1: SharedIntervalCollection;
		let intervals2: SharedIntervalCollection;
		let collection1: IIntervalCollection<Interval>;
		let collection2: IIntervalCollection<Interval>;
		let overlappingIntervalsIndex1: IOverlappingIntervalsIndex<Interval>;
		let overlappingIntervalsIndex2: IOverlappingIntervalsIndex<Interval>;

		beforeEach(() => {
			runtimeFactory = new MockContainerRuntimeFactory();
			intervals1 = createConnectedIntervalCollection("collection 1", runtimeFactory).intervals;
			intervals2 = createConnectedIntervalCollection("collection 2", runtimeFactory).intervals;
			collection1 = intervals1.getIntervalCollection("test");
			collection2 = intervals2.getIntervalCollection("test");
			overlappingIntervalsIndex1 = new OverlappingIntervalsIndex(
				undefined as unknown as Client,
				intervalHelpers,
			);
			overlappingIntervalsIndex2 = new OverlappingIntervalsIndex(
				undefined as unknown as Client,
				intervalHelpers,
			);
			collection1.attachIndex(overlappingIntervalsIndex1);
			collection2.attachIndex(overlappingIntervalsIndex2);
		});

		afterEach(() => {
			collection1.detachIndex(overlappingIntervalsIndex1);
			collection2.detachIndex(overlappingIntervalsIndex2);
		});

		it("Can add intervals from multiple clients", () => {
			collection1.add({ start: 0, end: 20 });
			collection2.add({ start: 10, end: 30 });
			assertIntervals(collection1, [{ start: 0, end: 20 }], overlappingIntervalsIndex1);
			assertIntervals(collection2, [{ start: 10, end: 30 }], overlappingIntervalsIndex2);

			assert.equal(overlappingIntervalsIndex1.findOverlappingIntervals(1, 3).length, 1);
			assert.equal(overlappingIntervalsIndex2.findOverlappingIntervals(1, 3).length, 0);
			assert.equal(overlappingIntervalsIndex1.findOverlappingIntervals(1, 19).length, 1);
			assert.equal(overlappingIntervalsIndex2.findOverlappingIntervals(1, 19).length, 1);

			runtimeFactory.processAllMessages();
			const expected = [
				{ start: 0, end: 20 },
				{ start: 10, end: 30 },
			];
			assertIntervals(collection1, expected, overlappingIntervalsIndex1);
			assertIntervals(collection2, expected, overlappingIntervalsIndex2);

			assert.equal(overlappingIntervalsIndex1.findOverlappingIntervals(1, 3).length, 1);
			assert.equal(overlappingIntervalsIndex2.findOverlappingIntervals(1, 3).length, 1);
			assert.equal(overlappingIntervalsIndex1.findOverlappingIntervals(1, 19).length, 2);
			assert.equal(overlappingIntervalsIndex2.findOverlappingIntervals(1, 19).length, 2);
		});

		it("Can remove intervals that were added", () => {
			const interval = collection1.add({ start: 0, end: 20 });
			collection2.add({ start: 10, end: 30 });
			runtimeFactory.processAllMessages();

			const id = interval.getIntervalId() ?? assert.fail("expected interval to have id");
			collection1.removeIntervalById(id);
			assertIntervals(collection1, [{ start: 10, end: 30 }], overlappingIntervalsIndex1);
			assertIntervals(
				collection2,
				[
					{ start: 0, end: 20 },
					{ start: 10, end: 30 },
				],
				overlappingIntervalsIndex2,
			);

			runtimeFactory.processAllMessages();
			assertIntervals(collection1, [{ start: 10, end: 30 }], overlappingIntervalsIndex1);
			assertIntervals(collection2, [{ start: 10, end: 30 }], overlappingIntervalsIndex2);
		});

		it("Can change intervals", () => {
			const interval = collection1.add({ start: 0, end: 20 });
			collection2.add({ start: 10, end: 30 });
			runtimeFactory.processAllMessages();

			const id = interval.getIntervalId() ?? assert.fail("expected interval to have id");
			collection1.change(id, { start: 10, end: 20 });
			assertIntervals(
				collection1,
				[
					{ start: 10, end: 20 },
					{ start: 10, end: 30 },
				],
				overlappingIntervalsIndex1,
			);
			assertIntervals(
				collection2,
				[
					{ start: 0, end: 20 },
					{ start: 10, end: 30 },
				],
				overlappingIntervalsIndex2,
			);

			runtimeFactory.processAllMessages();
			assertIntervals(
				collection1,
				[
					{ start: 10, end: 20 },
					{ start: 10, end: 30 },
				],
				overlappingIntervalsIndex1,
			);
			assertIntervals(
				collection2,
				[
					{ start: 10, end: 20 },
					{ start: 10, end: 30 },
				],
				overlappingIntervalsIndex2,
			);
		});
	});

	describe("on reconnect", () => {
		let runtimeFactory: MockContainerRuntimeFactoryForReconnection;
		let intervals1: SharedIntervalCollection;
		let intervals2: SharedIntervalCollection;
		let runtime1: MockContainerRuntimeForReconnection;
		let collection1: IIntervalCollection<Interval>;
		let collection2: IIntervalCollection<Interval>;
		let overlappingIntervalsIndex1: IOverlappingIntervalsIndex<Interval>;
		let overlappingIntervalsIndex2: IOverlappingIntervalsIndex<Interval>;

		beforeEach(() => {
			runtimeFactory = new MockContainerRuntimeFactoryForReconnection();
			const client1 = createConnectedIntervalCollection("collection 1", runtimeFactory);
			runtime1 = client1.containerRuntime;
			intervals1 = client1.intervals;
			intervals2 = createConnectedIntervalCollection("collection 2", runtimeFactory).intervals;
			collection1 = intervals1.getIntervalCollection("test");
			collection2 = intervals2.getIntervalCollection("test");

			overlappingIntervalsIndex1 = new OverlappingIntervalsIndex(
				undefined as unknown as Client,
				intervalHelpers,
			);
			overlappingIntervalsIndex2 = new OverlappingIntervalsIndex(
				undefined as unknown as Client,
				intervalHelpers,
			);
			collection1.attachIndex(overlappingIntervalsIndex1);
			collection2.attachIndex(overlappingIntervalsIndex2);
		});

		afterEach(() => {
			collection1.detachIndex(overlappingIntervalsIndex1);
			collection2.detachIndex(overlappingIntervalsIndex2);
		});

		it("can rebase add ops", () => {
			runtime1.connected = false;
			collection1.add({ start: 15, end: 17 });
			runtimeFactory.processAllMessages();

			assertIntervals(collection1, [{ start: 15, end: 17 }], overlappingIntervalsIndex1);
			assertIntervals(collection2, [], overlappingIntervalsIndex2);

			runtime1.connected = true;
			runtimeFactory.processAllMessages();

			assertIntervals(collection1, [{ start: 15, end: 17 }], overlappingIntervalsIndex1);
			assertIntervals(collection2, [{ start: 15, end: 17 }], overlappingIntervalsIndex2);
		});
	});
});
