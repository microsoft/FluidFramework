/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	benchmarkDuration,
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
	SchemaFactoryAlpha,
	TreeViewConfiguration,
	type ValidateRecursiveSchema,
} from "../../../simple-tree/index.js";
import { brand } from "../../../util/index.js";
import { configureBenchmarkHooks } from "../../utils.js";

// These benchmarks compare hydrated and unhydrated FlexTree navigation, mostly through the public simple-tree API.
// Their timings include the simple-tree layer and assertions, rather than isolating FlexTree costs.
// The cached-field case accesses FlexTree directly to measure reuse of a boxed field.
describe("FlexTree navigation benchmarks", () => {
	configureBenchmarkHooks();
	for (const [name, forest] of [
		["ChunkedForest", ForestTypeOptimized],
		["ObjectForest", ForestTypeReference],
		["Unhydrated", undefined],
	] as const) {
		describe(name, () => {
			describe("Object and array navigation", () => {
				const sf = new SchemaFactory("flex-navigation-bench");
				class Item extends sf.object("Item", {
					value: sf.number,
					optional: sf.optional(sf.number),
				}) {}
				class Items extends sf.array("Items", [Item, sf.number]) {}
				class Wrapper extends sf.objectRecursive("Wrapper", {
					child: [Items, () => Wrapper],
				}) {}
				{
					type _check = ValidateRecursiveSchema<typeof Wrapper>;
				}

				// Vary ancestor depth while keeping the accessed subtree and operations unchanged.
				for (const depth of [0, 10]) {
					for (const operation of [
						"reads",
						"edits",
						"parent and key",
						"cached field",
					] as const) {
						benchmarkIt({
							title: `depth ${depth} ${operation}`,
							type: BenchmarkType.Measurement,
							...benchmarkDuration({
								benchmarkFnCustom: async (state) => {
									const item = new Item({ value: 0 });
									const items = new Items([item, 1, { value: 2 }]);
									let content: Items | Wrapper = items;
									for (let i = 0; i < depth; i++) content = new Wrapper({ child: content });
									if (forest !== undefined) {
										const view = createIndependentTreeAlpha({ forest }).viewWith(
											new TreeViewConfiguration({ schema: [Items, Wrapper] }),
										);
										view.initialize(content);
									}
									const inner = getInnerNode(item);
									// Populate the field cache before timing so lookups measure the cached path.
									const field = inner.getBoxed(brand("value"));
									let value = 0;
									const benchmarkFn = (() => {
										switch (operation) {
											case "reads": {
												return () => {
													assert.equal(item.value, 0);
													assert.equal(item.optional, undefined);
													assert.equal(items[1], 1);
												};
											}
											case "edits": {
												return () => {
													// Change the value each time so repeated edits are not no-ops.
													item.value = ++value;
												};
											}
											case "parent and key": {
												return () => {
													assert.equal(Tree.parent(item), items);
													assert.equal(Tree.key(item), 0);
												};
											}
											case "cached field": {
												return () => {
													assert.equal(inner.getBoxed(brand("value")), field);
												};
											}
											default: {
												unreachableCase(operation);
											}
										}
									})();
									state.timeAllBatches(benchmarkFn);
								},
							}),
						});
					}
				}
			});

			describe("Dynamic field navigation (maps and records)", () => {
				const sf = new SchemaFactoryAlpha("dynamic-field-navigation");
				class ValuesMap extends sf.map("Map", sf.number) {}
				class ValuesRecord extends sf.record("Record", sf.number) {}
				const configuration = new TreeViewConfiguration({ schema: [ValuesMap, ValuesRecord] });
				const adapters = [
					{
						name: "Map",
						create: () => {
							const node = new ValuesMap({ value: 1 });
							return {
								node,
								read: (key: string) => node.get(key),
								set: (key: string, value: number) => node.set(key, value),
								remove: (key: string) => node.delete(key),
							};
						},
					},
					{
						name: "Record",
						create: () => {
							const node = new ValuesRecord({ value: 1 });
							return {
								node,
								read: (key: string) => node[key],
								set: (key: string, value: number) => {
									node[key] = value;
								},
								remove: (key: string) => {
									Reflect.deleteProperty(node, key);
								},
							};
						},
					},
				];

				for (const adapter of adapters) {
					for (const operation of ["Read leaf", "Read missing", "Key churn"] as const) {
						benchmarkIt({
							title: `${adapter.name} ${operation}`,
							type: BenchmarkType.Measurement,
							...benchmarkDurationBatchless({
								benchmarkFn: (state) => {
									const build = () => {
										const instance = adapter.create();
										if (forest !== undefined) {
											createIndependentTreeAlpha({ forest })
												.viewWith(configuration)
												.initialize(instance.node);
										}
										return instance;
									};
									let access = build();
									let samples = 0;
									let running: boolean;
									do {
										running = state.time(() => {
											switch (operation) {
												case "Read leaf": {
													assert.equal(access.read("value"), 1);
													break;
												}
												case "Read missing": {
													assert.equal(access.read("missing"), undefined);
													break;
												}
												case "Key churn": {
													const key = `key-${samples}`;
													access.set(key, 2);
													assert.equal(access.read(key), 2);
													access.remove(key);
													assert.equal(access.read(key), undefined);
													break;
												}
												default: {
													unreachableCase(operation);
												}
											}
										});
										// Discard edit history outside the timed region.
										if (++samples === 256) {
											access = build();
											samples = 0;
										}
									} while (running);
								},
								maxBenchmarkDurationSeconds: 1,
							}),
						});
					}
				}
			});
		});
	}
});
