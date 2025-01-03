/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "node:assert";

import { segmentIsRemoved, type ISegmentPrivate } from "../mergeTreeNodes.js";
import { TextSegment } from "../textSegment.js";

import { TestClient } from "./testClient.js";

describe("client.getPosition", () => {
	const localUserLongId = "localUser";
	let client: TestClient;
	let segment: TextSegment;
	const segPos = 4;
	beforeEach(() => {
		client = new TestClient();
		for (const c of "hello world") {
			client.insertTextLocal(client.getLength(), c);
		}
		client.startOrUpdateCollaboration(localUserLongId);

		const segOff = client.getContainingSegment<ISegmentPrivate>(segPos);
		assert(TextSegment.is(segOff.segment!));
		assert.strictEqual(segOff.offset, 0);
		assert.strictEqual(segOff.segment.text, "o");
		segment = segOff.segment;
	});

	it("Existing Segment", () => {
		const pos = client.getPosition(segment);
		assert.strictEqual(pos, segPos);
	});

	it("Deleted Segment", () => {
		client.removeRangeLocal(segPos, segPos + 1);
		assert.strictEqual(segmentIsRemoved(segment), true);
		const pos = client.getPosition(segment);
		assert.strictEqual(pos, segPos);
	});

	it("Detached Segment", () => {
		client.applyMsg(client.makeOpMessage(client.removeRangeLocal(segPos, segPos + 1), 1));
		// do some work and move the client's min seq forward, so zamboni runs
		for (const c of "hello world") {
			client.applyMsg(
				client.makeOpMessage(
					client.insertTextLocal(client.getLength(), c),
					client.getCurrentSeq() + 1,
					client.getCurrentSeq(),
					undefined,
					client.getCurrentSeq(),
				),
			);
		}
		assert.strictEqual(segmentIsRemoved(segment), true);

		const pos = client.getPosition(segment);
		assert.strictEqual(pos, -1);
	});

	it("Moved Segment", () => {
		client.removeRangeLocal(segPos - 1, segPos);
		const pos = client.getPosition(segment);
		assert.strictEqual(pos, segPos - 1);
	});
});
