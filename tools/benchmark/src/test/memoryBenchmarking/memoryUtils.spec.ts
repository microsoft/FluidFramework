/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { benchmarkIt } from "../../mocha/index.js";
import { benchmarkMemoryUse } from "../../memoryBenchmarking/getMemoryUse.js";
import { Box, memoryAddedBy, memoryUseOfValue } from "../../memoryBenchmarking/memoryUtils.js";

describe("memoryUtils", () => {
	describe("Box", () => {
		it("full creates a box holding the item", () => {
			const box = Box.full(42);
			assert.equal(box.value, 42);
		});

		it("empty creates an empty box", () => {
			const box = Box.empty<number>();
			assert.throws(() => box.value, { message: /Box is empty/ });
		});

		it("setter stores a value", () => {
			const box = Box.empty<string>();
			box.value = "hello";
			assert.equal(box.value, "hello");
		});

		it("setter rejects undefined", () => {
			const box = Box.empty<string>();
			assert.throws(
				() => {
					// @ts-expect-error testing compile time and runtime rejection of undefined
					box.value = undefined;
				},
				{ message: /Box cannot be set to undefined/ },
			);
		});

		it("clear empties the box", () => {
			const box = Box.full("value");
			box.clear();
			assert.throws(() => box.value, { message: /Box is empty/ });
		});

		it("setter can overwrite an existing value", () => {
			const box = Box.full(1);
			box.value = 2;
			assert.equal(box.value, 2);
		});
	});

	describe("memoryAddedBy", () => {
		it("everything called in expected order", async () => {
			const log: string[] = [];
			const benchmark = memoryAddedBy({
				setup() {
					log.push("setup");
					return {};
				},
				modify() {
					log.push("modify");
				},
				after() {
					log.push("after");
				},
			});
			const iterations = 2;
			let count = 0;
			await benchmark.benchmarkFn({
				continue() {
					return count++ < iterations;
				},
				async beforeAllocation() {
					log.push("beforeAllocation");
				},
				async whileAllocated() {
					log.push("whileAllocated");
				},
				async afterDeallocation() {
					log.push("afterDeallocation");
				},
			});
			assert.deepEqual(log, [
				"setup",
				"beforeAllocation",
				"modify",
				"whileAllocated",
				"after",
				"setup",
				"beforeAllocation",
				"modify",
				"whileAllocated",
				"after",
			]);
		});

		benchmarkIt({
			title: "sync setup and modify",
			...benchmarkMemoryUse(
				memoryAddedBy({
					setup() {
						return [] as number[];
					},
					modify(input) {
						for (let i = 0; i < 1000; i++) {
							input.push(i);
						}
					},
				}),
			),
		});

		benchmarkIt({
			title: "async setup and modify",
			...benchmarkMemoryUse(
				memoryAddedBy({
					async setup() {
						return [] as number[];
					},
					async modify(input) {
						for (let i = 0; i < 1000; i++) {
							input.push(i);
						}
					},
				}),
			),
		});
	});

	describe("memoryUseOfValue", () => {
		benchmarkIt({
			title: "sync factory",
			...benchmarkMemoryUse(
				memoryUseOfValue(() => {
					const arr: number[] = [];
					for (let i = 0; i < 1000; i++) {
						arr.push(i);
					}
					return arr;
				}),
			),
		});

		benchmarkIt({
			title: "async factory",
			...benchmarkMemoryUse(
				memoryUseOfValue(async () => {
					const arr: number[] = [];
					for (let i = 0; i < 1000; i++) {
						arr.push(i);
					}
					return arr;
				}),
			),
		});

		benchmarkIt({
			title: "linked list",
			...benchmarkMemoryUse(
				memoryUseOfValue(() => {
					let arr: unknown[] = [];
					for (let i = 0; i < 1000; i++) {
						arr = [arr];
					}
					return arr;
				}),
			),
		});
	});
});
