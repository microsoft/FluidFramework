/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IMergeBlock } from "../mergeTreeNodes.js";
import { zamboniSegments, packParent } from "../zamboni.js";
import { TestClient } from "./testClient.js";

describe("Zamboni Logic", () => {
	let client: TestClient;
	const localUserLongId = "localUser";
	beforeEach(() => {
		client = new TestClient();
		for (const c of "hello world") {
			client.insertTextLocal(client.getLength(), c);
		}
		client.startOrUpdateCollaboration(localUserLongId);
	});
	it("packParent with no children segments", () => {
		client.applyMsg(
			client.makeOpMessage(client.removeRangeLocal(0, client.getLength() - 1), 1),
		);
		packParent(client.mergeTree.root, client.mergeTree);
		assert.equal(client.mergeTree.root.cachedLength, 1);

		client.applyMsg(
			client.makeOpMessage(
				client.removeRangeLocal(0, client.getLength()),
				client.getCurrentSeq(),
				client.getCurrentSeq(),
				undefined,
				client.getCurrentSeq(),
			),
		);
		assert.equal(client.mergeTree.root.cachedLength ?? 0, 0);

		packParent(client.mergeTree.root, client.mergeTree);

		assert.equal(client.mergeTree.root.childCount, 0);
	});
	it("zamboni with no segments to scour", () => {
		const cachedLength = client.mergeTree.root.cachedLength;
		const childCount = client.mergeTree.root.childCount;

		zamboniSegments(client.mergeTree);

		assert.equal(cachedLength, client.mergeTree.root.cachedLength);
		assert.equal(childCount, client.mergeTree.root.childCount);
	});
	it("zamboni with one segment to scour", () => {
		const initialChildCount = (client.mergeTree.root.children[0] as IMergeBlock).childCount;
		const initialCachedLength = client.mergeTree.root.cachedLength ?? 0;
		client.removeRangeLocal(0, 1);
		zamboniSegments(client.mergeTree);

		assert.equal(client.mergeTree.root.cachedLength, initialCachedLength - 1);
		assert.equal(
			(client.mergeTree.root.children[0] as IMergeBlock).childCount,
			initialChildCount,
		);
	});
	it("zamboni with many segments to scour", () => {
		client.removeRangeLocal(0, 6);

		assert.equal(client.mergeTree.root.children[0].cachedLength, 0);

		zamboniSegments(client.mergeTree);
		packParent(client.mergeTree.root, client.mergeTree);

		assert.equal(client.mergeTree.root.childCount, 1);
	});
});
