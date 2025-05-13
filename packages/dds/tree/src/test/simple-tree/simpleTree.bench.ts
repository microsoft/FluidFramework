/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

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
import { hydrate, hydrateUnsafe } from "./utils.js";
import { configureBenchmarkHooks } from "../utils.js";

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
	configureBenchmarkHooks();
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
			/**
			 * Creates a pair of benchmarks to test accessing leaf values in a tree, one for unhydrated nodes and one for flex
			 * nodes.
			 * @param title - The title for the test.
			 * @param unhydratedNodeInitFunction - Function that returns the test tree with unhydrated nodes.
			 * @param flexNodeInitFunction - Function that returns the test tree with flex nodes.
			 * @param treeReadingFunction - Function that reads the leaf value from the tree. It should have no side-effects.
			 * @param expectedValue - The expected value of the leaf.
			 */
			function generateBenchmarkPair<RootNode>(
				title: string,
				unhydratedNodeInitFunction: () => RootNode,
				flexNodeInitFunction: () => RootNode,
				treeReadingFunction: (tree: RootNode) => number | undefined,
				expectedValue: number | undefined,
			) {
				let unhydratedTree: RootNode | undefined;
				let readNumber: number | undefined;
				benchmark({
					type: BenchmarkType.Measurement,
					title: `${title} (unhydrated node)`,
					before: () => {
						unhydratedTree = unhydratedNodeInitFunction();
					},
					benchmarkFn: () => {
						readNumber = treeReadingFunction(
							unhydratedTree ?? fail("Expected unhydratedTree to be set"),
						);
					},
					after: () => {
						assert.equal(readNumber, expectedValue);
					},
				});
				let flexTree: RootNode | undefined;
				benchmark({
					type: BenchmarkType.Measurement,
					title: `${title} (flex node)`,
					before: () => {
						flexTree = flexNodeInitFunction();
					},
					benchmarkFn: () => {
						readNumber = treeReadingFunction(flexTree ?? fail("Expected flexTree to be set"));
					},
					after: () => {
						assert.equal(readNumber, expectedValue);
					},
				});
			}

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
						readFunction: (tree: MySchema) => tree.value,
						expected: 1,
					},
					{
						title: `Read value from union of two leaves`,
						initUnhydrated: () => new MySchema({ leafUnion: 1 }),
						readFunction: (tree: MySchema) => tree.leafUnion as number,
						expected: 1,
					},
					{
						title: `Read value from union of leaf and non-leaf`,
						initUnhydrated: () => new MySchema({ complexUnion: 1 }),
						readFunction: (tree: MySchema) => tree.complexUnion as number,
						expected: 1,
					},
					{
						title: `Read undefined from leaf`,
						initUnhydrated: () => new MySchema({}),
						readFunction: (tree: MySchema) => tree.value,
						expected: undefined,
					},
					{
						title: `Read undefined from union of two leaves`,
						initUnhydrated: () => new MySchema({}),
						readFunction: (tree: MySchema) => tree.leafUnion as number,
						expected: undefined,
					},
					{
						title: `Read undefined from union of leaf and non-leaf`,
						initUnhydrated: () => new MySchema({}),
						readFunction: (tree: MySchema) => tree.complexUnion as number,
						expected: undefined,
					},
				];

				for (const { title, initUnhydrated, readFunction, expected } of testCases) {
					const initFlexNode = () => hydrate(MySchema, initUnhydrated());
					generateBenchmarkPair(title, initUnhydrated, initFlexNode, readFunction, expected);
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
						readFunction: (tree: MySchema) => tree.value,
					},
					{
						title: `Read value from union of two leaves`,
						readFunction: (tree: MySchema) => tree.leafUnion as number,
					},
					{
						title: `Read value from union of leaf and non-leaf`,
						readFunction: (tree: MySchema) => tree.complexUnion as number,
					},
				];

				const initUnhydrated = () => new MySchema({ value: 1, leafUnion: 1, complexUnion: 1 });
				const initFlex = () => hydrate(MySchema, initUnhydrated());
				for (const { title, readFunction } of testCases) {
					generateBenchmarkPair(title, initUnhydrated, initFlex, readFunction, 1);
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

				const valueTestCases = [
					{
						title: `Read value from leaf`,
						mapType: NumberMap,
					},
					{
						title: `Read value from union of two leaves`,
						mapType: NumberStringMap,
					},
					{
						title: `Read value from union of leaf and non-leaf`,
						mapType: NumberObjectMap,
					},
				] as const;

				for (const { title, mapType } of valueTestCases) {
					const initUnhydrated = () => new mapType([["a", 1]]);
					const initFlex = () => hydrateUnsafe(mapType, initUnhydrated());
					const readFunction = (tree: CombinedTypes) => tree.get("a") as number;
					generateBenchmarkPair(title, initUnhydrated, initFlex, readFunction, 1);
				}

				const undefinedTestCases = [
					{
						title: `Read undefined from leaf`,
						mapType: NumberMap,
						read: (tree: CombinedTypes) => tree.get("b") as number,
						expected: undefined,
					},
					{
						title: `Read undefined from union of two leaves`,
						mapType: NumberStringMap,
						read: (tree: CombinedTypes) => tree.get("b") as number,
						expected: undefined,
					},
					{
						title: `Read undefined from union of leaf and non-leaf`,
						mapType: NumberObjectMap,
						read: (tree: CombinedTypes) => tree.get("b") as number,
						expected: undefined,
					},
				];

				for (const { title, mapType } of undefinedTestCases) {
					const initUnhydrated = () => new mapType([["a", 1]]);
					const initFlex = () => hydrateUnsafe(mapType, initUnhydrated());
					const readFunction = (tree: CombinedTypes) => tree.get("b") as number;
					generateBenchmarkPair(title, initUnhydrated, initFlex, readFunction, undefined);
				}
			});

			describe("Array entries", () => {
				const factory = new SchemaFactory("test");
				class NumArray extends factory.array("root", [factory.number]) {}
				class NumStringArray extends factory.array("root", [factory.number, factory.string]) {}
				class NumObjectArray extends factory.array("root", [
					factory.number,
					factory.object("inner", { value: factory.number }),
				]) {}

				const testCases = [
					{
						title: `Read value from leaf`,
						arrayType: NumArray,
					},
					{
						title: `Read value from union of two leaves`,
						arrayType: NumStringArray,
					},
					{
						title: `Read value from union of leaf and non-leaf`,
						arrayType: NumObjectArray,
					},
				];

				for (const { title, arrayType } of testCases) {
					const initUnhydrated = () => new arrayType([1]);
					const initFlex = () => hydrateUnsafe(arrayType, initUnhydrated());
					const read = (tree: NumArray | NumStringArray | NumObjectArray) => tree[0] as number;
					generateBenchmarkPair(title, initUnhydrated, initFlex, read, 1);
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
