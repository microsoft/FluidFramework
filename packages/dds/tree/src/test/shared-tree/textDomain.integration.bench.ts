/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	BenchmarkType,
	benchmarkIt,
	isInPerformanceTestingMode,
	ValueType,
	type CollectedData,
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

/**
 * Generates a test string of the given length by repeating "ab".
 * @remarks
 * Avoids adjacent repeated characters to prevent unrealistic compression optimizations.
 */
function makeTestString(length: number): string {
	return "ab".repeat(Math.ceil(length / 2)).slice(0, length);
}

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
			return makeTestString(keyLength);
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
			{ depth: 5, benchmarkType: BenchmarkType.Perspective, runInCorrectnessMode: true },
			{ depth: 25, benchmarkType: BenchmarkType.Measurement, runInCorrectnessMode: true },
			{ depth: 125, benchmarkType: BenchmarkType.Perspective, runInCorrectnessMode: false },
		] as const;

		/**
		 * Numbers of characters to insert or remove in each benchmark.
		 */
		const characterCountConfigs = [
			{
				characterCount: 1,
				benchmarkType: BenchmarkType.Measurement,
				runInCorrectnessMode: true,
			},
			{
				characterCount: 10,
				benchmarkType: BenchmarkType.Perspective,
				runInCorrectnessMode: true,
			},
			{
				characterCount: 100,
				benchmarkType: BenchmarkType.Measurement,
				runInCorrectnessMode: true,
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
				runInCorrectnessMode: true,
			},
			{
				keyLength: 100,
				benchmarkType: BenchmarkType.Measurement,
				runInCorrectnessMode: true,
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
					benchmarkIt({
						only: false,
						type: BenchmarkType.Measurement,
						title: `Op size by inserted character count`,
						run: async () => {
							const points: { x: number; y: number }[] = [];

							for (const { characterCount } of filteredCharacterCountConfigs) {
								const localOps: ISequencedDocumentMessage[] = [];
								const key = getPropertyKey(defaultKeyLength);
								const tree = createConnectedTree();
								const view = tree.viewWith(viewConfig);
								view.initialize(makeTree(defaultTreeDepth, key, ""));
								registerOpListener(tree, localOps);

								const textNode = getLeaf(view.root, key);
								textNode.insertAt(0, makeTestString(characterCount));
								assert.equal(textNode.characterCount(), characterCount);

								const { "Total Op Size (Bytes)": totalOpSize } =
									getOperationsStats(localOps);
								points.push({ x: characterCount, y: totalOpSize });
							}

							const { slope, intercept } = assertLinear({ points });
							return [
								{
									name: "bytes per inserted character",
									value: slope,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
									significance: "Primary",
								},
								{
									name: "fixed insert op overhead",
									value: intercept,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
								},
							] as CollectedData;
						},
					});
				});

				describe(`Op size by tree depth`, () => {
					benchmarkIt({
						only: false,
						type: BenchmarkType.Measurement,
						title: `Op size by tree depth`,
						run: async () => {
							const points: { x: number; y: number }[] = [];

							for (const { depth } of filteredDepthConfigs) {
								const localOps: ISequencedDocumentMessage[] = [];
								const key = getPropertyKey(defaultKeyLength);
								const tree = createConnectedTree();
								const view = tree.viewWith(viewConfig);
								view.initialize(makeTree(depth, key, ""));
								registerOpListener(tree, localOps);

								const textNode = getLeaf(view.root, key);
								textNode.insertAt(0, makeTestString(defaultCharacterCount));
								assert.equal(textNode.characterCount(), defaultCharacterCount);

								const { "Total Op Size (Bytes)": totalOpSize } =
									getOperationsStats(localOps);
								points.push({ x: depth, y: totalOpSize });
							}

							const { slope, intercept } = assertLinear({ points });
							return [
								{
									name: "bytes per path level (insert)",
									value: slope,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
									significance: "Primary",
								},
								{
									name: "base insert op size",
									value: intercept,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
								},
							] as CollectedData;
						},
					});
				});

				describe(`Op size by property key length`, () => {
					benchmarkIt({
						only: false,
						type: BenchmarkType.Measurement,
						title: `Op size by property key length`,
						run: async () => {
							const points: { x: number; y: number }[] = [];

							for (const { keyLength } of filteredKeyConfigs) {
								const localOps: ISequencedDocumentMessage[] = [];
								const key = getPropertyKey(keyLength);
								const tree = createConnectedTree();
								const view = tree.viewWith(viewConfig);
								view.initialize(makeTree(defaultTreeDepth, key, ""));
								registerOpListener(tree, localOps);

								const textNode = getLeaf(view.root, key);
								textNode.insertAt(0, makeTestString(defaultCharacterCount));
								assert.equal(textNode.characterCount(), defaultCharacterCount);

								const { "Total Op Size (Bytes)": totalOpSize } =
									getOperationsStats(localOps);
								points.push({ x: keyLength, y: totalOpSize });
							}

							const { slope, intercept } = assertLinear({ points });
							return [
								{
									name: "bytes per key character (insert)",
									value: slope,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
									significance: "Primary",
								},
								{
									name: "base insert op size (by key)",
									value: intercept,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
								},
							] as CollectedData;
						},
					});
				});
			});

			describe("Remove characters", () => {
				describe(`Op size by removed character count`, () => {
					benchmarkIt({
						only: false,
						type: BenchmarkType.Measurement,
						title: `Op size by removed character count`,
						run: async () => {
							const opSizes: number[] = [];

							for (const { characterCount } of filteredCharacterCountConfigs) {
								const localOps: ISequencedDocumentMessage[] = [];
								const key = getPropertyKey(defaultKeyLength);
								const tree = createConnectedTree();
								const view = tree.viewWith(viewConfig);
								view.initialize(
									makeTree(defaultTreeDepth, key, makeTestString(characterCount)),
								);
								registerOpListener(tree, localOps);

								const textNode = getLeaf(view.root, key);
								textNode.removeRange(0, characterCount);
								assert.equal(textNode.characterCount(), 0);

								const { "Total Op Size (Bytes)": totalOpSize } =
									getOperationsStats(localOps);
								opSizes.push(totalOpSize);
							}

							// Remove ops encode a (start, count) range, not the removed characters,
							// so op size should be essentially independent of character count.
							assertApproximatelyConstant({ sizes: opSizes, maxDeltaBytes: 20 });
							const avgOpSize = opSizes.reduce((a, b) => a + b, 0) / opSizes.length;
							return [
								{
									name: "fixed remove op size",
									value: avgOpSize,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
									significance: "Primary",
								},
							] as CollectedData;
						},
					});
				});

				describe(`Op size by tree depth`, () => {
					benchmarkIt({
						only: false,
						type: BenchmarkType.Measurement,
						title: `Op size by tree depth`,
						run: async () => {
							const points: { x: number; y: number }[] = [];

							for (const { depth } of filteredDepthConfigs) {
								const localOps: ISequencedDocumentMessage[] = [];
								const key = getPropertyKey(defaultKeyLength);
								const tree = createConnectedTree();
								const view = tree.viewWith(viewConfig);
								view.initialize(
									makeTree(depth, key, makeTestString(defaultCharacterCount)),
								);
								registerOpListener(tree, localOps);

								const textNode = getLeaf(view.root, key);
								textNode.removeRange(0, defaultCharacterCount);
								assert.equal(textNode.characterCount(), 0);

								const { "Total Op Size (Bytes)": totalOpSize } =
									getOperationsStats(localOps);
								points.push({ x: depth, y: totalOpSize });
							}

							const { slope, intercept } = assertLinear({ points });
							return [
								{
									name: "bytes per path level (remove)",
									value: slope,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
									significance: "Primary",
								},
								{
									name: "base remove op size",
									value: intercept,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
								},
							] as CollectedData;
						},
					});
				});

				describe(`Op size by property key length`, () => {
					benchmarkIt({
						only: false,
						type: BenchmarkType.Measurement,
						title: `Op size by property key length`,
						run: async () => {
							const points: { x: number; y: number }[] = [];

							for (const { keyLength } of filteredKeyConfigs) {
								const localOps: ISequencedDocumentMessage[] = [];
								const key = getPropertyKey(keyLength);
								const tree = createConnectedTree();
								const view = tree.viewWith(viewConfig);
								view.initialize(
									makeTree(defaultTreeDepth, key, makeTestString(defaultCharacterCount)),
								);
								registerOpListener(tree, localOps);

								const textNode = getLeaf(view.root, key);
								textNode.removeRange(0, defaultCharacterCount);
								assert.equal(textNode.characterCount(), 0);

								const { "Total Op Size (Bytes)": totalOpSize } =
									getOperationsStats(localOps);
								points.push({ x: keyLength, y: totalOpSize });
							}

							const { slope, intercept } = assertLinear({ points });
							return [
								{
									name: "bytes per key character (remove)",
									value: slope,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
									significance: "Primary",
								},
								{
									name: "base remove op size (by key)",
									value: intercept,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
								},
							] as CollectedData;
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
				runInCorrectnessMode: true,
			},
			{
				stringLength: 100,
				benchmarkType: BenchmarkType.Measurement,
				runInCorrectnessMode: true,
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
			benchmarkIt({
				only: false,
				type: BenchmarkType.Measurement,
				title: `exportVerbose encoded size by string length`,
				run: async () => {
					const points: { x: number; y: number }[] = [];

					for (const { stringLength } of filteredConfigs) {
						const independentTree = createIndependentTreeAlpha({});
						const view = independentTree.viewWith(viewConfig);
						view.initialize(TextAsTree.Tree.fromString(makeTestString(stringLength)));

						const encoded = TreeAlpha.exportVerbose(view.root);
						const encodedSize = utf8Length(encoded as JsonCompatibleReadOnly);
						points.push({ x: stringLength, y: encodedSize });
					}

					const { slope, intercept } = assertLinear({ points });
					return [
						{
							name: "bytes per character (encoded)",
							value: slope,
							units: "bytes",
							type: ValueType.SmallerIsBetter,
							significance: "Primary",
						},
						{
							name: "fixed encoding overhead",
							value: intercept,
							units: "bytes",
							type: ValueType.SmallerIsBetter,
						},
					] as CollectedData;
				},
			});
		});

		// TODO: formatted text benchmarks.
	});
});
