/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Heap } from "../../heap";

interface TestObject {
	value: number;
	key: string;
}

describe("Heap", () => {
	it("should return undefined if heap is empty", () => {
		const heap = new Heap<number>({
			compareFn: (a, b) => a - b,
		});
		assert.strictEqual(heap.pop(), undefined);
	});

	it("should return the smallest element for a min heap", () => {
		const heap = new Heap<number>({
			compareFn: (a, b) => a - b,
		});
		heap.push(3);
		heap.push(1);
		heap.push(2);
		assert.strictEqual(heap.pop(), 1);
		assert.strictEqual(heap.pop(), 2);
		assert.strictEqual(heap.pop(), 3);
	});

	it("should return the largest element for a max heap", () => {
		const heap = new Heap<number>({
			compareFn: (a, b) => b - a,
		});
		heap.push(3);
		heap.push(1);
		heap.push(2);
		assert.strictEqual(heap.pop(), 3);
		assert.strictEqual(heap.pop(), 2);
		assert.strictEqual(heap.pop(), 1);
	});

	it("should return the smallest element for a min heap with custom comparator for a complex object", () => {
		const heap = new Heap<TestObject>({
			compareFn: (a, b) => a.value - b.value,
		});
		heap.push({ value: 3, key: "3" });
		heap.push({ value: 1, key: "1" });
		heap.push({ value: 1, key: "2" });
		heap.push({ value: 2, key: "2" });
		assert.strictEqual(heap.pop().value, 1);
		assert.strictEqual(heap.pop().value, 1);
		assert.strictEqual(heap.pop().value, 2);
		assert.strictEqual(heap.pop().value, 3);
	});
});
