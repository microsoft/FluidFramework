/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { AttachState } from "@fluidframework/container-definitions";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import { ReferenceType, SlidingPreference, Side } from "@fluidframework/merge-tree/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { IIntervalCollection, intervalLocatorFromEndpoint } from "../intervalCollection.js";
import { IntervalStickiness, SequenceInterval } from "../intervals/index.js";
import { SharedStringFactory } from "../sequenceFactory.js";
import { SharedStringClass, type ISharedString } from "../sharedString.js";

import { assertSequenceIntervals } from "./intervalTestUtils.js";

async function loadSharedString(
	containerRuntimeFactory: MockContainerRuntimeFactory,
	id: string,
	summary: ISummaryTree,
): Promise<ISharedString> {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	dataStoreRuntime.deltaManagerInternal.lastSequenceNumber =
		containerRuntimeFactory.sequenceNumber;
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: MockStorage.createFromSummary(summary),
	};
	const sharedString = new SharedStringClass(
		dataStoreRuntime,
		id,
		SharedStringFactory.Attributes,
	);
	await sharedString.load(services);
	return sharedString;
}

async function getSingleIntervalSummary(): Promise<{ summary: ISummaryTree; seq: number }> {
	const containerRuntimeFactory = new MockContainerRuntimeFactory();
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	dataStoreRuntime.setAttachState(AttachState.Attached);
	dataStoreRuntime.options = {
		intervalStickinessEnabled: true,
	};
	containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};
	const sharedString = new SharedStringClass(
		dataStoreRuntime,
		"",
		SharedStringFactory.Attributes,
	);
	sharedString.initializeLocal();
	sharedString.connect(services);
	sharedString.insertText(0, "ABCDEF");
	const collection = sharedString.getIntervalCollection("test");
	collection.add({ start: 0, end: 2 });
	const collectionStartSticky = sharedString.getIntervalCollection("start-sticky");
	const startStickyInterval = collectionStartSticky.add({
		start: { pos: 0, side: Side.After },
		end: { pos: 2, side: Side.After },
	});
	assert.equal(startStickyInterval.stickiness, IntervalStickiness.START);
	const collectionEndSticky = sharedString.getIntervalCollection("end-sticky");
	const endStickyInterval = collectionEndSticky.add({
		start: { pos: 0, side: Side.Before },
		end: { pos: 2, side: Side.Before },
	});
	assert.equal(endStickyInterval.stickiness, IntervalStickiness.END);
	containerRuntimeFactory.processAllMessages();
	const { summary } = await sharedString.summarize();
	return { summary, seq: containerRuntimeFactory.sequenceNumber };
}

describe("IntervalCollection snapshotting", () => {
	let summary: ISummaryTree;
	let seq: number;
	before(async () => {
		({ summary, seq } = await getSingleIntervalSummary());
	});

	let containerRuntimeFactory: MockContainerRuntimeFactory;
	beforeEach(() => {
		containerRuntimeFactory = new MockContainerRuntimeFactory();
		containerRuntimeFactory.sequenceNumber = seq;
	});

	it("creates the correct reference type on reload", async () => {
		// This is a direct regression test for an issue with interval collection deserialization logic.
		// It manifested in later failures demonstrated by the "enable operations on reload" suite.
		const sharedString = await loadSharedString(containerRuntimeFactory, "1", summary);
		const collection = sharedString.getIntervalCollection("test");
		const intervals = Array.from(collection);
		assert.equal(intervals.length, 1);
		const interval = intervals[0] ?? assert.fail();
		/* eslint-disable no-bitwise */
		assert(
			interval.start.refType === (ReferenceType.RangeBegin | ReferenceType.SlideOnRemove),
		);
		assert(interval.end.refType === (ReferenceType.RangeEnd | ReferenceType.SlideOnRemove));
		/* eslint-enable no-bitwise */
	});

	it("start stickiness is persisted", async () => {
		const sharedString = await loadSharedString(containerRuntimeFactory, "1", summary);
		const collection = sharedString.getIntervalCollection("start-sticky");
		const intervals = Array.from(collection);
		assert.equal(intervals.length, 1);
		const interval = intervals[0] ?? assert.fail();
		assert.equal(interval.stickiness, IntervalStickiness.START);
		assert.equal(interval.start.slidingPreference, SlidingPreference.BACKWARD);
		assert.equal(interval.end.slidingPreference, SlidingPreference.BACKWARD);
	});

	it("end stickiness is stored as undefined", async () => {
		const sharedString = await loadSharedString(containerRuntimeFactory, "1", summary);
		const collection = sharedString.getIntervalCollection("end-sticky");
		const intervals = Array.from(collection);
		assert.equal(intervals.length, 1);
		const interval = intervals[0] ?? assert.fail();
		assert.equal(interval.stickiness, IntervalStickiness.END);
		assert.equal(interval.start.slidingPreference, SlidingPreference.FORWARD);
		assert.equal(interval.end.slidingPreference, SlidingPreference.FORWARD);
	});

	it("supports detached intervals", async () => {
		const sharedString = await loadSharedString(containerRuntimeFactory, "1", summary);
		sharedString.removeRange(0, sharedString.getLength());
		containerRuntimeFactory.processAllMessages();
		const { summary: detachedSummary } = await sharedString.summarize();
		const stringLoadedWithDetachedInterval = await loadSharedString(
			containerRuntimeFactory,
			"2",
			detachedSummary,
		);
		const collection = stringLoadedWithDetachedInterval.getIntervalCollection("test");
		assertSequenceIntervals(stringLoadedWithDetachedInterval, collection, [
			{ start: -1, end: -1 },
		]);
	});

	describe("enables operations on reload", () => {
		let sharedString: ISharedString;
		let sharedString2: ISharedString;
		let collection: IIntervalCollection<SequenceInterval>;
		let collection2: IIntervalCollection<SequenceInterval>;
		let id: string;
		beforeEach(async () => {
			sharedString = await loadSharedString(containerRuntimeFactory, "1", summary);
			sharedString2 = await loadSharedString(containerRuntimeFactory, "2", summary);
			containerRuntimeFactory.processAllMessages();
			collection = sharedString.getIntervalCollection("test");
			collection2 = sharedString2.getIntervalCollection("test");
			containerRuntimeFactory.processAllMessages();
			const intervals = Array.from(collection);
			assert.equal(intervals.length, 1);
			const interval = intervals[0] ?? assert.fail("collection should have interval");
			id = interval.getIntervalId() ?? assert.fail("interval should have id");
		});

		it("reloaded interval can be changed", async () => {
			collection.change(id, { start: 1, end: 3 });
			assertSequenceIntervals(sharedString, collection, [{ start: 1, end: 3 }]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 2 }]);
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString2, collection2, [{ start: 1, end: 3 }]);
		});

		it("reloaded interval can be deleted", async () => {
			collection.removeIntervalById(id);
			assert.equal(Array.from(collection).length, 0);
			assert.equal(Array.from(collection2).length, 1);
			containerRuntimeFactory.processAllMessages();
			assert.equal(Array.from(collection2).length, 0);
		});

		it("new interval can be added after reload", async () => {
			collection.add({ start: 2, end: 4 });
			assertSequenceIntervals(sharedString, collection, [
				{ start: 0, end: 2 },
				{ start: 2, end: 4 },
			]);
			assertSequenceIntervals(sharedString2, collection2, [{ start: 0, end: 2 }]);
			containerRuntimeFactory.processAllMessages();
			assertSequenceIntervals(sharedString2, collection2, [
				{ start: 0, end: 2 },
				{ start: 2, end: 4 },
			]);
		});

		it("intervals can be retrieved from endpoints", async () => {
			const interval1 =
				collection.getIntervalById(id) ?? assert.fail("collection should have interval");
			const locator1 = intervalLocatorFromEndpoint(interval1.start);
			assert.deepEqual(locator1, { interval: interval1, label: "test" });
			const interval2 = collection.add({ start: 1, end: 2 });
			const locator2 = intervalLocatorFromEndpoint(interval2.start);
			assert.deepEqual(locator2, { interval: interval2, label: "test" });
		});
	});
});
