/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { benchmark, BenchmarkTimer, BenchmarkType } from "@fluid-tools/benchmark";
import {
	jsonableTreeFromCursor,
	cursorForTypedData,
	cursorForTypedTreeData,
} from "../../feature-libraries";
import { singleJsonCursor } from "../../domains";
import { insert, TestTreeProviderLite, toJsonableTree, viewWithContent } from "../utils";
import { ISharedTreeView } from "../../shared-tree";
import { rootFieldKey } from "../../core";
import {
	deepPath,
	deepSchema,
	JSDeepTree,
	JSWideTree,
	localFieldKey,
	makeDeepContent,
	makeJsDeepTree,
	makeWideContentWithEndValue,
	makeJsWideTreeWithEndValue,
	readDeepCursorTree,
	readDeepEditableTree,
	readDeepTreeAsJSObject,
	readWideCursorTree,
	readWideEditableTree,
	readWideTreeAsJSObject,
	wideRootSchema,
	wideSchema,
} from "../scalableTestTrees";

// number of nodes in test for wide trees
const nodesCountWide = [
	[1, BenchmarkType.Measurement],
	[100, BenchmarkType.Perspective],
	[500, BenchmarkType.Measurement],
];
// number of nodes in test for deep trees
const nodesCountDeep = [
	[1, BenchmarkType.Measurement],
	[10, BenchmarkType.Perspective],
	[100, BenchmarkType.Measurement],
];

// TODO: Once the "BatchTooLarge" error is no longer an issue, extend tests for larger trees.
describe("SharedTree benchmarks", () => {
	describe("Direct JS Object", () => {
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			let tree: JSDeepTree;
			benchmark({
				type: benchmarkType,
				title: `Deep Tree as JS Object: reads with ${numberOfNodes} nodes`,
				before: () => {
					tree = makeJsDeepTree(numberOfNodes, 1) as JSDeepTree;
				},
				benchmarkFn: () => {
					const { depth, value } = readDeepTreeAsJSObject(tree);
					assert.equal(depth, numberOfNodes);
					assert.equal(value, 1);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: JSWideTree;
			let expected = 0;
			benchmark({
				type: benchmarkType,
				title: `Wide Tree as JS Object: reads with ${numberOfNodes} nodes`,
				before: () => {
					tree = makeJsWideTreeWithEndValue(numberOfNodes, numberOfNodes - 1);
					for (let i = 0; i < numberOfNodes; i++) {
						expected += i;
					}
				},
				benchmarkFn: () => {
					const { nodesCount, sum } = readWideTreeAsJSObject(tree);
					assert.equal(nodesCount, numberOfNodes);
					assert.equal(sum, expected);
				},
			});
		}
		describe(`Edit JS Object`, () => {
			for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
				let tree: JSDeepTree;
				let currentNode: JSDeepTree;
				benchmark({
					type: benchmarkType,
					title: `Update value at leaf of ${numberOfNodes} deep tree`,
					before: () => {
						tree = makeJsDeepTree(numberOfNodes, 1) as JSDeepTree;
						currentNode = tree;
						while (typeof currentNode !== "number") {
							if (typeof currentNode.foo === "number") {
								break;
							}
							currentNode = currentNode.foo;
						}
					},
					benchmarkFn: () => {
						currentNode.foo = -1;
					},
					after: () => {
						const expected = makeJsDeepTree(numberOfNodes, -1);
						assert.deepEqual(tree, expected);
					},
				});
			}
			for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
				let tree: JSWideTree;
				benchmark({
					type: benchmarkType,
					title: `Update value at leaf of ${numberOfNodes} Wide tree`,
					before: () => {
						tree = makeJsWideTreeWithEndValue(numberOfNodes, numberOfNodes - 1);
					},
					benchmarkFn: () => {
						tree.foo[numberOfNodes - 1] = -1;
					},
					after: () => {
						const expected = makeJsWideTreeWithEndValue(numberOfNodes, -1);
						assert.deepEqual(tree, expected);
					},
				});
			}
		});
	});
	describe("Cursors", () => {
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			let tree: ISharedTreeView;
			benchmark({
				type: benchmarkType,
				title: `Deep Tree with cursor: reads with ${numberOfNodes} nodes`,
				before: () => {
					tree = viewWithContent(makeDeepContent(numberOfNodes));
				},
				benchmarkFn: () => {
					const { depth, value } = readDeepCursorTree(tree);
					assert.equal(value, 1);
					assert.equal(depth, numberOfNodes);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: ISharedTreeView;
			let expected = 0;
			benchmark({
				type: benchmarkType,
				title: `Wide Tree with cursor: reads with ${numberOfNodes} nodes`,
				before: () => {
					const numbers = [];
					for (let index = 0; index < numberOfNodes; index++) {
						numbers.push(index);
						expected += index;
					}
					tree = viewWithContent(
						makeWideContentWithEndValue(numberOfNodes, numberOfNodes - 1),
					);
				},
				benchmarkFn: () => {
					const { nodesCount, sum } = readWideCursorTree(tree);
					assert.equal(sum, expected);
					assert.equal(nodesCount, numberOfNodes);
				},
			});
		}
	});
	describe("EditableTree bench", () => {
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			let tree: ISharedTreeView;
			benchmark({
				type: benchmarkType,
				title: `Deep Tree with Editable Tree: reads with ${numberOfNodes} nodes`,
				before: () => {
					tree = viewWithContent(makeDeepContent(numberOfNodes));
				},
				benchmarkFn: () => {
					const { depth, value } = readDeepEditableTree(tree);
					assert.equal(depth, numberOfNodes);
					assert.equal(value, 1);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: ISharedTreeView;
			let expected: number = 0;
			benchmark({
				type: benchmarkType,
				title: `Wide Tree with Editable Tree: reads with ${numberOfNodes} nodes`,
				before: () => {
					const numbers = [];
					for (let index = 0; index < numberOfNodes; index++) {
						numbers.push(index);
						expected += index;
					}
					tree = viewWithContent({
						initialTree: { foo: numbers },
						schema: wideSchema,
					});
				},
				benchmarkFn: () => {
					const { nodesCount, sum } = readWideEditableTree(tree);
					assert.equal(sum, expected);
					assert.equal(nodesCount, numberOfNodes);
					readWideCursorTree(tree);
				},
			});
		}
	});
	describe("Edit with editor", () => {
		const setCount = 100;
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			benchmark({
				type: benchmarkType,
				title: `Update value at leaf of ${numberOfNodes} deep tree ${setCount} times`,
				benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
					let duration: number;
					do {
						// Since this setup one collects data from one iteration, assert that this is what is expected.
						assert.equal(state.iterationsPerBatch, 1);

						// Setup
						const tree = viewWithContent(makeDeepContent(numberOfNodes));
						const path = deepPath(numberOfNodes);

						// Measure
						const before = state.timer.now();
						for (let value = 1; value <= setCount; value++) {
							tree.editor
								.valueField({ parent: path, field: localFieldKey })
								.set(singleJsonCursor(value));
						}
						const after = state.timer.now();
						duration = state.timer.toSeconds(before, after);

						// Cleanup + validation
						const expected = jsonableTreeFromCursor(
							cursorForTypedData(
								{ schema: tree.storedSchema },
								deepSchema.rootFieldSchema.allowedTypes,
								makeJsDeepTree(numberOfNodes, setCount),
							),
						);
						const actual = toJsonableTree(tree);
						assert.deepEqual(actual, [expected]);

						// Collect data
					} while (state.recordBatch(duration));
				},
				// Force batch size of 1
				minBatchDurationSeconds: 0,
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			benchmark({
				type: benchmarkType,
				title: `Update value at leaf of ${numberOfNodes} wide tree ${setCount} times`,
				benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
					let duration: number;
					do {
						// Since this setup one collects data from one iteration, assert that this is what is expected.
						assert.equal(state.iterationsPerBatch, 1);

						// Setup
						const numbers = [];
						for (let index = 0; index < numberOfNodes; index++) {
							numbers.push(index);
						}
						const tree = viewWithContent({
							initialTree: { foo: numbers },
							schema: wideSchema,
						});

						const rootPath = {
							parent: undefined,
							parentField: rootFieldKey,
							parentIndex: 0,
						};
						const nodeIndex = numberOfNodes - 1;
						const editor = tree.editor.sequenceField({
							parent: rootPath,
							field: localFieldKey,
						});

						// Measure
						const before = state.timer.now();
						for (let value = 1; value <= setCount; value++) {
							editor.delete(nodeIndex, 1);
							editor.insert(nodeIndex, [singleJsonCursor(value)]);
						}
						const after = state.timer.now();
						duration = state.timer.toSeconds(before, after);

						// Cleanup + validation
						const expected = jsonableTreeFromCursor(
							cursorForTypedTreeData(
								{
									schema: tree.storedSchema,
								},
								wideRootSchema,
								makeJsWideTreeWithEndValue(numberOfNodes, setCount),
							),
						);
						const actual = toJsonableTree(tree);
						assert.deepEqual(actual, [expected]);

						// Collect data
					} while (state.recordBatch(duration));
				},
				// Force batch size of 1
				minBatchDurationSeconds: 0,
			});
		}
	});

	describe("acking local commits", () => {
		const localCommitSize = [1, 25, 100, 500, 1000];
		for (const size of localCommitSize) {
			benchmark({
				type: BenchmarkType.Measurement,
				title: `for ${size} local commit${size === 1 ? "" : "s"}`,
				benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
					let duration: number;
					do {
						// Since this setup one collects data from one iteration, assert that this is what is expected.
						assert.equal(state.iterationsPerBatch, 1);

						// Setup
						const provider = new TestTreeProviderLite();
						const [tree] = provider.trees;
						for (let i = 0; i < size; i++) {
							insert(tree, i, "test");
						}

						// Measure
						const before = state.timer.now();
						provider.processMessages();
						const after = state.timer.now();
						duration = state.timer.toSeconds(before, after);
						// Collect data
					} while (state.recordBatch(duration));
				},
				// Force batch size of 1
				minBatchDurationSeconds: 0,
			});
		}
	});

	// Note that this runs the computation for several peers.
	// In practice, this computation is distributed across peers, so the actual time reported is
	// divided by the number of peers.
	describe("rebasing commits", () => {
		const commitCounts = [1, 10, 20];
		const nbPeers = 5;
		for (const nbCommits of commitCounts) {
			benchmark({
				type: BenchmarkType.Measurement,
				title: `for ${nbCommits} commits per peer for ${nbPeers} peers`,
				benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
					let duration: number;
					do {
						// Since this setup one collects data from one iteration, assert that this is what is expected.
						assert.equal(state.iterationsPerBatch, 1);

						// Setup
						const provider = new TestTreeProviderLite(nbPeers);
						for (let iCommit = 0; iCommit < nbCommits; iCommit++) {
							for (let iPeer = 0; iPeer < nbPeers; iPeer++) {
								const peer = provider.trees[iPeer];
								insert(peer, 0, `p${iPeer}c${iCommit}`);
							}
						}

						// Measure
						const before = state.timer.now();
						provider.processMessages();
						const after = state.timer.now();
						// Divide the duration by the number of peers so we get the average time per peer.
						duration = state.timer.toSeconds(before, after) / nbPeers;
					} while (state.recordBatch(duration));
				},
				// Force batch size of 1
				minBatchDurationSeconds: 0,
			});
		}
	});
});
