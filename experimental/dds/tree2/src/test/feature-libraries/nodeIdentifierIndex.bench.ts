/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";
import { benchmark, BenchmarkTimer, BenchmarkType } from "@fluid-tools/benchmark";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { IsoBuffer } from "@fluidframework/common-utils";
import { ISharedTree } from "../../shared-tree";
import { TestTreeProviderLite } from "../utils";
import {
	NodeIdentifier,
	SequenceFieldEditBuilder,
	singleTextCursor,
} from "../../feature-libraries";
import {
	rootFieldKeySymbol,
	ITreeCursor,
	moveToDetachedField,
	JsonableTree,
	symbolFromKey,
} from "../../core";
import { nodeIdentifierSchema } from "../../domains";
import { nodeSchema, nodeSchemaData } from "./nodeIdentifierIndex.spec";

const { field: nodeIdentifierField, type: nodeIdentifierType } = nodeIdentifierSchema();

describe("Node Identifiers", () => {
	// TODO: Increase these numbers when the identifier index is more efficient
	for (const nodeCount of [50, 100]) {
		describe(`In a tree with ${nodeCount} nodes`, () => {
			function makeTree(): [ISharedTree, SequenceFieldEditBuilder, TestTreeProviderLite] {
				const provider = new TestTreeProviderLite(1);
				const [tree] = provider.trees;
				tree.storedSchema.update(nodeSchemaData);
				const field = tree.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				return [tree, field, provider];
			}

			function createNode(nodeIdentifier?: NodeIdentifier): ITreeCursor {
				const jsonTree: JsonableTree = {
					type: nodeSchema.name,
				};
				if (nodeIdentifier !== undefined) {
					jsonTree.globalFields = {
						[nodeIdentifierField.key]: [
							{ type: nodeIdentifierType, value: nodeIdentifier },
						],
					};
				}
				return singleTextCursor(jsonTree);
			}

			for (const identifierDensityPercentage of [5, 50, 100]) {
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Insert ${nodeCount} nodes, ${identifierDensityPercentage}% of which have identifiers`,
					benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
						const period = Math.round(100 / identifierDensityPercentage);
						let duration: number;
						do {
							assert.equal(state.iterationsPerBatch, 1);
							const [tree, field] = makeTree();
							const cursors: ITreeCursor[] = [];
							const ids: (NodeIdentifier | undefined)[] = [];
							for (let i = 0; i < nodeCount; i++) {
								const nodeIdentifier =
									i % period === 0 ? tree.generateNodeIdentifier() : undefined;

								ids.push(nodeIdentifier);
								cursors.push(createNode(nodeIdentifier));
							}

							// Measure how long it takes to insert a node with an identifier
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
									cursor.enterField(symbolFromKey(nodeIdentifierField.key));
									cursor.enterNode(0);
									assert.equal(cursor.value, ids[i]);
									cursor.exitNode();
									cursor.exitField();
									const node = tree.identifiedNodes.get(
										ids[i] ?? fail("Expected node identifier to be in list"),
									);
									assert(node !== undefined);
									assert.equal(
										node[symbolFromKey(nodeIdentifierField.key)],
										ids[i],
									);
								}
								cursor.nextNode();
							}
							cursor.free();
						} while (state.recordBatch(duration));
					},
					minBatchDurationSeconds: 0, // Force batch size of 1
				});
			}

			for (const identifierDensityPercentage of [5, 50, 100]) {
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Lookup a node by identifier in a tree of size ${nodeCount} where ${identifierDensityPercentage}% of the tree has identifiers`,
					benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
						const period = Math.round(100 / identifierDensityPercentage);
						const random = makeRandom(0);
						let duration: number;
						do {
							assert.equal(state.iterationsPerBatch, 1);
							const [tree, field] = makeTree();
							const ids: NodeIdentifier[] = [];
							for (let i = 0; i < nodeCount; i++) {
								if (i % period === 0) {
									const nodeIdentifier = tree.generateNodeIdentifier();
									field.insert(i, createNode(nodeIdentifier));
									ids.push(nodeIdentifier);
								} else {
									field.insert(i, createNode());
								}
							}

							const id = random.pick(ids);

							// Measure how long it takes to lookup a randomly selected ID that is known to be in the document
							const before = state.timer.now();
							const node = tree.identifiedNodes.get(id);
							duration = state.timer.toSeconds(before, state.timer.now());

							assert(node !== undefined);
							assert.equal(node[symbolFromKey(nodeIdentifierField.key)], id);
						} while (state.recordBatch(duration));
					},
					minBatchDurationSeconds: 0, // Force batch size of 1
				});
			}

			for (const identifierDensityPercentage of [5, 50, 100]) {
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Lookup a non-existent identifier in a tree of size ${nodeCount} where ${identifierDensityPercentage}% of the tree has identifiers`,
					benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
						const period = Math.round(100 / identifierDensityPercentage);
						let duration: number;
						do {
							assert.equal(state.iterationsPerBatch, 1);
							const [tree, field] = makeTree();
							for (let i = 0; i < nodeCount; i++) {
								const identifier =
									i % period === 0 ? tree.generateNodeIdentifier() : undefined;

								field.insert(i, createNode(identifier));
							}

							// Measure how long it takes to lookup an ID that is not in the document
							const nodeIdentifier = tree.generateNodeIdentifier();
							const before = state.timer.now();
							const node = tree.identifiedNodes.get(nodeIdentifier);
							duration = state.timer.toSeconds(before, state.timer.now());

							assert(node === undefined);
						} while (state.recordBatch(duration));
					},
					minBatchDurationSeconds: 0, // Force batch size of 1
				});
			}

			for (const identifierDensityPercentage of [5, 50, 100]) {
				const period = Math.round(100 / identifierDensityPercentage);
				it(`increase the summary size (when ${identifierDensityPercentage}% of nodes have identifiers)`, () => {
					// Create a baseline tree with no identifiers
					const [treeBaseline, fieldBaseline, providerBaseline] = makeTree();
					for (let i = 0; i < nodeCount; i++) {
						fieldBaseline.insert(i, createNode());
					}
					providerBaseline.processMessages();
					// Create a tree of the same size as the baseline, but with some identifiers
					const [treeWithIds, fieldWithIds, providerWithIds] = makeTree();
					for (let i = 0; i < nodeCount; i++) {
						const identifier =
							i % period === 0 ? treeBaseline.generateNodeIdentifier() : undefined;

						fieldWithIds.insert(i, createNode(identifier));
					}
					providerWithIds.processMessages();

					// Summarize both trees and measure their summary sizes
					const { summary: summaryBaseline } = treeBaseline.getAttachSummary(true);
					const sizeBaseline = IsoBuffer.from(JSON.stringify(summaryBaseline)).byteLength;
					const { summary: summaryWithIds } = treeWithIds.getAttachSummary(true);
					const sizeWithIds = IsoBuffer.from(JSON.stringify(summaryWithIds)).byteLength;
					// TODO: report these sizes as benchmark output which can be tracked over time.
					const sizeDelta = sizeWithIds - sizeBaseline;
					const relativeDelta = sizeDelta / sizeBaseline;
					// Arbitrary limit of 10% increase. Re-adjust when identifier index is more performant.
					assert(
						relativeDelta < 0.1,
						`Increased summary size by ${sizeDelta} bytes (${(
							relativeDelta * 100
						).toFixed(2)}% increase)`,
					);
				});
			}
		});
	}
});
