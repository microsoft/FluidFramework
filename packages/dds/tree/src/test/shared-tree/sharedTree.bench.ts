/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type BenchmarkTimer,
	BenchmarkType,
	benchmark,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import { EmptyKey, rootFieldKey, type NormalizedUpPath } from "../../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { typeboxValidator } from "../../external-utilities/typeboxValidator.js";
import {
	TreeCompressionStrategy,
	jsonableTreeFromFieldCursor,
} from "../../feature-libraries/index.js";
import { Tree, type CheckoutFlexTreeView } from "../../shared-tree/index.js";
import {
	type JSDeepTree,
	type JSWideTree,
	LinkedList,
	WideRoot,
	deepPath,
	localFieldKey,
	makeDeepContentSimple,
	makeDeepStoredContent,
	makeJsDeepTree,
	makeJsWideTreeWithEndValue,
	makeWideContentWithEndValueSimple,
	makeWideStoredContentWithEndValue,
	readDeepCursorTree,
	readDeepFlexTree,
	readDeepTreeAsJSObject,
	readWideCursorTree,
	readWideFlexTree,
	readWideTreeAsJSObject,
} from "../scalableTestTrees.js";
import {
	StringArray,
	TestTreeProviderLite,
	checkoutWithContent,
	configureBenchmarkHooks,
	chunkFromJsonTrees,
	flexTreeViewWithContent,
	toJsonableTree,
	type SharedTreeWithContainerRuntime,
	fieldCursorFromInsertable,
} from "../utils.js";
import { insert } from "../sequenceRootUtils.js";
import { TreeViewConfiguration } from "../../simple-tree/index.js";
import { configuredSharedTree } from "../../treeFactory.js";
import { makeArray } from "../../util/index.js";

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

// TODO: ADO#7111 Schema should be fixed to enable schema based encoding.
const factory = configuredSharedTree({
	jsonValidator: typeboxValidator,
	treeEncodeType: TreeCompressionStrategy.Uncompressed,
}).getFactory();

// TODO: Once the "BatchTooLarge" error is no longer an issue, extend tests for larger trees.
describe("SharedTree benchmarks", () => {
	configureBenchmarkHooks();
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
						tree[numberOfNodes - 1] = -1;
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
			let tree: CheckoutFlexTreeView;
			benchmark({
				type: benchmarkType,
				title: `Deep Tree with cursor: reads with ${numberOfNodes} nodes`,
				before: () => {
					tree = flexTreeViewWithContent(makeDeepContentSimple(numberOfNodes));
				},
				benchmarkFn: () => {
					const { depth, value } = readDeepCursorTree(tree);
					assert.equal(value, 1);
					assert.equal(depth, numberOfNodes);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: CheckoutFlexTreeView;
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
					tree = flexTreeViewWithContent(
						makeWideContentWithEndValueSimple(numberOfNodes, numberOfNodes - 1),
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
	describe("FlexTree bench", () => {
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			let tree: CheckoutFlexTreeView;
			benchmark({
				type: benchmarkType,
				title: `Deep Tree with Flex Tree: reads with ${numberOfNodes} nodes`,
				before: () => {
					tree = flexTreeViewWithContent(makeDeepContentSimple(numberOfNodes));
				},
				benchmarkFn: () => {
					const { depth, value } = readDeepFlexTree(tree);
					assert.equal(depth, numberOfNodes);
					assert.equal(value, 1);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: CheckoutFlexTreeView;
			let expected: number = 0;
			benchmark({
				type: benchmarkType,
				title: `Wide Tree with Flex Tree: reads with ${numberOfNodes} nodes`,
				before: () => {
					expected = ((numberOfNodes - 1) * numberOfNodes) / 2; // Arithmetic sum of [0, numberOfNodes)
					tree = flexTreeViewWithContent(makeWideContentWithEndValueSimple(numberOfNodes));
				},
				benchmarkFn: () => {
					const { nodesCount, sum } = readWideFlexTree(tree);
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
						const tree = checkoutWithContent(makeDeepStoredContent(numberOfNodes));
						const path = deepPath(numberOfNodes);

						// Measure
						const before = state.timer.now();
						for (let value = 1; value <= setCount; value++) {
							tree.editor
								.valueField({ parent: path, field: localFieldKey })
								.set(chunkFromJsonTrees([value]));
						}
						const after = state.timer.now();
						duration = state.timer.toSeconds(before, after);

						// Cleanup + validation
						const expected = jsonableTreeFromFieldCursor(
							fieldCursorFromInsertable(
								LinkedList,
								makeJsDeepTree(numberOfNodes, setCount) as LinkedList,
							),
						);
						const actual = toJsonableTree(tree);
						assert.deepEqual(actual, expected);

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
						const tree = checkoutWithContent(makeWideStoredContentWithEndValue(numberOfNodes));

						const rootPath: NormalizedUpPath = {
							detachedNodeId: undefined,
							parent: undefined,
							parentField: rootFieldKey,
							parentIndex: 0,
						};
						const nodeIndex = numberOfNodes - 1;
						const editor = tree.editor.sequenceField({
							parent: rootPath,
							field: EmptyKey,
						});

						// Measure
						const before = state.timer.now();
						for (let value = 1; value <= setCount; value++) {
							editor.remove(nodeIndex, 1);
							editor.insert(nodeIndex, chunkFromJsonTrees([value]));
						}
						const after = state.timer.now();
						duration = state.timer.toSeconds(before, after);

						// Cleanup + validation
						const expected = jsonableTreeFromFieldCursor(
							fieldCursorFromInsertable(
								WideRoot,
								makeJsWideTreeWithEndValue(numberOfNodes, setCount),
							),
						);
						const actual = toJsonableTree(tree);
						assert.deepEqual(actual, expected);

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
						const provider = new TestTreeProviderLite(1, factory);
						// TODO: specify a schema for these trees.
						const [tree] = provider.trees;
						for (let i = 0; i < size; i++) {
							insert(tree.kernel.checkout, i, "test");
						}

						// Measure
						const before = state.timer.now();
						provider.synchronizeMessages();
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
		// Each commit generates 2 ops (one for the changeset and one for the UUID minting
		const opsPerCommit = 2;
		const sampleSize = 10;
		// Number of peers that are generating commits.
		const peerCounts = [2, 4];
		// Number of commits that are generated in the amount of time it takes of a single commit to round-trip.
		// E.g., 10 is equivalent to all of the following (and more):
		// - generating 5 edits per second with a 2000ms round-trip time
		// - generating 10 edits per second with a 1000ms round-trip time
		// - generating 100 edits per second with a 100ms round-trip time
		const commitCounts = isInPerformanceTestingMode ? [1, 5, 10] : [1, 2];
		for (const peerCount of peerCounts) {
			for (const commitCount of commitCounts) {
				const test = benchmark({
					type: BenchmarkType.Measurement,
					title: `for ${commitCount} commits per peer for ${peerCount} peers`,
					benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
						let duration: number;
						do {
							// Since this setup one collects data from one iteration, assert that this is what is expected.
							assert.equal(state.iterationsPerBatch, 1);
							const provider = new TestTreeProviderLite(peerCount, factory);

							// This is the start of the stream of commits.
							// Earlier commits are less out of date and therefore not representative.
							for (let iCommit = 0; iCommit < commitCount; iCommit++) {
								for (let iPeer = 0; iPeer < peerCount; iPeer++) {
									const peer = provider.trees[iPeer];
									insert(peer.kernel.checkout, 0, `p${iPeer}c${iCommit}`);
								}
							}

							// This block generates commits that are all out of date to the same degree
							for (let iCommit = 0; iCommit < commitCount; iCommit++) {
								for (let iPeer = 0; iPeer < peerCount; iPeer++) {
									provider.synchronizeMessages({
										count: opsPerCommit,
									});

									const peer = provider.trees[iPeer];
									insert(peer.kernel.checkout, 0, `p${iPeer}c${iCommit}`);
								}
							}

							// This block measures commits that are all out of date to the same degree.
							// We could theoretically measure the time it takes for a single commit to be processed,
							// but averaging over multiple commits gives a more stable result.
							let timeSum = 0;
							for (let iCommit = 0; iCommit < sampleSize; iCommit++) {
								for (let iPeer = 0; iPeer < peerCount; iPeer++) {
									const before = state.timer.now();
									provider.synchronizeMessages({
										count: opsPerCommit,
									});

									const after = state.timer.now();
									timeSum += state.timer.toSeconds(before, after);
									// We still generate commits because it affects local branch rebasing
									const peer = provider.trees[iPeer];
									insert(peer.kernel.checkout, 0, `p${iPeer}c${iCommit}`);
								}
							}

							// We want the average time it would take one peer to process one incoming edit
							duration = timeSum / (peerCount * peerCount * sampleSize);
						} while (state.recordBatch(duration));
					},
					// Force batch size of 1
					minBatchDurationSeconds: 0,
				});

				if (!isInPerformanceTestingMode) {
					test.timeout(5000);
				}
			}
		}
	});

	// In this context "op bunch" refers to a group of ops for the same DDS that are sent by a peer in a single message.
	describe("Op Bunching", () => {
		/**
		 * Helper function to setup the sender and receiver trees for the op bunching benchmarks.
		 * @remarks It pauses the processing of both sender and receiver to enable the test to control when the
		 * messages are processed.
		 */
		function setupSenderAndReceiver() {
			const provider = new TestTreeProviderLite(
				2,
				factory,
				undefined /* useDeterministicSessionIds */,
				FlushMode.TurnBased,
			);
			const sender = provider.trees[0];
			const receiver = provider.trees[1];
			sender.containerRuntime.pauseInboundProcessing();
			receiver.containerRuntime.pauseInboundProcessing();
			return { provider, sender, receiver };
		}

		/**
		 * Helper function to send local commits from a given tree.
		 * In turn based flush mode, the messages won't be sequenced until flush is called explicitly
		 * on the tree's container runtime.
		 * In Immediate flush mode, the messages will be flushed and sequenced immediately. So, this
		 * function will behave similar to 'sequenceLocalCommits'.
		 */
		function sendLocalCommits(
			tree: SharedTreeWithContainerRuntime,
			count: number,
			commitPrefix: string,
		) {
			for (let iCommit = 0; iCommit < count; iCommit++) {
				insert(tree.kernel.checkout, 0, `${commitPrefix}${iCommit}`);
			}
		}

		describe("Rebasing inbound bunch over local changes", () => {
			// The number of commits in a bunch for a given run of this test suite.
			const bunchSizes = isInPerformanceTestingMode ? [1, 10, 100] : [2];
			// Number of local commits to rebase over the inbound bunch
			const localBranchSizes = isInPerformanceTestingMode ? [10, 100] : [2];
			// The time taken by each scenario can be broken down into 4 time costs:
			// 1. Constant factor overhead (we ignore this).
			// 2. The time taken to rebase inbound commits onto the tip of the trunk.
			// 3. The time taken to compose all inbound commits from a bunch into a single commit.
			// 4. The time taken to rebase the local branch over the composed commit from #3.
			//
			// For the following timings:
			// +----------------------+-------------+--------------+
			// |                      | bunchSize:1 | bunchSize:10 |
			// +----------------------+-------------+--------------+
			// | localBranchSize: 10  | t1          | t2           |
			// | localBranchSize: 100 | t3          | t4           |
			// +----------------------+-------------+--------------+
			// If op bunching is used, the time taken for each scenario is as follows:
			// t1 = rebase 1  inbound commit  onto trunk + compose 1  commit  + rebase the local branch of size 10  over one commit
			// t2 = rebase 10 inbound commits onto trunk + compose 10 commits + rebase the local branch of size 10  over one commit
			// t3 = rebase 1  inbound commit  onto trunk + compose 1  commit  + rebase the local branch of size 100 over one commit
			// t4 = rebase 10 inbound commits onto trunk + compose 10 commits + rebase the local branch of size 100 over one commit
			// Therefore, if op bunching is used, then t4 should be roughly equal to t3 + t2 - t1.
			for (const bunchSize of bunchSizes) {
				for (const localBranchSize of localBranchSizes) {
					const test = benchmark({
						type: BenchmarkType.Measurement,
						title: `Rebase ${localBranchSize} local commits over ${bunchSize} inbound commits`,
						benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
							let duration: number;
							do {
								// Since this setup collects data from one iteration, assert that this is what is expected.
								assert.equal(state.iterationsPerBatch, 1);

								const { provider, sender, receiver } = setupSenderAndReceiver();
								// Send local commits from the receiver but don't sequence them because we want them to be
								// in the local branch.
								sendLocalCommits(receiver, localBranchSize, "r");
								// Send and sequence local commits from the sender. These are the commits that should be
								// bunched together.
								sendLocalCommits(sender, bunchSize, "s");
								sender.containerRuntime.flush();

								// Resume the receiver so it can process the bunched commits from the sender.
								receiver.containerRuntime.resumeInboundProcessing();

								const before = state.timer.now();
								// Synchronize the bunched commits. This should force the local branch to be rebased over the bunch.
								// The receiver will not process its local commits since they were never flushed.
								provider.synchronizeMessages({ flush: false });
								const after = state.timer.now();
								duration = state.timer.toSeconds(before, after);
							} while (state.recordBatch(duration));
						},
						// Force batch size of 1
						minBatchDurationSeconds: 0,
					});
					if (!isInPerformanceTestingMode) {
						test.timeout(5000);
					}
				}
			}
		});

		describe("Rebasing inbound bunch over trunk changes", () => {
			// The number of commits in a bunch for a given run of this test suite.
			const bunchSizes = isInPerformanceTestingMode ? [10, 100] : [2];
			// Number of local commits to rebase over the inbound bunch
			const localTrunkSizes = isInPerformanceTestingMode ? [1, 10, 100] : [2];
			for (const bunchSize of bunchSizes) {
				for (const localTrunkSize of localTrunkSizes) {
					const test = benchmark({
						type: BenchmarkType.Measurement,
						title: `Rebase ${bunchSize} inbound commits over ${localTrunkSize} trunk commits`,
						benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
							let duration: number;
							do {
								// Since this setup collects data from one iteration, assert that this is what is expected.
								assert.equal(state.iterationsPerBatch, 1);

								const { provider, sender, receiver } = setupSenderAndReceiver();
								// Send local commits from the receiver and flush them so they are sequenced. These are
								// the commits that will be in the trunk.
								sendLocalCommits(receiver, localTrunkSize, "r");
								receiver.containerRuntime.flush();
								// Send local commits from the sender but don't sequence them yet. We want them to be
								// sequenced after the receiver has received its local commits and they are in its trunk.
								// These are sent before the receiver's commits are processed so that their reference
								// sequence number is older the receiver's commits.
								sendLocalCommits(sender, bunchSize, "s");

								// Synchronize the messages. The receiver will receive its local commits and they will
								// be in the trunk.
								receiver.containerRuntime.resumeInboundProcessing();
								provider.synchronizeMessages({ flush: false });

								// Flush the sender's local commits now to sequence them. These will be rebased by the
								// receiver over its trunk when it receives them.
								sender.containerRuntime.flush();

								const before = state.timer.now();
								// Synchronize the message. The receiver will received the bunched commits from the
								// sender which will be rebased over the trunk.
								provider.synchronizeMessages({ flush: false });
								const after = state.timer.now();
								duration = state.timer.toSeconds(before, after);
							} while (state.recordBatch(duration));
						},
						// Force batch size of 1
						minBatchDurationSeconds: 0,
					});
					if (!isInPerformanceTestingMode) {
						test.timeout(5000);
					}
				}
			}
		});
	});

	describe("big transaction composition", () => {
		const editCounts = isInPerformanceTestingMode ? [10, 100, 1000] : [5];
		for (const editCount of editCounts) {
			const test = benchmark({
				type: BenchmarkType.Measurement,
				title: `Compose ${editCount} sequence edits into a single transaction`,
				benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
					let duration: number;
					do {
						// Since this setup one collects data from one iteration, assert that this is what is expected.
						assert.equal(state.iterationsPerBatch, 1);
						const provider = new TestTreeProviderLite(
							1,
							factory,
							undefined /* useDeterministicSessionIds */,
							FlushMode.TurnBased,
						);
						const tree = provider.trees[0];
						tree.containerRuntime.connected = true;
						const view = tree.viewWith(
							new TreeViewConfiguration({
								schema: StringArray,
							}),
						);
						view.initialize([]);

						const before = state.timer.now();
						Tree.runTransaction(view, () => {
							for (let iEdit = 0; iEdit < editCount; iEdit++) {
								view.root.insertAtEnd(`${iEdit}`);
							}
						});
						const after = state.timer.now();
						duration = state.timer.toSeconds(before, after);

						const actual = [...view.root];
						const expected = makeArray(editCount, (index) => `${index}`);
						assert.deepEqual(actual, expected);
					} while (state.recordBatch(duration));
				},
				// Force batch size of 1
				minBatchDurationSeconds: 0,
			});
			if (!isInPerformanceTestingMode) {
				test.timeout(5000);
			}
		}
	});
});
