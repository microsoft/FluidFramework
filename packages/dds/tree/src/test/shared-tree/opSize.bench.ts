/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import {
	BenchmarkType,
	benchmarkCustom,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import type { Value } from "../../core/index.js";
import { typeboxValidator } from "../../external-utilities/index.js";
import { TreeCompressionStrategy } from "../../feature-libraries/index.js";
import { Tree, type ISharedTree, type SharedTree } from "../../shared-tree/index.js";
import { type JsonCompatibleReadOnly, getOrAddEmptyToMap } from "../../util/index.js";
import { treeTestFactory } from "../utils.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type ITree,
	type TreeView,
} from "../../simple-tree/index.js";

// Notes:
// 1. Within this file "percentile" is commonly used, and seems to refer to a portion (0 to 1) or some maximum size.
// While it would be useful and interesting to have some distribution of op sizes and measure some percentile from that distribution,
// that does not appear to be what these tests are doing.
// 2. Major changes in these sizes (regressions, optimizations or the tests not collecting what they should) do not make these tests fail.
// 3. These tests are currently implemented as integration tests, meaning they use lots of dependencies and high level APIs.
// They could be reimplemented targeted the lower level APIs if desired (just call the op encoding functions)
// 4. "large" node just get a long repeated string value, not a complex tree, so tree encoding is not really covered here.
// TODO: fix above issues.

const schemaFactory = new SchemaFactory("opSize");

class Child extends schemaFactory.object("Test:Opsize-Bench-Child", {
	data: schemaFactory.string,
}) {}
class Parent extends schemaFactory.array("Test:Opsize-Bench-Root", Child) {}

/**
 * Create a default attached tree for op submission
 */
function createConnectedTree(): SharedTree {
	const containerRuntimeFactory = new MockContainerRuntimeFactory();
	const dataStoreRuntime = new MockFluidDataStoreRuntime({
		idCompressor: createIdCompressor(),
	});
	containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const tree = treeTestFactory({
		runtime: dataStoreRuntime,
		options: {
			jsonValidator: typeboxValidator,
			treeEncodeType: TreeCompressionStrategy.Uncompressed,
		},
	});
	tree.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	return tree;
}

const config = new TreeViewConfiguration({
	schema: Parent,
	preventAmbiguity: true,
	enableSchemaValidation: true,
});

/*
 * Updates the given `tree` to the given `schema` and inserts `state` as its root.
 */
function initializeTestTree(
	tree: ITree,
	state: InsertableTreeNodeFromImplicitAllowedTypes<typeof Parent> = [],
): TreeView<typeof Parent> {
	const view = tree.viewWith(config);
	view.initialize(state);
	return view;
}

function utf8Length(data: JsonCompatibleReadOnly): number {
	return new TextEncoder().encode(JSON.stringify(data)).length;
}

/**
 * Creates an insertable child with a string of the provided length
 */
function createTreeWithSize(
	desiredByteSize: number,
): InsertableTreeNodeFromImplicitAllowedTypes<typeof Child> {
	return {
		data: createStringFromLength(desiredByteSize),
	};
}

function assertChildNodeCount(tree: TreeView<typeof Parent>, nodeCount: number): void {
	assert.equal(tree.root.length, nodeCount);
}

/**
 * Checks that the first `childCount` values under "children" have the provided value.
 */
function expectChildrenValues(
	tree: TreeView<typeof Parent>,
	expected: Value,
	childCount: number,
): void {
	for (let index = 0; index < childCount; index++) {
		assert.equal(tree.root[index].data, expected);
	}
}

/**
 * Creates a tree with the desired number of children and the size of each child's string in bytes.
 */
function createInitialTree(
	childNodes: number,
	childNodeByteSize: number,
): InsertableTreeNodeFromImplicitAllowedTypes<typeof Parent> {
	const childNode = createTreeWithSize(childNodeByteSize);
	const children: InsertableTreeNodeFromImplicitAllowedTypes<typeof Child>[] = new Array(
		childNodes,
	).fill(childNode);
	return children;
}

function insertNodes(
	tree: TreeView<typeof Parent>,
	content: InsertableTreeNodeFromImplicitAllowedTypes<typeof Child>,
	count: number,
): void {
	for (let i = 0; i < count; i++) {
		tree.root.insertAt(0, content);
	}
}

function insertNodesWithSingleTransaction(
	tree: TreeView<typeof Parent>,
	content: InsertableTreeNodeFromImplicitAllowedTypes<typeof Child>,
	count: number,
): void {
	Tree.runTransaction(tree, () => {
		insertNodes(tree, content, count);
	});
}

function removeNodes(
	tree: TreeView<typeof Parent>,
	numRemovals: number,
	removalsPerOp: number,
): void {
	for (let i = 0; i < numRemovals; i++) {
		tree.root.removeRange(tree.root.length - 1, tree.root.length - 1 + removalsPerOp);
	}
}

function removeNodesWithSingleTransaction(
	tree: TreeView<typeof Parent>,
	numRemoved: number,
): void {
	tree.root.removeRange(0, numRemoved);
}

function createStringFromLength(numberOfBytes: number): string {
	return "a".repeat(numberOfBytes);
}

function editNodes(
	tree: TreeView<typeof Parent>,
	numChildrenToEdit: number,
	childData: string,
): void {
	for (let i = 0; i < numChildrenToEdit; i++) {
		Tree.runTransaction(tree, () => {
			tree.root.removeAt(i);
			tree.root.insertAt(i, { data: childData });
		});
	}
}

enum Operation {
	Insert = "Insert",
	Remove = "Remove",
	Edit = "Edit",
}

enum TransactionStyle {
	Individual,
	Single,
}

/**
 * The following byte sizes in utf-8 encoded bytes of JsonableTree were found to be the maximum size that could be successfully
 * inserted/removed/edited using the following node counts and either individual of singular (bulk) transactions.
 *
 * Using any larger of a byte size of JsonableTree children causes the "BatchToLarge" error; this would require either:
 * Adding artificial wait, for e.x. by using a for-loop to segment our transactions into batches of less than the given node count.
 * OR
 * Making the size in bytes of the children smaller.
 */
const MAX_SUCCESSFUL_OP_BYTE_SIZES = {
	Insert: {
		[TransactionStyle.Individual]: {
			nodeCounts: {
				"100": 8900,
			},
		},
		[TransactionStyle.Single]: {
			nodeCounts: {
				"100": 9600,
			},
		},
	},
	Remove: {
		[TransactionStyle.Individual]: {
			nodeCounts: {
				"100": 9700,
			},
		},
		[TransactionStyle.Single]: {
			nodeCounts: {
				"100": 9700,
			},
		},
	},
	Edit: {
		[TransactionStyle.Individual]: {
			nodeCounts: {
				// Edit benchmarks use 1/10 of the actual max sizes outside of perf mode because it takes so long to execute.
				"100": isInPerformanceTestingMode ? 800000 : 80000,
			},
		},
		[TransactionStyle.Single]: {
			nodeCounts: {
				"100": 8600,
			},
		},
	},
} as const;

const getSuccessfulOpByteSize = (
	operation: Operation,
	transactionStyle: TransactionStyle,
	percentile: number,
) => {
	return Math.floor(
		MAX_SUCCESSFUL_OP_BYTE_SIZES[operation][transactionStyle].nodeCounts["100"] * percentile,
	);
};

const BENCHMARK_NODE_COUNT = 100;

const sizes = [
	{ percentile: 0.1, word: "small" },
	{ percentile: 0.5, word: "medium" },
	{ percentile: 1.0, word: "large" },
];

const styles = [
	{
		description: "Many Transactions",
		style: TransactionStyle.Individual,
		extraDescription: `${BENCHMARK_NODE_COUNT} transactions`,
	},
	{
		description: "Single Transaction",
		style: TransactionStyle.Single,
		extraDescription: `1 transaction`,
	},
];

// TODO: replace use of TransactionStyle with this.
function withTransactionsOrNot(
	fn: (run: <T>(view: TreeView<typeof Parent>, op: () => T) => T) => void,
): void {
	describe("Many Ops", () => {
		fn((view, op) => op());
	});
	describe("Single Transaction", () => {
		fn((view, op) => Tree.runTransaction(view, () => op()));
	});
}

describe("Op Size", () => {
	const opsByBenchmarkName: Map<string, ISequencedDocumentMessage[]> = new Map();
	let currentBenchmarkName = "";
	const currentTestOps: ISequencedDocumentMessage[] = [];

	function registerOpListener(
		tree: ISharedTree,
		resultArray: ISequencedDocumentMessage[],
	): void {
		// TODO: better way to hook this up. Needs to detect local ops exactly once.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const oldSubmitLocalMessage = (tree as any).submitLocalMessage.bind(tree);
		function submitLocalMessage(
			content: ISequencedDocumentMessage,
			localOpMetadata: unknown = undefined,
		): void {
			resultArray.push(content);
			oldSubmitLocalMessage(content, localOpMetadata);
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(tree as any).submitLocalMessage = submitLocalMessage;
	}

	const getOperationsStats = (
		operations: ISequencedDocumentMessage[],
	): Record<string, number> => {
		const lengths = operations.map((operation) =>
			utf8Length(operation as unknown as JsonCompatibleReadOnly),
		);
		const totalOpBytes = lengths.reduce((a, b) => a + b, 0);
		const maxOpSizeBytes = Math.max(...lengths);

		return {
			"Total Op Size (Bytes)": totalOpBytes,
			"Max Op Size (Bytes)": maxOpSizeBytes,
			"Total Ops:": operations.length,
		};
	};

	const initializeOpDataCollection = (tree: ISharedTree) => {
		currentTestOps.length = 0;
		registerOpListener(tree, currentTestOps);
	};

	const saveAndResetCurrentOps = () => {
		currentTestOps.forEach((op) =>
			getOrAddEmptyToMap(opsByBenchmarkName, currentBenchmarkName).push(op),
		);
		currentTestOps.length = 0;
	};

	const deleteCurrentOps = () => {
		currentTestOps.length = 0;
	};

	beforeEach(function (): void {
		currentBenchmarkName = this.currentTest?.fullTitle() ?? fail();
		currentTestOps.length = 0;
	});

	afterEach(function () {
		if (this.currentTest?.isFailed() === false) {
			// Currently tests can pass when no data is collected, so throw here in that case to ensure tests don't break and start collecting no data.
			assert(currentTestOps.length !== 0);
		}
		currentTestOps.forEach((op) =>
			getOrAddEmptyToMap(opsByBenchmarkName, currentBenchmarkName).push(op),
		);
		currentTestOps.length = 0;
	});

	describe("Insert Nodes", () => {
		function benchmarkOps(transactionStyle: TransactionStyle, percentile: number): void {
			const tree = createConnectedTree();
			initializeOpDataCollection(tree);
			const view = initializeTestTree(tree);
			deleteCurrentOps(); // We don't want to record any ops from initializing the tree.
			const apply =
				transactionStyle === TransactionStyle.Individual
					? insertNodes
					: insertNodesWithSingleTransaction;

			apply(
				view,
				createTreeWithSize(
					getSuccessfulOpByteSize(Operation.Insert, transactionStyle, percentile),
				),
				BENCHMARK_NODE_COUNT,
			);
			assertChildNodeCount(view, BENCHMARK_NODE_COUNT);
		}

		for (const { description, style, extraDescription } of styles) {
			describe(description, () => {
				for (const { percentile, word } of sizes) {
					benchmarkCustom({
						only: false,
						type: BenchmarkType.Measurement,
						title: `${BENCHMARK_NODE_COUNT} ${word} nodes in ${extraDescription}`,
						run: async (reporter) => {
							benchmarkOps(style, percentile);
							const opStats = getOperationsStats(currentTestOps);
							for (const key of Object.keys(opStats)) {
								reporter.addMeasurement(key, opStats[key]);
							}
						},
					});
				}
			});
		}
	});

	describe("Remove Nodes", () => {
		function benchmarkOps(transactionStyle: TransactionStyle, percentile: number): void {
			const tree = createConnectedTree();
			initializeOpDataCollection(tree);
			const childByteSize = getSuccessfulOpByteSize(
				Operation.Remove,
				transactionStyle,
				percentile,
			);
			const view = initializeTestTree(tree, createInitialTree(100, childByteSize));
			deleteCurrentOps(); // We don't want to record any ops from initializing the tree.
			if (transactionStyle === TransactionStyle.Individual) {
				removeNodes(view, 100, 1);
			} else {
				removeNodesWithSingleTransaction(view, 100);
			}
			assertChildNodeCount(view, 0);
		}

		for (const { description, style, extraDescription } of styles) {
			describe(description, () => {
				for (const { percentile, word } of sizes) {
					const title = `${BENCHMARK_NODE_COUNT} ${word} nodes in ${
						style === TransactionStyle.Individual
							? extraDescription
							: `1 transactions containing 1 removal of ${BENCHMARK_NODE_COUNT} nodes`
					}`;
					benchmarkCustom({
						only: false,
						type: BenchmarkType.Measurement,
						title,
						run: async (reporter) => {
							benchmarkOps(style, percentile);
							const opStats = getOperationsStats(currentTestOps);
							for (const key of Object.keys(opStats)) {
								reporter.addMeasurement(key, opStats[key]);
							}
						},
					});
				}
			});
		}
	});

	describe("Edit Nodes", () => {
		function benchmarkOps(transactionStyle: TransactionStyle, percentile: number): void {
			const tree = createConnectedTree();
			initializeOpDataCollection(tree);
			// Note that the child node byte size for the initial tree here should be arbitrary.
			const view = initializeTestTree(tree, createInitialTree(BENCHMARK_NODE_COUNT, 1000));
			deleteCurrentOps(); // We don't want to record any ops from initializing the tree.
			const childData = createStringFromLength(
				getSuccessfulOpByteSize(Operation.Edit, transactionStyle, percentile),
			);
			const action = () => {
				editNodes(view, BENCHMARK_NODE_COUNT, childData);
			};
			if (transactionStyle === TransactionStyle.Individual) {
				action();
			} else {
				Tree.runTransaction(view, action);
			}
			expectChildrenValues(view, childData, BENCHMARK_NODE_COUNT);
		}

		for (const { description, style, extraDescription } of styles) {
			describe(description, () => {
				for (const { percentile, word } of sizes) {
					const title = `${BENCHMARK_NODE_COUNT} ${word} changes in ${extraDescription} containing ${
						style === TransactionStyle.Individual ? "1 edit" : `${BENCHMARK_NODE_COUNT} edits`
					}`;
					benchmarkCustom({
						only: false,
						type: BenchmarkType.Measurement,
						title,
						run: async (reporter) => {
							benchmarkOps(style, percentile);
							const opStats = getOperationsStats(currentTestOps);
							for (const key of Object.keys(opStats)) {
								reporter.addMeasurement(key, opStats[key]);
							}
						},
					});
				}
			});
		}
	});

	describe("Insert, Remove & Edit Nodes", () => {
		const oneThirdNodeCount = Math.floor(BENCHMARK_NODE_COUNT * (1 / 3));
		const seventyPercentCount = Math.floor(BENCHMARK_NODE_COUNT * 0.7);
		const fifteenPercentCount = Math.floor(BENCHMARK_NODE_COUNT * 0.15);

		type OpKindDistribution = {
			readonly [OpKind in keyof typeof Operation]: number;
		};

		const distributions: OpKindDistribution[] = [
			{
				[Operation.Insert]: oneThirdNodeCount,
				[Operation.Edit]: oneThirdNodeCount,
				[Operation.Remove]: oneThirdNodeCount,
			},
			{
				[Operation.Insert]: seventyPercentCount,
				[Operation.Edit]: fifteenPercentCount,
				[Operation.Remove]: fifteenPercentCount,
			},
			{
				[Operation.Insert]: fifteenPercentCount,
				[Operation.Edit]: seventyPercentCount,
				[Operation.Remove]: fifteenPercentCount,
			},
			{
				[Operation.Insert]: fifteenPercentCount,
				[Operation.Edit]: fifteenPercentCount,
				[Operation.Remove]: seventyPercentCount,
			},
		];

		withTransactionsOrNot((run) => {
			const benchmarkInsertRemoveEditNodesWithIndividualTxs = (
				percentile: number,
				distribution: OpKindDistribution,
			) => {
				const {
					Remove: removeNodeCount,
					Insert: insertNodeCount,
					Edit: editNodeCount,
				} = distribution;

				const tree = createConnectedTree();
				initializeOpDataCollection(tree);

				// remove
				const childByteSize = getSuccessfulOpByteSize(
					Operation.Remove,
					TransactionStyle.Individual,
					percentile,
				);
				const view = initializeTestTree(
					tree,
					createInitialTree(removeNodeCount, childByteSize),
				);
				deleteCurrentOps(); // We don't want to record the ops from initializing the tree.

				const childData = createStringFromLength(
					getSuccessfulOpByteSize(Operation.Edit, TransactionStyle.Individual, percentile),
				);

				run(view, () => {
					removeNodes(view, removeNodeCount, 1);
					assertChildNodeCount(view, 0);

					// insert
					const insertChildNode = createTreeWithSize(
						getSuccessfulOpByteSize(Operation.Insert, TransactionStyle.Individual, percentile),
					);
					insertNodes(view, insertChildNode, insertNodeCount);
					assertChildNodeCount(view, insertNodeCount);

					// edit
					// The editing function iterates over each child node and performs an edit so we have to make sure we have enough children to avoid going out of bounds.
					if (insertNodeCount < editNodeCount) {
						const remainder = editNodeCount - insertNodeCount;
						saveAndResetCurrentOps();
						insertNodes(view, createTreeWithSize(childByteSize), remainder);
						deleteCurrentOps(); // We don't want to record the ops from re-initializing the tree.
					}
					editNodes(view, editNodeCount, childData);
				});
				expectChildrenValues(view, childData, editNodeCount);
			};

			for (const distribution of distributions) {
				const suiteDescription = `Distribution: ${distribution.Insert}% insert, ${distribution.Edit}% edit, ${distribution.Remove}% remove`;
				describe(suiteDescription, () => {
					for (const { percentile } of sizes) {
						it(`Percentile: ${percentile}`, () => {
							benchmarkInsertRemoveEditNodesWithIndividualTxs(percentile, distribution);
						});
					}
				});
			}
		});
	});
});
