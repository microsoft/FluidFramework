/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IsoBuffer, unreachableCase } from "@fluidframework/common-utils";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { ISummaryTree, ITree } from "@fluidframework/protocol-definitions";
import { IChannelServices } from "@fluidframework/datastore-definitions";
import {
	MockDeltaConnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { BenchmarkType, benchmark } from "@fluid-tools/benchmark";
import { convertSummaryTreeToITree } from "@fluidframework/runtime-utils";
import { FieldKinds, singleTextCursor, namedTreeSchema } from "../../feature-libraries";
import { ISharedTree, SharedTreeFactory, runSynchronous } from "../../shared-tree";
import { brand } from "../../util";
import { TestTreeProviderLite } from "../utils";
import {
	rootFieldKey,
	rootFieldKeySymbol,
	TreeValue,
	fieldSchema,
	GlobalFieldKey,
	SchemaData,
} from "../../core";
import { typeboxValidator } from "../../external-utilities";

// eslint-disable-next-line import/no-internal-modules
import { PlacePath } from "../../feature-libraries/sequence-change-family";

const globalFieldKey: GlobalFieldKey = brand("globalFieldKey");

enum TreeShape {
	Wide = "wide",
	Deep = "deep",
}

describe("Summary benchmarks", () => {
	// TODO: report these sizes as benchmark output which can be tracked over time.
	describe("size of", () => {
		it("an empty tree.", async () => {
			const provider = new TestTreeProviderLite();
			const tree = provider.trees[0];
			const { summary } = tree.getAttachSummary(true);
			const summaryString = JSON.stringify(summary);
			const summarySize = IsoBuffer.from(summaryString).byteLength;
			assert(summarySize < 500);
		});
		it("a tree with 1 node.", async () => {
			const summaryTree = getInsertsSummaryTree(1, TreeShape.Wide);
			const summaryString = JSON.stringify(summaryTree);
			const summarySize = IsoBuffer.from(summaryString).byteLength;
			assert(summarySize > 1000);
			assert(summarySize < 2000);
		});
		it("a wide tree with 10 nodes", async () => {
			const summaryTree = getInsertsSummaryTree(10, TreeShape.Wide);
			const summaryString = JSON.stringify(summaryTree);
			const summarySize = IsoBuffer.from(summaryString).byteLength;
			assert(summarySize > 1000);
			assert(summarySize < 10000);
		});
		it("a wide tree with 100 nodes", async () => {
			const summaryTree = getInsertsSummaryTree(100, TreeShape.Wide);
			const summaryString = JSON.stringify(summaryTree);
			const summarySize = IsoBuffer.from(summaryString).byteLength;
			assert(summarySize > 1000);
			assert(summarySize < 500000);
		});
		it("a deep tree with 10 nodes", async () => {
			const summaryTree = getInsertsSummaryTree(10, TreeShape.Deep);
			const summaryString = JSON.stringify(summaryTree);
			const summarySize = IsoBuffer.from(summaryString).byteLength;
			assert(summarySize > 1000);
			assert(summarySize < 25000);
		});
		it("a deep tree with 100 nodes.", async () => {
			const summaryTree = getInsertsSummaryTree(100, TreeShape.Deep);
			const summaryString = JSON.stringify(summaryTree);
			const summarySize = IsoBuffer.from(summaryString).byteLength;
			assert(summarySize > 1000);
			assert(summarySize < 1000000);
		});
		it("a deep tree with 200 nodes.", async () => {
			const summaryTree = getInsertsSummaryTree(200, TreeShape.Deep);
			const summaryString = JSON.stringify(summaryTree);
			const summarySize = IsoBuffer.from(summaryString).byteLength;
			assert(summarySize > 1000);
			assert(summarySize < 5000000);
		});
	});

	describe("load speed of", () => {
		function runSummaryBenchmark(
			numberOfNodes: number,
			shape: TreeShape,
			benchmarkType: BenchmarkType = BenchmarkType.Perspective,
		) {
			let summaryTree: ITree;
			const factory = new SharedTreeFactory({ jsonValidator: typeboxValidator });
			benchmark({
				title: `a ${shape} tree with ${numberOfNodes} node${
					numberOfNodes !== 1 ? "s" : ""
				}`,
				type: benchmarkType,
				before: async () => {
					summaryTree = convertSummaryTreeToITree(
						getInsertsSummaryTree(numberOfNodes, shape),
					);
				},
				benchmarkFnAsync: async () => {
					const services: IChannelServices = {
						deltaConnection: new MockDeltaConnection(
							() => 0,
							() => {},
						),
						objectStorage: new MockStorage(summaryTree),
					};
					const datastoreRuntime = new MockFluidDataStoreRuntime();
					await factory.load(datastoreRuntime, "test", services, factory.attributes);
				},
			});
		}

		runSummaryBenchmark(1, TreeShape.Deep);
		runSummaryBenchmark(10, TreeShape.Wide);
		runSummaryBenchmark(10, TreeShape.Deep);
		runSummaryBenchmark(100, TreeShape.Wide, BenchmarkType.Measurement);
		runSummaryBenchmark(100, TreeShape.Deep, BenchmarkType.Measurement);
	});
});

/**
 * Inserts a single node under the root of the tree with the given value.
 */
function setTestValue(tree: ISharedTree, value: TreeValue, index: number): void {
	// Apply an edit to the tree which inserts a node with a value
	runSynchronous(tree, () => {
		const writeCursor = singleTextCursor({ type: brand("TestValue"), value });
		const field = tree.editor.sequenceField({ parent: undefined, field: rootFieldKeySymbol });
		field.insert(index, writeCursor);
	});
}

function setTestValueOnPath(tree: ISharedTree, value: TreeValue, path: PlacePath): void {
	// Apply an edit to the tree which inserts a node with a value.
	runSynchronous(tree, () => {
		const writeCursor = singleTextCursor({ type: brand("TestValue"), value });
		const field = tree.editor.sequenceField({ parent: path, field: rootFieldKeySymbol });
		field.insert(0, writeCursor);
	});
}

function setTestValuesWide(tree: ISharedTree, numberOfNodes: number): void {
	const seed = 0;
	const random = makeRandom(seed);
	for (let j = 0; j < numberOfNodes; j++) {
		setTestValue(tree, random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), j);
	}
}

/**
 *
 * @param numberOfNodes - number of nodes you would like to insert
 * @param shape - TreeShape enum to specify the shape of the tree
 * @returns the byte size of the tree's summary
 */
export function getInsertsSummaryTree(numberOfNodes: number, shape: TreeShape): ISummaryTree {
	const provider = new TestTreeProviderLite();
	const tree = provider.trees[0];
	initializeTestTreeWithValue(tree, 1);

	switch (shape) {
		case TreeShape.Deep:
			setTestValuesNarrow(tree, numberOfNodes);
			break;
		case TreeShape.Wide:
			setTestValuesWide(tree, numberOfNodes);
			break;
		default:
			unreachableCase(shape);
	}

	provider.processMessages();
	const { summary } = tree.getAttachSummary(true);
	return summary;
}

function setTestValuesNarrow(tree: ISharedTree, numberOfNodes: number): void {
	const seed = 0;
	const random = makeRandom(seed);
	let path: PlacePath = {
		parent: undefined,
		parentField: rootFieldKeySymbol,
		parentIndex: 0,
	};
	// loop through and update path for the next insert.
	for (let i = 0; i <= numberOfNodes; i++) {
		setTestValueOnPath(
			tree,
			random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
			path,
		);
		path = {
			parent: path,
			parentField: rootFieldKeySymbol,
			parentIndex: 0,
		};
	}
}

const rootFieldSchema = fieldSchema(FieldKinds.value);
const globalFieldSchema = fieldSchema(FieldKinds.value);
const rootNodeSchema = namedTreeSchema({
	name: brand("TestValue"),
	extraLocalFields: fieldSchema(FieldKinds.sequence),
	globalFields: [globalFieldKey],
});
const testSchema: SchemaData = {
	treeSchema: new Map([[rootNodeSchema.name, rootNodeSchema]]),
	globalFieldSchema: new Map([
		[rootFieldKey, rootFieldSchema],
		[globalFieldKey, globalFieldSchema],
	]),
};

/**
 * Inserts a single node under the root of the tree with the given value.
 */
function initializeTestTreeWithValue(tree: ISharedTree, value: TreeValue): void {
	tree.storedSchema.update(testSchema);

	// Apply an edit to the tree which inserts a node with a value
	runSynchronous(tree, () => {
		const writeCursor = singleTextCursor({ type: brand("TestValue"), value });
		const field = tree.editor.sequenceField({ parent: undefined, field: rootFieldKeySymbol });
		field.insert(0, writeCursor);
	});
}
