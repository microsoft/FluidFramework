/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISharedTree } from "../../treeFactory.js";
import {
	type ITestTreeProvider,
	SharedTreeTestFactory,
	SummarizeType,
	TestTreeProvider,
	spyOnMethod,
} from "../utils.js";

describe("TestTreeProvider", () => {
	const providers: ITestTreeProvider[] = [];
	const restoreSpies: (() => void)[] = [];

	afterEach(() => {
		for (const restore of restoreSpies.splice(0)) {
			restore();
		}
		for (const provider of providers.splice(0)) {
			provider.reset();
		}
	});

	async function checkSummarize(treeCount: number): Promise<void> {
		let summaryCount = 0;
		const onTree = (tree: ISharedTree): void => {
			restoreSpies.push(
				spyOnMethod(tree.kernel, "summarizeCore", () => {
					summaryCount += 1;
				}),
			);
		};
		const provider = await TestTreeProvider.create(
			treeCount,
			SummarizeType.onDemand,
			new SharedTreeTestFactory(onTree, onTree),
		);
		providers.push(provider);

		const unrelated = await TestTreeProvider.create(1, SummarizeType.onDemand);
		providers.push(unrelated);
		const summaries = summaryCount;
		await unrelated.summarize();
		assert.strictEqual(summaryCount, summaries);

		await provider.summarize();

		// getGCData and the summary each call summarizeCore once.
		assert.strictEqual(summaryCount, summaries + 2);
	}

	it("can create 1", async () => {
		const provider = await TestTreeProvider.create(1);
		providers.push(provider);
	});
	it("can create 2", async () => {
		const provider = await TestTreeProvider.create(2);
		providers.push(provider);
	});

	it("can manually trigger summaries with summarizeOnDemand", async () => {
		await checkSummarize(1);
	});

	it("cannot manually trigger summaries without setting summarizeOnDemand", async () => {
		let summarizerError;
		try {
			const provider = await TestTreeProvider.create(1);
			providers.push(provider);
			await provider.summarize();
		} catch (error) {
			summarizerError = error;
		}
		assert.notStrictEqual(summarizerError, undefined);
	});

	it("cannot manually trigger summaries with 0 trees", async () => {
		let summarizerError;
		try {
			const provider = await TestTreeProvider.create(0, SummarizeType.onDemand);
			await provider.summarize();
		} catch (error) {
			summarizerError = error;
		}
		assert.notStrictEqual(summarizerError, undefined);
	});

	it("can trigger summaries with multiple trees", async () => {
		await checkSummarize(2);
	});
});

describe("spyOnMethod", () => {
	class Example {
		public method(value: number): number {
			return value + 1;
		}
	}

	it("can spy on one instance and restore the inherited method", () => {
		const first = new Example();
		const second = new Example();
		let count = 0;
		const restore = spyOnMethod(first, "method", () => {
			count += 1;
		});
		try {
			assert.equal(first.method(1), 2);
			assert.equal(second.method(2), 3);
			assert.equal(count, 1);
		} finally {
			restore();
		}
		assert.equal(Object.hasOwn(first, "method"), false);
		assert.equal(first.method(3), 4);
		assert.equal(count, 1);
	});

	it("can spy on a class and restore its method", () => {
		const original = Object.getOwnPropertyDescriptor(Example.prototype, "method");
		let count = 0;
		const restore = spyOnMethod(Example, "method", () => {
			count += 1;
		});
		try {
			assert.equal(new Example().method(1), 2);
			assert.equal(new Example().method(2), 3);
			assert.equal(count, 2);
		} finally {
			restore();
		}
		assert.deepEqual(Object.getOwnPropertyDescriptor(Example.prototype, "method"), original);
		assert.equal(new Example().method(3), 4);
		assert.equal(count, 2);
	});
});
