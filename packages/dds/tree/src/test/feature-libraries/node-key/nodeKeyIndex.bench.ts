/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: fix/update these tests before using node ket indexes

/*

import { strict as assert, fail } from "assert";
import { benchmark, BenchmarkTimer, BenchmarkType } from "@fluid-tools/benchmark";
import { makeRandom } from "@fluid-private/stochastic-test-utils";
import { IsoBuffer } from "@fluid-internal/client-utils";
import { ISharedTree, ISharedTreeView, TreeContent } from "../../../shared-tree/index.js";
import { ITestTreeProvider, treeWithContent } from "../../utils.js";
import {
	SequenceFieldEditBuilder,
	singleTextCursor,
	LocalNodeKey,
	localNodeKeySymbol,
	SchemaBuilder,
	FieldKinds,
	nodeKeyFieldKey,
	DefaultEditBuilder,
	DefaultChangeFamily,
	TreeContext,
	SchemaAware,
	typeNameSymbol,
} from "../../../feature-libraries/index.js";
import { rootFieldKey, ITreeCursor, moveToDetachedField, JsonableTree } from "../../../core/index.js";
import { nodeKeyField, nodeKeySchema, nodeKeyTreeSchema } from "../../../domains/index.js";
import { brand } from "../../../util/index.js";
import { ApiMode } from "../../../feature-libraries/schema-aware.js";

const builder = new SchemaBuilder("node key index benchmarks", {}, nodeKeySchema);
const nodeSchema = builder.object("node", {
	// child: FlexFieldSchema.createUnsafe(
	// 	FieldKinds.optional,
	// 	[() => nodeSchema,	() => nodeWithKeySchema],
	// ),
});
const nodeWithKeySchema = builder.object("nodeWithKey", {
	...nodeKeyField,
	// child: FlexFieldSchema.createUnsafe(
	// 	FieldKinds.optional,
	// 	[() => nodeWithKeySchema, () => nodeSchema],
	// ),
});
const schemaData = builder.intoDocumentSchema(
	SchemaBuilder.sequence(nodeSchema, nodeWithKeySchema),
);

describe("Node Key Index Benchmarks", () => {
	// TODO: Increase these numbers when the node key index is more efficient
	for (const nodeCount of [50, 100]) {
		describe(`In a tree with ${nodeCount} nodes`, () => {
			async function makeTree(): Promise<
				[ISharedTree, SequenceFieldEditBuilder, ITestTreeProvider]
			> {
				const tree = treeWithContent({
					initialTree: [],
					schema: schemaData,
				});

				// const field = new DefaultEditBuilder(new DefaultChangeFamily({}, )).sequenceField({
				// 	parent: undefined,
				// 	field: rootFieldKey,
				// });

				return tree;
			}

			function createNode(
				view: TreeContext,
				nodeKey?: LocalNodeKey,
			):
				| SchemaAware.TypedNode<typeof nodeWithKeySchema>
				| SchemaAware.TypedNode<typeof nodeSchema> {
				if (nodeKey !== undefined) {
					return {
						[typeNameSymbol]: nodeWithKeySchema.name,
						[nodeKeyFieldKey]: view.nodeKeys.stabilize(nodeKey),
					} satisfies SchemaAware.TypedNode<typeof nodeWithKeySchema>;
				}
				return {
					[typeNameSymbol]: nodeSchema.name,
				} satisfies SchemaAware.TypedNode<typeof nodeSchema>;
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
							const tree = treeWithContent({
								initialTree: [],
								schema: schemaData,
							});
							const cursors: ITreeCursor[] = [];
							const ids: (LocalNodeKey | undefined)[] = [];
							for (let i = 0; i < nodeCount; i++) {
								const nodeKey =
									i % period === 0 ? tree.context.nodeKeys.generate() : undefined;

								ids.push(nodeKey);
								cursors.push(createNode(tree.context, nodeKey));
							}

							// Measure how long it takes to insert a node with a key
							const before = state.timer.now();
							for (let i = 0; i < nodeCount; i++) {
								tree.insertAtEnd(cursors[i]);
							}
							duration = state.timer.toSeconds(before, state.timer.now());

							// Validate that the tree is as we expect
							const cursor = tree.view.forest.allocateCursor();
							moveToDetachedField(tree.view.forest, cursor);
							cursor.firstNode();
							for (let i = 0; i < nodeCount; i++) {
								if (i % period === 0) {
									cursor.enterField(brand(nodeKeyFieldKey));
									cursor.enterNode(0);
									const id = ids[i];
									const stableId =
										id !== undefined
											? tree.view.nodeKey.stabilize(id)
											: undefined;

									assert.equal(cursor.value, stableId);
									cursor.exitNode();
									cursor.exitField();
									const node = tree.view.nodeKey.map.get(
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
									const nodeKey = tree.view.nodeKey.generate();
									field.insert(i, createNode(tree.view, nodeKey));
									ids.push(nodeKey);
								} else {
									field.insert(i, createNode(tree.view));
								}
							}

							const id = random.pick(ids);

							// Measure how long it takes to lookup a randomly selected key that is known to be in the document
							const before = state.timer.now();
							const node = tree.view.nodeKey.map.get(id);
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
								const key =
									i % period === 0 ? tree.view.nodeKey.generate() : undefined;

								field.insert(i, createNode(tree.view, key));
							}

							// Measure how long it takes to lookup a key that is not in the document
							const nodeKey = tree.view.nodeKey.generate();
							const before = state.timer.now();
							const node = tree.view.nodeKey.map.get(nodeKey);
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
						fieldBaseline.insert(i, createNode(treeBaseline.view));
					}
					await providerBaseline.ensureSynchronized();
					// Create a tree of the same size as the baseline, but with some keys
					const [treeWithIds, fieldWithIds, providerWithIds] = await makeTree();
					for (let i = 0; i < nodeCount; i++) {
						const key =
							i % period === 0 ? treeWithIds.view.nodeKey.generate() : undefined;

						fieldWithIds.insert(i, createNode(treeWithIds.view, key));
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
*/
