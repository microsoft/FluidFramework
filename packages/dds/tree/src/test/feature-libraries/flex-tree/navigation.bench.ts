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
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	type MapTree,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	ValueSchema,
} from "../../../core/index.js";
import {
	Context,
	cursorForMapTreeNode,
	defaultSchemaPolicy,
	FieldKinds,
	type FlexTreeNode,
	type FlexibleNodeContent,
	MockNodeIdentifierManager,
} from "../../../feature-libraries/index.js";
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
/* eslint-disable import-x/no-internal-modules -- Raw FlexTree schemas require internal construction APIs. */
import {
	Context as SimpleContext,
	UnhydratedContext,
} from "../../../simple-tree/core/index.js";
import { unhydratedFlexTreeFromCursor } from "../../../simple-tree/api/create.js";
/* eslint-enable import-x/no-internal-modules */
import { brand, disposeSymbol } from "../../../util/index.js";
import { checkoutWithContent, configureBenchmarkHooks } from "../../utils.js";

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
			describe("Sequence map navigation", () => {
				const type: TreeNodeSchemaIdentifier = brand("sequence-map-navigation");
				const leafType: TreeNodeSchemaIdentifier = brand("com.fluidframework.leaf.number");
				const schema: TreeStoredSchema = {
					rootFieldSchema: {
						kind: FieldKinds.required.identifier,
						types: new Set([type]),
						persistedMetadata: undefined,
					},
					nodeSchema: new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>([
						[
							type,
							new MapNodeStoredSchema({
								kind: FieldKinds.sequence.identifier,
								types: new Set([leafType]),
								persistedMetadata: undefined,
							}),
						],
						[leafType, new LeafNodeStoredSchema(ValueSchema.Number)],
					]),
				};
				const number = (value: number): MapTree => ({
					type: leafType,
					value,
					fields: new Map(),
				});
				const content: MapTree = {
					type,
					fields: new Map([[brand("value"), [number(1), number(2)]]]),
				};
				const build = (): {
					node: FlexTreeNode;
					makeNumber: (value: number) => FlexibleNodeContent;
					dispose: () => void;
				} => {
					if (forest === undefined) {
						const simpleContext = new SimpleContext(
							new UnhydratedContext(defaultSchemaPolicy, schema.nodeSchema),
							new Map(),
						);
						return {
							node: unhydratedFlexTreeFromCursor(simpleContext, cursorForMapTreeNode(content)),
							makeNumber: (value) =>
								unhydratedFlexTreeFromCursor(
									simpleContext,
									cursorForMapTreeNode(number(value)),
								),
							dispose: () => {},
						};
					}
					const checkout = checkoutWithContent(
						{ schema, initialTree: cursorForMapTreeNode(content) },
						{ forestType: forest },
					);
					const context = new Context(
						defaultSchemaPolicy,
						checkout,
						new MockNodeIdentifierManager(),
					);
					const node = context.root.boxedAt(0) ?? assert.fail();
					return {
						node,
						makeNumber: number,
						dispose: () => {
							context[disposeSymbol]();
							checkout.dispose();
						},
					};
				};
				for (const operation of ["Read leaf", "Key churn"] as const) {
					benchmarkIt({
						title: operation,
						type: BenchmarkType.Measurement,
						...benchmarkDurationBatchless({
							benchmarkFn: (state) => {
								let access = build();
								let samples = 0;
								let running: boolean;
								do {
									running = state.time(() => {
										const field = access.node.getBoxed(
											brand(operation === "Read leaf" ? "value" : `churn-${samples}`),
										);
										assert(field.is(FieldKinds.sequence));
										if (operation === "Read leaf") {
											assert.equal(field.atIndex(0), 1);
											assert.equal(field.length, 2);
										} else {
											field.editor.insert(0, [access.makeNumber(3)]);
											assert.equal(field.atIndex(0), 3);
											field.editor.remove(0, 1);
											assert.equal(field.length, 0);
										}
									});
									if (++samples === 256) {
										access.dispose();
										access = build();
										samples = 0;
									}
								} while (running);
								access.dispose();
							},
							maxBenchmarkDurationSeconds: 1,
						}),
					});
				}
			});

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
						"array edits",
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
											case "array edits": {
												return () => {
													items.insertAtEnd(3);
													items.removeAt(3);
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
