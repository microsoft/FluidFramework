/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "node:assert";

import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import { Client } from "../client.js";
import {
	LocalReferencePosition,
	SlidingPreference,
	setValidateRefCount,
} from "../localReference.js";
import { getSlideToSegoff } from "../mergeTree.js";
import { type ISegmentPrivate } from "../mergeTreeNodes.js";
import { TrackingGroup, UnorderedTrackingGroup } from "../mergeTreeTracking.js";
import { MergeTreeDeltaType, ReferenceType } from "../ops.js";
import { DetachedReferencePosition } from "../referencePositions.js";
import { toRemovalInfo } from "../segmentInfos.js";
import { TextSegment } from "../textSegment.js";

import { TestClient } from "./testClient.js";
import { createClientsAtInitialState } from "./testClientLogger.js";
import { validateRefCount } from "./testUtils.js";

function getSlideOnRemoveReferencePosition(
	client: Client,
	pos: number,
	op: ISequencedDocumentMessage,
): {
	segment: ISegmentPrivate | undefined;
	offset: number | undefined;
} {
	let segoff = client.getContainingSegment<ISegmentPrivate>(pos, {
		referenceSequenceNumber: op.referenceSequenceNumber,
		clientId: op.clientId,
	});
	segoff = getSlideToSegoff(segoff);
	return segoff;
}

describe("MergeTree.Client", () => {
	beforeEach(() => {
		setValidateRefCount(validateRefCount);
	});

	afterEach(() => {
		setValidateRefCount(undefined);
	});

	it("Remove segment of non-sliding local reference", () => {
		const client1 = new TestClient();
		const client2 = new TestClient();

		client1.startOrUpdateCollaboration("1");
		client2.startOrUpdateCollaboration("2");
		let seq = 0;
		for (let i = 0; i < 5; i++) {
			const insert = client1.makeOpMessage(
				client1.insertTextLocal(client1.getLength(), i.toString()),
				++seq,
			);
			insert.minimumSequenceNumber = seq - 1;
			client1.applyMsg(insert);
			client2.applyMsg(insert);
		}

		const segInfo = client1.getContainingSegment<ISegmentPrivate>(2);
		const c1LocalRef = client1.createLocalReferencePosition(
			segInfo.segment!,
			segInfo.offset,
			ReferenceType.Simple,
			undefined,
		);

		assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 2, "create position");

		const remove = client2.makeOpMessage(client2.removeRangeLocal(2, 3), ++seq);
		remove.minimumSequenceNumber = seq - 1;
		client1.applyMsg(remove);
		client2.applyMsg(remove);

		// this only works because zamboni hasn't run yet
		assert.equal(
			client1.localReferencePositionToPosition(c1LocalRef),
			DetachedReferencePosition,
			"after remove",
		);

		// this will force Zamboni to run
		for (let i = 0; i < 5; i++) {
			const insert = client1.makeOpMessage(
				client1.insertTextLocal(client1.getLength(), i.toString()),
				++seq,
			);
			insert.minimumSequenceNumber = seq - 1;
			client1.applyMsg(insert);
			client2.applyMsg(insert);
		}
		assert.equal(
			client1.localReferencePositionToPosition(c1LocalRef),
			DetachedReferencePosition,
			"after zamboni",
		);
	});

	it("Remove segment of sliding local reference", () => {
		const client1 = new TestClient();
		const client2 = new TestClient();

		client1.startOrUpdateCollaboration("1");
		client2.startOrUpdateCollaboration("2");
		let seq = 0;
		for (let i = 0; i < 5; i++) {
			const insert = client1.makeOpMessage(
				client1.insertTextLocal(client1.getLength(), i.toString()),
				++seq,
			);
			insert.minimumSequenceNumber = seq - 1;
			client1.applyMsg(insert);
			client2.applyMsg(insert);
		}

		const segInfo = client1.getContainingSegment<ISegmentPrivate>(2);
		const c1LocalRef = client1.createLocalReferencePosition(
			segInfo.segment!,
			segInfo.offset,
			ReferenceType.SlideOnRemove,
			undefined,
		);

		assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 2);

		const remove = client2.makeOpMessage(client2.removeRangeLocal(2, 3), ++seq);
		remove.minimumSequenceNumber = seq - 1;
		client1.applyMsg(remove);
		client2.applyMsg(remove);

		assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 2);

		for (let i = 0; i < 5; i++) {
			const insert = client1.makeOpMessage(
				client1.insertTextLocal(client1.getLength(), i.toString()),
				++seq,
			);
			insert.minimumSequenceNumber = seq - 1;
			client1.applyMsg(insert);
			client2.applyMsg(insert);
		}

		assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 2);
	});

	it("Remove segments to end with sliding local reference", () => {
		const client1 = new TestClient();
		const client2 = new TestClient();

		client1.startOrUpdateCollaboration("1");
		client2.startOrUpdateCollaboration("2");
		let seq = 0;
		for (let i = 0; i < 5; i++) {
			const insert = client1.makeOpMessage(
				client1.insertTextLocal(client1.getLength(), i.toString()),
				++seq,
			);
			insert.minimumSequenceNumber = seq - 1;
			client1.applyMsg(insert);
			client2.applyMsg(insert);
		}

		const segInfo = client1.getContainingSegment<ISegmentPrivate>(2);
		const c1LocalRef = client1.createLocalReferencePosition(
			segInfo.segment!,
			segInfo.offset,
			ReferenceType.SlideOnRemove,
			undefined,
		);

		assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 2);

		const remove = client2.makeOpMessage(
			client2.removeRangeLocal(2, client2.getLength()),
			++seq,
		);
		remove.minimumSequenceNumber = seq - 1;
		client1.applyMsg(remove);
		client2.applyMsg(remove);

		assert.equal(
			client1.localReferencePositionToPosition(c1LocalRef),
			client2.getLength() - 1,
		);
	});

	it("Remove segments from end with sliding local reference", () => {
		const client1 = new TestClient();

		client1.startOrUpdateCollaboration("1");
		let seq = 0;
		const insert = client1.makeOpMessage(client1.insertTextLocal(0, "ABCD"), ++seq);
		insert.minimumSequenceNumber = seq - 1;
		client1.applyMsg(insert);

		const segInfo = client1.getContainingSegment<ISegmentPrivate>(3);
		const c1LocalRef = client1.createLocalReferencePosition(
			segInfo.segment!,
			segInfo.offset,
			ReferenceType.SlideOnRemove,
			undefined,
		);

		assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 3, "ref created");

		const remove1 = client1.makeOpMessage(client1.removeRangeLocal(3, 4), ++seq);
		remove1.minimumSequenceNumber = seq - 1;
		assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 3, "after remove");

		const remove2 = client1.makeOpMessage(client1.removeRangeLocal(1, 3), ++seq);
		remove2.minimumSequenceNumber = seq - 1;
		assert.equal(
			client1.localReferencePositionToPosition(c1LocalRef),
			1,
			"after second remove",
		);

		client1.applyMsg(remove1);
		client1.applyMsg(remove2);

		assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 0, "ops applied");
	});

	it("getSlideOnRemoveReferencePosition", () => {
		const client1 = new TestClient();
		const client2 = new TestClient();
		client1.startOrUpdateCollaboration("1");
		client2.startOrUpdateCollaboration("2");

		let seq = 0;
		const insert1 = client1.makeOpMessage(client1.insertTextLocal(0, "XYZ"), ++seq);
		client1.applyMsg(insert1);

		const insert2 = client1.makeOpMessage(client1.insertTextLocal(0, "ABC"), ++seq);
		client1.applyMsg(insert2);

		// Position depends on op
		const createReference1 = client2.makeOpMessage(
			{ type: MergeTreeDeltaType.INSERT },
			++seq,
			insert1.sequenceNumber,
		);
		let segoff = getSlideOnRemoveReferencePosition(client1, 1, createReference1);
		assert(segoff.segment);
		assert.equal(client1.getPosition(segoff.segment), 3);
		assert.equal(segoff.offset, 1);

		const createReference2 = client2.makeOpMessage(
			{ type: MergeTreeDeltaType.INSERT },
			++seq,
			insert2.sequenceNumber,
		);
		segoff = getSlideOnRemoveReferencePosition(client1, 2, createReference2);
		assert(segoff.segment);
		assert.equal(client1.getPosition(segoff.segment), 0);
		assert.equal(segoff.offset, 2);

		// On a removed, unacked segment
		let remove = client1.makeOpMessage(client1.removeRangeLocal(2, 5), ++seq);
		segoff = getSlideOnRemoveReferencePosition(client1, 3, createReference2);
		assert(segoff.segment);
		assert.notEqual(toRemovalInfo(segoff.segment), undefined);
		assert.equal(client1.getPosition(segoff.segment), 2);
		assert.equal(segoff.offset, 0);

		// Slid from a removed, acked segment
		client1.applyMsg(remove);
		segoff = getSlideOnRemoveReferencePosition(client1, 3, createReference2);
		assert(segoff.segment);
		assert.equal(toRemovalInfo(segoff.segment), undefined);
		assert.equal(client1.getPosition(segoff.segment), 2);
		assert.equal(segoff.offset, 0);

		// On a removed, unacked segment, end of string
		remove = client1.makeOpMessage(client1.removeRangeLocal(2, 3), ++seq);
		segoff = getSlideOnRemoveReferencePosition(client1, 3, createReference2);
		assert(segoff.segment);
		assert.notEqual(toRemovalInfo(segoff.segment), undefined);
		assert.equal(client1.getPosition(segoff.segment), 2);
		assert.equal(segoff.offset, 0);

		// Slid from a removed, acked segment, end of string
		client1.applyMsg(remove);
		segoff = getSlideOnRemoveReferencePosition(client1, 3, createReference2);
		assert(segoff.segment);
		assert.equal(toRemovalInfo(segoff.segment), undefined);
		assert.equal(client1.getPosition(segoff.segment), 0);
		assert.equal(segoff.offset, 1);
	});

	it("Remove all segments with sliding local reference", () => {
		const client1 = new TestClient();
		const client2 = new TestClient();

		client1.startOrUpdateCollaboration("1");
		client2.startOrUpdateCollaboration("2");
		let seq = 0;
		for (let i = 0; i < 5; i++) {
			const insert = client1.makeOpMessage(
				client1.insertTextLocal(client1.getLength(), i.toString()),
				++seq,
			);
			insert.minimumSequenceNumber = seq - 1;
			client1.applyMsg(insert);
			client2.applyMsg(insert);
		}

		const segInfo = client1.getContainingSegment<ISegmentPrivate>(2);
		const c1LocalRef = client1.createLocalReferencePosition(
			segInfo.segment!,
			segInfo.offset,
			ReferenceType.SlideOnRemove,
			undefined,
		);

		assert.equal(client1.localReferencePositionToPosition(c1LocalRef), 2);

		const remove = client2.makeOpMessage(
			client2.removeRangeLocal(0, client2.getLength()),
			++seq,
		);
		remove.minimumSequenceNumber = seq - 1;
		client1.applyMsg(remove);
		client2.applyMsg(remove);

		assert.equal(
			client1.localReferencePositionToPosition(c1LocalRef),
			DetachedReferencePosition,
		);
		assert.equal(c1LocalRef.getSegment(), undefined);
	});

	it("References can have offsets on removed segment", () => {
		const client1 = new TestClient();
		const client2 = new TestClient();

		client1.startOrUpdateCollaboration("1");
		client2.startOrUpdateCollaboration("2");

		let seq = 0;
		const insert1 = client1.makeOpMessage(client1.insertTextLocal(0, "ABCD"), ++seq);
		client1.applyMsg(insert1);
		client2.applyMsg(insert1);

		const segInfo1 = client1.getContainingSegment<ISegmentPrivate>(1);
		const LocalRef1 = client1.createLocalReferencePosition(
			segInfo1.segment!,
			segInfo1.offset,
			ReferenceType.SlideOnRemove,
			undefined,
		);
		const segInfo3 = client1.getContainingSegment<ISegmentPrivate>(3);
		const LocalRef2 = client1.createLocalReferencePosition(
			segInfo3.segment!,
			segInfo3.offset,
			ReferenceType.SlideOnRemove,
			undefined,
		);

		const insert2 = client1.makeOpMessage(client1.insertTextLocal(2, "XY"), ++seq);

		assert.equal(client1.localReferencePositionToPosition(LocalRef1), 1);
		assert.equal(client1.localReferencePositionToPosition(LocalRef2), 5);

		const c2SegInfo1 = client2.getContainingSegment<ISegmentPrivate>(1);
		const c2SegInfo3 = client2.getContainingSegment<ISegmentPrivate>(3);
		const remove = client2.makeOpMessage(
			client2.removeRangeLocal(0, client2.getLength()),
			++seq,
		);

		const c2LocalRef1 = client2.createLocalReferencePosition(
			c2SegInfo1.segment!,
			c2SegInfo1.offset,
			ReferenceType.SlideOnRemove,
			undefined,
		);
		const c2LocalRef2 = client2.createLocalReferencePosition(
			c2SegInfo3.segment!,
			c2SegInfo3.offset,
			ReferenceType.SlideOnRemove,
			undefined,
		);

		assert.equal(client2.localReferencePositionToPosition(c2LocalRef1), 0);
		assert.equal(client2.localReferencePositionToPosition(c2LocalRef2), 0);

		client1.applyMsg(insert2);
		client2.applyMsg(insert2);

		assert.equal(client1.localReferencePositionToPosition(LocalRef1), 1);
		assert.equal(client1.localReferencePositionToPosition(LocalRef2), 5);
		assert.equal(client2.localReferencePositionToPosition(c2LocalRef1), 0);
		assert.equal(client2.localReferencePositionToPosition(c2LocalRef2), 2);

		client1.applyMsg(remove);
		client2.applyMsg(remove);

		assert.equal(client1.localReferencePositionToPosition(LocalRef1), 0);
		assert.equal(client1.localReferencePositionToPosition(LocalRef2), 1);
		assert.equal(client2.localReferencePositionToPosition(c2LocalRef1), 0);
		assert.equal(client2.localReferencePositionToPosition(c2LocalRef2), 1);
	});

	it("Transient references can be created on removed segments", () => {
		const client1 = new TestClient();
		const client2 = new TestClient();
		client1.startOrUpdateCollaboration("1");
		client2.startOrUpdateCollaboration("2");
		let seq = 0;
		const insertOp = client1.makeOpMessage(client1.insertTextLocal(0, "ABCD"), ++seq);
		client1.applyMsg(insertOp);
		client2.applyMsg(insertOp);
		client1.removeRangeLocal(0, 2);

		const opFromBeforeRemovePerspective = client2.makeOpMessage(
			client2.insertTextLocal(3, "X"),
		);
		const { segment, offset } = client1.getContainingSegment<ISegmentPrivate>(0, {
			referenceSequenceNumber: opFromBeforeRemovePerspective.referenceSequenceNumber,
			clientId: opFromBeforeRemovePerspective.clientId,
		});
		assert(segment && toRemovalInfo(segment) !== undefined);
		const transientRef = client1.createLocalReferencePosition(
			segment,
			offset,
			ReferenceType.Transient,
			{},
		);
		assert.equal(transientRef.getSegment(), segment);
		assert.equal(transientRef.getOffset(), 0);
	});

	it("References can have offsets when slid to locally removed segment", () => {
		const client1 = new TestClient();
		const client2 = new TestClient();

		client1.startOrUpdateCollaboration("1");
		client2.startOrUpdateCollaboration("2");

		let seq = 0;
		const insert1 = client1.makeOpMessage(client1.insertTextLocal(0, "ABCDE"), ++seq);
		client1.applyMsg(insert1);
		client2.applyMsg(insert1);

		const segInfo = client1.getContainingSegment<ISegmentPrivate>(4);
		const localRef = client1.createLocalReferencePosition(
			segInfo.segment!,
			segInfo.offset,
			ReferenceType.SlideOnRemove,
			undefined,
		);
		const createReference1 = client1.makeOpMessage(
			{ type: MergeTreeDeltaType.INSERT },
			++seq,
			insert1.sequenceNumber,
		);

		const remove1 = client2.makeOpMessage(client2.removeRangeLocal(4, 5), ++seq);

		const insert2 = client1.makeOpMessage(client1.insertTextLocal(2, "XY"), ++seq);

		const remove2 = client2.makeOpMessage(client2.removeRangeLocal(1, 4), ++seq);

		const segoff = getSlideOnRemoveReferencePosition(client2, 4, createReference1);
		const c2LocalRef = client2.createLocalReferencePosition(
			segoff.segment!,
			segoff.offset,
			ReferenceType.SlideOnRemove,
			undefined,
		);
		assert.equal(client1.localReferencePositionToPosition(localRef), 6);
		assert.equal(client2.localReferencePositionToPosition(c2LocalRef), 1);

		client1.applyMsg(remove1);
		client2.applyMsg(remove1);

		assert.equal(client1.localReferencePositionToPosition(localRef), 5);
		assert.equal(client2.localReferencePositionToPosition(c2LocalRef), 1);

		client1.applyMsg(insert2);
		client2.applyMsg(insert2);

		assert.equal(client1.localReferencePositionToPosition(localRef), 5);
		assert.equal(client2.getText(), "AXY");
		assert.equal(client2.localReferencePositionToPosition(c2LocalRef), 3);

		client1.applyMsg(remove2);
		client2.applyMsg(remove2);

		assert.equal(client1.localReferencePositionToPosition(localRef), 2);
		assert.equal(client2.localReferencePositionToPosition(c2LocalRef), 2);
	});

	it("Split segment with no references and append to segment with references", () => {
		const clients = createClientsAtInitialState({ initialState: "" }, "A", "B");

		const messages: ISequencedDocumentMessage[] = [];
		let seq = 0;
		messages.push(clients.A.makeOpMessage(clients.A.insertTextLocal(0, "0123456789"), ++seq));
		// initialize the local reference collection on the segment, but keep it empty
		{
			const segInfo = clients.A.getContainingSegment<ISegmentPrivate>(9);
			const segment = segInfo.segment;
			assert(segment !== undefined && TextSegment.is(segment));
			assert.strictEqual(segment.text[segInfo.offset!], "9");
			const localRef = clients.A.createLocalReferencePosition(
				segment,
				segInfo.offset,
				ReferenceType.Simple,
				undefined,
			);
			clients.A.removeLocalReferencePosition(localRef);
		}
		// split the segment
		messages.push(clients.A.makeOpMessage(clients.A.insertTextLocal(5, "ABCD"), ++seq));

		// add a local reference to the newly inserted segment that caused the split
		{
			const segInfo = clients.A.getContainingSegment<ISegmentPrivate>(6);
			const segment = segInfo.segment;
			assert(segment !== undefined && TextSegment.is(segment));
			assert.strictEqual(segment.text[segInfo.offset!], "B");
			clients.A.createLocalReferencePosition(
				segment,
				segInfo.offset,
				ReferenceType.Simple,
				undefined,
			);
		}
		// apply all the ops
		while (messages.length > 0) {
			const msg = messages.shift()!;
			for (const c of clients.all) c.applyMsg(msg);
		}

		// regression: would fire 0x2be on zamboni during segment append
		for (const c of clients.all) c.updateMinSeq(seq);
	});

	describe("avoids removing StayOnRemove references on local + remote concurrent delete", () => {
		let client: TestClient;
		let localRefA: LocalReferencePosition;
		let localRefB: LocalReferencePosition;
		let seq: number;
		beforeEach(() => {
			seq = 0;
			client = new TestClient();
			client.startOrUpdateCollaboration("1");
			client.enqueueMsg(client.makeOpMessage(client.insertTextLocal(0, "B"), ++seq));
			client.enqueueMsg(client.makeOpMessage(client.insertTextLocal(0, "A"), ++seq));
			client.applyMessages(2);
			assert.equal(client.getText(), "AB");
			localRefA = client.createLocalReferencePosition(
				client.getContainingSegment<ISegmentPrivate>(0).segment!,
				0,
				ReferenceType.StayOnRemove,
				{},
			);
			localRefB = client.createLocalReferencePosition(
				client.getContainingSegment<ISegmentPrivate>(1).segment!,
				0,
				ReferenceType.StayOnRemove,
				{},
			);
			for (const ref of [localRefA, localRefB]) {
				ref.callbacks = {
					beforeSlide: (): void => assert.fail("Unexpected slide"),
					afterSlide: (): void => assert.fail("Unexpected slide"),
				};
			}
		});

		it("when references would slide forward", () => {
			const originalSegment = localRefA.getSegment();
			client.removeRangeLocal(0, 1);
			client.removeRangeRemote(0, 1, ++seq, seq - 1, "2");
			assert(localRefA.getSegment() === originalSegment, "ref was removed");
		});

		it("when references would slide backward", () => {
			const originalSegment = localRefB.getSegment();
			client.removeRangeLocal(1, 2);
			client.removeRangeRemote(1, 2, ++seq, seq - 1, "2");
			assert(localRefB.getSegment() === originalSegment, "ref was removed");
		});

		it("when references would slide off the string", () => {
			const originalSegment = localRefA.getSegment();
			client.removeRangeLocal(0, 2);
			client.removeRangeRemote(0, 2, ++seq, seq - 1, "2");
			assert(localRefA.getSegment() === originalSegment, "ref was removed");
		});
	});

	it("slides to correct position with backward sliding preference", () => {
		const client1 = new TestClient();
		const client2 = new TestClient();

		client1.startOrUpdateCollaboration("1");
		client2.startOrUpdateCollaboration("2");

		let seq = 0;
		const insert1 = client1.makeOpMessage(client1.insertTextLocal(0, "abcXdef"), ++seq);
		client1.applyMsg(insert1);
		client2.applyMsg(insert1);

		const segInfo = client1.getContainingSegment<ISegmentPrivate>(3);

		const localRef = client1.createLocalReferencePosition(
			segInfo.segment!,
			segInfo.offset,
			ReferenceType.SlideOnRemove,
			undefined,
			SlidingPreference.BACKWARD,
		);

		assert.equal(client1.localReferencePositionToPosition(localRef), 3);

		const insert2 = client1.makeOpMessage(client1.insertTextLocal(4, "ghi"), ++seq);
		client1.applyMsg(insert2);
		client2.applyMsg(insert2);

		assert.equal(client1.localReferencePositionToPosition(localRef), 3);

		const remove1 = client1.makeOpMessage(client1.removeRangeLocal(1, 4), ++seq);
		client1.applyMsg(remove1);
		client2.applyMsg(remove1);

		assert.equal(client1.getText(), "aghidef");
		assert.equal(client1.localReferencePositionToPosition(localRef), 0);
		assert.equal(client2.getText(), "aghidef");
		assert.equal(client2.localReferencePositionToPosition(localRef), 0);
	});

	const tgCases = [
		{
			name: "when the ref is not in a tracking group",
			addRef: (): void => {},
		},
		{
			name: "when the ref is in a TrackingGroup",
			addRef: (ref: LocalReferencePosition): void => {
				const tg = new TrackingGroup();
				tg.link(ref);
			},
		},
		{
			name: "when the ref is in an UnorderedTrackingGroup",
			addRef: (ref: LocalReferencePosition): void => {
				const tg = new UnorderedTrackingGroup();
				tg.link(ref);
			},
		},
	];

	describe("doesn't crash for remove ref then link to undefined", () => {
		for (const { name, addRef } of tgCases) {
			it(name, () => {
				const client1 = new TestClient();
				const client2 = new TestClient();

				client1.startOrUpdateCollaboration("1");
				client2.startOrUpdateCollaboration("2");

				let seq = 0;
				const insert1 = client1.makeOpMessage(client1.insertTextLocal(0, "abcdef"), ++seq);
				client1.applyMsg(insert1);
				client2.applyMsg(insert1);

				const segInfo = client1.getContainingSegment<ISegmentPrivate>(3);

				assert(segInfo.segment);

				const localRef = client1.createLocalReferencePosition(
					segInfo.segment,
					segInfo.offset,
					ReferenceType.SlideOnRemove,
					undefined,
				);
				addRef(localRef);

				assert.equal(localRef.getSegment(), segInfo.segment);

				assert(segInfo.segment.localRefs);
				assert(!segInfo.segment.localRefs.empty);

				segInfo.segment.localRefs.removeLocalRef(localRef);
				assert(segInfo.segment.localRefs.empty);
				// Cast is necessary because LocalReference is not exported, so we can't directly call link.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
				(localRef as any).link(undefined, 0, undefined);
				assert(segInfo.segment.localRefs.empty);

				assert.equal(segInfo.segment.localRefs.empty, true);
				assert.equal(segInfo.segment.localRefs.has(localRef), false);
				assert.equal(localRef.getSegment(), undefined);
				assert.equal(localRef.getOffset(), 0);
			});
		}
	});

	describe("doesn't crash for link to undefined then remove ref", () => {
		for (const { name, addRef } of tgCases) {
			it(name, () => {
				const client1 = new TestClient();
				const client2 = new TestClient();

				client1.startOrUpdateCollaboration("1");
				client2.startOrUpdateCollaboration("2");

				let seq = 0;
				const insert1 = client1.makeOpMessage(client1.insertTextLocal(0, "abcdef"), ++seq);
				client1.applyMsg(insert1);
				client2.applyMsg(insert1);

				const segInfo = client1.getContainingSegment<ISegmentPrivate>(3);

				assert(segInfo.segment);

				const localRef = client1.createLocalReferencePosition(
					segInfo.segment,
					segInfo.offset,
					ReferenceType.SlideOnRemove,
					undefined,
				);
				addRef(localRef);

				assert.equal(localRef.getSegment(), segInfo.segment);

				assert(segInfo.segment.localRefs);
				assert(!segInfo.segment.localRefs.empty);
				// Cast is necessary because LocalReference is not exported, so we can't directly call link
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
				(localRef as any).link(undefined, 0, undefined);
				assert(segInfo.segment.localRefs.empty);
				segInfo.segment.localRefs.removeLocalRef(localRef);
				assert(segInfo.segment.localRefs.empty);

				assert.equal(segInfo.segment.localRefs.empty, true);
				assert.equal(segInfo.segment.localRefs.has(localRef), false);
				assert.equal(localRef.getSegment(), undefined);
				assert.equal(localRef.getOffset(), 0);
			});
		}
	});
});
