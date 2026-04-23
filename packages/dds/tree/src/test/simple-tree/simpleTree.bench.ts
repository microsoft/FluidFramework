/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	BenchmarkType,
	benchmarkDuration,
	benchmarkIt,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";

import { SchemaFactory, SchemaFactoryAlpha, type TreeNode } from "../../simple-tree/index.js";
import { configureBenchmarkHooks } from "../utils.js";

import {
	generateDeepSimpleTree,
	generateWideSimpleTree,
	readDeepSimpleTree,
	readWideSimpleTree,
	writeDeepTree,
	writeWideSimpleTreeNewValue,
} from "./benchmarkUtilities.js";
import { hydrateNode } from "./utils.js";

// number of nodes in test for wide trees
const nodesCountWide = [
	[2, BenchmarkType.Measurement],
	...(isInPerformanceTestingMode
		? [
				[100, BenchmarkType.Perspective],
				[500, BenchmarkType.Measurement],
			]
		: []),
];
// number of nodes in test for deep trees
const nodesCountDeep = [
	[1, BenchmarkType.Measurement],
	...(isInPerformanceTestingMode
		? [
				[10, BenchmarkType.Perspective],
				[100, BenchmarkType.Measurement],
			]
		: []),
];

describe("SimpleTree benchmarks", () => {
	configureBenchmarkHooks();
	describe("Read SimpleTree", () => {
		const leafValue = 1;
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			benchmarkIt({
				type: benchmarkType,
				title: `Deep Tree as SimpleTree: reads with ${numberOfNodes} nodes`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						const tree = generateDeepSimpleTree(numberOfNodes, leafValue);
						let actualDepth = 0;
						let actualValue = 0;
						state.timeAllBatches(() => {
							const { depth, value } = readDeepSimpleTree(tree);
							actualDepth = depth;
							actualValue = value;
						});
						assert.equal(actualDepth, numberOfNodes);
						assert.equal(actualValue, leafValue);
					},
				}),
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			benchmarkIt({
				type: benchmarkType,
				title: `Wide Tree as SimpleTree: reads with ${numberOfNodes} nodes`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						const tree = generateWideSimpleTree(numberOfNodes, leafValue);
						const expected = numberOfNodes * leafValue;
						let actualNodesCount = 0;
						let actualSum = 0;
						state.timeAllBatches(() => {
							const { nodesCount, sum } = readWideSimpleTree(tree);
							actualNodesCount = nodesCount;
							actualSum = sum;
						});
						assert.equal(actualNodesCount, numberOfNodes);
						assert.equal(actualSum, expected);
					},
				}),
			});
		}

		describe("Access to leaves", () => {
			/**
			 * Creates a pair of benchmarks to test accessing leaf values in a tree, one for unhydrated nodes and one for hydrated nodes.
			 * @param title - The title for the test.
			 * @param unhydratedNodeInitFunction - Function that returns the test tree with unhydrated nodes.
			 * @param treeReadingFunction - Function that reads the leaf value from the tree. It should have no side-effects.
			 * @param expectedValue - The expected value of the leaf.
			 */
			function generateBenchmarkPair<RootNode extends TreeNode>(
				title: string,
				unhydratedNodeInitFunction: () => RootNode,
				treeReadingFunction: (tree: RootNode) => number | undefined,
				expectedValue: number | undefined,
			) {
				for (const doHydration of [false, true]) {
					benchmarkIt({
						title: `${title} (${doHydration ? "hydrated" : "unhydrated"} node)`,
						...benchmarkDuration({
							benchmarkFnCustom: async (state) => {
								const tree = unhydratedNodeInitFunction();
								if (doHydration) {
									hydrateNode(tree);
								}
								let readNumber: number | undefined;
								state.timeAllBatches(() => {
									readNumber = treeReadingFunction(tree);
								});
								assert.equal(readNumber, expectedValue);
							},
						}),
					});
				}
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
					generateBenchmarkPair(title, initUnhydrated, readFunction, expected);
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
				for (const { title, readFunction } of testCases) {
					generateBenchmarkPair(title, initUnhydrated, readFunction, 1);
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
					const readFunction = (tree: CombinedTypes) => tree.get("a") as number;
					generateBenchmarkPair(title, initUnhydrated, readFunction, 1);
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
					const readFunction = (tree: CombinedTypes) => tree.get("b") as number;
					generateBenchmarkPair(title, initUnhydrated, readFunction, undefined);
				}
			});

			describe("Record keys", () => {
				const factory = new SchemaFactoryAlpha("test");
				class NumberRecord extends factory.record("root", [factory.number]) {}
				class NumberStringRecord extends factory.record("root", [
					factory.number,
					factory.string,
				]) {}
				class NumberObjectRecord extends factory.record("root", [
					factory.number,
					factory.object("inner", { value: factory.number }),
				]) {}
				// Just to simplify typing a bit below in a way that keeps TypeScript happy
				type CombinedTypes = NumberRecord | NumberStringRecord | NumberObjectRecord;

				const valueTestCases = [
					{
						title: `Read value from leaf`,
						recordType: NumberRecord,
					},
					{
						title: `Read value from union of two leaves`,
						recordType: NumberStringRecord,
					},
					{
						title: `Read value from union of leaf and non-leaf`,
						recordType: NumberObjectRecord,
					},
				] as const;

				for (const { title, recordType } of valueTestCases) {
					const initUnhydrated = () => new recordType({ a: 1 });
					const readFunction = (tree: CombinedTypes) => tree.a as number;
					generateBenchmarkPair(title, initUnhydrated, readFunction, 1);
				}

				const undefinedTestCases = [
					{
						title: `Read undefined from leaf`,
						recordType: NumberRecord,
						read: (tree: CombinedTypes) => tree.b as number,
						expected: undefined,
					},
					{
						title: `Read undefined from union of two leaves`,
						recordType: NumberStringRecord,
						read: (tree: CombinedTypes) => tree.b as number,
						expected: undefined,
					},
					{
						title: `Read undefined from union of leaf and non-leaf`,
						recordType: NumberObjectRecord,
						read: (tree: CombinedTypes) => tree.b as number,
						expected: undefined,
					},
				];

				for (const { title, recordType } of undefinedTestCases) {
					const initUnhydrated = () => new recordType({ a: 1 });
					const readFunction = (tree: CombinedTypes) => tree.b as number;
					generateBenchmarkPair(title, initUnhydrated, readFunction, undefined);
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
					const read = (tree: NumArray | NumStringArray | NumObjectArray) => tree[0] as number;
					generateBenchmarkPair(title, initUnhydrated, read, 1);
				}
			});
		});
	});

	describe(`Edit SimpleTree`, () => {
		const leafValue = 1;
		const changedLeafValue = -1;
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			benchmarkIt({
				type: benchmarkType,
				title: `Update value at leaf of ${numberOfNodes} deep tree`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						const tree = generateDeepSimpleTree(numberOfNodes, leafValue);
						state.timeAllBatches(() => {
							writeDeepTree(tree, changedLeafValue);
						});
						const expected = generateDeepSimpleTree(numberOfNodes, changedLeafValue);
						assert.deepEqual(tree, expected);
					},
				}),
			});
		}

		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			benchmarkIt({
				type: benchmarkType,
				title: `Remove and insert end value at leaf of ${numberOfNodes} Wide tree`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						const tree = generateWideSimpleTree(numberOfNodes, leafValue);
						state.timeAllBatches(() => {
							writeWideSimpleTreeNewValue(tree, changedLeafValue, tree.length - 1);
						});
						const actual = tree[tree.length - 1];
						assert.equal(actual, changedLeafValue);
					},
				}),
			});
		}

		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			benchmarkIt({
				type: benchmarkType,
				title: `Remove and insert first value at leaf of ${numberOfNodes} Wide tree`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						const tree = generateWideSimpleTree(numberOfNodes, leafValue);
						state.timeAllBatches(() => {
							writeWideSimpleTreeNewValue(tree, changedLeafValue, 0);
						});
						const actual = tree[0];
						assert.equal(actual, changedLeafValue);
					},
				}),
			});
		}

		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			benchmarkIt({
				type: benchmarkType,
				title: `Move second leaf to beginning of ${numberOfNodes} Wide tree`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						const tree = generateWideSimpleTree(numberOfNodes, leafValue);
						writeWideSimpleTreeNewValue(tree, changedLeafValue, 1);
						state.timeAllBatches(() => {
							tree.moveToIndex(0, 1);
						});
						// Even number of iterations cancel out, so this validation only works after odd numbers of iterations.
						// Correctness mode always does a single iteration, so just validate that case.
						if (!isInPerformanceTestingMode) assert.equal(tree[0], changedLeafValue);
					},
				}),
			});
		}

		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			benchmarkIt({
				type: benchmarkType,
				title: `Move next-to-last leaf to end of ${numberOfNodes} Wide tree`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						const tree = generateWideSimpleTree(numberOfNodes, leafValue);
						writeWideSimpleTreeNewValue(tree, changedLeafValue, tree.length - 2);
						state.timeAllBatches(() => {
							tree.moveToIndex(tree.length - 2, tree.length - 1);
						});
						if (!isInPerformanceTestingMode)
							assert.equal(tree[tree.length - 1], changedLeafValue);
					},
				}),
			});
		}
	});
});
