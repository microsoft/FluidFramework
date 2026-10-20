/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { IsoBuffer } from "@fluid-internal/client-utils";
import {
	BenchmarkType,
	benchmarkDuration,
	benchmarkDurationBatchless,
	benchmarkIt,
	benchmarkMemoryUse,
	isInPerformanceTestingMode,
	memoryUseOfValue,
	ValueType,
	type CollectedData,
	currentBenchmarkMode,
	BenchmarkMode,
} from "@fluid-tools/benchmark";
import type { IChannelServices } from "@fluidframework/datastore-definitions/internal";
import type { ISummaryTree } from "@fluidframework/driver-definitions";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	createIdCompressor,
	SerializationVersion,
} from "@fluidframework/id-compressor/internal";
import { convertSummaryTreeToITree } from "@fluidframework/runtime-utils/internal";
import {
	MockContainerRuntimeFactory,
	MockDeltaConnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import type { IForestSubscription } from "../../core/index.js";
import {
	ForestTypeOptimized,
	ForestTypeReference,
	Tree,
	TreeAlpha,
	createIndependentTreeAlpha,
	type ForestType,
} from "../../shared-tree/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	type TreeView,
	type ValidateRecursiveSchema,
} from "../../simple-tree/index.js";
import { PlainText } from "../../text/index.js";
import { configuredSharedTree } from "../../treeFactory.js";
import type { JsonCompatibleReadOnly } from "../../util/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { iterationSettings } from "../memory/utils.js";
// eslint-disable-next-line import-x/no-internal-modules
import { FormattedTextTest } from "../text/formattedTextTest.js";
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

describe("Text benchmarks", () => {
	configureBenchmarkHooks();

	describe("op size", () => {
		const schemaFactory = new SchemaFactory("bench.textDepth");

		// A single recursive map schema covers all key-length variants.
		class WrapperMap extends schemaFactory.mapRecursive("bench.textDepth.WrapperMap", [
			() => WrapperMap,
			PlainText.Tree,
		]) {}
		{
			type _check = ValidateRecursiveSchema<typeof WrapperMap>;
		}

		const viewConfiguration = new TreeViewConfiguration({ schema: WrapperMap });

		function getPropertyKey(keyLength: number): string {
			return makeTestString(keyLength);
		}

		function makeTree(depth: number, key: string, text: string): WrapperMap {
			const textNode = PlainText.Tree.fromString(text);
			let current: WrapperMap = new WrapperMap([[key, textNode]]);
			for (let i = 1; i < depth; i++) {
				current = new WrapperMap([[key, current]]);
			}
			return current;
		}

		function getLeaf(root: WrapperMap, key: string): PlainText.Tree {
			let current: WrapperMap | PlainText.Tree = root;
			while (Tree.is(current, WrapperMap)) {
				const next = current.get(key);
				assert(next !== undefined);
				current = next;
			}
			assert(Tree.is(current, PlainText.Tree));
			return current;
		}

		/**
		 * Depths at which to place the text node within the wrapper tree.
		 * @remarks
		 * A deeper text node results in a longer path in the generated operation, which we expect to increase op size.
		 */
		const depthConfigurations = [
			{ depth: 1, runInCorrectnessMode: true },
			{ depth: 5, runInCorrectnessMode: true },
			{ depth: 25, runInCorrectnessMode: true },
			{ depth: 125, runInCorrectnessMode: false },
		] as const;

		/**
		 * Numbers of characters to insert or remove in each benchmark.
		 */
		const characterCountConfigurations = [
			{
				characterCount: 1,
				runInCorrectnessMode: true,
			},
			{
				characterCount: 10,
				runInCorrectnessMode: true,
			},
			{
				characterCount: 100,
				runInCorrectnessMode: true,
			},
			{
				characterCount: 1000,
				runInCorrectnessMode: false,
			},
		] as const;

		/**
		 * Property key lengths to test.
		 */
		const keyConfigurations = [
			{
				keyLength: 1,
				runInCorrectnessMode: true,
			},
			{
				keyLength: 10,
				runInCorrectnessMode: true,
			},
			{
				keyLength: 100,
				runInCorrectnessMode: true,
			},
			{
				keyLength: 1000,
				runInCorrectnessMode: false,
			},
		] as const;

		// Control values
		const defaultTreeDepth = 1;
		const defaultCharacterCount = 1;
		const defaultKeyLength = 1;

		const filteredDepthConfigurations = depthConfigurations.filter(
			(configuration) => isInPerformanceTestingMode || configuration.runInCorrectnessMode,
		);
		const filteredCharacterCountConfigurations = characterCountConfigurations.filter(
			(configuration) => isInPerformanceTestingMode || configuration.runInCorrectnessMode,
		);
		const filteredKeyConfigurations = keyConfigurations.filter(
			(configuration) => isInPerformanceTestingMode || configuration.runInCorrectnessMode,
		);

		// "Base size" is the fitted intercept for each sweep, with the other dimensions held fixed.
		describe("Plain text", () => {
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `Insert by character count`,
				run: async () => {
					const points: { x: number; y: number }[] = [];

					for (const { characterCount } of filteredCharacterCountConfigurations) {
						const localOperations: ISequencedDocumentMessage[] = [];
						const key = getPropertyKey(defaultKeyLength);
						const tree = createConnectedTree();
						const view = tree.viewWith(viewConfiguration);
						view.initialize(makeTree(defaultTreeDepth, key, ""));
						registerOpListener(tree, localOperations);

						const textNode = getLeaf(view.root, key);
						textNode.insertAt(0, makeTestString(characterCount));
						assert.equal(textNode.characterCount(), characterCount);

						const { "Total Op Size (Bytes)": totalOperationSize } =
							getOperationsStats(localOperations);
						points.push({ x: characterCount, y: totalOperationSize });
					}

					// Variable-length IDs in the character-node encoding cause deviations
					// from exact linearity across the tested character count range.
					// TODO: investigate if this is expected / if we can make this check exact.
					const { slope, intercept } = assertLinear({ points, maxDeviation: 15 });
					return [
						{
							name: "Per character",
							value: slope,
							units: "bytes",
							type: ValueType.SmallerIsBetter,
							significance: "Primary",
						},
						{
							name: "Base size",
							value: intercept,
							units: "bytes",
							type: ValueType.SmallerIsBetter,
							significance: "Primary",
						},
					] satisfies CollectedData;
				},
			});

			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `Insert by tree depth`,
				run: async () => {
					const points: { x: number; y: number }[] = [];

					for (const { depth } of filteredDepthConfigurations) {
						const localOperations: ISequencedDocumentMessage[] = [];
						const key = getPropertyKey(defaultKeyLength);
						const tree = createConnectedTree();
						const view = tree.viewWith(viewConfiguration);
						view.initialize(makeTree(depth, key, ""));
						registerOpListener(tree, localOperations);

						const textNode = getLeaf(view.root, key);
						textNode.insertAt(0, makeTestString(defaultCharacterCount));
						assert.equal(textNode.characterCount(), defaultCharacterCount);

						const { "Total Op Size (Bytes)": totalOperationSize } =
							getOperationsStats(localOperations);
						points.push({ x: depth, y: totalOperationSize });
					}

					// Depth values with more digits in JSON encoding (e.g. 25 vs 5) can
					// cause 1-byte deviations from exact linearity.
					const { slope, intercept } = assertLinear({ points, maxDeviation: 2 });
					return [
						{
							name: "Per path level",
							value: slope,
							units: "bytes",
							type: ValueType.SmallerIsBetter,
							significance: "Primary",
						},
						{
							name: "Base size",
							value: intercept,
							units: "bytes",
							type: ValueType.SmallerIsBetter,
							significance: "Primary",
						},
					] satisfies CollectedData;
				},
			});

			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `Insert by key length`,
				run: async () => {
					const points: { x: number; y: number }[] = [];

					for (const { keyLength } of filteredKeyConfigurations) {
						const localOperations: ISequencedDocumentMessage[] = [];
						const key = getPropertyKey(keyLength);
						const tree = createConnectedTree();
						const view = tree.viewWith(viewConfiguration);
						view.initialize(makeTree(defaultTreeDepth, key, ""));
						registerOpListener(tree, localOperations);

						const textNode = getLeaf(view.root, key);
						textNode.insertAt(0, makeTestString(defaultCharacterCount));
						assert.equal(textNode.characterCount(), defaultCharacterCount);

						const { "Total Op Size (Bytes)": totalOperationSize } =
							getOperationsStats(localOperations);
						points.push({ x: keyLength, y: totalOperationSize });
					}

					const { slope, intercept } = assertLinear({ points });
					return [
						{
							name: "Per key character",
							value: slope,
							units: "bytes",
							type: ValueType.SmallerIsBetter,
							significance: "Primary",
						},
						{
							name: "Base size",
							value: intercept,
							units: "bytes",
							type: ValueType.SmallerIsBetter,
							significance: "Primary",
						},
					] satisfies CollectedData;
				},
			});

			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `Remove by character count`,
				run: async () => {
					const points: { x: number; y: number }[] = [];

					for (const { characterCount } of filteredCharacterCountConfigurations) {
						const localOperations: ISequencedDocumentMessage[] = [];
						const key = getPropertyKey(defaultKeyLength);
						const tree = createConnectedTree();
						const view = tree.viewWith(viewConfiguration);
						view.initialize(makeTree(defaultTreeDepth, key, makeTestString(characterCount)));
						registerOpListener(tree, localOperations);

						const textNode = getLeaf(view.root, key);
						textNode.removeRange(0, characterCount);
						assert.equal(textNode.characterCount(), 0);

						const { "Total Op Size (Bytes)": totalOperationSize } =
							getOperationsStats(localOperations);
						points.push({ x: characterCount, y: totalOperationSize });
					}

					// Remove ops encode a (start, count) range, not the removed characters,
					// so op size is approximately constant regardless of character count.
					// Small deviations (a few bytes) can occur because the count value itself
					// is encoded as a JSON number in the op.
					// TODO: Investigate whether this approximately-constant behavior is
					// intentional — it is unexpected that op size does not scale with character
					// count. Confirm the encoding is working as intended.
					assertApproximatelyConstant({
						sizes: points.map(({ y }) => y),
						maxDeltaBytes: 6,
					});
					// Report the fitted slope and intercept without relaxing the constant-size check.
					// Count encoding can produce a small nonzero slope over the sampled range.
					const { slope, intercept } = assertLinear({ points, maxDeviation: 6 });
					return [
						{
							name: "Per character",
							value: slope,
							units: "bytes",
							type: ValueType.SmallerIsBetter,
							significance: "Primary",
						},
						{
							name: "Base size",
							value: intercept,
							units: "bytes",
							type: ValueType.SmallerIsBetter,
							significance: "Primary",
						},
					] satisfies CollectedData;
				},
			});

			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `Remove by tree depth`,
				run: async () => {
					const points: { x: number; y: number }[] = [];

					for (const { depth } of filteredDepthConfigurations) {
						const localOperations: ISequencedDocumentMessage[] = [];
						const key = getPropertyKey(defaultKeyLength);
						const tree = createConnectedTree();
						const view = tree.viewWith(viewConfiguration);
						view.initialize(makeTree(depth, key, makeTestString(defaultCharacterCount)));
						registerOpListener(tree, localOperations);

						const textNode = getLeaf(view.root, key);
						textNode.removeRange(0, defaultCharacterCount);
						assert.equal(textNode.characterCount(), 0);

						const { "Total Op Size (Bytes)": totalOperationSize } =
							getOperationsStats(localOperations);
						points.push({ x: depth, y: totalOperationSize });
					}

					// Depth values with more digits in JSON encoding (e.g. 25 vs 5) can
					// cause 1-byte deviations from exact linearity.
					const { slope, intercept } = assertLinear({ points, maxDeviation: 2 });
					return [
						{
							name: "Per path level",
							value: slope,
							units: "bytes",
							type: ValueType.SmallerIsBetter,
							significance: "Primary",
						},
						{
							name: "Base size",
							value: intercept,
							units: "bytes",
							type: ValueType.SmallerIsBetter,
							significance: "Primary",
						},
					] satisfies CollectedData;
				},
			});

			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `Remove by key length`,
				run: async () => {
					const points: { x: number; y: number }[] = [];

					for (const { keyLength } of filteredKeyConfigurations) {
						const localOperations: ISequencedDocumentMessage[] = [];
						const key = getPropertyKey(keyLength);
						const tree = createConnectedTree();
						const view = tree.viewWith(viewConfiguration);
						view.initialize(
							makeTree(defaultTreeDepth, key, makeTestString(defaultCharacterCount)),
						);
						registerOpListener(tree, localOperations);

						const textNode = getLeaf(view.root, key);
						textNode.removeRange(0, defaultCharacterCount);
						assert.equal(textNode.characterCount(), 0);

						const { "Total Op Size (Bytes)": totalOperationSize } =
							getOperationsStats(localOperations);
						points.push({ x: keyLength, y: totalOperationSize });
					}

					const { slope, intercept } = assertLinear({ points });
					return [
						{
							name: "Per key character",
							value: slope,
							units: "bytes",
							type: ValueType.SmallerIsBetter,
							significance: "Primary",
						},
						{
							name: "Base size",
							value: intercept,
							units: "bytes",
							type: ValueType.SmallerIsBetter,
							significance: "Primary",
						},
					] satisfies CollectedData;
				},
			});
		});

		// TODO: formatted text benchmarks.
	});

	describe("encoding", () => {
		const testConfigurations = [
			{
				stringLength: 1,
				runInCorrectnessMode: true,
			},
			{
				stringLength: 10,
				runInCorrectnessMode: true,
			},
			{
				stringLength: 100,
				runInCorrectnessMode: true,
			},
			{
				stringLength: 1000,
				runInCorrectnessMode: false,
			},
		] as const;

		// Filter configurations to those that should be run in the current mode (performance or correctness).
		const filteredConfigurations = testConfigurations.filter(
			(configuration) => isInPerformanceTestingMode || configuration.runInCorrectnessMode,
		);

		const viewConfiguration = new TreeViewConfiguration({ schema: PlainText.Tree });

		describe("Plain text", () => {
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `exportVerbose size by string length`,
				run: async () => {
					const points: { x: number; y: number }[] = [];

					for (const { stringLength } of filteredConfigurations) {
						const independentTree = createIndependentTreeAlpha({});
						const view = independentTree.viewWith(viewConfiguration);
						view.initialize(PlainText.Tree.fromString(makeTestString(stringLength)));

						const encoded = TreeAlpha.exportVerbose(view.root);
						const encodedSize = utf8Length(encoded as JsonCompatibleReadOnly);
						points.push({ x: stringLength, y: encodedSize });
					}

					// "Base size" is the fitted intercept at zero string length.
					const { slope, intercept } = assertLinear({ points });
					return [
						{
							name: "Per character",
							value: slope,
							units: "bytes",
							type: ValueType.SmallerIsBetter,
							significance: "Primary",
						},
						{
							name: "Base size",
							value: intercept,
							units: "bytes",
							type: ValueType.SmallerIsBetter,
							significance: "Primary",
						},
					] satisfies CollectedData;
				},
			});
		});

		// TODO: formatted text benchmarks.
	});

	// Whole-document benchmarks vary document size and forest implementation.
	// Most apply to both plain and formatted text.
	describe("whole document", () => {
		/** Upper bound on each duration benchmark's wall-clock so the full sweep stays tractable. */
		const maxBenchmarkDurationSeconds = 5;

		/** Document sizes (in characters) swept by the whole-document benchmarks. */
		const documentSizeConfigurations = [
			{ size: 10, benchmarkType: BenchmarkType.Perspective, runInCorrectnessMode: true },
			{ size: 100, benchmarkType: BenchmarkType.Perspective, runInCorrectnessMode: true },
			{ size: 1000, benchmarkType: BenchmarkType.Measurement, runInCorrectnessMode: false },
			{ size: 10000, benchmarkType: BenchmarkType.Measurement, runInCorrectnessMode: false },
		] as const;
		const filteredDocumentSizeConfigurations = documentSizeConfigurations.filter(
			(configuration) =>
				currentBenchmarkMode === BenchmarkMode.Performance ||
				configuration.runInCorrectnessMode,
		);

		const plainTextAdapter = createTextBenchmarkAdapter(
			new TreeViewConfiguration({ schema: PlainText.Tree }),
			(content) => PlainText.Tree.fromString(content),
		);
		const formattedTextAdapter = createTextBenchmarkAdapter(
			new TreeViewConfiguration({ schema: FormattedTextTest.Tree }),
			(content) => FormattedTextTest.Tree.fromString(content),
		);

		/** Text implementations tested independently of the forest configuration. */
		const textConfigurations = [
			{ name: "Plain text", adapter: plainTextAdapter },
			{ name: "Formatted text", adapter: formattedTextAdapter },
		] as const;

		/** Forest implementations tested with both plain and formatted text. */
		const forestConfigurations = [
			{ name: "ChunkedForest", forest: ForestTypeOptimized },
			{ name: "ObjectForest", forest: ForestTypeReference },
		] as const;

		// #region Document construction helpers

		/**
		 * A plain or formatted text root, hydrated or unhydrated.
		 */
		type TextRoot = PlainText.Tree | FormattedTextTest.Tree;

		/**
		 * Gets the forest through the view's internal checkout.
		 * The forest-footprint benchmark retains only the forest, not the view or checkout.
		 */
		function getForestOf(view: object): IForestSubscription {
			return (view as { readonly checkout: { readonly forest: IForestSubscription } }).checkout
				.forest;
		}

		/**
		 * Binds schema-specific construction without fixing a forest or document size.
		 * Keeping the schema and its content together preserves their types when iterating over adapters.
		 */
		function createTextBenchmarkAdapter<TSchema extends ImplicitFieldSchema>(
			viewConfiguration: TreeViewConfiguration<TSchema>,
			fromString: (
				content: string,
			) => TextRoot & InsertableTreeFieldFromImplicitField<TSchema>,
		) {
			return {
				fromString,
				buildDocument(content: string, forest: ForestType): TreeView<TSchema> {
					const view = createIndependentTreeAlpha({ forest }).viewWith(viewConfiguration);
					view.initialize(fromString(content));
					return view;
				},
				attachSummary: (content: string, forest: ForestType) =>
					getTextAttachSummary(viewConfiguration, fromString(content), forest),
			};
		}

		/** The SharedTree factory the summary-size and load benchmarks build on, for a given forest. */
		const getTreeFactory = (forest: ForestType) =>
			configuredSharedTree({ forest }).getFactory();

		/**
		 * Builds an attached text document of `content` on `forest` and returns its attach summary together
		 * with the `idCompressor` that produced it.
		 */
		function getTextAttachSummary<TSchema extends ImplicitFieldSchema>(
			viewConfiguration: TreeViewConfiguration<TSchema>,
			content: InsertableTreeFieldFromImplicitField<TSchema>,
			forest: ForestType,
		): {
			readonly summary: ISummaryTree;
			readonly idCompressor: ReturnType<typeof createIdCompressor>;
		} {
			const idCompressor = createIdCompressor(SerializationVersion.V3);
			const runtime = new MockFluidDataStoreRuntime({ idCompressor });
			const containerRuntimeFactory = new MockContainerRuntimeFactory();
			containerRuntimeFactory.createContainerRuntime(runtime);
			const tree = getTreeFactory(forest).create(runtime, "tree");
			tree.connect({
				deltaConnection: runtime.createDeltaConnection(),
				objectStorage: new MockStorage(),
			});
			const view = tree.viewWith(viewConfiguration);
			view.initialize(content);
			// Sequence the initialization op so the content is part of the attach summary (and the
			// compressor's creation range is finalized).
			containerRuntimeFactory.processAllMessages();
			return { summary: tree.getAttachSummary(true).summary, idCompressor };
		}

		/**
		 * Types `count` single characters at the middle of the document. One `insertAt` per character,
		 * recomputing the middle each time — mirroring sustained typing.
		 * @returns The index at which the last character was inserted, so the caller can remove exactly that
		 * character to restore the document length (independent of whether `count` is even or odd).
		 */
		function typeMiddle(root: TextRoot, count: number): number {
			let lastIndex = -1;
			for (let i = 0; i < count; i++) {
				const middle = Math.floor(root.characterCount() / 2);
				root.insertAt(middle, i % 2 === 0 ? "a" : "b");
				lastIndex = middle;
			}
			return lastIndex;
		}

		// #endregion

		for (const { name, adapter } of textConfigurations) {
			describe(name, () => {
				const makeUnhydratedRoot = (size: number): TextRoot =>
					adapter.fromString(makeTestString(size));

				// Unhydrated nodes do not use a forest, so measure them once per text implementation.
				describe("Unhydrated construction and read", () => {
					for (const { size, benchmarkType } of filteredDocumentSizeConfigurations) {
						benchmarkIt({
							type: benchmarkType,
							title: `${size}-character document`,
							...benchmarkDurationBatchless({
								benchmarkFn: (state) => {
									let running: boolean;
									do {
										running = state.time(() => {
											const root = makeUnhydratedRoot(size);
											root.fullString();
										});
									} while (running);
								},
								maxBenchmarkDurationSeconds,
							}),
						});
					}
				});

				for (const { name: forestName, forest } of forestConfigurations) {
					describe(forestName, () => {
						const buildDocument = (size: number) =>
							adapter.buildDocument(makeTestString(size), forest);
						const attachSummary = (size: number) =>
							adapter.attachSummary(makeTestString(size), forest);

						// The serialized attach-summary byte size of a document
						describe("Attach-summary JSON size", () => {
							for (const { size, benchmarkType } of filteredDocumentSizeConfigurations) {
								benchmarkIt({
									type: benchmarkType,
									title: `${size}-character document`,
									run: async () => {
										const { summary } = attachSummary(size);
										const summarySize = IsoBuffer.from(JSON.stringify(summary)).byteLength;
										return [
											{
												name: "Summary size",
												value: summarySize,
												units: "bytes",
												type: ValueType.SmallerIsBetter,
												significance: "Primary",
											},
										] satisfies CollectedData;
									},
								});
							}
						});

						// The heap retained by a fresh, history-free document of N characters. `memoryUseOfValue` measures
						// the memory uniquely retained by the returned view, which transitively holds the checkout, forest,
						// and simple-tree nodes.
						describe("Document retained memory", () => {
							for (const { size, benchmarkType } of filteredDocumentSizeConfigurations) {
								benchmarkIt({
									type: benchmarkType,
									title: `${size}-character document`,
									...benchmarkMemoryUse({
										...memoryUseOfValue(() => buildDocument(size)),
										...iterationSettings,
									}),
								});
							}
						});

						// Compare the forest's retained memory with the whole document's retained memory above.
						describe("Forest retained memory", () => {
							for (const { size, benchmarkType } of filteredDocumentSizeConfigurations) {
								benchmarkIt({
									type: benchmarkType,
									title: `${size}-character document`,
									...benchmarkMemoryUse({
										...memoryUseOfValue(() => getForestOf(buildDocument(size))),
										...iterationSettings,
									}),
								});
							}
						});

						// Time to read the whole document's content via `fullString`. Each call re-walks the forest cursor over
						// the whole document. The document is built once and read repeatedly, so this measures that repeated
						// read in isolation, excluding the build cost.
						describe("Read (fullString)", () => {
							for (const { size, benchmarkType } of filteredDocumentSizeConfigurations) {
								benchmarkIt({
									type: benchmarkType,
									title: `${size}-character document`,
									...benchmarkDurationBatchless({
										benchmarkFn: (state) => {
											const root = buildDocument(size).root;
											let running: boolean;
											do {
												running = state.time(() => {
													root.fullString();
												});
											} while (running);
										},
										maxBenchmarkDurationSeconds,
									}),
								});
							}
						});

						// Time per keystroke when typing into the middle of a document of N characters. The document is built
						// once; each timed sample types one character and an untimed remove restores the document to `size`.
						// Rebuild every `size` edits to discard the removed roots retained for undo.
						describe("Insert 1 character in the middle", () => {
							for (const { size, benchmarkType } of filteredDocumentSizeConfigurations) {
								benchmarkIt({
									type: benchmarkType,
									title: `${size}-character document`,
									...benchmarkDurationBatchless({
										benchmarkFn: (state) => {
											let root = buildDocument(size).root;
											let editsSinceBuild = 0;
											let running: boolean;
											do {
												let typedIndex = -1;
												running = state.time(() => {
													typedIndex = typeMiddle(root, 1);
												});
												// Untimed restore: remove the just-typed character to hold the document at `size`.
												root.removeRange(typedIndex, typedIndex + 1);
												if (++editsSinceBuild >= size) {
													// Rebuild to flush the removed roots the restores accumulate.
													root = buildDocument(size).root;
													editsSinceBuild = 0;
												}
											} while (running);
										},
										maxBenchmarkDurationSeconds,
									}),
								});
							}
						});

						if (adapter === formattedTextAdapter) {
							// Each timed sample toggles bold across the whole document so every sample changes the formatting.
							// Rebuild the document periodically, outside the timed region, to bound its edit history.
							describe("Formatting (formatRange)", () => {
								/** Samples between document rebuilds, to bound the edit log the reused document accumulates. */
								const samplesPerRebuild = 16;
								for (const { size, benchmarkType } of filteredDocumentSizeConfigurations) {
									benchmarkIt({
										type: benchmarkType,
										title: `${size}-character document`,
										...benchmarkDurationBatchless({
											benchmarkFn: (state) => {
												const buildRoot = () =>
													formattedTextAdapter.buildDocument(makeTestString(size), forest)
														.root;
												let root = buildRoot();

												let bold = true;
												let samplesSinceBuild = 0;
												let running: boolean;
												do {
													running = state.time(() => {
														root.formatRange(undefined, undefined, { bold });
													});
													bold = !bold;
													if (++samplesSinceBuild >= samplesPerRebuild) {
														root = buildRoot();
														bold = true;
														samplesSinceBuild = 0;
													}
												} while (running);
											},
											maxBenchmarkDurationSeconds,
											// The largest size of these tests is quite slow but is realistic and needs to be optimized.
											// As the scaling for chunked forest is showing to be worse than linear with respect to string length,
											// Keeping this test is valuable, but slow, so save some time with a reduced minimum sample count.
											// TODO: optimize this scenario, and remove this reduced sample count setting.
											minSampleCount: 3,
										}),
									});
								}
							});
						}

						// Time construction and fullString together for a hydrated document.
						describe("Hydrated construction and read", () => {
							for (const { size, benchmarkType } of filteredDocumentSizeConfigurations) {
								benchmarkIt({
									type: benchmarkType,
									title: `${size}-character document`,
									...benchmarkDurationBatchless({
										benchmarkFn: (state) => {
											let running: boolean;
											do {
												running = state.time(() => {
													buildDocument(size).root.fullString();
												});
											} while (running);
										},
										maxBenchmarkDurationSeconds,
									}),
								});
							}
						});

						describe("Load from summary", () => {
							for (const { size, benchmarkType } of filteredDocumentSizeConfigurations) {
								benchmarkIt({
									type: benchmarkType,
									title: `${size}-character document`,
									...benchmarkDuration({
										benchmarkFnCustom: async (state) => {
											const { summary, idCompressor } = attachSummary(size);
											const summaryTree = convertSummaryTreeToITree(summary);
											await state.timeAllBatchesAsync(async () => {
												const services: IChannelServices = {
													deltaConnection: new MockDeltaConnection(
														() => 0,
														() => {},
													),
													objectStorage: new MockStorage(summaryTree),
												};
												// Load with the same compressor and forest type used to produce the summary.
												const datastoreRuntime = new MockFluidDataStoreRuntime({
													idCompressor,
												});
												const factory = getTreeFactory(forest);
												await factory.load(
													datastoreRuntime,
													"test",
													services,
													factory.attributes,
												);
											});
										},
									}),
								});
							}
						});
					});
				}
			});
		}
	});
});
