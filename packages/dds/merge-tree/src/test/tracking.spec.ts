/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISegmentLeaf } from "../mergeTreeNodes.js";
import { TrackingGroup } from "../mergeTreeTracking.js";
import { ReferenceType } from "../ops.js";

import { TestClient } from "./testClient.js";

describe("MergeTree.tracking", () => {
	let testClient: TestClient;

	beforeEach(() => {
		testClient = new TestClient();
		testClient.startOrUpdateCollaboration("me");
	});

	it("Inserted segment should have empty tracking groups", () => {
		testClient.insertTextLocal(0, "abc");

		assert.equal(testClient.getLength(), 3);

		const segmentInfo = testClient.getContainingSegment<ISegmentLeaf>(0);

		assert(segmentInfo?.segment?.trackingCollection.empty);
	});

	it("Insert single segment with single tracking group", () => {
		const trackingGroup = new TrackingGroup();

		testClient.on("delta", (opArgs, deltaArgs) => {
			for (const sg of deltaArgs.deltaSegments)
				sg.segment.trackingCollection.link(trackingGroup);
		});

		testClient.insertTextLocal(0, "abc");

		assert.equal(trackingGroup.size, 1);

		const segmentInfo = testClient.getContainingSegment<ISegmentLeaf>(0);

		assert.equal(segmentInfo?.segment?.trackingCollection.trackingGroups.size, 1);

		assert(trackingGroup.unlink(segmentInfo.segment), "unlink segment should be true");

		assert.equal(segmentInfo?.segment?.trackingCollection.trackingGroups.size, 0);
	});

	it("Splitting segment should split tracking group", () => {
		const trackingGroup = new TrackingGroup();

		testClient.on("delta", (opArgs, deltaArgs) => {
			for (const sg of deltaArgs.deltaSegments)
				sg.segment.trackingCollection.link(trackingGroup);
		});

		const ops = [testClient.insertTextLocal(0, "abc")];

		testClient.removeAllListeners("delta");
		assert.equal(trackingGroup.size, 1);

		ops.push(testClient.insertTextLocal(1, "z"));
		assert.equal(testClient.getLength(), 4);

		assert.equal(trackingGroup.size, 2);
		const segmentInfo = testClient.getContainingSegment<ISegmentLeaf>(0);
		assert.equal(segmentInfo?.segment?.trackingCollection.trackingGroups.size, 1);
	});

	it("Zamboni should merge matching tracking groups", () => {
		const trackingGroup = new TrackingGroup();

		testClient.on("delta", (opArgs, deltaArgs) => {
			for (const sg of deltaArgs.deltaSegments)
				sg.segment.trackingCollection.link(trackingGroup);
		});

		const ops = [testClient.insertTextLocal(0, "abc")];

		assert.equal(trackingGroup.size, 1);

		ops.push(testClient.insertTextLocal(1, "z"));
		assert.equal(testClient.getLength(), 4);

		assert.equal(trackingGroup.size, 3);
		let segmentInfo = testClient.getContainingSegment<ISegmentLeaf>(0);
		assert.equal(segmentInfo?.segment?.trackingCollection.trackingGroups.size, 1);

		let seq = 1;
		for (const op of ops) testClient.applyMsg(testClient.makeOpMessage(op, ++seq));

		assert.equal(trackingGroup.size, 3);
		segmentInfo = testClient.getContainingSegment<ISegmentLeaf>(0);
		assert.equal(segmentInfo?.segment?.trackingCollection.trackingGroups.size, 1);

		testClient.updateMinSeq(seq);

		assert.equal(trackingGroup.size, 1);
		segmentInfo = testClient.getContainingSegment<ISegmentLeaf>(0);
		assert.equal(segmentInfo?.segment?.trackingCollection.trackingGroups.size, 1);
	});

	it("Newly created local reference should have empty tracking group", () => {
		testClient.insertTextLocal(0, "abc");

		assert.equal(testClient.getLength(), 3);

		const segmentInfo = testClient.getContainingSegment<ISegmentLeaf>(0);
		assert(segmentInfo.segment);
		const ref = testClient.createLocalReferencePosition(
			segmentInfo.segment,
			0,
			ReferenceType.SlideOnRemove,
			undefined,
		);

		assert(ref.trackingCollection.empty);
	});

	it("Local reference can be added an removed from tracking group", () => {
		testClient.insertTextLocal(0, "abc");

		assert.equal(testClient.getLength(), 3);

		const segmentInfo = testClient.getContainingSegment<ISegmentLeaf>(0);
		assert(segmentInfo.segment);
		const ref = testClient.createLocalReferencePosition(
			segmentInfo.segment,
			0,
			ReferenceType.SlideOnRemove,
			undefined,
		);

		const trackingGroup = new TrackingGroup();

		ref.trackingCollection.link(trackingGroup);

		assert.equal(trackingGroup.size, 1);
		assert.equal(trackingGroup.has(ref), true);
		assert.equal(trackingGroup.tracked.includes(ref), true);
		assert.equal(ref.trackingCollection.trackingGroups.size, 1);

		ref.trackingCollection.unlink(trackingGroup);

		assert.equal(trackingGroup.size, 0);
		assert.equal(trackingGroup.has(ref), false);
		assert.equal(trackingGroup.tracked.includes(ref), false);
		assert.equal(ref.trackingCollection.trackingGroups.size, 0);
	});

	it("unlink segment from tracking group", () => {
		const trackingGroup = new TrackingGroup();

		testClient.insertTextLocal(0, "abc");

		const { segment } = testClient.getContainingSegment<ISegmentLeaf>(0);
		segment?.trackingCollection.link(trackingGroup);

		assert.equal(segment?.trackingCollection.trackingGroups.size, 1);

		assert(trackingGroup.unlink(segment), "unlink segment should be true");

		assert.equal(segment?.trackingCollection.trackingGroups.size, 0);

		assert.equal(
			trackingGroup.unlink(segment),
			false,
			"repeat unlink segment should be false",
		);
		assert.equal(
			segment.trackingCollection.unlink(trackingGroup),
			false,
			"repeat unlink trackingGroup should be false",
		);
	});

	it("unlink tracking group from collection", () => {
		const trackingGroup = new TrackingGroup();

		testClient.insertTextLocal(0, "abc");

		const { segment } = testClient.getContainingSegment<ISegmentLeaf>(0);
		segment?.trackingCollection.link(trackingGroup);

		assert.equal(segment?.trackingCollection.trackingGroups.size, 1);

		assert(
			segment.trackingCollection.unlink(trackingGroup),
			"unlink trackingGroup should be true",
		);

		assert.equal(segment?.trackingCollection.trackingGroups.size, 0);
		assert.equal(
			trackingGroup.unlink(segment),
			false,
			"repeat unlink segment should be false",
		);
		assert.equal(
			segment.trackingCollection.unlink(trackingGroup),
			false,
			"repeat unlink trackingGroup should be false",
		);
	});
});
