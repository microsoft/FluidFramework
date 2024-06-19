/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { BenchmarkType, benchmark, isInPerformanceTestingMode } from "@fluid-tools/benchmark";
import {
	generateDeepSimpleTree,
	generateWideSimpleTree,
	readDeepSimpleTree,
	readWideSimpleTree,
	writeDeepTree,
	writeWideSimpleTreeNewValue,
	type DeepTreeNode,
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
	// [10, BenchmarkType.Perspective],
	// [100, BenchmarkType.Measurement],
];

describe.only("New benchmarks", () => {
	describe("Optional object property", () => {
		const schemaFactory = new SchemaFactory("test");
		class MyInnerSchema extends schemaFactory.object("inner", {
			value: schemaFactory.optional(schemaFactory.number),
		}) {}
		class MySchema extends schemaFactory.object("root", {
			value: schemaFactory.optional(schemaFactory.number),
			primitiveUnion: schemaFactory.optional([schemaFactory.number, schemaFactory.string]),
			schemaUnion: schemaFactory.optional([schemaFactory.number, MyInnerSchema]),
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
			title: `Read value from leaf union (just primitives)`,
			before: () => {
				tree = new MySchema({ primitiveUnion: 1 });
			},
			benchmarkFn: () => {
				readNumber = tree.primitiveUnion as number;
			},
			after: () => {
				assert.equal(readNumber, 1);
			},
		});

		benchmark({
			type: BenchmarkType.Measurement,
			title: `Read value from leaf union (with schemas)`,
			before: () => {
				tree = new MySchema({ schemaUnion: 1 });
			},
			benchmarkFn: () => {
				readNumber = tree.schemaUnion as number;
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
			title: `Read undefined from leaf union (just primitives)`,
			before: () => {
				tree = new MySchema({});
			},
			benchmarkFn: () => {
				readNumber = tree.primitiveUnion as number;
			},
			after: () => {
				assert.equal(readNumber, undefined);
			},
		});

		benchmark({
			type: BenchmarkType.Measurement,
			title: `Read undefined from leaf union (with schemas)`,
			before: () => {
				tree = new MySchema({});
			},
			benchmarkFn: () => {
				readNumber = tree.schemaUnion as number;
			},
			after: () => {
				assert.equal(readNumber, undefined);
			},
		});
	});

	describe("Required object property", () => {
		const schemaFactory = new SchemaFactory("test");
		class MyInnerSchema extends schemaFactory.object("inner", {
			value: schemaFactory.number,
		}) {}
		class MySchema extends schemaFactory.object("root", {
			value: schemaFactory.number,
			primitiveUnion: [schemaFactory.number, schemaFactory.string],
			schemaUnion: [schemaFactory.number, MyInnerSchema],
		}) {}
		let tree: MySchema;
		let readNumber: number | undefined;

		benchmark({
			type: BenchmarkType.Measurement,
			title: `Read value from leaf`,
			before: () => {
				tree = new MySchema({ value: 1, primitiveUnion: 1, schemaUnion: 1 });
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
			title: `Read value from leaf union (just primitives)`,
			before: () => {
				tree = new MySchema({ value: 1, primitiveUnion: 1, schemaUnion: 1 });
			},
			benchmarkFn: () => {
				readNumber = tree.primitiveUnion as number;
			},
			after: () => {
				assert.equal(readNumber, 1);
			},
		});

		benchmark({
			type: BenchmarkType.Measurement,
			title: `Read value from leaf union (with schemas)`,
			before: () => {
				tree = new MySchema({ value: 1, primitiveUnion: 1, schemaUnion: 1 });
			},
			benchmarkFn: () => {
				readNumber = tree.schemaUnion as number;
			},
			after: () => {
				assert.equal(readNumber, 1);
			},
		});
	});

	describe("Map keys", () => {
		const schemaFactory = new SchemaFactory("test");
		class MyInnerSchema extends schemaFactory.object("inner", {
			value: schemaFactory.number,
		}) {}
		class NumberMap extends schemaFactory.map("root", [schemaFactory.number]) {}
		let numberMapTree: NumberMap;
		class NumberStringMap extends schemaFactory.map("root", [
			schemaFactory.number,
			schemaFactory.string,
		]) {}
		let numberStringMapTree: NumberStringMap;
		class NumberObjectMap extends schemaFactory.map("root", [
			schemaFactory.number,
			MyInnerSchema,
		]) {}
		let numberObjectMapTree: NumberObjectMap;
		let readNumber: number | undefined;

		benchmark({
			type: BenchmarkType.Measurement,
			title: `Read value from leaf`,
			before: () => {
				numberMapTree = new NumberMap([["a", 1]]);
			},
			benchmarkFn: () => {
				readNumber = numberMapTree.get("a");
			},
			after: () => {
				assert.equal(readNumber, 1);
			},
		});

		benchmark({
			type: BenchmarkType.Measurement,
			title: `Read value from leaf union (just primitives)`,
			before: () => {
				numberStringMapTree = new NumberStringMap([["a", 1]]);
			},
			benchmarkFn: () => {
				readNumber = numberStringMapTree.get("a") as number;
			},
			after: () => {
				assert.equal(readNumber, 1);
			},
		});

		benchmark({
			type: BenchmarkType.Measurement,
			title: `Read value from leaf union (with schemas)`,
			before: () => {
				numberObjectMapTree = new NumberObjectMap([["a", 1]]);
			},
			benchmarkFn: () => {
				readNumber = numberObjectMapTree.get("a") as number;
			},
			after: () => {
				assert.equal(readNumber, 1);
			},
		});

		benchmark({
			type: BenchmarkType.Measurement,
			title: `Read undefined from leaf`,
			before: () => {
				numberMapTree = new NumberMap([["a", 1]]);
			},
			benchmarkFn: () => {
				readNumber = numberMapTree.get("b");
			},
			after: () => {
				assert.equal(readNumber, undefined);
			},
		});

		benchmark({
			type: BenchmarkType.Measurement,
			title: `Read undefined from leaf union (just primitives)`,
			before: () => {
				numberStringMapTree = new NumberStringMap([["a", 1]]);
			},
			benchmarkFn: () => {
				readNumber = numberStringMapTree.get("b") as number;
			},
			after: () => {
				assert.equal(readNumber, undefined);
			},
		});

		benchmark({
			type: BenchmarkType.Measurement,
			title: `Read undefined from leaf union (with schemas)`,
			before: () => {
				numberObjectMapTree = new NumberObjectMap([["a", 1]]);
			},
			benchmarkFn: () => {
				readNumber = numberObjectMapTree.get("b") as number;
			},
			after: () => {
				assert.equal(readNumber, undefined);
			},
		});
	});

	describe("Array entries", () => {
		const schemaFactory = new SchemaFactory("test");
		class MyInnerSchema extends schemaFactory.object("inner", {
			value: schemaFactory.number,
		}) {}
		class NumberArray extends schemaFactory.array("root", [schemaFactory.number]) {}
		let numberMapTree: NumberArray;
		class NumberStringArray extends schemaFactory.array("root", [
			schemaFactory.number,
			schemaFactory.string,
		]) {}
		let numberStringMapTree: NumberStringArray;
		class NumberObjectArray extends schemaFactory.array("root", [
			schemaFactory.number,
			MyInnerSchema,
		]) {}
		let numberObjectMapTree: NumberObjectArray;
		let readNumber: number | undefined;

		benchmark({
			type: BenchmarkType.Measurement,
			title: `Read value from leaf`,
			before: () => {
				numberMapTree = new NumberArray([1]);
			},
			benchmarkFn: () => {
				readNumber = numberMapTree[0];
			},
			after: () => {
				assert.equal(readNumber, 1);
			},
		});

		benchmark({
			type: BenchmarkType.Measurement,
			title: `Read value from leaf union (just primitives)`,
			before: () => {
				numberStringMapTree = new NumberStringArray([1]);
			},
			benchmarkFn: () => {
				readNumber = numberStringMapTree[0] as number;
			},
			after: () => {
				assert.equal(readNumber, 1);
			},
		});

		benchmark({
			type: BenchmarkType.Measurement,
			title: `Read value from leaf union (with schemas)`,
			before: () => {
				numberObjectMapTree = new NumberObjectArray([1]);
			},
			benchmarkFn: () => {
				readNumber = numberObjectMapTree[0] as number;
			},
			after: () => {
				assert.equal(readNumber, 1);
			},
		});
	});
});

describe("SimpleTree benchmarks", () => {
	describe("Read SimpleTree", () => {
		const leafValue = 1;
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			let tree: DeepTreeNode;
			benchmark({
				type: benchmarkType,
				// only: true,
				title: `Deep Tree as SimpleTree: reads with ${numberOfNodes} nodes`,
				before: () => {
					// Setup
					tree = generateDeepSimpleTree(numberOfNodes, leafValue);
				},
				benchmarkFn: () => {
					const { depth, value } = readDeepSimpleTree(tree);
					assert.equal(depth, numberOfNodes);
					assert.equal(value, leafValue);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: WideTreeNode;
			const expected = numberOfNodes * leafValue;
			benchmark({
				type: benchmarkType,
				title: `Wide Tree as SimpleTree: reads with ${numberOfNodes} nodes`,
				before: () => {
					// Setup
					tree = generateWideSimpleTree(numberOfNodes, leafValue);
				},
				benchmarkFn: () => {
					const { nodesCount, sum } = readWideSimpleTree(tree);
					assert.equal(nodesCount, numberOfNodes);
					assert.equal(sum, expected);
				},
			});
		}
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
