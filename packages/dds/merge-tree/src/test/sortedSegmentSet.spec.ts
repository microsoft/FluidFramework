/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { LocalReferencePosition } from "../localReference.js";
import { ISegment, type ISegmentPrivate } from "../mergeTreeNodes.js";
import { TrackingGroup } from "../mergeTreeTracking.js";
import { ReferenceType } from "../ops.js";
import { toMergeNodeInfo } from "../segmentInfos.js";
import { SortedSegmentSet, SortedSegmentSetItem } from "../sortedSegmentSet.js";

import { TestClient } from "./testClient.js";
const segmentCount = 15;

function validateSorted<T extends SortedSegmentSetItem>(
	set: SortedSegmentSet<T>,
	getOrdinal: (item: T) => string | undefined,
	prefix: string,
): void {
	for (let i = 0; i < set.size - 1; i++) {
		const a = getOrdinal(set.items[i]);
		const b = getOrdinal(set.items[i + 1]);
		assert(a !== undefined, `${prefix}: Undefined ordinal ${i}`);
		assert(b !== undefined, `${prefix}: Undefined ordinal  ${i + 1}`);
		assert(a <= b, `${prefix}: Not sorted at item ${i}`);
	}
}

function validateSet<T extends SortedSegmentSetItem>(
	client: TestClient,
	set: SortedSegmentSet<T>,
	getOrdinal: (item: T) => string | undefined,
): void {
	validateSorted(set, getOrdinal, "initial");

	// add content to shift ordinals in tree
	for (let i = 0; i < segmentCount * 5; i++) {
		client.insertTextLocal((i * 3) % client.getLength(), `X`);
	}
	validateSorted(set, getOrdinal, "after insert");

	for (let i = set.size; set.size > 0; i += set.size) {
		// jump around the list a bit, so its not just an in-order remove
		const item = set.items[i % set.size];
		assert.equal(set.remove(item), true, "remove failed");
		assert.equal(set.has(item), false);
		validateSorted(set, getOrdinal, "during remove");
	}
}

describe("SortedSegmentSet", () => {
	const localUserLongId = "localUser";
	let client: TestClient;
	beforeEach(() => {
		client = new TestClient();
		for (let i = 0; i < segmentCount; i++) {
			client.insertTextLocal(client.getLength(), i.toString()[0].repeat(i + 1));
		}
		client.startOrUpdateCollaboration(localUserLongId);
	});

	it("SortedSegmentSet of objects with segments", () => {
		const set = new SortedSegmentSet<{ segment: ISegment }>();
		for (let i = 0; i < client.getLength(); i++) {
			for (const pos of [i, client.getLength() - 1 - i]) {
				const segment = client.getContainingSegment<ISegmentPrivate>(pos).segment;
				assert(segment);
				const item = { segment };
				assert.equal(set.has(item), false);
				set.addOrUpdate(item);
				assert.equal(set.has(item), true);
			}
		}
		assert.equal(set.size, client.getLength() * 2);
		validateSet(client, set, (i) => toMergeNodeInfo(i.segment)?.ordinal);
	});

	it("SortedSegmentSet of segments", () => {
		const set = new SortedSegmentSet();
		for (let i = 0; i < client.getLength(); i++) {
			for (const pos of [i, client.getLength() - 1 - i]) {
				const segment = client.getContainingSegment<ISegmentPrivate>(pos).segment;
				assert(segment);
				set.addOrUpdate(segment);
				assert.equal(set.has(segment), true);
			}
		}
		assert.equal(set.size, segmentCount);
		validateSet(client, set, (i) => toMergeNodeInfo(i)?.ordinal);
	});

	it("SortedSegmentSet of local references", () => {
		// using a sorted segment set directly creates problems,
		// as we don't correctly split, or merge, so leverage
		// the tracking group for correct behavior in those case
		// and spy it's internal set
		const set = new TrackingGroup();
		for (let i = 0; i < client.getLength(); i++) {
			for (const pos of [i, client.getLength() - 1 - i]) {
				const segmentInfo = client.getContainingSegment<ISegmentPrivate>(pos);
				assert(segmentInfo?.segment);
				const lref = client.createLocalReferencePosition(
					segmentInfo.segment,
					segmentInfo.offset,
					ReferenceType.SlideOnRemove,
					undefined,
				);
				assert.equal(set.has(lref), false);
				set.link(lref);
				assert.equal(set.has(lref), true);
			}
		}
		assert.equal(set.size, client.getLength() * 2);
		validateSet<LocalReferencePosition>(
			client,
			// Cast to any because we are validating a set of local references, but the instantiated type of trackedSet
			// on TrackingGroup is SortedSegmentSet<Trackable>.
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			(set as any).trackedSet,
			(i) => toMergeNodeInfo(i.getSegment())?.ordinal,
		);
	});
});
