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
	assertApproximatelyConstant,
	assertLinear,
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
		const characterCountConfigs = [
			{ characterCount: 1, benchmarkType: BenchmarkType.Measurement, runInCorrectnessMode: true },
			{ characterCount: 10, benchmarkType: BenchmarkType.Perspective, runInCorrectnessMode: false },
			{
				characterCount: 100,
				benchmarkType: BenchmarkType.Measurement,
				runInCorrectnessMode: false,
			},
			{
				characterCount: 1000,
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

		// Control values
		const defaultTreeDepth = 1;
		const defaultCharacterCount = 1;
		const defaultKeyLength = 1;

		const filteredDepthConfigs = depthConfigs.filter(
			(config) => isInPerformanceTestingMode || config.runInCorrectnessMode,
		);
		const filteredCharacterCountConfigs = characterCountConfigs.filter(
			(config) => isInPerformanceTestingMode || config.runInCorrectnessMode,
		);
		const filteredKeyConfigs = keyConfigs.filter(
			(config) => isInPerformanceTestingMode || config.runInCorrectnessMode,
		);

		describe("Plain text", () => {
			describe("Insert characters", () => {
				describe(`Op size by inserted character count`, () => {
					benchmarkCustom({
						only: false,
						type: BenchmarkType.Measurement,
						title: `Op size by inserted character count`,
						run: async (reporter) => {
							const opSizeByCharCount: { x: number; y: number }[] = [];
							for (const { characterCount } of filteredCharacterCountConfigs) {
								const localOps: ISequencedDocumentMessage[] = [];

								const key = getPropertyKey(defaultKeyLength);

								const tree = createConnectedTree();
								const view = tree.viewWith(viewConfig);
								view.initialize(makeTree(defaultTreeDepth, key, ""));

								registerOpListener(tree, localOps);

								const textNode = getLeaf(view.root, key);
								textNode.insertAt(0, "a".repeat(characterCount));
								assert.equal(textNode.characterCount(), characterCount);

								const opStats = getOperationsStats(localOps);
								opSizeByCharCount.push({
									x: characterCount,
									y: opStats["Total Op Size (Bytes)"],
								});
								for (const statKey of Object.keys(opStats)) {
									reporter.addMeasurement(
										`${statKey} [characterCount=${characterCount}]`,
										opStats[statKey],
									);
								}
							}
							assertLinear({ points: opSizeByCharCount });
						},
					});
				});

				describe(`Op size by tree depth`, () => {
					benchmarkCustom({
						only: false,
						type: BenchmarkType.Measurement,
						title: `Op size by tree depth`,
						run: async (reporter) => {
							const opSizeByDepth: { x: number; y: number }[] = [];
							for (const { depth } of filteredDepthConfigs) {
								const localOps: ISequencedDocumentMessage[] = [];

								const key = getPropertyKey(defaultKeyLength);

								const tree = createConnectedTree();
								const view = tree.viewWith(viewConfig);
								view.initialize(makeTree(depth, key, ""));

								registerOpListener(tree, localOps);

								const textNode = getLeaf(view.root, key);
								textNode.insertAt(0, "a".repeat(defaultCharacterCount));
								assert.equal(textNode.characterCount(), defaultCharacterCount);

								const opStats = getOperationsStats(localOps);
								opSizeByDepth.push({ x: depth, y: opStats["Total Op Size (Bytes)"] });
								for (const statKey of Object.keys(opStats)) {
									reporter.addMeasurement(
										`${statKey} [depth=${depth}]`,
										opStats[statKey],
									);
								}
							}
							assertLinear({ points: opSizeByDepth });
						},
					});
				});

				describe(`Op size by property key length`, () => {
					benchmarkCustom({
						only: false,
						type: BenchmarkType.Measurement,
						title: `Op size by property key length`,
						run: async (reporter) => {
							const opSizeByKeyLength: { x: number; y: number }[] = [];
							for (const { keyLength } of filteredKeyConfigs) {
								const localOps: ISequencedDocumentMessage[] = [];

								const key = getPropertyKey(keyLength);

								const tree = createConnectedTree();
								const view = tree.viewWith(viewConfig);
								view.initialize(makeTree(defaultTreeDepth, key, ""));

								registerOpListener(tree, localOps);

								const textNode = getLeaf(view.root, key);
								textNode.insertAt(0, "a".repeat(defaultCharacterCount));
								assert.equal(textNode.characterCount(), defaultCharacterCount);

								const opStats = getOperationsStats(localOps);
								opSizeByKeyLength.push({
									x: keyLength,
									y: opStats["Total Op Size (Bytes)"],
								});
								for (const statKey of Object.keys(opStats)) {
									reporter.addMeasurement(
										`${statKey} [keyLength=${keyLength}]`,
										opStats[statKey],
									);
								}
							}
							assertLinear({ points: opSizeByKeyLength });
						},
					});
				});
			});

			describe("Remove characters", () => {
				describe(`Op size by removed character count`, () => {
					benchmarkCustom({
						only: false,
						type: BenchmarkType.Measurement,
						title: `Op size by removed character count`,
						run: async (reporter) => {
							const opSizes: number[] = [];
							for (const { characterCount } of filteredCharacterCountConfigs) {
								const localOps: ISequencedDocumentMessage[] = [];

								const key = getPropertyKey(defaultKeyLength);

								const tree = createConnectedTree();
								const view = tree.viewWith(viewConfig);
								view.initialize(makeTree(defaultTreeDepth, key, "a".repeat(1000)));

								registerOpListener(tree, localOps);

								const textNode = getLeaf(view.root, key);
								textNode.removeRange(0, characterCount);
								assert.equal(textNode.characterCount(), 1000 - characterCount);

								const opStats = getOperationsStats(localOps);
								opSizes.push(opStats["Total Op Size (Bytes)"]);
								for (const statKey of Object.keys(opStats)) {
									reporter.addMeasurement(
										`${statKey} [characterCount=${characterCount}]`,
										opStats[statKey],
									);
								}
							}
							// Remove ops encode a (start, count) range, not the removed characters,
							// so op size should be essentially independent of character count.
							assertApproximatelyConstant({ sizes: opSizes, maxDeltaBytes: 20 });
						},
					});
				});

				describe(`Op size by tree depth`, () => {
					benchmarkCustom({
						only: false,
						type: BenchmarkType.Measurement,
						title: `Op size by tree depth`,
						run: async (reporter) => {
							const opSizeByDepth: { x: number; y: number }[] = [];
							for (const { depth } of filteredDepthConfigs) {
								const localOps: ISequencedDocumentMessage[] = [];

								const key = getPropertyKey(defaultKeyLength);

								const tree = createConnectedTree();
								const view = tree.viewWith(viewConfig);
								view.initialize(makeTree(depth, key, "a".repeat(1000)));

								registerOpListener(tree, localOps);

								const textNode = getLeaf(view.root, key);
								textNode.removeRange(0, defaultCharacterCount);
								assert.equal(textNode.characterCount(), 1000 - defaultCharacterCount);

								const opStats = getOperationsStats(localOps);
								opSizeByDepth.push({ x: depth, y: opStats["Total Op Size (Bytes)"] });
								for (const statKey of Object.keys(opStats)) {
									reporter.addMeasurement(
										`${statKey} [depth=${depth}]`,
										opStats[statKey],
									);
								}
							}
							assertLinear({ points: opSizeByDepth });
						},
					});
				});

				describe(`Op size by property key length`, () => {
					benchmarkCustom({
						only: false,
						type: BenchmarkType.Measurement,
						title: `Op size by property key length`,
						run: async (reporter) => {
							const opSizeByKeyLength: { x: number; y: number }[] = [];
							for (const { keyLength } of filteredKeyConfigs) {
								const localOps: ISequencedDocumentMessage[] = [];

								const key = getPropertyKey(keyLength);

								const tree = createConnectedTree();
								const view = tree.viewWith(viewConfig);
								view.initialize(makeTree(defaultTreeDepth, key, "a".repeat(1000)));

								registerOpListener(tree, localOps);

								const textNode = getLeaf(view.root, key);
								textNode.removeRange(0, defaultCharacterCount);
								assert.equal(textNode.characterCount(), 1000 - defaultCharacterCount);

								const opStats = getOperationsStats(localOps);
								opSizeByKeyLength.push({
									x: keyLength,
									y: opStats["Total Op Size (Bytes)"],
								});
								for (const statKey of Object.keys(opStats)) {
									reporter.addMeasurement(
										`${statKey} [keyLength=${keyLength}]`,
										opStats[statKey],
									);
								}
							}
							assertLinear({ points: opSizeByKeyLength });
						},
					});
				});
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
			benchmarkCustom({
				only: false,
				type: BenchmarkType.Measurement,
				title: `exportVerbose encoded size by string length`,
				run: async (reporter) => {
					const encodedSizeByLength: { x: number; y: number }[] = [];
					for (const { stringLength } of filteredConfigs) {
						const independentTree = createIndependentTreeAlpha({});
						const view = independentTree.viewWith(viewConfig);
						view.initialize(TextAsTree.Tree.fromString("a".repeat(stringLength)));

						const encoded = TreeAlpha.exportVerbose(view.root);
						const encodedSize = utf8Length(encoded as JsonCompatibleReadOnly);

						encodedSizeByLength.push({ x: stringLength, y: encodedSize });
						reporter.addMeasurement(
							`Encoded Size (Bytes) [stringLength=${stringLength}]`,
							encodedSize,
						);
					}
					assertLinear({ points: encodedSizeByLength });
				},
			});
		});

		// TODO: formatted text benchmarks.
	});
});
