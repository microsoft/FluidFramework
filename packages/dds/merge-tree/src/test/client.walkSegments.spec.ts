/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
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
});
