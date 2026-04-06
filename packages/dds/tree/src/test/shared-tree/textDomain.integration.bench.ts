/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	BenchmarkType,
	benchmarkCustom,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import { Tree, TreeAlpha, createIndependentTreeAlpha } from "../../shared-tree/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type ValidateRecursiveSchema,
} from "../../simple-tree/index.js";
import { TextAsTree } from "../../text/index.js";
import type { JsonCompatibleReadOnly } from "../../util/index.js";
import { configureBenchmarkHooks } from "../utils.js";

import {
	createConnectedTree,
	getOperationsStats,
	registerOpListener,
	utf8Length,
} from "./opBenchmarkUtilities.js";

describe("TextDomain benchmarks", () => {
	configureBenchmarkHooks();

	describe("TextDomain op size benchmarks", () => {
		const schemaFactory = new SchemaFactory("bench.textDepth");

		// A single recursive map schema covers all key-length variants.
		class WrapperMap extends schemaFactory.mapRecursive("bench.textDepth.WrapperMap", [
			() => WrapperMap,
			TextAsTree.Tree,
		]) {}
		{
			type _check = ValidateRecursiveSchema<typeof WrapperMap>;
		}

		const viewConfig = new TreeViewConfiguration({ schema: WrapperMap });

		function getPropertyKey(keyLength: number): string {
			return "a".repeat(keyLength);
		}

		function makeTree(depth: number, key: string, text: string): WrapperMap {
			const textNode = TextAsTree.Tree.fromString(text);
			let current: WrapperMap = new WrapperMap([[key, textNode]]);
			for (let i = 1; i < depth; i++) {
				current = new WrapperMap([[key, current]]);
			}
			return current;
		}

		function getLeaf(root: WrapperMap, key: string): TextAsTree.Tree {
			let current: WrapperMap | TextAsTree.Tree = root;
			while (Tree.is(current, WrapperMap)) {
				const next = current.get(key);
				assert(next !== undefined);
				current = next;
			}
			assert(Tree.is(current, TextAsTree.Tree));
			return current;
		}

		/**
		 * Depths at which to place the text node within the wrapper tree.
		 * @remarks
		 * A deeper text node results in a longer path in the generated op, which we expect to increase op size.
		 */
		const depthConfigs = [
			{ depth: 1, benchmarkType: BenchmarkType.Measurement, runInCorrectnessMode: true },
			{ depth: 5, benchmarkType: BenchmarkType.Perspective, runInCorrectnessMode: false },
			{ depth: 25, benchmarkType: BenchmarkType.Measurement, runInCorrectnessMode: false },
			{ depth: 125, benchmarkType: BenchmarkType.Perspective, runInCorrectnessMode: false },
		] as const;

		/**
		 * Numbers of characters to insert or remove in each benchmark.
		 */
		const charCountConfigs = [
			{ charCount: 1, benchmarkType: BenchmarkType.Measurement, runInCorrectnessMode: true },
			{ charCount: 10, benchmarkType: BenchmarkType.Perspective, runInCorrectnessMode: false },
			{
				charCount: 100,
				benchmarkType: BenchmarkType.Measurement,
				runInCorrectnessMode: false,
			},
			{
				charCount: 1000,
				benchmarkType: BenchmarkType.Perspective,
				runInCorrectnessMode: false,
			},
		] as const;

		/**
		 * Key length variants to test. Each entry specifies the key string to use at runtime.
		 */
		const keyConfigs = [
			{
				keyLength: 1,
				benchmarkType: BenchmarkType.Measurement,
				runInCorrectnessMode: true,
			},
			{
				keyLength: 10,
				benchmarkType: BenchmarkType.Perspective,
				runInCorrectnessMode: false,
			},
			{
				keyLength: 100,
				benchmarkType: BenchmarkType.Measurement,
				runInCorrectnessMode: false,
			},
			{
				keyLength: 1000,
				benchmarkType: BenchmarkType.Perspective,
				runInCorrectnessMode: false,
			},
		] as const;

		const filteredDepthConfigs = depthConfigs.filter(
			(config) => isInPerformanceTestingMode || config.runInCorrectnessMode,
		);
		const filteredCharCountConfigs = charCountConfigs.filter(
			(config) => isInPerformanceTestingMode || config.runInCorrectnessMode,
		);
		const filteredKeyConfigs = keyConfigs.filter(
			(config) => isInPerformanceTestingMode || config.runInCorrectnessMode,
		);

		/**
		 * Returns `BenchmarkType.Perspective` if any of the given types is `Perspective`,
		 * otherwise returns `BenchmarkType.Measurement`.
		 */
		function getEffectiveBenchmarkType(
			...types: (BenchmarkType.Measurement | BenchmarkType.Perspective)[]
		): BenchmarkType {
			return types.includes(BenchmarkType.Perspective)
				? BenchmarkType.Perspective
				: BenchmarkType.Measurement;
		}

		describe("Plain text", () => {
			const currentTestOps: ISequencedDocumentMessage[] = [];

			beforeEach(() => {
				currentTestOps.length = 0;
			});

			afterEach(function () {
				if (this.currentTest?.isFailed() === false) {
					assert(currentTestOps.length > 0);
				}
				currentTestOps.length = 0;
			});

			describe("Insert characters", () => {
				for (const { depth, benchmarkType: depthType } of filteredDepthConfigs) {
					for (const { keyLength, benchmarkType: keyType } of filteredKeyConfigs) {
						for (const { charCount, benchmarkType: charType } of filteredCharCountConfigs) {
							benchmarkCustom({
								only: false,
								type: getEffectiveBenchmarkType(depthType, keyType, charType),
								title: `insert ${charCount} character(s) into empty string at depth ${depth} with key length ${keyLength}`,
								run: async (reporter) => {
									const key = getPropertyKey(keyLength);

									const tree = createConnectedTree();
									const view = tree.viewWith(viewConfig);
									view.initialize(makeTree(depth, key, ""));

									registerOpListener(tree, currentTestOps);

									const textNode = getLeaf(view.root, key);
									textNode.insertAt(0, "a".repeat(charCount));

									assert.equal(textNode.characterCount(), charCount);
									const opStats = getOperationsStats(currentTestOps);
									for (const statKey of Object.keys(opStats)) {
										reporter.addMeasurement(statKey, opStats[statKey]);
									}
								},
							});
						}
					}
				}
			});

			describe("Remove characters", () => {
				for (const { depth, benchmarkType: depthType } of filteredDepthConfigs) {
					for (const { keyLength, benchmarkType: keyType } of filteredKeyConfigs) {
						for (const { charCount, benchmarkType: charType } of filteredCharCountConfigs) {
							benchmarkCustom({
								only: false,
								type: getEffectiveBenchmarkType(depthType, keyType, charType),
								title: `remove ${charCount} character(s) from string of 1000 characters at depth ${depth} with key length ${keyLength}`,
								run: async (reporter) => {
									const key = getPropertyKey(keyLength);

									const tree = createConnectedTree();
									const view = tree.viewWith(viewConfig);
									view.initialize(makeTree(depth, key, "a".repeat(1000)));

									registerOpListener(tree, currentTestOps);

									const textNode = getLeaf(view.root, key);
									textNode.removeRange(0, charCount);

									assert.equal(textNode.characterCount(), 1000 - charCount);
									const opStats = getOperationsStats(currentTestOps);
									for (const statKey of Object.keys(opStats)) {
										reporter.addMeasurement(statKey, opStats[statKey]);
									}
								},
							});
						}
					}
				}
			});
		});

		// TODO: formatted text benchmarks.
	});

	describe("TextDomain encoding benchmarks", () => {
		const testConfigs = [
			{
				stringLength: 1,
				benchmarkType: BenchmarkType.Measurement,
				runInCorrectnessMode: true,
			},
			{
				stringLength: 10,
				benchmarkType: BenchmarkType.Perspective,
				runInCorrectnessMode: false,
			},
			{
				stringLength: 100,
				benchmarkType: BenchmarkType.Measurement,
				runInCorrectnessMode: false,
			},
			{
				stringLength: 1000,
				benchmarkType: BenchmarkType.Perspective,
				runInCorrectnessMode: false,
			},
		] as const;

		// Filter configs to those that should be run in the current mode (performance or correctness).
		const filteredConfigs = testConfigs.filter(
			(config) => isInPerformanceTestingMode || config.runInCorrectnessMode,
		);

		const viewConfig = new TreeViewConfiguration({ schema: TextAsTree.Tree });

		describe("TextAsTree.Tree node encoded size", () => {
			for (const { stringLength, benchmarkType } of filteredConfigs) {
				benchmarkCustom({
					only: false,
					type: benchmarkType,
					title: `exportVerbose encoded size for string of length ${stringLength}`,
					run: async (reporter) => {
						const independentTree = createIndependentTreeAlpha({});
						const view = independentTree.viewWith(viewConfig);
						view.initialize(TextAsTree.Tree.fromString("a".repeat(stringLength)));

						const encoded = TreeAlpha.exportVerbose(view.root);
						const encodedSize = utf8Length(encoded as JsonCompatibleReadOnly);

						reporter.addMeasurement("Encoded Size (Bytes)", encodedSize);
					},
				});
			}
		});

		// TODO: formatted text benchmarks.
	});
});
