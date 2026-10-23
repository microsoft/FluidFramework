/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	benchmarkDurationBatchless,
	benchmarkIt,
	BenchmarkType,
} from "@fluid-tools/benchmark";
import { unreachableCase } from "@fluidframework/core-utils/internal";

import {
	createIndependentTreeAlpha,
	ForestTypeOptimized,
	ForestTypeReference,
	Tree,
} from "../../../shared-tree/index.js";
import {
	getInnerNode,
	SchemaFactory,
	TreeViewConfiguration,
	type ValidateRecursiveSchema,
} from "../../../simple-tree/index.js";
import { brand } from "../../../util/index.js";
import { configureBenchmarkHooks } from "../../utils.js";

describe("FlexTree navigation benchmarks", () => {
	configureBenchmarkHooks();
	const sf = new SchemaFactory("flex-navigation-bench");
	class Item extends sf.object("Item", {
		value: sf.number,
		optional: sf.optional(sf.number),
	}) {}
	class Items extends sf.array("Items", [Item, sf.number]) {}
	class Wrapper extends sf.objectRecursive("Wrapper", { child: [Items, () => Wrapper] }) {}
	{
		type _check = ValidateRecursiveSchema<typeof Wrapper>;
	}

	for (const [name, forest] of [
		["ChunkedForest", ForestTypeOptimized],
		["ObjectForest", ForestTypeReference],
	] as const) {
		for (const depth of [0, 10]) {
			for (const operation of ["reads", "edits", "parent and key", "cached field"] as const) {
				benchmarkIt({
					title: `${name} depth ${depth} ${operation}`,
					type: BenchmarkType.Measurement,
					...benchmarkDurationBatchless({
						benchmarkFn: (state) => {
							const item = new Item({ value: 0 });
							const items = new Items([item, 1, { value: 2 }]);
							let content: Items | Wrapper = items;
							for (let i = 0; i < depth; i++) content = new Wrapper({ child: content });
							const view = createIndependentTreeAlpha({ forest }).viewWith(
								new TreeViewConfiguration({ schema: [Items, Wrapper] }),
							);
							view.initialize(content);
							const inner = getInnerNode(item);
							const field = inner.getBoxed(brand("value"));
							let value = 0;
							let running: boolean;
							do {
								running = state.time(() => {
									switch (operation) {
										case "reads": {
											assert.equal(item.value, 0);
											assert.equal(item.optional, undefined);
											assert.equal(items[1], 1);
											break;
										}
										case "edits": {
											item.value = ++value;
											break;
										}
										case "parent and key": {
											assert.equal(Tree.parent(item), items);
											assert.equal(Tree.key(item), 0);
											break;
										}
										case "cached field": {
											assert.equal(inner.getBoxed(brand("value")), field);
											break;
										}
										default: {
											unreachableCase(operation);
										}
									}
								});
							} while (running);
						},
						minSampleCount: 8,
						maxBenchmarkDurationSeconds: 1,
					}),
				});
			}
		}
	}
});
