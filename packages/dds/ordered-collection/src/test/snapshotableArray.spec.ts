/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IOrderedCollection } from "../interfaces.js";
import { SnapshotableArray } from "../snapshotableArray.js";

/**
 * Minimal queue subclass mirroring the in-tree `SnapshotableQueue` so we can exercise
 * removal against the protected `data` list without depending on the full
 * ConsensusQueue runtime plumbing.
 */
class TestQueue<T> extends SnapshotableArray<T> implements IOrderedCollection<T> {
	public add(value: T): void {
		this.data.push(value);
	}
	public remove(): T {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.data.shift()!.data;
	}
}

describe("SnapshotableArray", () => {
	it("asArray() reflects iteration order after loadFrom + remove (snapshot contract)", async () => {
		const queue = new TestQueue<string>();
		await queue.loadFrom(["a", "b", "c"]);
		queue.remove();
		assert.deepEqual(queue.asArray(), ["b", "c"]);
		assert.equal(queue.size(), 2);
	});
});
