/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISegmentInternal } from "../mergeTreeNodes.js";

import { TestClient } from "./testClient.js";

describe("client.applyMsg", () => {
	const localUserLongId = "localUser";
	const seg1 = "hello";
	const seg2 = "world";
	let client: TestClient;

	beforeEach(() => {
		client = new TestClient();
		client.insertTextLocal(client.getLength(), seg1);
		client.insertTextLocal(client.getLength(), seg2);
		client.startOrUpdateCollaboration(localUserLongId);
	});

	it("Walk All Segments", () => {
		let segCount = 0;
		let segLen = 0;
		client.walkSegments((s) => {
			segCount++;
			segLen += s.cachedLength;
			return true;
		});
		assert.equal(segCount, 2);
		assert.equal(segLen, seg1.length + seg2.length);
	});

	it("Walk Segment Range", () => {
		let segCount = 0;
		let segLen = 0;
		client.walkSegments(
			(s) => {
				segCount++;
				segLen += s.cachedLength;
				return true;
			},
			seg1.length - 2,
			seg1.length + 2,
		);
		assert.equal(segCount, 2);
		assert.equal(segLen, seg1.length + seg2.length);
	});

	it("Walk Segment Range With Split", () => {
		let segCount = 0;
		let segLen = 0;
		client.walkSegments(
			(s) => {
				segCount++;
				segLen += s.cachedLength;
				return true;
			},
			seg1.length - 2,
			seg1.length + 2,
			undefined,
			true,
		);
		assert.equal(segCount, 2);
		assert.equal(segLen, 4);
	});

	it("Walk single multi-character segment", () => {
		client.removeRangeLocal(0, client.getLength());
		client.insertTextLocal(0, "Blocker");
		client.annotateRangeLocal(0, 7, { bold: true });
		let segCount = 0;
		const segLengths: number[] = [];
		client.walkSegments(
			(s: ISegmentInternal) => {
				segCount++;
				segLengths.push(s.cachedLength);
				return true;
			},
			0,
			client.getLength(),
			undefined,
			true,
		);
		assert.equal(segCount, 1, `Expected one segment, saw ${segCount} segments`);
		assert.equal(
			segLengths.length,
			1,
			`Expected one segment length, saw ${segLengths.length} lengths`,
		);
		assert.equal(segLengths[0], 7, `Expected segment length 7, saw ${segLengths[0]}`);
	});
});
