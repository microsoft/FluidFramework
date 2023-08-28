/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert, fail } from "assert";
import Table from "easy-table";
import { isInPerformanceTestingMode } from "@fluid-tools/benchmark";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SchemaBuilder, singleTextCursor } from "../../feature-libraries";
import { ISharedTree, ISharedTreeView, SharedTreeFactory } from "../../shared-tree";
import { JsonCompatibleReadOnly, brand, getOrAddEmptyToMap } from "../../util";
import {
	AllowedUpdateType,
	FieldKey,
	forEachNode,
	JsonableTree,
	moveToDetachedField,
	rootFieldKey,
	Value,
	ValueSchema,
} from "../../core";
import { typeboxValidator } from "../../external-utilities";

// Notes:
// 1. Within this file "percentile" is commonly used, and seems to refer to a portion (0 to 1) or some maximum size.
// While it would be useful and interesting to have some distribution of op sizes and measure some percentile from that distribution,
// that does not appear to be what these tests are doing.
// 2. Data from these tests are just printed: no other data collection is done. If a comparison is desire, manually run the tests before and after.
// 3. Major changes in these sizes (regressions, optimizations or the tests not collecting what they should) do not make these tests fail.
// 4. These tests are currently implemented as integration tests, meaning they use lots of dependencies and high level APIs.
// They could be reimplemented targeted the lower level APIs if desired.
// 5. "large" node just get a long repeated string value, not a complex tree, so tree encoding is not really covered here.

const builder = new SchemaBuilder("opSize");

const stringSchema = builder.leaf("String", ValueSchema.String);
const childSchema = builder.struct("Test:Opsize-Bench-Child", {
	data: SchemaBuilder.fieldValue(stringSchema),
});
const parentSchema = builder.struct("Test:Opsize-Bench-Root", {
	children: SchemaBuilder.fieldSequence(childSchema),
});

const rootSchema = SchemaBuilder.fieldValue(parentSchema);

const fullSchemaData = builder.intoDocumentSchema(rootSchema);

const initialTestJsonTree = {
	type: parentSchema.name,
};

const childrenFieldKey: FieldKey = brand("children");

/*
 * Updates the given `tree` to the given `schema` and inserts `state` as its root.
 */
function initializeTestTree(tree: ISharedTree, state: JsonableTree = initialTestJsonTree) {
	const writeCursor = singleTextCursor(state);
	tree.schematize({
		allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
		initialTree: [writeCursor],
		schema: fullSchemaData,
	});
}

function utf8Length(data: JsonCompatibleReadOnly): number {
	return new TextEncoder().encode(JSON.stringify(data)).length;
}

/**
 * Creates a {@link JsonableTree} that matches the `parentSchema` and when run through `JSON.stringify` has the requested length in bytes when encoded as utf8.
 */
function createTreeWithSize(desiredByteSize: number): JsonableTree {
	const node = {
		type: childSchema.name,
		fields: {
			data: [{ value: "", type: stringSchema.name }],
		},
	};

	const initialNodeByteSize = utf8Length(node);
	node.fields.data[0].value = createStringFromLength(desiredByteSize - initialNodeByteSize);
	assert(utf8Length(node) === desiredByteSize);
	return node;
}

function getChildrenLength(tree: ISharedTree): number {
	const cursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, cursor);
	cursor.enterNode(0);
	cursor.enterField(childrenFieldKey);
	const length = cursor.getFieldLength();
	cursor.free();
	return length;
}

function assertChildNodeCount(tree: ISharedTree, nodeCount: number): void {
	const cursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, cursor);
	cursor.enterNode(0);
	cursor.enterField(childrenFieldKey);
	assert.equal(cursor.getFieldLength(), nodeCount);
	cursor.free();
}

/**
 * Checks that the first `childCount` values under "children" have the provided value.
 */
function expectChildrenValues(tree: ISharedTree, expected: Value, childCount: number): void {
	const cursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, cursor);
	cursor.enterNode(0);
	cursor.enterField(childrenFieldKey);
	assert(cursor.getFieldLength() >= childCount);
	forEachNode(cursor, () => {
		if (cursor.fieldIndex < childCount) {
			assert.equal(cursor.value, expected);
		}
	});
	cursor.free();
}

/**
 * Creates a jsonable tree with the desired number of children and the size of each child in bytes.
 */
function createInitialTree(childNodes: number, childNodeByteSize: number): JsonableTree {
	const childNode = createTreeWithSize(childNodeByteSize);
	const jsonTree: JsonableTree = {
		type: parentSchema.name,
		fields: {
			children: new Array(childNodes).fill(childNode),
		},
	};
	return jsonTree;
}

function insertNodesWithIndividualTransactions(
	tree: ISharedTreeView,
	jsonNode: JsonableTree,
	count: number,
): void {
	for (let i = 0; i < count; i++) {
		tree.transaction.start();
		const path = {
			parent: undefined,
			parentField: rootFieldKey,
			parentIndex: 0,
		};
		const writeCursor = singleTextCursor(jsonNode);
		const field = tree.editor.sequenceField({ parent: path, field: childrenFieldKey });
		field.insert(0, writeCursor);
		tree.transaction.commit();
	}
}

function insertNodesWithSingleTransaction(
	tree: ISharedTreeView,
	jsonNode: JsonableTree,
	count: number,
): void {
	tree.transaction.start();
	const path = {
		parent: undefined,
		parentField: rootFieldKey,
		parentIndex: 0,
	};
	const field = tree.editor.sequenceField({ parent: path, field: childrenFieldKey });
	for (let i = 0; i < count; i++) {
		field.insert(0, singleTextCursor(jsonNode));
	}
	tree.transaction.commit();
}

function deleteNodesWithIndividualTransactions(
	tree: ISharedTree,
	numDeletes: number,
	deletesPerTransaction: number,
): void {
	for (let i = 0; i < numDeletes; i++) {
		tree.transaction.start();
		const path = {
			parent: undefined,
			parentField: rootFieldKey,
			parentIndex: 0,
		};
		const field = tree.editor.sequenceField({ parent: path, field: childrenFieldKey });
		field.delete(getChildrenLength(tree) - 1, deletesPerTransaction);
		tree.transaction.commit();
	}
}

function deleteNodesWithSingleTransaction(tree: ISharedTree, numDeletes: number): void {
	tree.transaction.start();
	const path = {
		parent: undefined,
		parentField: rootFieldKey,
		parentIndex: 0,
	};
	const field = tree.editor.sequenceField({ parent: path, field: childrenFieldKey });
	field.delete(0, numDeletes);
	tree.transaction.commit();
}

function createStringFromLength(numberOfBytes: number): string {
	return "a".repeat(numberOfBytes);
}

function editNodesWithIndividualTransactions(
	tree: ISharedTree,
	numChildrenToEdit: number,
	editPayload: Value,
): void {
	const rootPath = {
		parent: undefined,
		parentField: rootFieldKey,
		parentIndex: 0,
	};
	const editor = tree.editor.sequenceField({ parent: rootPath, field: childrenFieldKey });
	for (let i = 0; i < numChildrenToEdit; i++) {
		tree.transaction.start();
		editor.delete(i, 1);
		editor.insert(
			i,
			singleTextCursor({
				type: childSchema.name,
				value: editPayload,
				fields: {
					data: [{ value: "", type: stringSchema.name }],
				},
			}),
		);
		tree.transaction.commit();
	}
}

function editNodesWithSingleTransaction(
	tree: ISharedTree,
	numChildrenToEdit: number,
	editPayload: Value,
): void {
	const rootPath = {
		parent: undefined,
		parentField: rootFieldKey,
		parentIndex: 0,
	};
	const editor = tree.editor.sequenceField({ parent: rootPath, field: childrenFieldKey });
	tree.transaction.start();
	for (let i = 0; i < numChildrenToEdit; i++) {
		editor.delete(i, 1);
		editor.insert(
			i,
			singleTextCursor({
				type: childSchema.name,
				value: editPayload,
				fields: {
					data: [{ value: "", type: stringSchema.name }],
				},
			}),
		);
	}
	tree.transaction.commit();
}

enum Operation {
	Insert = "Insert",
	Delete = "Delete",
	Edit = "Edit",
}

enum TransactionStyle {
	Individual,
	Single,
}

/**
 * The following byte sizes in utf-8 encoded bytes of JsonableTree were found to be the maximum size that could be successfully
 * inserted/deleted/edited using the following node counts and either individual of singular (bulk) transactions.
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
	Delete: {
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

const factory = new SharedTreeFactory({ jsonValidator: typeboxValidator });

describe("Op Size", () => {
	const opsByBenchmarkName: Map<string, ISequencedDocumentMessage[]> = new Map();
	let currentBenchmarkName = "";
	const currentTestOps: ISequencedDocumentMessage[] = [];

	function registerOpListener(tree: ISharedTree, resultArray: ISequencedDocumentMessage[]): void {
		// TODO: better way to hook this up. Needs to detect local ops exactly once.
		const oldSubmitLocalMessage = (tree as any).submitLocalMessage.bind(tree);
		function submitLocalMessage(content: any, localOpMetadata: unknown = undefined): void {
			resultArray.push(content);
			oldSubmitLocalMessage(content, localOpMetadata);
		}
		(tree as any).submitLocalMessage = submitLocalMessage;
	}

	const getOperationsStats = (operations: ISequencedDocumentMessage[]) => {
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

	afterEach(() => {
		// Currently tests can pass when no data is collected, so throw here in that case to ensure tests don't break and start collecting no data.
		assert(currentTestOps.length !== 0);
		currentTestOps.forEach((op) =>
			getOrAddEmptyToMap(opsByBenchmarkName, currentBenchmarkName).push(op),
		);
		currentTestOps.length = 0;
	});

	after(() => {
		const allBenchmarkOpStats: any[] = [];
		for (const [benchmarkName, ops] of opsByBenchmarkName) {
			allBenchmarkOpStats.push({
				"Test name": benchmarkName,
				...getOperationsStats(ops),
			});
		}
		const table = new Table();
		allBenchmarkOpStats.forEach((data) => {
			Object.keys(data).forEach((key) => table.cell(key, data[key]));
			table.newRow();
		});
		table.sort(["Avg. Op Size (Bytes)|des"]);

		console.log("-- Op Size Benchmark Statistics -- ");
		console.log(table.toString());
	});

	describe("Insert Nodes", () => {
		function benchmarkOps(transactionStyle: TransactionStyle, percentile: number): void {
			const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
			initializeOpDataCollection(tree);
			initializeTestTree(tree);
			deleteCurrentOps(); // We don't want to record any ops from initializing the tree.
			const jsonNode = createTreeWithSize(
				getSuccessfulOpByteSize(Operation.Insert, transactionStyle, percentile),
			);
			const apply =
				transactionStyle === TransactionStyle.Individual
					? insertNodesWithIndividualTransactions
					: insertNodesWithSingleTransaction;
			apply(tree, jsonNode, BENCHMARK_NODE_COUNT);
			assertChildNodeCount(tree, BENCHMARK_NODE_COUNT);
		}

		for (const { description, style, extraDescription } of styles) {
			describe(description, () => {
				for (const { percentile, word } of sizes) {
					it(`${BENCHMARK_NODE_COUNT} ${word} nodes in ${extraDescription}`, () => {
						benchmarkOps(style, percentile);
					});
				}
			});
		}
	});

	describe("Delete Nodes", () => {
		function benchmarkOps(transactionStyle: TransactionStyle, percentile: number): void {
			const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
			initializeOpDataCollection(tree);
			const childByteSize = getSuccessfulOpByteSize(
				Operation.Delete,
				transactionStyle,
				percentile,
			);
			initializeTestTree(tree, createInitialTree(100, childByteSize));
			deleteCurrentOps(); // We don't want to record any ops from initializing the tree.
			if (transactionStyle === TransactionStyle.Individual) {
				deleteNodesWithIndividualTransactions(tree, 100, 1);
			} else {
				deleteNodesWithSingleTransaction(tree, 100);
			}
			assertChildNodeCount(tree, 0);
		}

		for (const { description, style, extraDescription } of styles) {
			describe(description, () => {
				for (const { percentile, word } of sizes) {
					it(`${BENCHMARK_NODE_COUNT} ${word} nodes in ${
						style === TransactionStyle.Individual
							? extraDescription
							: `1 transactions containing 1 delete of ${BENCHMARK_NODE_COUNT} nodes`
					}`, () => {
						benchmarkOps(style, percentile);
					});
				}
			});
		}
	});

	describe("Edit Nodes", () => {
		function benchmarkOps(transactionStyle: TransactionStyle, percentile: number): void {
			const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
			initializeOpDataCollection(tree);
			// Note that the child node byte size for the initial tree here should be arbitrary.
			initializeTestTree(tree, createInitialTree(BENCHMARK_NODE_COUNT, 1000));
			deleteCurrentOps(); // We don't want to record any ops from initializing the tree.
			const editPayload = createStringFromLength(
				getSuccessfulOpByteSize(Operation.Edit, transactionStyle, percentile),
			);
			if (transactionStyle === TransactionStyle.Individual) {
				editNodesWithIndividualTransactions(tree, BENCHMARK_NODE_COUNT, editPayload);
			} else {
				editNodesWithSingleTransaction(tree, BENCHMARK_NODE_COUNT, editPayload);
			}
			expectChildrenValues(tree, editPayload, BENCHMARK_NODE_COUNT);
		}

		for (const { description, style, extraDescription } of styles) {
			describe(description, () => {
				for (const { percentile, word } of sizes) {
					it(`${BENCHMARK_NODE_COUNT} ${word} changes in ${extraDescription} containing ${
						style === TransactionStyle.Individual
							? "1 edit"
							: `${BENCHMARK_NODE_COUNT} edits`
					}`, () => {
						benchmarkOps(style, percentile);
					});
				}
			});
		}
	});

	describe("Insert, Delete & Edit Nodes", () => {
		describe("Individual Transactions", () => {
			const benchmarkInsertDeleteEditNodesWithInvidiualTxs = (
				percentile: number,
				insertNodeCount: number,
				deleteNodeCount: number,
				editNodeCount: number,
			) => {
				const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
				initializeOpDataCollection(tree);

				// delete
				const childByteSize = getSuccessfulOpByteSize(
					Operation.Delete,
					TransactionStyle.Individual,
					percentile,
				);
				initializeTestTree(tree, createInitialTree(deleteNodeCount, childByteSize));
				deleteCurrentOps(); // We don't want to record the ops from initializing the tree.
				deleteNodesWithIndividualTransactions(tree, deleteNodeCount, 1);
				assertChildNodeCount(tree, 0);

				// insert
				const insertChildNode = createTreeWithSize(
					getSuccessfulOpByteSize(
						Operation.Insert,
						TransactionStyle.Individual,
						percentile,
					),
				);
				insertNodesWithIndividualTransactions(tree, insertChildNode, insertNodeCount);
				assertChildNodeCount(tree, insertNodeCount);

				// edit
				// The editing function iterates over each child node and performs an edit so we have to make sure we have enough children to avoid going out of bounds.
				if (insertNodeCount < editNodeCount) {
					const remainder = editNodeCount - insertNodeCount;
					saveAndResetCurrentOps();
					insertNodesWithIndividualTransactions(
						tree,
						createTreeWithSize(childByteSize),
						remainder,
					);
					deleteCurrentOps(); // We don't want to record the ops from re-initializing the tree.
				}
				const editPayload = createStringFromLength(
					getSuccessfulOpByteSize(
						Operation.Edit,
						TransactionStyle.Individual,
						percentile,
					),
				);
				editNodesWithIndividualTransactions(tree, editNodeCount, editPayload);
				expectChildrenValues(tree, editPayload, editNodeCount);
			};

			describe("an equal distribution of operation type", () => {
				const oneThirdNodeCount = Math.floor(BENCHMARK_NODE_COUNT * (1 / 3));

				it(`insert ${oneThirdNodeCount} small nodes, delete ${oneThirdNodeCount} small nodes, edit ${oneThirdNodeCount} nodes with small payloads`, () => {
					benchmarkInsertDeleteEditNodesWithInvidiualTxs(
						0.01,
						oneThirdNodeCount,
						oneThirdNodeCount,
						oneThirdNodeCount,
					);
				});

				it(`insert ${oneThirdNodeCount} medium nodes, delete ${oneThirdNodeCount} medium nodes, edit ${oneThirdNodeCount} nodes with medium payloads`, () => {
					benchmarkInsertDeleteEditNodesWithInvidiualTxs(
						0.5,
						oneThirdNodeCount,
						oneThirdNodeCount,
						oneThirdNodeCount,
					);
				});

				it(`insert ${oneThirdNodeCount} large nodes, delete ${oneThirdNodeCount} large medium, edit ${oneThirdNodeCount} nodes with large payloads`, () => {
					benchmarkInsertDeleteEditNodesWithInvidiualTxs(
						1,
						oneThirdNodeCount,
						oneThirdNodeCount,
						oneThirdNodeCount,
					);
				});
			});

			describe("70% distribution of operations towards insert", () => {
				const seventyPercentCount = BENCHMARK_NODE_COUNT * 0.7;
				const fifteenPercentCount = BENCHMARK_NODE_COUNT * 0.15;

				it(`Insert ${seventyPercentCount} small nodes, delete ${fifteenPercentCount} small nodes, edit ${fifteenPercentCount} nodes with small payloads`, () => {
					benchmarkInsertDeleteEditNodesWithInvidiualTxs(
						0.01,
						seventyPercentCount,
						fifteenPercentCount,
						fifteenPercentCount,
					);
				});

				it(`Insert ${seventyPercentCount} medium nodes, delete ${fifteenPercentCount} medium nodes, edit ${fifteenPercentCount} nodes with medium payloads`, () => {
					benchmarkInsertDeleteEditNodesWithInvidiualTxs(
						0.5,
						seventyPercentCount,
						fifteenPercentCount,
						fifteenPercentCount,
					);
				});

				it(`Insert ${seventyPercentCount} large nodes, delete ${fifteenPercentCount} large nodes, edit ${fifteenPercentCount} nodes with large payloads`, () => {
					benchmarkInsertDeleteEditNodesWithInvidiualTxs(
						1,
						seventyPercentCount,
						fifteenPercentCount,
						fifteenPercentCount,
					);
				});
			});

			describe("70% distribution of operations towards delete", () => {
				const seventyPercentCount = BENCHMARK_NODE_COUNT * 0.7;
				const fifteenPercentCount = BENCHMARK_NODE_COUNT * 0.15;

				it(`Insert ${fifteenPercentCount} small nodes, delete ${seventyPercentCount} small nodes, edit ${fifteenPercentCount} nodes with small payloads`, () => {
					benchmarkInsertDeleteEditNodesWithInvidiualTxs(
						0.01,
						fifteenPercentCount,
						seventyPercentCount,
						fifteenPercentCount,
					);
				});

				it(`Insert ${fifteenPercentCount} medium nodes, delete ${seventyPercentCount} medium nodes, edit ${fifteenPercentCount} nodes with medium payloads`, () => {
					benchmarkInsertDeleteEditNodesWithInvidiualTxs(
						0.5,
						fifteenPercentCount,
						seventyPercentCount,
						fifteenPercentCount,
					);
				});

				it(`Insert ${fifteenPercentCount} large nodes, delete ${seventyPercentCount} large nodes, edit ${fifteenPercentCount} nodes with large payloads`, () => {
					benchmarkInsertDeleteEditNodesWithInvidiualTxs(
						1,
						fifteenPercentCount,
						seventyPercentCount,
						fifteenPercentCount,
					);
				});
			});

			describe("70% distribution of operations towards edit", () => {
				const seventyPercentCount = BENCHMARK_NODE_COUNT * 0.7;
				const fifteenPercentCount = BENCHMARK_NODE_COUNT * 0.15;

				it(`Insert ${fifteenPercentCount} small nodes, delete ${fifteenPercentCount} small nodes, edit ${seventyPercentCount} nodes with small payloads`, () => {
					benchmarkInsertDeleteEditNodesWithInvidiualTxs(
						0.01,
						fifteenPercentCount,
						fifteenPercentCount,
						seventyPercentCount,
					);
				});

				it(`Insert ${fifteenPercentCount} medium nodes, delete ${fifteenPercentCount} medium nodes, edit ${seventyPercentCount} nodes with medium payloads`, () => {
					benchmarkInsertDeleteEditNodesWithInvidiualTxs(
						0.5,
						fifteenPercentCount,
						fifteenPercentCount,
						seventyPercentCount,
					);
				});

				it(`Insert ${fifteenPercentCount} large nodes, delete ${seventyPercentCount} large nodes, edit ${seventyPercentCount} nodes with large payloads`, () => {
					benchmarkInsertDeleteEditNodesWithInvidiualTxs(
						1,
						fifteenPercentCount,
						fifteenPercentCount,
						seventyPercentCount,
					);
				});
			});
		});

		// TODO:
		// These tests don't actually do a single transaction (they do one per edit type).
		// Therefor they are failing to test the size of transactions mixing inserts, deletes and edits.
		// These tests also fail to clarify if the nodes being deleted are ones which were inserted or edited earlier,
		// so it can't be used to test compaction of transient data within a transaction even if it was a single transaction.
		// Instead correctness tests should cover that, and maybe this suite should simply be removed?
		describe("Single Transactions", () => {
			const benchmarkInsertDeleteEditNodesWithSingleTxs = (
				percentile: number,
				insertNodeCount: number,
				deleteNodeCount: number,
				editNodeCount: number,
			) => {
				const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
				initializeOpDataCollection(tree);

				// delete
				const childByteSize = getSuccessfulOpByteSize(
					Operation.Delete,
					TransactionStyle.Single,
					percentile,
				);
				initializeTestTree(tree, createInitialTree(deleteNodeCount, childByteSize));
				deleteCurrentOps(); // We don't want to record the ops from initializing the tree.
				deleteNodesWithSingleTransaction(tree, deleteNodeCount);
				assertChildNodeCount(tree, 0);

				// insert
				const insertChildNode = createTreeWithSize(
					getSuccessfulOpByteSize(Operation.Insert, TransactionStyle.Single, percentile),
				);
				insertNodesWithSingleTransaction(tree, insertChildNode, insertNodeCount);
				assertChildNodeCount(tree, insertNodeCount);

				// edit
				// The editing function iterates over each child node and performs an edit so we have to make sure we have enough children to avoid going out of bounds.
				// TODO: if actually making this do a single transaction like its supposed to, this would be an issue as it would get included in that transaction.
				if (insertNodeCount < editNodeCount) {
					const remainder = editNodeCount - insertNodeCount;
					saveAndResetCurrentOps();
					insertNodesWithIndividualTransactions(
						tree,
						createTreeWithSize(childByteSize),
						remainder,
					);
					deleteCurrentOps(); // We don't want to record the ops from re-initializing the tree.
				}
				const editPayload = createStringFromLength(
					getSuccessfulOpByteSize(Operation.Edit, TransactionStyle.Single, percentile),
				);
				editNodesWithSingleTransaction(tree, editNodeCount, editPayload);
				expectChildrenValues(tree, editPayload, editNodeCount);
			};

			describe("equal distribution of operation type", () => {
				const oneThirdNodeCount = Math.floor(BENCHMARK_NODE_COUNT * (1 / 3));

				it(`insert ${oneThirdNodeCount} small nodes, delete ${oneThirdNodeCount} small nodes, edit ${oneThirdNodeCount} nodes with small payloads`, () => {
					benchmarkInsertDeleteEditNodesWithSingleTxs(
						0.01,
						oneThirdNodeCount,
						oneThirdNodeCount,
						oneThirdNodeCount,
					);
				});

				it(`insert ${oneThirdNodeCount} medium nodes, delete ${oneThirdNodeCount} medium nodes, edit ${oneThirdNodeCount} nodes with medium payloads`, () => {
					benchmarkInsertDeleteEditNodesWithSingleTxs(
						0.5,
						oneThirdNodeCount,
						oneThirdNodeCount,
						oneThirdNodeCount,
					);
				});

				it(`insert ${oneThirdNodeCount} large nodes, delete ${oneThirdNodeCount} large medium, edit ${oneThirdNodeCount} nodes with large payloads`, () => {
					benchmarkInsertDeleteEditNodesWithSingleTxs(
						1,
						oneThirdNodeCount,
						oneThirdNodeCount,
						oneThirdNodeCount,
					);
				});
			});

			describe("70% distribution of operations towards insert", () => {
				const seventyPercentCount = BENCHMARK_NODE_COUNT * 0.7;
				const fifteenPercentCount = BENCHMARK_NODE_COUNT * 0.15;

				it(`Insert ${seventyPercentCount} small nodes, delete ${fifteenPercentCount} small nodes, edit ${fifteenPercentCount} nodes with small payloads`, () => {
					benchmarkInsertDeleteEditNodesWithSingleTxs(
						0.01,
						seventyPercentCount,
						fifteenPercentCount,
						fifteenPercentCount,
					);
				});

				it(`Insert ${seventyPercentCount} medium nodes, delete ${fifteenPercentCount} medium nodes, edit ${fifteenPercentCount} nodes with medium payloads`, () => {
					benchmarkInsertDeleteEditNodesWithSingleTxs(
						0.5,
						seventyPercentCount,
						fifteenPercentCount,
						fifteenPercentCount,
					);
				});

				it(`Insert ${seventyPercentCount} large nodes, delete ${fifteenPercentCount} large nodes, edit ${fifteenPercentCount} nodes with large payloads`, () => {
					benchmarkInsertDeleteEditNodesWithSingleTxs(
						1,
						seventyPercentCount,
						fifteenPercentCount,
						fifteenPercentCount,
					);
				});
			});

			describe("70% distribution of operations towards delete", () => {
				const seventyPercentCount = BENCHMARK_NODE_COUNT * 0.7;
				const fifteenPercentCount = BENCHMARK_NODE_COUNT * 0.15;

				it(`Insert ${fifteenPercentCount} small nodes, delete ${seventyPercentCount} small nodes, edit ${fifteenPercentCount} nodes with small payloads`, () => {
					benchmarkInsertDeleteEditNodesWithSingleTxs(
						0.01,
						fifteenPercentCount,
						seventyPercentCount,
						fifteenPercentCount,
					);
				});

				it(`Insert ${fifteenPercentCount} medium nodes, delete ${seventyPercentCount} medium nodes, edit ${fifteenPercentCount} nodes with medium payloads`, () => {
					benchmarkInsertDeleteEditNodesWithSingleTxs(
						0.5,
						fifteenPercentCount,
						seventyPercentCount,
						fifteenPercentCount,
					);
				});

				it(`Insert ${fifteenPercentCount} large nodes, delete ${seventyPercentCount} large nodes, edit ${fifteenPercentCount} nodes with large payloads`, () => {
					benchmarkInsertDeleteEditNodesWithSingleTxs(
						1,
						fifteenPercentCount,
						seventyPercentCount,
						fifteenPercentCount,
					);
				});
			});

			describe("70% distribution of operations towards edit", () => {
				const seventyPercentCount = BENCHMARK_NODE_COUNT * 0.7;
				const fifteenPercentCount = BENCHMARK_NODE_COUNT * 0.15;

				it(`Insert ${fifteenPercentCount} small nodes, delete ${fifteenPercentCount} small nodes, edit ${seventyPercentCount} nodes with small payloads`, () => {
					benchmarkInsertDeleteEditNodesWithSingleTxs(
						0.01,
						fifteenPercentCount,
						fifteenPercentCount,
						seventyPercentCount,
					);
				});

				it(`Insert ${fifteenPercentCount} medium nodes, delete ${fifteenPercentCount} medium nodes, edit ${seventyPercentCount} nodes with medium payloads`, () => {
					benchmarkInsertDeleteEditNodesWithSingleTxs(
						0.5,
						fifteenPercentCount,
						fifteenPercentCount,
						seventyPercentCount,
					);
				});

				it(`Insert ${fifteenPercentCount} large nodes, delete ${seventyPercentCount} large nodes, edit ${seventyPercentCount} nodes with large payloads`, () => {
					benchmarkInsertDeleteEditNodesWithSingleTxs(
						1,
						fifteenPercentCount,
						fifteenPercentCount,
						seventyPercentCount,
					);
				});
			});
		});
	});
});
