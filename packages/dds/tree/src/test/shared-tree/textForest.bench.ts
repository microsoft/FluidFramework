/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { IsoBuffer } from "@fluid-internal/client-utils";
import {
	type BenchmarkTimer,
	BenchmarkType,
	benchmark,
	benchmarkCustom,
	type IMeasurementReporter,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";
import type { IChannelServices } from "@fluidframework/datastore-definitions/internal";
import type { ISummaryTree } from "@fluidframework/driver-definitions";
import type { ITree } from "@fluidframework/driver-definitions/internal";
import type { IExperimentalIncrementalSummaryContext } from "@fluidframework/runtime-definitions/internal";
import { convertSummaryTreeToITree } from "@fluidframework/runtime-utils/internal";
import {
	MockDeltaConnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { FluidClientVersion, type CodecWriteOptions } from "../../codec/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import {
	ForestSummarizer,
	TreeCompressionStrategy,
	defaultSchemaPolicy,
	type FieldBatchEncodingContext,
} from "../../feature-libraries/index.js";
import {
	ForestTypeOptimized,
	ForestTypeReference,
	type ForestType,
} from "../../shared-tree/index.js";
import {
	incrementalEncodingPolicyForAllowedTypes,
	incrementalSummaryHint,
	permissiveStoredSchemaGenerationOptions,
	SchemaFactoryAlpha,
	toStoredSchema,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
	type ImplicitFieldSchema,
} from "../../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { TextAsTree } from "../../text/textDomain.js";
// eslint-disable-next-line import-x/no-internal-modules
import { FormattedTextAsTree } from "../../text/textDomainFormatted.js";
import { configuredSharedTree } from "../../treeFactory.js";
import {
	TestTreeProviderLite,
	checkoutWithContent,
	configureBenchmarkHooks,
	fieldCursorFromInsertable,
	testIdCompressor,
	testRevisionTagCodec,
	type TreeStoredContentStrict,
} from "../utils.js";

/**
 * Generates a string of the given length for benchmark input.
 */
function generateText(charCount: number): string {
	const chars = "abcdefghijklmnopqrstuvwxyz";
	const segments: string[] = [];
	for (let i = 0; i < charCount; i++) {
		segments.push(chars[i % chars.length]);
	}
	return segments.join("");
}

const forestTypes: [string, ForestType][] = [
	["ObjectForest", ForestTypeReference],
	["ChunkedForest", ForestTypeOptimized],
];

const plainTextSizes = isInPerformanceTestingMode ? [100, 1000, 5000] : [100];
// Formatted text creates ~9 nodes per character (StringAtom + StringTextAtom + string leaf + CharacterFormat + 5 leaf fields).
// This makes large sizes prohibitively expensive for repeated benchmark iterations.
const formattedTextSizes = isInPerformanceTestingMode ? [100, 500, 1000] : [100];
// Per-character edit counts (inserting one char at a time is expensive, especially for formatted).
const plainPerCharCounts = isInPerformanceTestingMode ? [100, 500] : [50];
const formattedPerCharCounts = isInPerformanceTestingMode ? [50, 200] : [50];

interface TextSchemaConfig<TSchema extends ImplicitFieldSchema> {
	name: string;
	schema: TSchema;
	sizes: number[];
	perCharSizes: number[];
	create: (text: string) => unknown;
	getText: (root: unknown) => string;
	insert: (root: unknown, index: number, text: string) => void;
}

const plainTextConfig: TextSchemaConfig<typeof TextAsTree.Tree> = {
	name: "Plain",
	schema: TextAsTree.Tree,
	sizes: plainTextSizes,
	perCharSizes: plainPerCharCounts,
	create: (text: string) => TextAsTree.Tree.fromString(text),
	getText: (root: unknown) => (root as TextAsTree.Tree).fullString(),
	insert: (root: unknown, index: number, text: string) =>
		(root as TextAsTree.Tree).insertAt(index, text),
};

const formattedTextConfig: TextSchemaConfig<typeof FormattedTextAsTree.Tree> = {
	name: "Formatted",
	schema: FormattedTextAsTree.Tree,
	sizes: formattedTextSizes,
	perCharSizes: formattedPerCharCounts,
	create: (text: string) => FormattedTextAsTree.Tree.fromString(text),
	getText: (root: unknown) => (root as FormattedTextAsTree.Tree).fullString(),
	insert: (root: unknown, index: number, text: string) =>
		(root as FormattedTextAsTree.Tree).insertAt(index, text),
};

const textConfigs = [plainTextConfig, formattedTextConfig];

/**
 * Creates a SharedTree with the given text content and forest type, returns the summary tree.
 */
function getTextSummaryTree<TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	initialTree: unknown,
	forestType: ForestType,
	treeEncodeType: TreeCompressionStrategy = TreeCompressionStrategy.Compressed,
): ISummaryTree {
	const factory = configuredSharedTree({
		forest: forestType,
		treeEncodeType,
	}).getFactory();
	const provider = new TestTreeProviderLite(1, factory);
	const tree = provider.trees[0];
	const view = tree.kernel.viewWith(new TreeViewConfiguration({ schema }));
	view.initialize(initialTree as never);
	provider.synchronizeMessages();
	const { summary } = tree.getAttachSummary(true);
	return summary;
}

describe("Text forest benchmarks", () => {
	configureBenchmarkHooks();

	for (const textConfig of textConfigs) {
		describe(`${textConfig.name} text`, () => {
			// --- Insertion time ---
			describe("insertion time", () => {
				for (const charCount of textConfig.sizes) {
					for (const [forestName, forestType] of forestTypes) {
						benchmark({
							type: BenchmarkType.Measurement,
							title: `insert ${charCount} chars into ${forestName}`,
							benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
								let duration: number;
								do {
									assert.equal(state.iterationsPerBatch, 1);

									// Setup (not measured)
									const factory = configuredSharedTree({
										forest: forestType,
									}).getFactory();
									const provider = new TestTreeProviderLite(1, factory);
									const tree = provider.trees[0];
									const view = tree.kernel.viewWith(
										new TreeViewConfiguration({
											schema: textConfig.schema,
										}),
									);
									view.initialize(textConfig.create("") as never);
									const text = generateText(charCount);

									// Measure only the insertion
									const before = state.timer.now();
									textConfig.insert(view.root, 0, text);
									const after = state.timer.now();
									duration = state.timer.toSeconds(before, after);

									// Validate
									assert.equal(textConfig.getText(view.root), text);
								} while (state.recordBatch(duration));
							},
							minBatchDurationSeconds: 0,
						});
					}
				}
			});

			// --- Read time (fullString) ---
			describe("read time (fullString)", () => {
				for (const charCount of textConfig.sizes) {
					for (const [forestName, forestType] of forestTypes) {
						let root: unknown;
						let readResult: string;
						benchmark({
							type: BenchmarkType.Measurement,
							title: `fullString on ${charCount} chars in ${forestName}`,
							before: () => {
								const factory = configuredSharedTree({
									forest: forestType,
								}).getFactory();
								const provider = new TestTreeProviderLite(1, factory);
								const tree = provider.trees[0];
								const view = tree.kernel.viewWith(
									new TreeViewConfiguration({ schema: textConfig.schema }),
								);
								view.initialize(textConfig.create(generateText(charCount)) as never);
								provider.synchronizeMessages();
								root = view.root;
							},
							benchmarkFn: () => {
								readResult = textConfig.getText(root);
							},
							after: () => {
								assert.equal(readResult.length, charCount);
							},
						});
					}
				}
			});

			// --- Formatted text read operations (getUniformRun + getString) ---
			// These are the hot path functions used by buildDeltaFromTree to convert
			// the tree into Quill deltas on every update.
			if (textConfig.name === "Formatted") {
				describe("getUniformRun time", () => {
					for (const charCount of textConfig.sizes) {
						for (const [forestName, forestType] of forestTypes) {
							let root: FormattedTextAsTree.Tree;
							benchmark({
								type: BenchmarkType.Measurement,
								title: `getUniformRun over ${charCount} chars in ${forestName}`,
								before: () => {
									const factory = configuredSharedTree({
										forest: forestType,
									}).getFactory();
									const provider = new TestTreeProviderLite(1, factory);
									const tree = provider.trees[0];
									const view = tree.kernel.viewWith(
										new TreeViewConfiguration({
											schema: FormattedTextAsTree.Tree,
										}),
									);
									view.initialize(
										FormattedTextAsTree.Tree.fromString(generateText(charCount)) as never,
									);
									provider.synchronizeMessages();
									root = view.root as unknown as FormattedTextAsTree.Tree;
								},
								benchmarkFn: () => {
									// Walk the entire document run-by-run, matching buildDeltaFromTree usage
									let index = 0;
									while (index < root.characterCount()) {
										const runLength = root.getUniformRun(index);
										index += runLength;
									}
								},
							});
						}
					}
				});

				describe("getString time", () => {
					for (const charCount of textConfig.sizes) {
						for (const [forestName, forestType] of forestTypes) {
							let root: FormattedTextAsTree.Tree;
							benchmark({
								type: BenchmarkType.Measurement,
								title: `getString over ${charCount} chars in ${forestName}`,
								before: () => {
									const factory = configuredSharedTree({
										forest: forestType,
									}).getFactory();
									const provider = new TestTreeProviderLite(1, factory);
									const tree = provider.trees[0];
									const view = tree.kernel.viewWith(
										new TreeViewConfiguration({
											schema: FormattedTextAsTree.Tree,
										}),
									);
									view.initialize(
										FormattedTextAsTree.Tree.fromString(generateText(charCount)) as never,
									);
									provider.synchronizeMessages();
									root = view.root as unknown as FormattedTextAsTree.Tree;
								},
								benchmarkFn: () => {
									// Walk the entire document run-by-run, extracting text per run
									let index = 0;
									while (index < root.characterCount()) {
										const runLength = root.getUniformRun(index);
										root.getString(index, index + runLength);
										index += runLength;
									}
								},
							});
						}
					}
				});
			}

			// --- Summary size ---
			describe("summary size", () => {
				for (const charCount of textConfig.sizes) {
					for (const [forestName, forestType] of forestTypes) {
						benchmarkCustom({
							only: false,
							type: BenchmarkType.Measurement,
							title: `summary of ${charCount} chars in ${forestName}`,
							run: async (reporter: IMeasurementReporter) => {
								const summaryTree = getTextSummaryTree(
									textConfig.schema,
									textConfig.create(generateText(charCount)),
									forestType,
								);
								const summaryString = JSON.stringify(summaryTree);
								const summarySize = IsoBuffer.from(summaryString).byteLength;
								reporter.addMeasurement("summarySize", summarySize);
								assert(summarySize > 0);
							},
						});
					}
				}
			});

			// --- Summary load time ---
			describe("summary load time", () => {
				for (const charCount of textConfig.sizes) {
					for (const [forestName, forestType] of forestTypes) {
						let summaryITree: ITree;
						const factory = configuredSharedTree({
							forest: forestType,
						}).getFactory();
						benchmark({
							type: BenchmarkType.Measurement,
							title: `load summary of ${charCount} chars in ${forestName}`,
							before: () => {
								const summaryTree = getTextSummaryTree(
									textConfig.schema,
									textConfig.create(generateText(charCount)),
									forestType,
								);
								summaryITree = convertSummaryTreeToITree(summaryTree);
							},
							benchmarkFnAsync: async () => {
								const services: IChannelServices = {
									deltaConnection: new MockDeltaConnection(
										() => 0,
										() => {},
									),
									objectStorage: new MockStorage(summaryITree),
								};
								const datastoreRuntime = new MockFluidDataStoreRuntime({
									idCompressor: testIdCompressor,
								});
								await factory.load(datastoreRuntime, "test", services, factory.attributes);
							},
						});
					}
				}
			});

			// --- Summary generation time ---
			describe("summary generation time", () => {
				for (const charCount of textConfig.sizes) {
					for (const [forestName, forestType] of forestTypes) {
						benchmark({
							type: BenchmarkType.Measurement,
							title: `generate summary of ${charCount} chars in ${forestName}`,
							benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
								let duration: number;
								do {
									assert.equal(state.iterationsPerBatch, 1);

									// Setup (not measured)
									const factory = configuredSharedTree({
										forest: forestType,
									}).getFactory();
									const provider = new TestTreeProviderLite(1, factory);
									const tree = provider.trees[0];
									const view = tree.kernel.viewWith(
										new TreeViewConfiguration({
											schema: textConfig.schema,
										}),
									);
									view.initialize(textConfig.create(generateText(charCount)) as never);
									provider.synchronizeMessages();

									// Measure only summary generation
									const before = state.timer.now();
									tree.getAttachSummary(true);
									const after = state.timer.now();
									duration = state.timer.toSeconds(before, after);
								} while (state.recordBatch(duration));
							},
							minBatchDurationSeconds: 0,
						});
					}
				}
			});

			// --- Per-character edit throughput ---
			describe("per-character edit throughput", () => {
				for (const editCount of textConfig.perCharSizes) {
					for (const [forestName, forestType] of forestTypes) {
						benchmark({
							type: BenchmarkType.Measurement,
							title: `insert ${editCount} chars one-by-one into ${forestName}`,
							benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
								let duration: number;
								do {
									assert.equal(state.iterationsPerBatch, 1);

									// Setup (not measured)
									const factory = configuredSharedTree({
										forest: forestType,
									}).getFactory();
									const provider = new TestTreeProviderLite(1, factory);
									const tree = provider.trees[0];
									const view = tree.kernel.viewWith(
										new TreeViewConfiguration({
											schema: textConfig.schema,
										}),
									);
									view.initialize(textConfig.create("") as never);

									// Measure per-character insertions
									const before = state.timer.now();
									for (let i = 0; i < editCount; i++) {
										textConfig.insert(view.root, i, "x");
									}
									const after = state.timer.now();
									duration = state.timer.toSeconds(before, after);

									// Validate
									assert.equal(textConfig.getText(view.root).length, editCount);
								} while (state.recordBatch(duration));
							},
							minBatchDurationSeconds: 0,
						});
					}
				}
			});
		});
	}
});

// --- Incremental Summarization Benchmarks ---
// Uses a separate schema with incrementalSummaryHint to test incremental summarization directly
// via the ForestSummarizer API, which requires lower-level setup than the SharedTree API above.

const isf = new SchemaFactoryAlpha("text-bench-incremental");

class TextItem extends isf.object("TextItem", {
	content: isf.string,
}) {}

class IncrementalTextArray extends isf.arrayAlpha(
	"IncrementalTextArray",
	isf.types([{ type: TextItem, metadata: {} }], {
		custom: { [incrementalSummaryHint]: true },
	}),
) {}

class IncrementalTextRoot extends isf.objectAlpha("IncrementalTextRoot", {
	text: IncrementalTextArray,
}) {}

function createIncrementalTextContent(charCount: number): IncrementalTextRoot {
	const items: TextItem[] = [];
	for (let i = 0; i < charCount; i++) {
		items.push(new TextItem({ content: String.fromCodePoint(97 + (i % 26)) }));
	}
	return new IncrementalTextRoot({ text: new IncrementalTextArray(items) });
}

function setupIncrementalForest(initialContent: IncrementalTextRoot) {
	const fieldCursor = fieldCursorFromInsertable(IncrementalTextRoot, initialContent);
	const storedContent: TreeStoredContentStrict = {
		schema: toStoredSchema(IncrementalTextRoot, permissiveStoredSchemaGenerationOptions),
		initialTree: fieldCursor,
	};
	const shouldEncodeIncrementally = incrementalEncodingPolicyForAllowedTypes(
		new TreeViewConfigurationAlpha({ schema: IncrementalTextRoot }),
	);
	const checkout = checkoutWithContent(storedContent, {
		forestType: ForestTypeOptimized,
		shouldEncodeIncrementally,
	});
	const options: CodecWriteOptions = {
		jsonValidator: FormatValidatorBasic,
		minVersionForCollab: FluidClientVersion.v2_74,
	};
	const encoderContext: FieldBatchEncodingContext = {
		encodeType: TreeCompressionStrategy.CompressedIncremental,
		idCompressor: testIdCompressor,
		originatorId: testIdCompressor.localSessionId,
		schema: { schema: storedContent.schema, policy: defaultSchemaPolicy },
	};
	const forestSummarizer = new ForestSummarizer(
		checkout.forest,
		testRevisionTagCodec,
		encoderContext,
		options,
		testIdCompressor,
		0,
		shouldEncodeIncrementally,
	);
	return { checkout, forestSummarizer };
}

const incrementalSizes = isInPerformanceTestingMode ? [100, 500] : [50];

describe("Incremental summarization benchmarks", () => {
	configureBenchmarkHooks();

	for (const charCount of incrementalSizes) {
		// --- Incremental summary size reduction ---
		benchmarkCustom({
			only: false,
			type: BenchmarkType.Measurement,
			title: `incremental summary size: ${charCount} items, no edit`,
			run: async (reporter: IMeasurementReporter) => {
				const { forestSummarizer } = setupIncrementalForest(
					createIncrementalTextContent(charCount),
				);

				// First summary (full)
				const ctx1: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};
				const summary1 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: ctx1,
				});
				const size1 = IsoBuffer.from(JSON.stringify(summary1.summary)).byteLength;
				reporter.addMeasurement("firstSummarySize", size1);

				// Second summary (all handles, nothing changed)
				const ctx2: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 10,
					latestSummarySequenceNumber: 0,
					summaryPath: "",
				};
				const summary2 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: ctx2,
				});
				const size2 = IsoBuffer.from(JSON.stringify(summary2.summary)).byteLength;
				reporter.addMeasurement("secondSummarySize", size2);
				assert(size2 < size1, "Incremental summary should be smaller");
			},
		});

		benchmarkCustom({
			only: false,
			type: BenchmarkType.Measurement,
			title: `incremental summary size: ${charCount} items, after edit`,
			run: async (reporter: IMeasurementReporter) => {
				const { checkout, forestSummarizer } = setupIncrementalForest(
					createIncrementalTextContent(charCount),
				);

				// First summary (full)
				const ctx1: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};
				const summary1 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: ctx1,
				});
				const size1 = IsoBuffer.from(JSON.stringify(summary1.summary)).byteLength;
				reporter.addMeasurement("firstSummarySize", size1);

				// Edit one item
				const view = checkout.viewWith(
					new TreeViewConfiguration({ schema: IncrementalTextRoot }),
				);
				const firstItem = view.root.text.at(0);
				assert(firstItem !== undefined);
				firstItem.content = "EDITED";

				// Second summary (one chunk re-encoded, rest are handles)
				const ctx2: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 10,
					latestSummarySequenceNumber: 0,
					summaryPath: "",
				};
				const summary2 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: ctx2,
				});
				const size2 = IsoBuffer.from(JSON.stringify(summary2.summary)).byteLength;
				reporter.addMeasurement("secondSummarySize", size2);
				assert(size2 < size1, "Incremental summary after edit should be smaller");
			},
		});

		// --- Incremental summary generation time ---
		benchmark({
			type: BenchmarkType.Measurement,
			title: `incremental summary gen time: ${charCount} items, second summary (no edit)`,
			benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
				let duration: number;
				do {
					assert.equal(state.iterationsPerBatch, 1);

					// Setup (not measured)
					const { forestSummarizer } = setupIncrementalForest(
						createIncrementalTextContent(charCount),
					);
					const ctx1: IExperimentalIncrementalSummaryContext = {
						summarySequenceNumber: 0,
						latestSummarySequenceNumber: -1,
						summaryPath: "",
					};
					forestSummarizer.summarize({
						stringify: JSON.stringify,
						incrementalSummaryContext: ctx1,
					});
					const ctx2: IExperimentalIncrementalSummaryContext = {
						summarySequenceNumber: 10,
						latestSummarySequenceNumber: 0,
						summaryPath: "",
					};

					// Measure only the second (incremental) summary
					const before = state.timer.now();
					forestSummarizer.summarize({
						stringify: JSON.stringify,
						incrementalSummaryContext: ctx2,
					});
					const after = state.timer.now();
					duration = state.timer.toSeconds(before, after);
				} while (state.recordBatch(duration));
			},
			minBatchDurationSeconds: 0,
		});

		benchmark({
			type: BenchmarkType.Measurement,
			title: `incremental summary gen time: ${charCount} items, second summary (after edit)`,
			benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
				let duration: number;
				do {
					assert.equal(state.iterationsPerBatch, 1);

					// Setup (not measured)
					const { checkout, forestSummarizer } = setupIncrementalForest(
						createIncrementalTextContent(charCount),
					);
					const ctx1: IExperimentalIncrementalSummaryContext = {
						summarySequenceNumber: 0,
						latestSummarySequenceNumber: -1,
						summaryPath: "",
					};
					forestSummarizer.summarize({
						stringify: JSON.stringify,
						incrementalSummaryContext: ctx1,
					});
					// Edit one item
					const view = checkout.viewWith(
						new TreeViewConfiguration({ schema: IncrementalTextRoot }),
					);
					const firstItem = view.root.text.at(0);
					assert(firstItem !== undefined);
					firstItem.content = "EDITED";
					const ctx2: IExperimentalIncrementalSummaryContext = {
						summarySequenceNumber: 10,
						latestSummarySequenceNumber: 0,
						summaryPath: "",
					};

					// Measure only the second (incremental) summary after edit
					const before = state.timer.now();
					forestSummarizer.summarize({
						stringify: JSON.stringify,
						incrementalSummaryContext: ctx2,
					});
					const after = state.timer.now();
					duration = state.timer.toSeconds(before, after);
				} while (state.recordBatch(duration));
			},
			minBatchDurationSeconds: 0,
		});

		// --- Full summary gen time for comparison ---
		benchmark({
			type: BenchmarkType.Measurement,
			title: `full summary gen time: ${charCount} items (baseline for comparison)`,
			benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
				let duration: number;
				do {
					assert.equal(state.iterationsPerBatch, 1);

					// Setup (not measured)
					const { forestSummarizer } = setupIncrementalForest(
						createIncrementalTextContent(charCount),
					);
					const ctx: IExperimentalIncrementalSummaryContext = {
						summarySequenceNumber: 0,
						latestSummarySequenceNumber: -1,
						summaryPath: "",
					};

					// Measure the first (full) summary
					const before = state.timer.now();
					forestSummarizer.summarize({
						stringify: JSON.stringify,
						incrementalSummaryContext: ctx,
					});
					const after = state.timer.now();
					duration = state.timer.toSeconds(before, after);
				} while (state.recordBatch(duration));
			},
			minBatchDurationSeconds: 0,
		});
	}
});
