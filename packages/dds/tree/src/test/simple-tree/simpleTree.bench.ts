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
import { hydrate } from "./utils.js";

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

		function testAccessToLeaf<RootSchema>(
			title: string,
			treeInitFunction: () => RootSchema,
			treeReadingFunction: (tree: RootSchema) => number | undefined,
			expectedValue: number | undefined,
		) {
			let tree: RootSchema;
			let readNumber: number | undefined;
			benchmark({
				type: BenchmarkType.Measurement,
				title,
				before: () => {
					tree = treeInitFunction();
				},
				benchmarkFn: () => {
					readNumber = treeReadingFunction(tree);
				},
				after: () => {
					assert.equal(readNumber, expectedValue);
				},
			});
		}

		describe("Access to leaves", () => {
			describe("Optional object property", () => {
				const factory = new SchemaFactory("test");
				class MySchema extends factory.object("root", {
					value: factory.optional(factory.number),
					leafUnion: factory.optional([factory.number, factory.string]),
					complexUnion: factory.optional([
						factory.number,
						factory.object("inner", {
							value: factory.optional(factory.number),
						}),
					]),
				}) {}

				const testCases = [
					{
						title: `Read value from leaf`,
						initUnhydrated: () => new MySchema({ value: 1 }),
						initFlex: () => hydrate(MySchema, { value: 1 }),
						read: (tree: MySchema) => tree.value,
						expected: 1,
					},
					{
						title: `Read value from union of two leaves`,
						initUnhydrated: () => new MySchema({ leafUnion: 1 }),
						initFlex: () => hydrate(MySchema, { leafUnion: 1 }),
						read: (tree: MySchema) => tree.leafUnion as number,
						expected: 1,
					},
					{
						title: `Read value from union of leaf and non-leaf`,
						initUnhydrated: () => new MySchema({ complexUnion: 1 }),
						initFlex: () => hydrate(MySchema, { complexUnion: 1 }),
						read: (tree: MySchema) => tree.complexUnion as number,
						expected: 1,
					},
					{
						title: `Read undefined from leaf`,
						initUnhydrated: () => new MySchema({}),
						initFlex: () => hydrate(MySchema, {}),
						read: (tree: MySchema) => tree.value,
						expected: undefined,
					},
					{
						title: `Read undefined from union of two leaves`,
						initUnhydrated: () => new MySchema({}),
						initFlex: () => hydrate(MySchema, {}),
						read: (tree: MySchema) => tree.leafUnion as number,
						expected: undefined,
					},
					{
						title: `Read undefined from union of leaf and non-leaf`,
						initUnhydrated: () => new MySchema({}),
						initFlex: () => hydrate(MySchema, {}),
						read: (tree: MySchema) => tree.complexUnion as number,
						expected: undefined,
					},
				];

				for (const { title, initUnhydrated, initFlex, read, expected } of testCases) {
					testAccessToLeaf(`${title} (unhydrated node)`, initUnhydrated, read, expected);
					testAccessToLeaf(`${title} (flex node)`, initFlex, read, expected);
				}
			});

			describe("Required object property", () => {
				const factory = new SchemaFactory("test");
				class MySchema extends factory.object("root", {
					value: factory.number,
					leafUnion: [factory.number, factory.string],
					complexUnion: [
						factory.number,
						factory.object("inner", {
							value: factory.number,
						}),
					],
				}) {}

				const testCases = [
					{
						title: `Read value from leaf`,
						initUnhydrated: () => new MySchema({ value: 1, leafUnion: 1, complexUnion: 1 }),
						initFlex: () => hydrate(MySchema, { value: 1, leafUnion: 1, complexUnion: 1 }),
						read: (tree: MySchema) => tree.value,
						expected: 1,
					},
					{
						title: `Read value from union of two leaves`,
						initUnhydrated: () => new MySchema({ value: 1, leafUnion: 1, complexUnion: 1 }),
						initFlex: () => hydrate(MySchema, { value: 1, leafUnion: 1, complexUnion: 1 }),
						read: (tree: MySchema) => tree.leafUnion as number,
						expected: 1,
					},
					{
						title: `Read value from union of leaf and non-leaf`,
						initUnhydrated: () => new MySchema({ value: 1, leafUnion: 1, complexUnion: 1 }),
						initFlex: () => hydrate(MySchema, { value: 1, leafUnion: 1, complexUnion: 1 }),
						read: (tree: MySchema) => tree.complexUnion as number,
						expected: 1,
					},
				];

				for (const { title, initUnhydrated, initFlex, read, expected } of testCases) {
					testAccessToLeaf(`${title} (unhydrated node)`, initUnhydrated, read, expected);
					testAccessToLeaf(`${title} (flex node)`, initFlex, read, expected);
				}
			});

			describe("Map keys", () => {
				const factory = new SchemaFactory("test");
				class NumberMap extends factory.map("root", [factory.number]) {}
				class NumberStringMap extends factory.map("root", [factory.number, factory.string]) {}
				class NumberObjectMap extends factory.map("root", [
					factory.number,
					factory.object("inner", { value: factory.number }),
				]) {}
				// Just to simplify typing a bit below in a way that keeps TypeScript happy
				type CombinedTypes = NumberMap | NumberStringMap | NumberObjectMap;

				const testCases = [
					{
						title: `Read value from leaf`,
						initUnhydrated: () => new NumberMap([["a", 1]]),
						initFlex: () => hydrate(NumberMap, new NumberMap([["a", 1]])),
						read: (tree: CombinedTypes) => tree.get("a") as number,
						expected: 1,
					},
					{
						title: `Read value from union of two leaves`,
						initUnhydrated: () => new NumberStringMap([["a", 1]]),
						initFlex: () => hydrate(NumberStringMap, new NumberStringMap([["a", 1]])),
						read: (tree: CombinedTypes) => tree.get("a") as number,
						expected: 1,
					},
					{
						title: `Read value from union of leaf and non-leaf`,
						initUnhydrated: () => new NumberObjectMap([["a", 1]]),
						initFlex: () => hydrate(NumberObjectMap, new NumberObjectMap([["a", 1]])),
						read: (tree: CombinedTypes) => tree.get("a") as number,
						expected: 1,
					},
					{
						title: `Read undefined from leaf`,
						initUnhydrated: () => new NumberMap([["a", 1]]),
						initFlex: () => hydrate(NumberMap, new NumberMap([["a", 1]])),
						read: (tree: CombinedTypes) => tree.get("b") as number,
						expected: undefined,
					},
					{
						title: `Read undefined from union of two leaves`,
						initUnhydrated: () => new NumberStringMap([["a", 1]]),
						initFlex: () => hydrate(NumberStringMap, new NumberStringMap([["a", 1]])),
						read: (tree: CombinedTypes) => tree.get("b") as number,
						expected: undefined,
					},
					{
						title: `Read undefined from union of leaf and non-leaf`,
						initUnhydrated: () => new NumberObjectMap([["a", 1]]),
						initFlex: () => hydrate(NumberObjectMap, new NumberObjectMap([["a", 1]])),
						read: (tree: CombinedTypes) => tree.get("b") as number,
						expected: undefined,
					},
				];

				for (const { title, initUnhydrated, initFlex, read, expected } of testCases) {
					testAccessToLeaf<NumberMap | NumberStringMap | NumberObjectMap>(
						`${title} (unhydrated node)`,
						initUnhydrated,
						read,
						expected,
					);
					testAccessToLeaf<NumberMap | NumberStringMap | NumberObjectMap>(
						`${title} (flex node)`,
						initFlex,
						read,
						expected,
					);
				}
			});

			describe("Array entries", () => {
				const factory = new SchemaFactory("test");
				class NumberArray extends factory.array("root", [factory.number]) {}
				class NumberStringArray extends factory.array("root", [
					factory.number,
					factory.string,
				]) {}
				class NumberObjectArray extends factory.array("root", [
					factory.number,
					factory.object("inner", { value: factory.number }),
				]) {}
				// Just to simplify typing a bit below in a way that keeps TypeScript happy
				type CombinedTypes = NumberArray | NumberStringArray | NumberObjectArray;

				const testCases = [
					{
						title: `Read value from leaf`,
						initUnhydrated: () => new NumberArray([1]),
						initFlex: () => hydrate(NumberArray, [1]),
						read: (tree: CombinedTypes) => tree[0] as number,
						expected: 1,
					},
					{
						title: `Read value from union of two leaves`,
						initUnhydrated: () => new NumberStringArray([1]),
						initFlex: () => hydrate(NumberStringArray, [1]),
						read: (tree: CombinedTypes) => tree[0] as number,
						expected: 1,
					},
					{
						title: `Read value from union of leaf and non-leaf`,
						initUnhydrated: () => new NumberObjectArray([1]),
						initFlex: () => hydrate(NumberObjectArray, [1]),
						read: (tree: CombinedTypes) => tree[0] as number,
						expected: 1,
					},
				];

				for (const { title, initUnhydrated, initFlex, read, expected } of testCases) {
					// Cast to any because we know that all different schemas represent an array and thus have the same interface,
					// so the same read function would work on any of them.
					testAccessToLeaf<NumberArray | NumberStringArray | NumberObjectArray>(
						`${title} (unhydrated node)`,
						initUnhydrated,
						read,
						expected,
					);
					testAccessToLeaf<NumberArray | NumberStringArray | NumberObjectArray>(
						`${title} (flex node)`,
						initFlex,
						read,
						expected,
					);
				}
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
