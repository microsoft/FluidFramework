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
	type Measurement,
	type PrimaryMeasurement,
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
	type OperationsStats,
} from "./opBenchmarkUtilities.js";

const isInCorrectnessTestingMode = !isInPerformanceTestingMode;

/**
 * Accumulates benchmark measurements across multiple sweep configs.
 *
 * The first measurement added becomes the {@link PrimaryMeasurement}; all subsequent ones are
 * secondary. Call {@link build} at the end of the sweep to get the final {@link CollectedData}.
 */
function createMeasurementCollector(): {
	/** Adds a single measurement, promoting it to primary if none has been added yet. */
	add(measurement: Measurement): void;
	/** Returns the accumulated {@link CollectedData}. Throws if no measurements were added. */
	build(): CollectedData;
} {
	let primary: PrimaryMeasurement | undefined;
	const rest: Measurement[] = [];

	return {
		add(measurement: Measurement): void {
			if (primary === undefined) {
				const { name, value, units = "bytes", type = ValueType.SmallerIsBetter } = measurement;
				primary = { name, value, units, type, significance: "Primary" };
			} else {
				rest.push(measurement);
			}
		},
		build(): CollectedData {
			const resolvedPrimary = primary;
			assert(resolvedPrimary !== undefined, "At least one measurement must be added before calling build()");
			return [resolvedPrimary, ...rest];
		},
	};
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

		/**
		 * Creates a collector for op-size sweeps.
		 * Extends {@link createMeasurementCollector} with {@link addOpStats}, which records the
		 * three standard op statistics (Total Op Size, Max Op Size, Total Ops) for a single config.
		 */
		function createCollector(): {
			addOpStats(opStats: OperationsStats, label: string): void;
			build(): CollectedData;
		} {
			const { add, build } = createMeasurementCollector();
			return {
				addOpStats(opStats: OperationsStats, label: string): void {
					add({ name: `Total Op Size (Bytes) [${label}]`, value: opStats["Total Op Size (Bytes)"], units: "bytes", type: ValueType.SmallerIsBetter });
					add({ name: `Max Op Size (Bytes) [${label}]`, value: opStats["Max Op Size (Bytes)"], units: "bytes", type: ValueType.SmallerIsBetter });
					add({ name: `Total Ops: [${label}]`, value: opStats["Total Ops:"], units: "count" });
				},
				build,
			};
		}

		describe("Plain text", () => {
			describe("Insert characters", () => {
				describe(`Op size by inserted character count`, () => {
					benchmarkIt({
						only: false,
						type: BenchmarkType.Measurement,
						title: `Op size by inserted character count`,
						run: async () => {
							const opSizeByCharCount: { x: number; y: number }[] = [];
							const measurements = createCollector();

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
								measurements.addOpStats(opStats, `characterCount=${characterCount}`);
							}
							if (isInCorrectnessTestingMode) {
								assertLinear({ points: opSizeByCharCount });
							}

							return measurements.build();
						},
					});
				});

				describe(`Op size by tree depth`, () => {
					benchmarkIt({
						only: false,
						type: BenchmarkType.Measurement,
						title: `Op size by tree depth`,
						run: async () => {
							const opSizeByDepth: { x: number; y: number }[] = [];
							const measurements = createCollector();

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
								measurements.addOpStats(opStats, `depth=${depth}`);
							}
							if (isInCorrectnessTestingMode) {
								assertLinear({ points: opSizeByDepth });
							}

							return measurements.build();
						},
					});
				});

				describe(`Op size by property key length`, () => {
					benchmarkIt({
						only: false,
						type: BenchmarkType.Measurement,
						title: `Op size by property key length`,
						run: async () => {
							const opSizeByKeyLength: { x: number; y: number }[] = [];
							const measurements = createCollector();

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
								measurements.addOpStats(opStats, `keyLength=${keyLength}`);
							}
							if (isInCorrectnessTestingMode) {
								assertLinear({ points: opSizeByKeyLength });
							}

							return measurements.build();
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
							const measurements = createCollector();

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
								measurements.addOpStats(opStats, `characterCount=${characterCount}`);
							}
							// Remove ops encode a (start, count) range, not the removed characters,
							// so op size should be essentially independent of character count.
							if (isInCorrectnessTestingMode) {
								assertApproximatelyConstant({
									sizes: opSizes,
									// Allow for a small amount of variance.
									maxDeltaBytes: 20,
								});
							}

							return measurements.build();
						},
					});
				});

				describe(`Op size by tree depth`, () => {
					benchmarkIt({
						only: false,
						type: BenchmarkType.Measurement,
						title: `Op size by tree depth`,
						run: async () => {
							const opSizeByDepth: { x: number; y: number }[] = [];
							const measurements = createCollector();

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
								measurements.addOpStats(opStats, `depth=${depth}`);
							}
							if (isInCorrectnessTestingMode) {
								assertLinear({ points: opSizeByDepth });
							}

							return measurements.build();
						},
					});
				});

				describe(`Op size by property key length`, () => {
					benchmarkIt({
						only: false,
						type: BenchmarkType.Measurement,
						title: `Op size by property key length`,
						run: async () => {
							const opSizeByKeyLength: { x: number; y: number }[] = [];
							const measurements = createCollector();

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
								measurements.addOpStats(opStats, `keyLength=${keyLength}`);
							}
							if (isInCorrectnessTestingMode) {
								assertLinear({ points: opSizeByKeyLength });
							}

							return measurements.build();
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
					const encodedSizeByLength: { x: number; y: number }[] = [];
					const measurements = createMeasurementCollector();

					for (const { stringLength } of filteredConfigs) {
						const independentTree = createIndependentTreeAlpha({});
						const view = independentTree.viewWith(viewConfig);
						view.initialize(TextAsTree.Tree.fromString("a".repeat(stringLength)));

						const encoded = TreeAlpha.exportVerbose(view.root);
						const encodedSize = utf8Length(encoded as JsonCompatibleReadOnly);

						encodedSizeByLength.push({ x: stringLength, y: encodedSize });
						measurements.add({
							name: `Encoded Size (Bytes) [stringLength=${stringLength}]`,
							value: encodedSize,
							units: "bytes",
							type: ValueType.SmallerIsBetter,
						});
					}
					if (isInCorrectnessTestingMode) {
						assertLinear({ points: encodedSizeByLength });
					}

					return measurements.build();
				},
			});
		});

		// TODO: formatted text benchmarks.
	});
});
