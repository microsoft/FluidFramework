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
} from "@fluid-tools/benchmark";
import type { IChannelServices } from "@fluidframework/datastore-definitions/internal";
import type { ISummaryTree } from "@fluidframework/driver-definitions";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
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
	type ITreePrivate,
} from "../../shared-tree/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	type TreeNode,
	type TreeView,
	type ValidateRecursiveSchema,
} from "../../simple-tree/index.js";
import { FormattedTextAsTreeDefault, TextAsTree } from "../../text/index.js";
import { configuredSharedTree } from "../../treeFactory.js";
import type { JsonCompatibleReadOnly } from "../../util/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { iterationSettings } from "../memory/utils.js";
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

		const viewConfiguration = new TreeViewConfiguration({ schema: WrapperMap });

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
		 * A deeper text node results in a longer path in the generated operation, which we expect to increase op size.
		 */
		const depthConfigurations = [
			{ depth: 1, benchmarkType: BenchmarkType.Measurement, runInCorrectnessMode: true },
			{ depth: 5, benchmarkType: BenchmarkType.Perspective, runInCorrectnessMode: true },
			{ depth: 25, benchmarkType: BenchmarkType.Measurement, runInCorrectnessMode: true },
			{ depth: 125, benchmarkType: BenchmarkType.Perspective, runInCorrectnessMode: false },
		] as const;

		/**
		 * Numbers of characters to insert or remove in each benchmark.
		 */
		const characterCountConfigurations = [
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
		const keyConfigurations = [
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

		const filteredDepthConfigurations = depthConfigurations.filter(
			(configuration) => isInPerformanceTestingMode || configuration.runInCorrectnessMode,
		);
		const filteredCharacterCountConfigurations = characterCountConfigurations.filter(
			(configuration) => isInPerformanceTestingMode || configuration.runInCorrectnessMode,
		);
		const filteredKeyConfigurations = keyConfigurations.filter(
			(configuration) => isInPerformanceTestingMode || configuration.runInCorrectnessMode,
		);

		describe("Plain text", () => {
			describe("Insert characters", () => {
				describe(`Op size by inserted character count`, () => {
					benchmarkIt({
						type: BenchmarkType.Measurement,
						title: `Op size by inserted character count`,
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
									name: "bytes per inserted character",
									value: slope,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
									significance: "Primary",
								},
								{
									name: "fixed insert op overhead (measured by variable character count)",
									value: intercept,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
									significance: "Primary",
								},
							] satisfies CollectedData;
						},
					});
				});

				describe(`Op size by tree depth`, () => {
					benchmarkIt({
						type: BenchmarkType.Measurement,
						title: `Op size by tree depth`,
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
									name: "bytes per path level (insert)",
									value: slope,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
									significance: "Primary",
								},
								{
									name: "base insert op size (measured by variable path length)",
									value: intercept,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
									significance: "Primary",
								},
							] satisfies CollectedData;
						},
					});
				});

				describe(`Op size by property key length`, () => {
					benchmarkIt({
						type: BenchmarkType.Measurement,
						title: `Op size by property key length`,
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
									name: "bytes per key character (insert)",
									value: slope,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
									significance: "Primary",
								},
								{
									name: "base insert op size (measured by variable key length)",
									value: intercept,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
									significance: "Primary",
								},
							] satisfies CollectedData;
						},
					});
				});
			});

			describe("Remove characters", () => {
				describe(`Op size by removed character count`, () => {
					benchmarkIt({
						type: BenchmarkType.Measurement,
						title: `Op size by removed character count`,
						run: async () => {
							const operationSizes: number[] = [];

							for (const { characterCount } of filteredCharacterCountConfigurations) {
								const localOperations: ISequencedDocumentMessage[] = [];
								const key = getPropertyKey(defaultKeyLength);
								const tree = createConnectedTree();
								const view = tree.viewWith(viewConfiguration);
								view.initialize(
									makeTree(defaultTreeDepth, key, makeTestString(characterCount)),
								);
								registerOpListener(tree, localOperations);

								const textNode = getLeaf(view.root, key);
								textNode.removeRange(0, characterCount);
								assert.equal(textNode.characterCount(), 0);

								const { "Total Op Size (Bytes)": totalOperationSize } =
									getOperationsStats(localOperations);
								operationSizes.push(totalOperationSize);
							}

							// Remove ops encode a (start, count) range, not the removed characters,
							// so op size is approximately constant regardless of character count.
							// Small deviations (a few bytes) can occur because the count value itself
							// is encoded as a JSON number in the op.
							// TODO: Investigate whether this approximately-constant behavior is
							// intentional — it is unexpected that op size does not scale with character
							// count. Confirm the encoding is working as intended.
							assertApproximatelyConstant({ sizes: operationSizes, maxDeltaBytes: 6 });
							const referenceSize = operationSizes[0];
							assert(referenceSize !== undefined);
							return [
								{
									name: "remove operation size (approximately constant by character count)",
									value: referenceSize,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
									significance: "Primary",
								},
							] satisfies CollectedData;
						},
					});
				});

				describe(`Op size by tree depth`, () => {
					benchmarkIt({
						type: BenchmarkType.Measurement,
						title: `Op size by tree depth`,
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
									name: "bytes per path level (remove)",
									value: slope,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
									significance: "Primary",
								},
								{
									name: "base remove op size (measured by variable path length)",
									value: intercept,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
									significance: "Primary",
								},
							] satisfies CollectedData;
						},
					});
				});

				describe(`Op size by property key length`, () => {
					benchmarkIt({
						type: BenchmarkType.Measurement,
						title: `Op size by property key length`,
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
									name: "bytes per key character (remove)",
									value: slope,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
									significance: "Primary",
								},
								{
									name: "base remove op size (measured by variable key length)",
									value: intercept,
									units: "bytes",
									type: ValueType.SmallerIsBetter,
									significance: "Primary",
								},
							] satisfies CollectedData;
						},
					});
				});
			});
		});

		// TODO: formatted text benchmarks.
	});

	describe("TextDomain encoding benchmarks", () => {
		const testConfigurations = [
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

		// Filter configurations to those that should be run in the current mode (performance or correctness).
		const filteredConfigurations = testConfigurations.filter(
			(configuration) => isInPerformanceTestingMode || configuration.runInCorrectnessMode,
		);

		const viewConfiguration = new TreeViewConfiguration({ schema: TextAsTree.Tree });

		describe("TextAsTree.Tree node encoded size", () => {
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `exportVerbose encoded size by string length`,
				run: async () => {
					const points: { x: number; y: number }[] = [];

					for (const { stringLength } of filteredConfigurations) {
						const independentTree = createIndependentTreeAlpha({});
						const view = independentTree.viewWith(viewConfiguration);
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
							significance: "Primary",
						},
					] satisfies CollectedData;
				},
			});
		});

		// TODO: formatted text benchmarks.
	});

	// Testing Suite that focuses on whole-document performance/memory measurements for text at varying doc sizes.
	describe("TextDomain whole-document benchmarks", () => {
		/** Upper bound on each duration benchmark's wall-clock so the full sweep stays tractable. */
		const maxBenchmarkDurationSeconds = 5;

		/** Document sizes (in characters) swept by the whole-document benchmarks. */
		const documentSizeConfigurations = [
			{ size: 10, benchmarkType: BenchmarkType.Perspective, runInCorrectnessMode: true },
			{ size: 100, benchmarkType: BenchmarkType.Perspective, runInCorrectnessMode: true },
			{ size: 1000, benchmarkType: BenchmarkType.Measurement, runInCorrectnessMode: true },
			{ size: 10000, benchmarkType: BenchmarkType.Measurement, runInCorrectnessMode: false },
		] as const;
		const filteredDocumentSizeConfigurations = documentSizeConfigurations.filter(
			(configuration) => isInPerformanceTestingMode || configuration.runInCorrectnessMode,
		);

		// #region Document construction helpers

		const plainTextViewConfiguration = new TreeViewConfiguration({ schema: TextAsTree.Tree });
		const formattedTextViewConfiguration = new TreeViewConfiguration({
			schema: FormattedTextAsTreeDefault.Tree,
		});

		/**
		 * The subset of the text-node API the whole-document benchmarks use. Both {@link TextAsTree.Tree}
		 * and {@link FormattedTextAsTreeDefault.Tree} share these, so the read/edit helpers below work
		 * against either domain (and against an unhydrated node).
		 */
		type TextRoot = TreeNode & {
			insertAt(index: number, additionalCharacters: string): void;
			removeRange(start: number | undefined, end: number | undefined): void;
			characterCount(): number;
			fullString(): string;
		};

		/**
		 * A retained text-document view. Formatted and plain have different node schemas, so the view's
		 * schema parameter is erased to the common handle here; what they share and all the benchmarks use
		 * is a {@link TextRoot} at the root. Narrowing `root` to `TextRoot` lets the benchmarks read/edit the
		 * document without a per-access cast.
		 */
		type TextDocumentView = TreeView<ImplicitFieldSchema> & { readonly root: TextRoot };

		/**
		 * Reaches the forest backing a view. The view is a `SchematizingSimpleTreeView` whose `checkout`
		 * exposes the `IForestSubscription`. This is an internal coupling, but it lets the forest-footprint
		 * benchmark return the forest alone (dropping the view and checkout) so only forest storage is
		 * measured.
		 */
		function getForestOf(view: object): IForestSubscription {
			return (view as { readonly checkout: { readonly forest: IForestSubscription } }).checkout
				.forest;
		}

		/**
		 * Builds an independent text document of `content` on the optimized chunked forest, returning the
		 * view (which retains the checkout and forest). Its schema is erased to {@link TextDocumentView} — the
		 * common handle whose root is a {@link TextRoot} — so the two domains share one `buildDocument`
		 * signature. The single unsafe cast in this whole flow lives here, at the construction boundary.
		 */
		function buildTextView<TSchema extends ImplicitFieldSchema>(
			viewConfiguration: TreeViewConfiguration<TSchema>,
			content: InsertableTreeFieldFromImplicitField<TSchema>,
			forest: ForestType,
		): TextDocumentView {
			const view = createIndependentTreeAlpha({ forest }).viewWith(viewConfiguration);
			view.initialize(content);
			return view as unknown as TextDocumentView;
		}

		/** The view's root node, typed as the shared {@link TextRoot} editing surface used by both domains. */
		function getRootOf(view: TextDocumentView): TextRoot {
			return view.root;
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
			const idCompressor = createIdCompressor();
			const runtime = new MockFluidDataStoreRuntime({ idCompressor });
			const containerRuntimeFactory = new MockContainerRuntimeFactory();
			containerRuntimeFactory.createContainerRuntime(runtime);
			const tree = getTreeFactory(forest).create(runtime, "tree");
			tree.connect({
				deltaConnection: runtime.createDeltaConnection(),
				objectStorage: new MockStorage(),
			});
			const view = (tree as unknown as ITreePrivate).kernel.viewWith(viewConfiguration);
			// `viewWith` here returns the alpha view, whose `initialize` is typed over `ReadSchema<TSchema>`;
			// that equals `TSchema` for these (non-recursive) text schemas, but the compiler can't prove it
			// for the open generic, so cast. Every concrete call site passes correctly-typed content.
			view.initialize(content as never);
			// Sequence the initialization op so the content is part of the attach summary (and the
			// compressor's creation range is finalized).
			containerRuntimeFactory.processAllMessages();
			return { summary: tree.getAttachSummary(true).summary, idCompressor };
		}

		/**
		 * A text domain to benchmark: a name plus factories that build a `size` character document in each
		 * of the forms the whole-document benchmarks need.
		 */
		interface TextDomain {
			readonly name: string;
			/** The forest this domain's documents are built on (used by the load benchmark's factory). */
			readonly forest: ForestType;
			/** Builds a hydrated document of `size` characters, whose root is a {@link TextRoot}. */
			buildDocument(size: number): TextDocumentView;
			/** Builds the forest of a `size` character document in isolation (no retained view). */
			buildForest(size: number): IForestSubscription;
			/** Builds an unhydrated root node of `size` characters (not inserted into any tree). */
			makeUnhydratedRoot(size: number): TextRoot;
			/**
			 * Attach summary of a `size` character document, plus the `idCompressor` that produced it (the load
			 * benchmark must load with that same compressor — see {@link getTextAttachSummary}).
			 */
			attachSummary(size: number): {
				readonly summary: ISummaryTree;
				readonly idCompressor: ReturnType<typeof createIdCompressor>;
			};
		}

		// The forests swept: the optimized "chunked" forest the app ships with, and the reference
		// "ObjectForest". Each text domain is built once per forest so the two can be compared side by side.
		const forests = [
			{ name: "chunked", forest: ForestTypeOptimized },
			{ name: "object", forest: ForestTypeReference },
		] as const;

		const textDomains: readonly TextDomain[] = forests.flatMap(
			({ name: forestName, forest }) => [
				{
					name: `plain (${forestName})`,
					forest,
					buildDocument: (size) =>
						buildTextView(
							plainTextViewConfiguration,
							TextAsTree.Tree.fromString(makeTestString(size)),
							forest,
						),
					buildForest: (size) =>
						getForestOf(
							buildTextView(
								plainTextViewConfiguration,
								TextAsTree.Tree.fromString(makeTestString(size)),
								forest,
							),
						),
					makeUnhydratedRoot: (size) =>
						TextAsTree.Tree.fromString(makeTestString(size)) as unknown as TextRoot,
					attachSummary: (size) =>
						getTextAttachSummary(
							plainTextViewConfiguration,
							TextAsTree.Tree.fromString(makeTestString(size)),
							forest,
						),
				},
				{
					name: `formatted (${forestName})`,
					forest,
					buildDocument: (size) =>
						buildTextView(
							formattedTextViewConfiguration,
							FormattedTextAsTreeDefault.Tree.fromString(makeTestString(size)),
							forest,
						),
					buildForest: (size) =>
						getForestOf(
							buildTextView(
								formattedTextViewConfiguration,
								FormattedTextAsTreeDefault.Tree.fromString(makeTestString(size)),
								forest,
							),
						),
					makeUnhydratedRoot: (size) =>
						FormattedTextAsTreeDefault.Tree.fromString(makeTestString(size)) as unknown as TextRoot,
					attachSummary: (size) =>
						getTextAttachSummary(
							formattedTextViewConfiguration,
							FormattedTextAsTreeDefault.Tree.fromString(makeTestString(size)),
							forest,
						),
				},
			],
		);

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

		// The serialized attach-summary byte size of a document
		describe("Summary size", () => {
			for (const domain of textDomains) {
				describe(domain.name, () => {
					for (const { size, benchmarkType } of filteredDocumentSizeConfigurations) {
						benchmarkIt({
							type: benchmarkType,
							title: `summary size of ${size}-character document`,
							run: async () => {
								const { summary } = domain.attachSummary(size);
								const summarySize = IsoBuffer.from(JSON.stringify(summary)).byteLength;
								return [
									{
										name: "summarySize",
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
			}
		});

		// The heap retained by a fresh, history-free document of N characters. `memoryUseOfValue` measures
		// the memory uniquely retained by the returned view, which transitively holds the checkout, forest,
		// and simple-tree nodes.
		describe("Memory use of fresh document", () => {
			for (const domain of textDomains) {
				describe(domain.name, () => {
					for (const { size, benchmarkType } of filteredDocumentSizeConfigurations) {
						benchmarkIt({
							type: benchmarkType,
							title: `memory of ${size}-character document`,
							...benchmarkMemoryUse({
								...memoryUseOfValue(() => domain.buildDocument(size)),
								...iterationSettings,
							}),
						});
					}
				});
			}
		});

		// A forest only memory footprint. Comparing to the results of the full memory footprint from the test
		// above will show how much of the memory footprint is just the forest
		describe("Forest footprint", () => {
			for (const domain of textDomains) {
				describe(domain.name, () => {
					for (const { size, benchmarkType } of filteredDocumentSizeConfigurations) {
						benchmarkIt({
							type: benchmarkType,
							title: `forest footprint of ${size}-character document`,
							...benchmarkMemoryUse({
								...memoryUseOfValue(() => domain.buildForest(size)),
								...iterationSettings,
							}),
						});
					}
				});
			}
		});

		// Time to read the whole document's content via `fullString`. Each call re-walks the forest cursor over
		// the whole document. The document is built once and read repeatedly, so this measures that repeated
		// read in isolation, excluding the build cost.
		describe("End-to-end read (fullString)", () => {
			for (const domain of textDomains) {
				describe(domain.name, () => {
					for (const { size, benchmarkType } of filteredDocumentSizeConfigurations) {
						benchmarkIt({
							type: benchmarkType,
							title: `fullString of ${size}-character document`,
							...benchmarkDurationBatchless({
								benchmarkFn: (state) => {
									const root = getRootOf(domain.buildDocument(size));
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
			}
		});

		// Time per keystroke when typing into the middle of a document of N characters. The document is built
		// once; each timed sample types one character and an untimed remove restores the document to `size`,
		// and the document is rebuilt every `size` edits to flush the removed-roots repair the removes
		// accumulate.
		describe("End-to-end edit (typing)", () => {
			for (const domain of textDomains) {
				describe(domain.name, () => {
					for (const { size, benchmarkType } of filteredDocumentSizeConfigurations) {
						benchmarkIt({
							type: benchmarkType,
							title: `type 1 character into ${size}-character document`,
							...benchmarkDurationBatchless({
								benchmarkFn: (state) => {
									let root = getRootOf(domain.buildDocument(size));
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
											root = getRootOf(domain.buildDocument(size));
											editsSinceBuild = 0;
										}
									} while (running);
								},
								maxBenchmarkDurationSeconds,
							}),
						});
					}
				});
			}
		});

		// Time to construct the tree a view renders over and read its content, in the two backing states a
		// react view can encounter: an unhydrated node versus a hydrated document.
		describe("View hydration", () => {
			for (const domain of textDomains) {
				describe(domain.name, () => {
					for (const { size, benchmarkType } of filteredDocumentSizeConfigurations) {
						benchmarkIt({
							type: benchmarkType,
							title: `unhydrated ${size}-character tree`,
							...benchmarkDurationBatchless({
								benchmarkFn: (state) => {
									let running: boolean;
									do {
										running = state.time(() => {
											const root = domain.makeUnhydratedRoot(size);
											root.fullString();
										});
									} while (running);
								},
								maxBenchmarkDurationSeconds,
							}),
						});

						benchmarkIt({
							type: benchmarkType,
							title: `hydrated ${size}-character tree`,
							...benchmarkDurationBatchless({
								benchmarkFn: (state) => {
									let running: boolean;
									do {
										running = state.time(() => {
											getRootOf(domain.buildDocument(size)).fullString();
										});
									} while (running);
								},
								maxBenchmarkDurationSeconds,
							}),
						});
					}
				});
			}
		});

		describe("Load time from summary", () => {
			for (const domain of textDomains) {
				describe(domain.name, () => {
					for (const { size, benchmarkType } of filteredDocumentSizeConfigurations) {
						benchmarkIt({
							type: benchmarkType,
							title: `load ${size}-character document from summary`,
							...benchmarkDuration({
								benchmarkFnCustom: async (state) => {
									const { summary, idCompressor } = domain.attachSummary(size);
									const summaryTree = convertSummaryTreeToITree(summary);
									await state.timeAllBatchesAsync(async () => {
										const services: IChannelServices = {
											deltaConnection: new MockDeltaConnection(
												() => 0,
												() => {},
											),
											objectStorage: new MockStorage(summaryTree),
										};
										// Load with the same compressor that produced the summary, on the domain's forest.
										const datastoreRuntime = new MockFluidDataStoreRuntime({
											idCompressor,
										});
										const factory = getTreeFactory(domain.forest);
										await factory.load(datastoreRuntime, "test", services, factory.attributes);
									});
								},
							}),
						});
					}
				});
			}
		});
	});
});
