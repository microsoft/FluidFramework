/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";
import { benchmark, BenchmarkTimer, BenchmarkType } from "@fluid-tools/benchmark";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { IsoBuffer } from "@fluidframework/common-utils";
import { ISharedTree, ISharedTreeView } from "../../../shared-tree";
import { ITestTreeProvider, TestTreeProvider } from "../../utils";
import {
	SequenceFieldEditBuilder,
	singleTextCursor,
	LocalNodeKey,
	localNodeKeySymbol,
	SchemaBuilder,
	FieldKinds,
	nodeKeyFieldKey,
} from "../../../feature-libraries";
import {
	rootFieldKey,
	ITreeCursor,
	moveToDetachedField,
	JsonableTree,
	AllowedUpdateType,
} from "../../../core";
import { nodeKeyField, nodeKeySchema, nodeKeyTreeSchema } from "../../../domains";
import { brand } from "../../../util";

const builder = new SchemaBuilder("node key index benchmarks", {}, nodeKeySchema);
const nodeSchema = builder.structRecursive("node", {
	child: SchemaBuilder.fieldRecursive(
		FieldKinds.optional,
		() => nodeSchema,
		() => nodeWithKeySchema,
	),
});
const nodeWithKeySchema = builder.structRecursive("nodeWithKey", {
	...nodeKeyField,
	child: SchemaBuilder.fieldRecursive(
		FieldKinds.optional,
		() => nodeWithKeySchema,
		() => nodeSchema,
	),
});
const schemaData = builder.intoDocumentSchema(
	SchemaBuilder.fieldOptional(nodeSchema, nodeWithKeySchema),
);

describe("Node Key Index Benchmarks", () => {
	// TODO: Increase these numbers when the node key index is more efficient
	for (const nodeCount of [50, 100]) {
		describe(`In a tree with ${nodeCount} nodes`, () => {
			async function makeTree(): Promise<
				[ISharedTree, SequenceFieldEditBuilder, ITestTreeProvider]
			> {
				const provider = await TestTreeProvider.create(1);
				const [tree] = provider.trees;
				tree.schematize({
					initialTree: undefined,
					schema: schemaData,
					allowedSchemaModifications: AllowedUpdateType.None,
				});
				const field = tree.editor.sequenceField({
					parent: undefined,
					field: rootFieldKey,
				});

				return [tree, field, provider];
			}

			function createNode(view: ISharedTreeView, nodeKey?: LocalNodeKey): ITreeCursor {
				const jsonTree: JsonableTree =
					nodeKey !== undefined
						? {
								type: nodeWithKeySchema.name,
								fields: {
									[nodeKeyFieldKey]: [
										{
											type: nodeKeyTreeSchema.name,
											value: view.nodeKey.stabilize(nodeKey),
										},
									],
								},
						  }
						: {
								type: nodeSchema.name,
						  };
				return singleTextCursor(jsonTree);
			}

			for (const keyDensityPercentage of [5, 50, 100]) {
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Insert ${nodeCount} nodes, ${keyDensityPercentage}% of which have keys`,
					benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
						const period = Math.round(100 / keyDensityPercentage);
						let duration: number;
						do {
							assert.equal(state.iterationsPerBatch, 1);
							const [tree, field] = await makeTree();
							const cursors: ITreeCursor[] = [];
							const ids: (LocalNodeKey | undefined)[] = [];
							for (let i = 0; i < nodeCount; i++) {
								const nodeKey =
									i % period === 0 ? tree.nodeKey.generate() : undefined;

								ids.push(nodeKey);
								cursors.push(createNode(tree, nodeKey));
							}

							// Measure how long it takes to insert a node with a key
							const before = state.timer.now();
							for (let i = 0; i < nodeCount; i++) {
								field.insert(i, cursors[i]);
							}
							duration = state.timer.toSeconds(before, state.timer.now());

							// Validate that the tree is as we expect
							const cursor = tree.forest.allocateCursor();
							moveToDetachedField(tree.forest, cursor);
							cursor.firstNode();
							for (let i = 0; i < nodeCount; i++) {
								if (i % period === 0) {
									cursor.enterField(brand(nodeKeyFieldKey));
									cursor.enterNode(0);
									const id = ids[i];
									const stableId =
										id !== undefined ? tree.nodeKey.stabilize(id) : undefined;

									assert.equal(cursor.value, stableId);
									cursor.exitNode();
									cursor.exitField();
									const node = tree.nodeKey.map.get(
										ids[i] ?? fail("Expected node key to be in list"),
									);
									assert(node !== undefined);
									assert.equal(node[localNodeKeySymbol], ids[i]);
								}
								cursor.nextNode();
							}
							cursor.free();
						} while (state.recordBatch(duration));
					},
					minBatchDurationSeconds: 0, // Force batch size of 1
				});
			}

			for (const keyDensityPercentage of [5, 50, 100]) {
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Lookup a node by key in a tree of size ${nodeCount} where ${keyDensityPercentage}% of the tree has keys`,
					benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
						const period = Math.round(100 / keyDensityPercentage);
						const random = makeRandom(0);
						let duration: number;
						do {
							assert.equal(state.iterationsPerBatch, 1);
							const [tree, field] = await makeTree();
							const ids: LocalNodeKey[] = [];
							for (let i = 0; i < nodeCount; i++) {
								if (i % period === 0) {
									const nodeKey = tree.nodeKey.generate();
									field.insert(i, createNode(tree, nodeKey));
									ids.push(nodeKey);
								} else {
									field.insert(i, createNode(tree));
								}
							}

							const id = random.pick(ids);

							// Measure how long it takes to lookup a randomly selected key that is known to be in the document
							const before = state.timer.now();
							const node = tree.nodeKey.map.get(id);
							duration = state.timer.toSeconds(before, state.timer.now());

							assert(node !== undefined);
							assert.equal(node[localNodeKeySymbol], id);
						} while (state.recordBatch(duration));
					},
					minBatchDurationSeconds: 0, // Force batch size of 1
				});
			}

			for (const keyDensityPercentage of [5, 50, 100]) {
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Lookup a non-existent key in a tree of size ${nodeCount} where ${keyDensityPercentage}% of the tree has keys`,
					benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
						const period = Math.round(100 / keyDensityPercentage);
						let duration: number;
						do {
							assert.equal(state.iterationsPerBatch, 1);
							const [tree, field] = await makeTree();
							for (let i = 0; i < nodeCount; i++) {
								const key = i % period === 0 ? tree.nodeKey.generate() : undefined;

								field.insert(i, createNode(tree, key));
							}

							// Measure how long it takes to lookup a key that is not in the document
							const nodeKey = tree.nodeKey.generate();
							const before = state.timer.now();
							const node = tree.nodeKey.map.get(nodeKey);
							duration = state.timer.toSeconds(before, state.timer.now());

							assert(node === undefined);
						} while (state.recordBatch(duration));
					},
					minBatchDurationSeconds: 0, // Force batch size of 1
				});
			}

			for (const keyDensityPercentage of [5, 50, 100]) {
				const period = Math.round(100 / keyDensityPercentage);
				it(`increase the summary size (when ${keyDensityPercentage}% of nodes have keys)`, async () => {
					// Create a baseline tree with no keys
					const [treeBaseline, fieldBaseline, providerBaseline] = await makeTree();
					for (let i = 0; i < nodeCount; i++) {
						fieldBaseline.insert(i, createNode(treeBaseline));
					}
					await providerBaseline.ensureSynchronized();
					// Create a tree of the same size as the baseline, but with some keys
					const [treeWithIds, fieldWithIds, providerWithIds] = await makeTree();
					for (let i = 0; i < nodeCount; i++) {
						const key = i % period === 0 ? treeWithIds.nodeKey.generate() : undefined;

						fieldWithIds.insert(i, createNode(treeWithIds, key));
					}
					await providerWithIds.ensureSynchronized();

					// Summarize both trees and measure their summary sizes
					const { summary: summaryBaseline } = treeBaseline.getAttachSummary(true);
					const sizeBaseline = IsoBuffer.from(JSON.stringify(summaryBaseline)).byteLength;
					const { summary: summaryWithIds } = treeWithIds.getAttachSummary(true);
					const sizeWithIds = IsoBuffer.from(JSON.stringify(summaryWithIds)).byteLength;
					// TODO: report these sizes as benchmark output which can be tracked over time.
					const sizeDelta = sizeWithIds - sizeBaseline;
					const relativeDelta = sizeDelta / sizeBaseline;
					// Arbitrary limit. Re-adjust when the node key index is more performant.
					assert(
						relativeDelta < keyDensityPercentage / 100,
						`Increased summary size by ${sizeDelta} bytes (${(
							relativeDelta * 100
						).toFixed(2)}% increase)`,
					);
				});
			}
		});
	}
});
