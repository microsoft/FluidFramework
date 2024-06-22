/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { BenchmarkType, benchmark, isInPerformanceTestingMode } from "@fluid-tools/benchmark";
import {
	type DeepTreeNode,
	generateDeepSimpleTree,
	generateWideSimpleTree,
	readDeepSimpleTree,
	readWideSimpleTree,
	writeDeepTree,
	writeWideSimpleTreeNewValue,
	type WideTreeNode,
} from "./benchmarkUtilities.js";
import { SchemaFactory } from "../../simple-tree/index.js";

// number of nodes in test for wide trees
const nodesCountWide = [
	[10, BenchmarkType.Measurement],
	[100, BenchmarkType.Perspective],
	[500, BenchmarkType.Measurement],
];
// number of nodes in test for deep trees
const nodesCountDeep = [
	[1, BenchmarkType.Measurement],
	[10, BenchmarkType.Perspective],
	[100, BenchmarkType.Measurement],
];

describe("SimpleTree benchmarks", () => {
	describe("Read SimpleTree", () => {
		const leafValue = 1;
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			let tree: DeepTreeNode;
			let actualDepth = 0;
			let actualValue = 0;

			benchmark({
				type: benchmarkType,
				title: `Deep Tree as SimpleTree: reads with ${numberOfNodes} nodes`,
				before: () => {
					// Setup
					tree = generateDeepSimpleTree(numberOfNodes, leafValue);
				},
				benchmarkFn: () => {
					const { depth, value } = readDeepSimpleTree(tree);
					actualDepth = depth;
					actualValue = value;
				},
				after() {
					//  Assert read values
					assert.equal(actualDepth, numberOfNodes);
					assert.equal(actualValue, leafValue);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: WideTreeNode;
			const expected = numberOfNodes * leafValue;
			let actualNodesCount = 0;
			let actualSum = 0;
			benchmark({
				type: benchmarkType,
				title: `Wide Tree as SimpleTree: reads with ${numberOfNodes} nodes`,
				before: () => {
					// Setup
					tree = generateWideSimpleTree(numberOfNodes, leafValue);
				},
				benchmarkFn: () => {
					const { nodesCount, sum } = readWideSimpleTree(tree);
					actualNodesCount = nodesCount;
					actualSum = sum;
				},
				after() {
					assert.equal(actualNodesCount, numberOfNodes);
					assert.equal(actualSum, expected);
				},
			});
		}

		describe("Access to leaves", () => {
			describe("Optional object property", () => {
				const factory = new SchemaFactory("test");
				class MyInnerSchema extends factory.object("inner", {
					value: factory.optional(factory.number),
				}) {}
				class MySchema extends factory.object("root", {
					value: factory.optional(factory.number),
					leafUnion: factory.optional([factory.number, factory.string]),
					complexUnion: factory.optional([factory.number, MyInnerSchema]),
				}) {}
				let tree: MySchema;
				let readNumber: number | undefined;

				benchmark({
					type: BenchmarkType.Measurement,
					title: `Read value from leaf`,
					before: () => {
						tree = new MySchema({ value: 1 });
					},
					benchmarkFn: () => {
						readNumber = tree.value;
					},
					after: () => {
						assert.equal(readNumber, 1);
					},
				});

				benchmark({
					type: BenchmarkType.Measurement,
					title: `Read value from union of two leaves`,
					before: () => {
						tree = new MySchema({ leafUnion: 1 });
					},
					benchmarkFn: () => {
						readNumber = tree.leafUnion as number;
					},
					after: () => {
						assert.equal(readNumber, 1);
					},
				});

				benchmark({
					type: BenchmarkType.Measurement,
					title: `Read value from union of leaf and non-leaf`,
					before: () => {
						tree = new MySchema({ complexUnion: 1 });
					},
					benchmarkFn: () => {
						readNumber = tree.complexUnion as number;
					},
					after: () => {
						assert.equal(readNumber, 1);
					},
				});

				benchmark({
					type: BenchmarkType.Measurement,
					title: `Read undefined from leaf`,
					before: () => {
						tree = new MySchema({});
					},
					benchmarkFn: () => {
						readNumber = tree.value;
					},
					after: () => {
						assert.equal(readNumber, undefined);
					},
				});

				benchmark({
					type: BenchmarkType.Measurement,
					title: `Read undefined from union of two leaves`,
					before: () => {
						tree = new MySchema({});
					},
					benchmarkFn: () => {
						readNumber = tree.leafUnion as number;
					},
					after: () => {
						assert.equal(readNumber, undefined);
					},
				});

				benchmark({
					type: BenchmarkType.Measurement,
					title: `Read undefined from union of leaf and non-leaf`,
					before: () => {
						tree = new MySchema({});
					},
					benchmarkFn: () => {
						readNumber = tree.complexUnion as number;
					},
					after: () => {
						assert.equal(readNumber, undefined);
					},
				});
			});

			describe("Required object property", () => {
				const factory = new SchemaFactory("test");
				class MyInnerSchema extends factory.object("inner", {
					value: factory.number,
				}) {}
				class MySchema extends factory.object("root", {
					value: factory.number,
					leafUnion: [factory.number, factory.string],
					complexUnion: [factory.number, MyInnerSchema],
				}) {}
				let tree: MySchema;
				let readNumber: number | undefined;

				benchmark({
					type: BenchmarkType.Measurement,
					title: `Read value from leaf`,
					before: () => {
						tree = new MySchema({ value: 1, leafUnion: 1, complexUnion: 1 });
					},
					benchmarkFn: () => {
						readNumber = tree.value;
					},
					after: () => {
						assert.equal(readNumber, 1);
					},
				});

				benchmark({
					type: BenchmarkType.Measurement,
					title: `Read value from union of two leaves`,
					before: () => {
						tree = new MySchema({ value: 1, leafUnion: 1, complexUnion: 1 });
					},
					benchmarkFn: () => {
						readNumber = tree.leafUnion as number;
					},
					after: () => {
						assert.equal(readNumber, 1);
					},
				});

				benchmark({
					type: BenchmarkType.Measurement,
					title: `Read value from union of leaf and non-leaf`,
					before: () => {
						tree = new MySchema({ value: 1, leafUnion: 1, complexUnion: 1 });
					},
					benchmarkFn: () => {
						readNumber = tree.complexUnion as number;
					},
					after: () => {
						assert.equal(readNumber, 1);
					},
				});
			});

			describe("Map keys", () => {
				const factory = new SchemaFactory("test");
				class MyInnerSchema extends factory.object("inner", {
					value: factory.number,
				}) {}
				class NumberMap extends factory.map("root", [factory.number]) {}
				let treeWithMapOfNumber: NumberMap;
				class NumberStringMap extends factory.map("root", [factory.number, factory.string]) {}
				let treeWithMapOfNumberOrString: NumberStringMap;
				class NumberObjectMap extends factory.map("root", [factory.number, MyInnerSchema]) {}
				let treeWithMapOfNumberOrObject: NumberObjectMap;
				let readNumber: number | undefined;

				benchmark({
					type: BenchmarkType.Measurement,
					title: `Read value from leaf`,
					before: () => {
						treeWithMapOfNumber = new NumberMap([["a", 1]]);
					},
					benchmarkFn: () => {
						readNumber = treeWithMapOfNumber.get("a");
					},
					after: () => {
						assert.equal(readNumber, 1);
					},
				});

				benchmark({
					type: BenchmarkType.Measurement,
					title: `Read value from union of two leaves`,
					before: () => {
						treeWithMapOfNumberOrString = new NumberStringMap([["a", 1]]);
					},
					benchmarkFn: () => {
						readNumber = treeWithMapOfNumberOrString.get("a") as number;
					},
					after: () => {
						assert.equal(readNumber, 1);
					},
				});

				benchmark({
					type: BenchmarkType.Measurement,
					title: `Read value from union of leaf and non-leaf`,
					before: () => {
						treeWithMapOfNumberOrObject = new NumberObjectMap([["a", 1]]);
					},
					benchmarkFn: () => {
						readNumber = treeWithMapOfNumberOrObject.get("a") as number;
					},
					after: () => {
						assert.equal(readNumber, 1);
					},
				});

				benchmark({
					type: BenchmarkType.Measurement,
					title: `Read undefined from leaf`,
					before: () => {
						treeWithMapOfNumber = new NumberMap([["a", 1]]);
					},
					benchmarkFn: () => {
						readNumber = treeWithMapOfNumber.get("b");
					},
					after: () => {
						assert.equal(readNumber, undefined);
					},
				});

				benchmark({
					type: BenchmarkType.Measurement,
					title: `Read undefined from union of two leaves`,
					before: () => {
						treeWithMapOfNumberOrString = new NumberStringMap([["a", 1]]);
					},
					benchmarkFn: () => {
						readNumber = treeWithMapOfNumberOrString.get("b") as number;
					},
					after: () => {
						assert.equal(readNumber, undefined);
					},
				});

				benchmark({
					type: BenchmarkType.Measurement,
					title: `Read undefined from union of leaf and non-leaf`,
					before: () => {
						treeWithMapOfNumberOrObject = new NumberObjectMap([["a", 1]]);
					},
					benchmarkFn: () => {
						readNumber = treeWithMapOfNumberOrObject.get("b") as number;
					},
					after: () => {
						assert.equal(readNumber, undefined);
					},
				});
			});

			describe("Array entries", () => {
				const factory = new SchemaFactory("test");
				class MyInnerSchema extends factory.object("inner", {
					value: factory.number,
				}) {}
				class NumberArray extends factory.array("root", [factory.number]) {}
				let treeWithArrayOfNumber: NumberArray;
				class NumberStringArray extends factory.array("root", [
					factory.number,
					factory.string,
				]) {}
				let treeWithArrayOfNumberOrString: NumberStringArray;
				class NumberObjectArray extends factory.array("root", [
					factory.number,
					MyInnerSchema,
				]) {}
				let treeWithArrayOfNumberOrObject: NumberObjectArray;
				let readNumber: number | undefined;

				benchmark({
					type: BenchmarkType.Measurement,
					title: `Read value from leaf`,
					before: () => {
						treeWithArrayOfNumber = new NumberArray([1]);
					},
					benchmarkFn: () => {
						readNumber = treeWithArrayOfNumber[0];
					},
					after: () => {
						assert.equal(readNumber, 1);
					},
				});

				benchmark({
					type: BenchmarkType.Measurement,
					title: `Read value from union of two leaves`,
					before: () => {
						treeWithArrayOfNumberOrString = new NumberStringArray([1]);
					},
					benchmarkFn: () => {
						readNumber = treeWithArrayOfNumberOrString[0] as number;
					},
					after: () => {
						assert.equal(readNumber, 1);
					},
				});

				benchmark({
					type: BenchmarkType.Measurement,
					title: `Read value from union of leaf and non-leaf`,
					before: () => {
						treeWithArrayOfNumberOrObject = new NumberObjectArray([1]);
					},
					benchmarkFn: () => {
						readNumber = treeWithArrayOfNumberOrObject[0] as number;
					},
					after: () => {
						assert.equal(readNumber, 1);
					},
				});
			});
		});
	});

	describe(`Edit SimpleTree`, () => {
		const leafValue = 1;
		const changedLeafValue = -1;
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			let tree: DeepTreeNode;
			benchmark({
				type: benchmarkType,
				title: `Update value at leaf of ${numberOfNodes} deep tree`,
				before: () => {
					// Setup
					tree = generateDeepSimpleTree(numberOfNodes, leafValue);
				},
				benchmarkFn: () => {
					writeDeepTree(tree, changedLeafValue);
				},
				after: () => {
					const expected = generateDeepSimpleTree(numberOfNodes, changedLeafValue);
					assert.deepEqual(tree, expected);
				},
			});
		}

		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: WideTreeNode;
			benchmark({
				type: benchmarkType,
				title: `Remove and insert end value at leaf of ${numberOfNodes} Wide tree`,
				before: () => {
					// Setup
					tree = generateWideSimpleTree(numberOfNodes, leafValue);
				},
				benchmarkFn: () => {
					writeWideSimpleTreeNewValue(tree, changedLeafValue, tree.length - 1);
				},
				after: () => {
					const actual = tree[tree.length - 1];
					assert.equal(actual, changedLeafValue);
				},
			});
		}

		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: WideTreeNode;
			benchmark({
				type: benchmarkType,
				title: `Remove and insert first value at leaf of ${numberOfNodes} Wide tree`,
				before: () => {
					// Setup
					tree = generateWideSimpleTree(numberOfNodes, leafValue);
				},
				benchmarkFn: () => {
					writeWideSimpleTreeNewValue(tree, changedLeafValue, 0);
				},
				after: () => {
					const actual = tree[0];
					assert.equal(actual, changedLeafValue);
				},
			});
		}

		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: WideTreeNode;
			benchmark({
				type: benchmarkType,
				title: `Move second leaf to begining of ${numberOfNodes} Wide tree`,
				before: () => {
					// Setup
					tree = generateWideSimpleTree(numberOfNodes, leafValue);
					writeWideSimpleTreeNewValue(tree, changedLeafValue, 1);
				},
				benchmarkFn: () => {
					tree.moveToIndex(0, 1);
				},
				after: () => {
					// Even number of iterations cancel out, so this validation only works after odd numbers of iterations.
					// Correctness mode always does a single iteration, so just validate that case.
					if (!isInPerformanceTestingMode) assert.equal(tree[0], changedLeafValue);
				},
			});
		}

		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: WideTreeNode;
			benchmark({
				type: benchmarkType,
				title: `Move next-to-last leaf to end of ${numberOfNodes} Wide tree`,
				before: () => {
					// Setup
					tree = generateWideSimpleTree(numberOfNodes, leafValue);
					writeWideSimpleTreeNewValue(tree, changedLeafValue, tree.length - 2);
				},
				benchmarkFn: () => {
					tree.moveToIndex(tree.length - 2, tree.length - 1);
				},
				after: () => {
					if (!isInPerformanceTestingMode)
						assert.equal(tree[tree.length - 1], changedLeafValue);
				},
			});
		}
	});
});
