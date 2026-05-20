/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	SummaryType,
	type ISummaryBlob,
	type ISummaryTree,
	type SummaryObject,
} from "@fluidframework/driver-definitions";
import type {
	IExperimentalIncrementalSummaryContext,
	MinimumVersionForCollab,
} from "@fluidframework/runtime-definitions/internal";
import { MockStorage, validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { FluidClientVersion, type CodecWriteOptions } from "../../../codec/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { FormatCommon } from "../../../feature-libraries/forest-summary/formatCommon.js";
import {
	ForestSummaryFormatVersion,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/forest-summary/summaryFormatCommon.js";
import {
	summaryContentBlobKey as summaryContentBlobKeyV1ToV2,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/forest-summary/summaryFormatV1ToV2.js";
import {
	summaryContentBlobKey,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/forest-summary/summaryFormatV3.js";
import {
	FieldBatchFormatVersion,
	ForestFormatVersion,
	ForestSummarizer,
	TreeCompressionStrategy,
	defaultSchemaPolicy,
	type FieldBatchEncodingContext,
	type IncrementalEncodingPolicy,
} from "../../../feature-libraries/index.js";
import {
	ForestTypeOptimized,
	ForestTypeReference,
	type ForestType,
	type TreeCheckout,
} from "../../../shared-tree/index.js";
import {
	summarizablesMetadataKey,
	type SharedTreeSummarizableMetadata,
} from "../../../shared-tree-core/index.js";
import {
	incrementalEncodingPolicyForAllowedTypes,
	incrementalSummaryHint,
	permissiveStoredSchemaGenerationOptions,
	SchemaFactory,
	SchemaFactoryAlpha,
	toStoredSchema,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
	type ImplicitFieldSchema,
	type InsertableField,
} from "../../../simple-tree/index.js";
import { fieldJsonCursor } from "../../json/index.js";
import { jsonSequenceRootSchema } from "../../sequenceRootUtils.js";
import {
	checkoutWithContent,
	fieldCursorFromInsertable,
	testIdCompressor,
	testRevisionTagCodec,
	type TreeStoredContentStrict,
} from "../../utils.js";

function createForestSummarizer(args: {
	// The encoding strategy to use when summarizing the forest.
	encodeType: TreeCompressionStrategy;
	// The type of forest to create.
	forestType: ForestType;
	// The content and schema to initialize the forest with. By default, it is an empty forest.
	initialContent?: TreeStoredContentStrict;
	shouldEncodeIncrementally?: IncrementalEncodingPolicy;
	minVersionForCollab?: MinimumVersionForCollab;
}): { forestSummarizer: ForestSummarizer; checkout: TreeCheckout } {
	const {
		initialContent = {
			schema: jsonSequenceRootSchema,
			initialTree: undefined,
		},
		encodeType,
		forestType,
		shouldEncodeIncrementally,
		minVersionForCollab = FluidClientVersion.v2_74,
	} = args;
	const options: CodecWriteOptions = {
		jsonValidator: FormatValidatorBasic,
		minVersionForCollab,
	};
	const checkout = checkoutWithContent(initialContent, {
		forestType,
		shouldEncodeIncrementally,
	});
	const encoderContext: FieldBatchEncodingContext = {
		encodeType,
		idCompressor: testIdCompressor,
		originatorId: testIdCompressor.localSessionId,
		isSummary: false,
		schema: { schema: initialContent.schema, policy: defaultSchemaPolicy },
	};
	return {
		checkout,
		forestSummarizer: new ForestSummarizer(
			checkout.forest,
			testRevisionTagCodec,
			encoderContext,
			options,
			testIdCompressor,
			0 /* initialSequenceNumber */,
			shouldEncodeIncrementally,
		),
	};
}

/**
 * Validates that the number of handles in the forest summary are as expected.
 * If there are handles, for each handle, its path exists in the last summary.
 * This basically validates that the handle paths in the current summary are valid.
 */
function validateHandlesInForestSummary(
	summary: ISummaryTree,
	validationArgs:
		| {
				shouldContainHandle: false;
		  }
		| { shouldContainHandle: true; handleCount: number; lastSummary: ISummaryTree },
) {
	const validateHandles = (s: ISummaryTree): number => {
		let localHandleCount = 0;
		for (const [_, summaryObject] of Object.entries(s.tree)) {
			if (summaryObject.type === SummaryType.Handle) {
				assert(validationArgs.shouldContainHandle, "Expected handle to be present");
				// Validate that the handle exists in lastSummary
				validateHandlePathExists(summaryObject.handle, validationArgs.lastSummary);
				localHandleCount++;
			} else if (summaryObject.type === SummaryType.Tree) {
				// Recursively validate nested trees
				localHandleCount += validateHandles(summaryObject);
			}
		}
		return localHandleCount;
	};
	const totalHandles = validateHandles(summary);
	const expectedHandleCount = validationArgs.shouldContainHandle
		? validationArgs.handleCount
		: 0;
	assert.equal(totalHandles, expectedHandleCount, "Expected handle count to match");
}

/**
 * Validates that the handle path exists in `summaryTree`.
 */
function validateHandlePathExists(handle: string, summaryTree: ISummaryTree) {
	// The handle path is split by "/" into pathParts where the first element should exist in the root
	// of the summary tree, the second element in the first element's subtree, and so on.
	const pathParts = handle.split("/");
	assert.equal(pathParts[0], "");
	assert(pathParts.length > 1);
	let currentObject: SummaryObject = summaryTree;
	for (const part of pathParts.slice(1)) {
		if (currentObject.type === SummaryType.Tree) {
			currentObject =
				currentObject.tree[part] ??
				assert.fail(`Handle path ${handle} not found in summary tree`);
		} else {
			assert(
				currentObject.type === SummaryType.Handle,
				`Handle path ${handle} should be for a subtree or a handle`,
			);
			// The path navigates into another handle, meaning the referenced subtree is itself
			// reused from an even older summary. Fluid supports chained handle resolution, so
			// this is valid — we simply cannot verify the deeper path without resolving the chain.
			return;
		}
	}
}

/**
 * Validates that the summary in incremental by validating that there is at least one node for incremental fields.
 * @param summary - The summary to validate.
 * @param incrementalNodeCount - The expected number of nodes for incremental fields at the top-level. If provided,
 * the summary is validated to have at exactly these many nodes at the top-level. Otherwise, this validation is skipped.
 */
function validateSummaryIsIncremental(summary: ISummaryTree, incrementalNodeCount?: number) {
	// Forest summary contains one blob for top-level forest content and one blob for metadata.
	// For incremental summaries, it should contain at least one other node making total >= 3.
	assert(
		Object.keys(summary.tree).length >= 3,
		"There should be at least one node for incremental fields",
	);

	let incrementalNodesFound = 0;
	for (const [key, value] of Object.entries(summary.tree)) {
		if (key === summaryContentBlobKey || key === summarizablesMetadataKey) {
			assert(value.type === SummaryType.Blob, "Forest summary blob not as expected");
		} else {
			assert(value.type === SummaryType.Tree, "Incremental summary node should be a tree");
			incrementalNodesFound++;
		}
	}
	if (incrementalNodeCount !== undefined) {
		assert.equal(
			incrementalNodesFound,
			incrementalNodeCount,
			"Incremental node count does not match expected value",
		);
	}
}

function validateSummaryIsNotIncremental(summary: ISummaryTree) {
	// Forest summary contains one blob for top-level forest content and one blob for metadata.
	// For incremental summaries, it should not contain any other node.
	assert(
		Object.keys(summary.tree).length === 2,
		"There should be no nodes for incremental fields",
	);
}

async function summarizeAndValidateIncrementality<TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	data: InsertableField<TSchema>,
	incrementalNodeCount: number,
) {
	const shouldEncodeIncrementally = incrementalEncodingPolicyForAllowedTypes(
		new TreeViewConfigurationAlpha({ schema }),
	);

	const initialContent: TreeStoredContentStrict = {
		schema: toStoredSchema(schema, permissiveStoredSchemaGenerationOptions),
		initialTree: fieldCursorFromInsertable(schema, data),
	};

	const { forestSummarizer } = createForestSummarizer({
		initialContent,
		encodeType: TreeCompressionStrategy.CompressedIncremental,
		forestType: ForestTypeOptimized,
		shouldEncodeIncrementally,
	});

	// Incremental summary context for the first summary. This is needed for incremental summarization.
	const incrementalSummaryContext: IExperimentalIncrementalSummaryContext = {
		summarySequenceNumber: 0,
		latestSummarySequenceNumber: -1,
		summaryPath: "",
	};
	const summary = forestSummarizer.summarize({
		stringify: JSON.stringify,
		incrementalSummaryContext,
	});

	if (incrementalNodeCount === 0) {
		validateSummaryIsNotIncremental(summary.summary);
	} else {
		validateSummaryIsIncremental(summary.summary, incrementalNodeCount);
	}

	// Validate that the forest can successfully load from the above summary.
	const mockStorage = MockStorage.createFromSummary(summary.summary);
	const { forestSummarizer: forestSummarizer2 } = createForestSummarizer({
		encodeType: TreeCompressionStrategy.CompressedIncremental,
		forestType: ForestTypeOptimized,
		shouldEncodeIncrementally,
	});
	await assert.doesNotReject(async () => {
		await forestSummarizer2.load(mockStorage, JSON.parse);
	});
}

const sf = new SchemaFactoryAlpha("IncrementalSummarization");

class ObjectNodeSchema extends sf.object("objectNodeSchema", {
	foo: sf.types([{ type: sf.string, metadata: {} }], {
		custom: { [incrementalSummaryHint]: true },
	}),
}) {}

class FooMap extends sf.mapAlpha(
	"fooMap",
	sf.types([{ type: sf.string, metadata: {} }], {
		custom: { [incrementalSummaryHint]: true },
	}),
) {}
class MapNodeSchema extends sf.object("mapNodeSchema", {
	fooMap: FooMap,
}) {}

class FooArray extends sf.arrayAlpha(
	"fooArray",
	sf.types([{ type: sf.string, metadata: {} }], {
		custom: { [incrementalSummaryHint]: true },
	}),
) {}
class ArrayNodeSchema extends sf.object("arrayNodeSchema", {
	fooArray: FooArray,
}) {}

class FooRecord extends sf.recordAlpha(
	"fooRecord",
	sf.types([{ type: sf.string, metadata: {} }], {
		custom: { [incrementalSummaryHint]: true },
	}),
) {}
class RecordNodeSchema extends sf.object("recordNodeSchema", {
	fooRecord: FooRecord,
}) {}

const LeafNodeSchema = sf.required(
	sf.types([{ type: sf.string, metadata: {} }], {
		custom: { [incrementalSummaryHint]: true },
	}),
);

describe("ForestSummarizer", () => {
	describe("Summarize and Load", () => {
		const testCases: {
			encodeType: TreeCompressionStrategy;
			testType: string;
			forestType: ForestType;
		}[] = [
			{
				encodeType: TreeCompressionStrategy.Compressed,
				testType: "compressed",
				forestType: ForestTypeReference,
			},
			{
				encodeType: TreeCompressionStrategy.Uncompressed,
				testType: "uncompressed",
				forestType: ForestTypeReference,
			},
			{
				encodeType: TreeCompressionStrategy.Compressed,
				testType: "compressed chunked",
				forestType: ForestTypeOptimized,
			},
			{
				encodeType: TreeCompressionStrategy.Uncompressed,
				testType: "uncompressed chunked",
				forestType: ForestTypeOptimized,
			},
		];
		for (const { encodeType, testType, forestType } of testCases) {
			it(`can summarize empty ${testType} forest and load from it`, async () => {
				const { forestSummarizer } = createForestSummarizer({
					encodeType,
					forestType,
					minVersionForCollab: FluidClientVersion.v2_52,
				});
				const summary = forestSummarizer.summarize({ stringify: JSON.stringify });
				// The summary tree should have 2 entries - one for forest contents and one for metadata
				assert.equal(
					Object.keys(summary.summary.tree).length,
					2,
					"Summary tree should only contain two entries",
				);
				const forestContentsBlob: SummaryObject | undefined =
					summary.summary.tree[summaryContentBlobKeyV1ToV2];
				assert(
					forestContentsBlob?.type === SummaryType.Blob,
					"Forest summary contents not found",
				);

				// Create a new ForestSummarizer and load with the above summary.
				const mockStorage = MockStorage.createFromSummary(summary.summary);
				const { forestSummarizer: forestSummarizer2 } = createForestSummarizer({
					encodeType,
					forestType,
					minVersionForCollab: FluidClientVersion.v2_52,
				});
				await assert.doesNotReject(async () => {
					await forestSummarizer2.load(mockStorage, JSON.parse);
				});
			});

			it(`can summarize ${testType} forest with simple content and load from it`, async () => {
				const schema = SchemaFactory.number;
				const initialContent: TreeStoredContentStrict = {
					schema: toStoredSchema(schema, permissiveStoredSchemaGenerationOptions),
					get initialTree() {
						return fieldJsonCursor([5]);
					},
				};
				const { forestSummarizer } = createForestSummarizer({
					initialContent,
					encodeType,
					forestType,
					minVersionForCollab: FluidClientVersion.v2_52,
				});
				const summary = forestSummarizer.summarize({ stringify: JSON.stringify });
				// The summary tree should have 2 entries - one for forest contents and one for metadata
				assert.equal(
					Object.keys(summary.summary.tree).length,
					2,
					"Summary tree should only contain two entries",
				);
				const forestContentsBlob: SummaryObject | undefined =
					summary.summary.tree[summaryContentBlobKeyV1ToV2];
				assert(
					forestContentsBlob?.type === SummaryType.Blob,
					"Forest summary contents not found",
				);

				// Create a new empty ForestSummarizer and load with the above summary.
				const mockStorage = MockStorage.createFromSummary(summary.summary);
				const { forestSummarizer: forestSummarizer2 } = createForestSummarizer({
					encodeType,
					forestType,
					minVersionForCollab: FluidClientVersion.v2_52,
				});
				await assert.doesNotReject(async () => {
					await forestSummarizer2.load(mockStorage, JSON.parse);
				});
			});
		}
	});

	describe("Incremental summarization", () => {
		describe("simple schema", () => {
			it("object nodes", async () => {
				await summarizeAndValidateIncrementality(
					ObjectNodeSchema,
					{
						foo: "bar",
					},
					1 /* incrementalNodeCount */,
				);
			});

			it("map nodes", async () => {
				await summarizeAndValidateIncrementality(
					MapNodeSchema,
					{
						fooMap: new FooMap({ key1: "value1", key2: "value2" }),
					},
					2 /* incrementalNodeCount */,
				);
			});

			it("array nodes", async () => {
				await summarizeAndValidateIncrementality(
					ArrayNodeSchema,
					{
						fooArray: new FooArray(["value1", "value2"]),
					},
					2 /* incrementalNodeCount */,
				);
			});

			it("record nodes", async () => {
				await summarizeAndValidateIncrementality(
					RecordNodeSchema,
					{
						fooRecord: new FooRecord({ key1: "value1", key2: "value2" }),
					},
					2 /* incrementalNodeCount */,
				);
			});

			it("leaf nodes", async () => {
				// Leaf nodes are not incrementally summarized.
				await summarizeAndValidateIncrementality(
					LeafNodeSchema,
					"leaf value",
					0 /* incrementalNodeCount */,
				);
			});
		});

		describe("multi-depth schema", () => {
			/**
			 * The property `bar` will be incrementally summarized as a single {@link TreeChunk}
			 * generated by calling {@link ChunkedForest.chunkField} during summarization.
			 * A summary tree node will be created for each such property under `BarItem`'s summary tree node.
			 */
			class BarItem extends sf.objectAlpha("barItem", {
				id: sf.number,
				bar: sf.types([{ type: sf.string, metadata: {} }], {
					custom: { [incrementalSummaryHint]: true },
				}),
			}) {}

			/**
			 * Every item in this array will be incrementally summarized as a single {@link TreeChunk}
			 * generated by calling {@link ChunkedForest.chunkField} during summarization.
			 * A summary tree node will be created for each of these items under the Forest's root summary tree node.
			 */
			class BarArray extends sf.arrayAlpha(
				"barArray",
				sf.types([{ type: BarItem, metadata: {} }], {
					custom: { [incrementalSummaryHint]: true },
				}),
			) {}

			class Root extends sf.objectAlpha("root", {
				rootId: sf.number,
				barArray: BarArray,
			}) {}

			/**
			 * Sets up the forest summarizer for incremental summarization. It creates a forest and sets up some
			 * of the fields to support incremental encoding.
			 * Note that it creates a chunked forest of type `ForestTypeOptimized` with compression strategy
			 * `TreeCompressionStrategy.CompressedIncremental` since incremental summarization is only
			 * supported by this combination.
			 */
			function setupForestForIncrementalSummarization(initialBoard: Root | undefined) {
				const fieldCursor = initialBoard
					? fieldCursorFromInsertable(Root, initialBoard)
					: fieldJsonCursor([]);
				const initialContent: TreeStoredContentStrict = {
					schema: toStoredSchema(Root, permissiveStoredSchemaGenerationOptions),
					initialTree: fieldCursor,
				};

				return createForestSummarizer({
					initialContent,
					encodeType: TreeCompressionStrategy.CompressedIncremental,
					forestType: ForestTypeOptimized,
					shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(
						new TreeViewConfigurationAlpha({ schema: Root }),
					),
				});
			}

			/**
			 * Creates an initial Root object with the specified number of items under it.
			 * The `id` for `FooItem`s are set to 10, 20, ..., itemsCount * 10. This is to make debugging simpler.
			 * The `EncodedFieldBatch` for this forest has other content that are smaller numbers and having the
			 * `id`s as multiples of 10 makes it easier to identify them.
			 * @param itemsCount - The number of items to create.
			 */
			function createInitialBoard(itemsCount: number) {
				let nextItemId = 10;
				const barArray: BarItem[] = [];
				for (let i = 0; i < itemsCount; i++) {
					barArray.push(
						new BarItem({
							id: nextItemId,
							bar: `Item ${nextItemId} bar`,
						}),
					);
					nextItemId += 10;
				}
				return new Root({
					rootId: 1,
					barArray,
				});
			}

			it("can incrementally summarize a forest", async () => {
				const itemsCount = 4;
				const { forestSummarizer } = setupForestForIncrementalSummarization(
					createInitialBoard(itemsCount),
				);

				// Incremental summary context for the first summary. This is needed for incremental summarization.
				const incrementalSummaryContext1: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};
				const summary1 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incrementalSummaryContext1,
				});
				validateSummaryIsIncremental(summary1.summary);
				// This summary should not contain any handles since it's the first summary.
				validateHandlesInForestSummary(summary1.summary, {
					shouldContainHandle: false,
				});

				// Validate that the forest can successfully load from the above summary.
				const mockStorage = MockStorage.createFromSummary(summary1.summary);
				const { forestSummarizer: forestSummarizer2 } = setupForestForIncrementalSummarization(
					undefined /* initialBoard */,
				);
				await assert.doesNotReject(async () => {
					await forestSummarizer2.load(mockStorage, JSON.parse);
				});

				// Incremental summary context for the second summary. `latestSummarySequenceNumber` should
				// be the `summarySequenceNumber` of the previous summary.
				const incrementalSummaryContext2: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 10,
					latestSummarySequenceNumber: 0,
					summaryPath: "",
				};
				const summary2 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incrementalSummaryContext2,
				});

				// At the root of the summary tree, there should be `itemsCount` number of summary tree nodes that
				// support incremental summary - one for each item in the `Root::fooArray`.
				// Since nothing changed, all of them should be handles.
				validateHandlesInForestSummary(summary2.summary, {
					shouldContainHandle: true,
					handleCount: itemsCount,
					lastSummary: summary1.summary,
				});
			});

			it("can incrementally summarize a forest with changes in between", async () => {
				const itemsCount = 3;
				const { checkout, forestSummarizer } = setupForestForIncrementalSummarization(
					createInitialBoard(itemsCount),
				);

				// Incremental summary context for the first summary. This is needed for incremental summarization.
				const incrementalSummaryContext1: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};
				const summary1 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incrementalSummaryContext1,
				});
				validateSummaryIsIncremental(summary1.summary);
				// This summary should not contain any handles since it's the first summary.
				validateHandlesInForestSummary(summary1.summary, {
					shouldContainHandle: false,
				});

				// Incremental summary context for the second summary. `latestSummarySequenceNumber` should
				// be the `summarySequenceNumber` of the previous summary.
				const incrementalSummaryContext2: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 10,
					latestSummarySequenceNumber: incrementalSummaryContext1.summarySequenceNumber,
					summaryPath: "",
				};
				const summary2 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incrementalSummaryContext2,
				});

				// At the root of the summary tree, there should be `itemsCount` number of summary tree nodes that
				// support incremental summary - one for each item in the `Root::fooArray`.
				// Since nothing changed, all of them should be handles.
				validateHandlesInForestSummary(summary2.summary, {
					shouldContainHandle: true,
					handleCount: itemsCount,
					lastSummary: summary1.summary,
				});

				// Make changes to `FooItem::bar` in one of the `Root::fooArray` entries. This will update one of the
				// summary tree nodes at the root of the summary tree and the summary tree node under it as well - these
				// will be re-summarized and not be handles anymore.
				// So, there should be one less than `itemsCount` number of handles than the previous summary.
				const view = checkout.viewWith(new TreeViewConfiguration({ schema: Root }));
				const root = view.root;
				const firstItem = root.barArray.at(0);
				assert(firstItem !== undefined, "Could not find first item");
				firstItem.bar = "Updated bar";

				// Incremental summary context for the third summary. `latestSummarySequenceNumber` should
				// be the `summarySequenceNumber` of the previous summary.
				const incrementalSummaryContext3: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 20,
					latestSummarySequenceNumber: incrementalSummaryContext2.summarySequenceNumber,
					summaryPath: "",
				};
				const summary3 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incrementalSummaryContext3,
				});
				validateHandlesInForestSummary(summary3.summary, {
					shouldContainHandle: true,
					handleCount: itemsCount - 1,
					lastSummary: summary2.summary,
				});
			});

			it("can incrementally summarize a forest with a summary failure in between", async () => {
				const itemsCount = 2;
				const { checkout, forestSummarizer } = setupForestForIncrementalSummarization(
					createInitialBoard(itemsCount),
				);

				// Incremental summary context for the first summary. This is needed for incremental summarization.
				const incrementalSummaryContext1: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};
				const summary1 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incrementalSummaryContext1,
				});
				validateSummaryIsIncremental(summary1.summary);
				// This summary should not contain any handles since it's the first summary.
				validateHandlesInForestSummary(summary1.summary, {
					shouldContainHandle: false,
				});

				// Make changes to `FooItem::bar` in one of the `Root::fooArray` entries. This will update one of the
				// summary tree nodes at the root of the summary tree and the summary tree node under it as well - these
				// will be re-summarized and not be handles anymore.
				// So, there should be one less than `itemsCount` number of handles than the previous summary.
				const view = checkout.viewWith(new TreeViewConfiguration({ schema: Root }));
				const root = view.root;
				const firstItem = root.barArray.at(0);
				assert(firstItem !== undefined, "Could not find first item");
				firstItem.bar = "Updated bar";

				// Incremental summary context for the second summary. `latestSummarySequenceNumber` should
				// be the `summarySequenceNumber` of the previous summary.
				const incrementalSummaryContext2: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 10,
					latestSummarySequenceNumber: incrementalSummaryContext1.summarySequenceNumber,
					summaryPath: "",
				};
				const summary2 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incrementalSummaryContext2,
				});
				validateHandlesInForestSummary(summary2.summary, {
					shouldContainHandle: true,
					handleCount: itemsCount - 1,
					lastSummary: summary1.summary,
				});

				// Incremental summary context for the third summary. This simulates a scenario where the second summary
				// failed by setting `latestSummarySequenceNumber` to the `summarySequenceNumber` of the first summary.
				const incrementalSummaryContext3: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 20,
					latestSummarySequenceNumber: incrementalSummaryContext1.summarySequenceNumber,
					summaryPath: "",
				};
				const summary3 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incrementalSummaryContext3,
				});
				// This summary should have the same number of handles as the second summary that failed. Also, the handle
				// paths must exist in the first summary tree and not the second.
				validateHandlesInForestSummary(summary3.summary, {
					shouldContainHandle: true,
					handleCount: itemsCount - 1,
					lastSummary: summary1.summary,
				});
			});

			it("can incrementally summarize a forest from a loaded state", async () => {
				const itemsCount = 3;
				const { forestSummarizer } = setupForestForIncrementalSummarization(
					createInitialBoard(itemsCount),
				);

				// Incremental summary context for the first summary. This is needed for incremental summarization.
				const incrementalSummaryContext1: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};
				const summary1 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incrementalSummaryContext1,
				});
				validateSummaryIsIncremental(summary1.summary);
				// This summary should not contain any handles since it's the first summary.
				validateHandlesInForestSummary(summary1.summary, {
					shouldContainHandle: false,
				});

				// Validate that the forest can successfully load from the above summary.
				const mockStorage = MockStorage.createFromSummary(summary1.summary);
				const { forestSummarizer: forestSummarizer2, checkout: checkout2 } =
					setupForestForIncrementalSummarization(undefined /* initialBoard */);
				await assert.doesNotReject(async () => {
					await forestSummarizer2.load(mockStorage, JSON.parse);
				});

				// Make changes to `FooItem::bar` in one of the `Root::fooArray` entries. This will update one of the
				// summary tree nodes at the root of the summary tree and the summary tree node under it as well - these
				// will be re-summarized and not be handles anymore.
				// So, there should be one less than `itemsCount` number of handles than the previous summary.
				const view = checkout2.viewWith(new TreeViewConfiguration({ schema: Root }));
				const root = view.root;
				const firstItem = root.barArray.at(0);
				assert(firstItem !== undefined, "Could not find first item");
				firstItem.bar = "Updated bar";

				// Incremental summary context for the second summary. `latestSummarySequenceNumber` should
				// be the `summarySequenceNumber` of the previous summary.
				const incrementalSummaryContext2: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 10,
					latestSummarySequenceNumber: incrementalSummaryContext1.summarySequenceNumber,
					summaryPath: "",
				};
				// Summarize via the forest that was loaded from the first summary.
				const summary2 = forestSummarizer2.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incrementalSummaryContext2,
				});
				validateHandlesInForestSummary(summary2.summary, {
					shouldContainHandle: true,
					handleCount: itemsCount - 1,
					lastSummary: summary1.summary,
				});
			});
		});

		describe("4-depth schema with parameterized incremental summarization", () => {
			/**
			 * A 4-depth nested schema where each level's map field carries
			 * {@link incrementalSummaryHint}, creating 4 independent incremental chunks:
			 * - Depth 1: the `documents` map (outermost chunk).
			 * - Depth 2: each document's `sections` map.
			 * - Depth 3: each section's `items` map.
			 * - Depth 4: each item's `tags` map (innermost chunk).
			 *
			 * The root field `version` (depth 0) is non-incremental and does not belong to any chunk.
			 */
			/** Depth 4 (innermost): a single tag entry, contained within the `tags` incremental chunk. */
			class Tag extends sf.object("Tag", {
				name: sf.string,
				value: sf.string,
			}) {}

			/** Depth 3: an item whose `tags` map is the depth-4 incremental chunk. */
			class Item extends sf.object("Item", {
				itemName: sf.string,
				/**
				 * The entire anonymous map of {@link Tag} entries is the depth-4 incremental chunk.
				 */
				tags: sf.types([{ type: sf.map(Tag), metadata: {} }], {
					custom: { [incrementalSummaryHint]: true },
				}),
			}) {}

			/** Depth 2: a section whose `items` map is the depth-3 incremental chunk. */
			class Section extends sf.object("Section", {
				sectionName: sf.string,
				/**
				 * The entire anonymous map of {@link Item} entries is the depth-3 incremental chunk.
				 */
				items: sf.types([{ type: sf.map(Item), metadata: {} }], {
					custom: { [incrementalSummaryHint]: true },
				}),
			}) {}

			/** Depth 1: a document whose `sections` map is the depth-2 incremental chunk. */
			class Document extends sf.object("Document", {
				docName: sf.string,
				/**
				 * The entire anonymous map of {@link Section} entries is the depth-2 incremental chunk.
				 */
				sections: sf.types([{ type: sf.map(Section), metadata: {} }], {
					custom: { [incrementalSummaryHint]: true },
				}),
			}) {}

			/** Depth 0 (root): workspace whose `documents` map is the depth-1 incremental chunk. */
			class Workspace extends sf.object("Workspace", {
				version: sf.string,
				/**
				 * The entire anonymous map of {@link Document} entries is the depth-1 incremental chunk.
				 */
				documents: sf.types([{ type: sf.map(Document), metadata: {} }], {
					custom: { [incrementalSummaryHint]: true },
				}),
			}) {}

			function setupForestSummarization(initialData: Workspace | undefined) {
				const fieldCursor = initialData
					? fieldCursorFromInsertable(Workspace, initialData)
					: fieldJsonCursor([]);
				const initialContent: TreeStoredContentStrict = {
					schema: toStoredSchema(Workspace, permissiveStoredSchemaGenerationOptions),
					initialTree: fieldCursor,
				};
				return createForestSummarizer({
					initialContent,
					encodeType: TreeCompressionStrategy.CompressedIncremental,
					forestType: ForestTypeOptimized,
					shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(
						new TreeViewConfigurationAlpha({ schema: Workspace }),
					),
				});
			}

			const initialWorkspaceData = new Workspace({
				version: "v1",
				documents: {
					Doc1: new Document({
						docName: "Document 1",
						sections: {
							Sec1: new Section({
								sectionName: "Section 1",
								items: {
									Item1: new Item({
										itemName: "Item 1",
										tags: {
											Tag1: new Tag({ name: "tag1", value: "value1" }),
										},
									}),
								},
							}),
						},
					}),
				},
			});

			/**
			 * Mutates the tree at the given depth to trigger re-summarization of that depth and
			 * all its ancestors (depths 0..changeDepth). Depths shallower than `changeDepth` (i.e.,
			 * closer to the root) are always re-encoded because a changed child forces a new chunk
			 * reference ID in the parent's encoding.
			 *
			 * - Depth 0: changes `version` (non-incremental root field). No chunks change; the
			 * depth-1 chunk becomes a handle.
			 * - Depth 1: changes `docName` inside the depth-1 documents chunk.
			 * - Depth 2: changes `sectionName` inside the depth-2 sections chunk (also re-encodes depth 1).
			 * - Depth 3: changes `itemName` inside the depth-3 items chunk (also re-encodes depths 1–2).
			 * - Depth 4: changes a tag `name` inside the depth-4 tags chunk (re-encodes all depths; no handles).
			 */
			function makeChangeAtDepth(
				workspace: Workspace,
				depth: 0 | 1 | 2 | 3 | 4,
				iteration: number,
			): void {
				const newVal = `updated-${iteration}`;
				switch (depth) {
					case 0: {
						workspace.version = newVal;
						break;
					}
					case 1: {
						const doc = workspace.documents.get("Doc1");
						assert(doc !== undefined, "Doc1 not found");
						doc.docName = newVal;
						break;
					}
					case 2: {
						const doc = workspace.documents.get("Doc1");
						assert(doc !== undefined, "Doc1 not found");
						const sec = doc.sections.get("Sec1");
						assert(sec !== undefined, "Sec1 not found");
						sec.sectionName = newVal;
						break;
					}
					case 3: {
						const doc = workspace.documents.get("Doc1");
						assert(doc !== undefined, "Doc1 not found");
						const sec = doc.sections.get("Sec1");
						assert(sec !== undefined, "Sec1 not found");
						const item = sec.items.get("Item1");
						assert(item !== undefined, "Item1 not found");
						item.itemName = newVal;
						break;
					}
					case 4: {
						const doc = workspace.documents.get("Doc1");
						assert(doc !== undefined, "Doc1 not found");
						const sec = doc.sections.get("Sec1");
						assert(sec !== undefined, "Sec1 not found");
						const item = sec.items.get("Item1");
						assert(item !== undefined, "Item1 not found");
						const tag = item.tags.get("Tag1");
						assert(tag !== undefined, "Tag1 not found");
						tag.name = newVal;
						break;
					}
					default: {
						throw new Error(`Invalid depth: ${String(depth)}`);
					}
				}
			}

			/**
			 * Test cases: each entry specifies an ordered sequence of depth changes.
			 * Each change drives a new summary round; together they exercise different combinations
			 * of chunk re-encoding and handle reuse.
			 */
			const testCases: {
				name: string;
				changeDepths: readonly (0 | 1 | 2 | 3 | 4)[];
			}[] = [
				{
					name: "ascending depths 0→1→2→3→4",
					changeDepths: [0, 1, 2, 3, 4],
				},
				{
					name: "descending depths 4→3→2→1",
					changeDepths: [4, 3, 2, 1],
				},
				{
					name: "shallow then deep: depth 1 then 3",
					changeDepths: [1, 3],
				},
				{
					name: "deep then shallow: depth 3 then 1",
					changeDepths: [3, 1],
				},
				{
					name: "non-sequential: depth 2 then 4 then 1",
					changeDepths: [2, 4, 1],
				},
				// The following test cases exercise the stale-handle-path bug: when a parent chunk
				// is re-encoded in summary S(i), child handles inside it reference a summaryPath that
				// was recorded when the child was last encoded as a full tree (possibly S0 or S1).
				// In S(i+1), those handles are nested inside the newly-re-encoded parent, so their
				// path must be resolvable in (i) (the latestSummary for (i+1)), not in an older one.
				{
					name: "same shallow depth twice: depth 1 then 1",
					changeDepths: [1, 1],
				},
				{
					name: "same depth twice: depth 2 then 2",
					changeDepths: [2, 2],
				},
				{
					name: "same depth three times: depth 1 then 1 then 1",
					changeDepths: [1, 1, 1],
				},
				{
					name: "shallow then same shallow twice: depth 2 then 1 then 1",
					changeDepths: [2, 1, 1],
				},
				{
					name: "deep then same shallow twice: depth 3 then 1 then 1",
					changeDepths: [3, 1, 1],
				},
				{
					name: "repeated shallow with deep interleaved: depth 1 then 2 then 1",
					changeDepths: [1, 2, 1],
				},
				// The next two cases exercise the completeSummary copy-propagation path.
				// When depth 0 changes, ALL incremental chunks become handles (or are not re-encoded
				// at all). `completeSummary` then copies their tracking entries — including any stale
				// summaryPath — forward to the new summary. On the following depth-1 (or depth-2)
				// change, the parent chunk gets a new referenceId, so any child handle whose
				// summaryPath was copied forward will point to a key that no longer exists in the
				// preceding summary → BUG.
				{
					name: "stale path via copy propagation: depth 1, depth 0, depth 1",
					changeDepths: [1, 0, 1],
				},
				{
					name: "stale path via copy propagation: depth 2, depth 0, depth 2",
					changeDepths: [2, 0, 2],
				},
			];

			for (const { name, changeDepths } of testCases) {
				it(`can incrementally summarize with ${name}`, () => {
					const { checkout, forestSummarizer } =
						setupForestSummarization(initialWorkspaceData);
					const view = checkout.viewWith(new TreeViewConfiguration({ schema: Workspace }));

					const summaries: ISummaryTree[] = [];

					// Initial summary (no changes yet → no handles).
					let seqNum = 0;
					const initCtx: IExperimentalIncrementalSummaryContext = {
						summarySequenceNumber: seqNum,
						latestSummarySequenceNumber: -1,
						summaryPath: "",
					};
					const initialSummaryResult = forestSummarizer.summarize({
						stringify: JSON.stringify,
						incrementalSummaryContext: initCtx,
					});
					validateSummaryIsIncremental(initialSummaryResult.summary);
					validateHandlesInForestSummary(initialSummaryResult.summary, {
						shouldContainHandle: false,
					});
					summaries.push(initialSummaryResult.summary);

					for (let round = 0; round < changeDepths.length; round++) {
						const changeDepth = changeDepths[round];
						const prevSeqNum = seqNum;
						seqNum = (round + 1) * 10;

						// Apply the mutation at the specified depth.
						makeChangeAtDepth(view.root, changeDepth, round);

						// The first unchanged chunk (at depth changeDepth+1) becomes a handle. All
						// deeper chunks are nested inside it and are not separately represented.
						// If changeDepth === 4 (the max), every chunk was re-encoded → no handles.
						const expectedHandleCount = changeDepth < 4 ? 1 : 0;

						const ctx: IExperimentalIncrementalSummaryContext = {
							summarySequenceNumber: seqNum,
							latestSummarySequenceNumber: prevSeqNum,
							summaryPath: "",
						};
						const summaryResult = forestSummarizer.summarize({
							stringify: JSON.stringify,
							incrementalSummaryContext: ctx,
						});
						summaries.push(summaryResult.summary);

						if (expectedHandleCount === 0) {
							validateHandlesInForestSummary(summaryResult.summary, {
								shouldContainHandle: false,
							});
						} else {
							// A handle's summaryPath must be resolvable in the immediately preceding
							// summary (the latestSummary used during this round). That is summaries[round]
							// because summaries[0] is the initial summary and summaries[i] is from round i-1.
							validateHandlesInForestSummary(summaryResult.summary, {
								shouldContainHandle: true,
								handleCount: expectedHandleCount,
								lastSummary: summaries[round],
							});
						}
					}
				});
			}

			it("simultaneous handles at depth 3 and depth 4 when only one section's items change", () => {
				// Doc1 has two sections (Sec1 and Sec2). When Item1.itemName in Sec1 changes
				// (a depth-3 change), depths 1–3 along the Sec1 branch are re-encoded:
				//   depth 1: A (documents map)   — new tree
				//   depth 2: B (Doc1.sections)   — new tree
				//   depth 3: C1 (Sec1.items)     — new tree  (changed)
				//   depth 3: C2 (Sec2.items)     — handle    (sibling of C1, unchanged)
				//   depth 4: D1 (Item1.tags)     — handle    (child of C1, unchanged)
				// Two handles at different depths appear in the same summary.
				// Repeating the change exposes the stale-path bug for both C2 and D1: their
				// stored summaryPaths still reference A and B's old referenceIds, so the handle
				// URL points to keys that no longer exist in the preceding summary.
				const twoSectionData = new Workspace({
					version: "v1",
					documents: {
						Doc1: new Document({
							docName: "Document 1",
							sections: {
								Sec1: new Section({
									sectionName: "Section 1",
									items: {
										Item1: new Item({
											itemName: "Item 1",
											tags: { Tag1: new Tag({ name: "tag1", value: "value1" }) },
										}),
									},
								}),
								Sec2: new Section({
									sectionName: "Section 2",
									items: {
										Item1: new Item({
											itemName: "Item 2",
											tags: { Tag1: new Tag({ name: "tag2", value: "value2" }) },
										}),
									},
								}),
							},
						}),
					},
				});
				const { checkout, forestSummarizer } = setupForestSummarization(twoSectionData);
				const view = checkout.viewWith(new TreeViewConfiguration({ schema: Workspace }));
				const summaries: ISummaryTree[] = [];

				let seqNum = 0;
				const initResult = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: {
						summarySequenceNumber: seqNum,
						latestSummarySequenceNumber: -1,
						summaryPath: "",
					},
				});
				validateHandlesInForestSummary(initResult.summary, { shouldContainHandle: false });
				summaries.push(initResult.summary);

				for (let round = 0; round < 3; round++) {
					const prevSeqNum = seqNum;
					seqNum = (round + 1) * 10;

					// Change Item1.itemName in Sec1 — re-encodes A, B, C1 as new trees.
					const doc1 = view.root.documents.get("Doc1");
					assert(doc1 !== undefined, "Doc1 not found");
					const sec1 = doc1.sections.get("Sec1");
					assert(sec1 !== undefined, "Sec1 not found");
					const item1 = sec1.items.get("Item1");
					assert(item1 !== undefined, "Item1 not found");
					item1.itemName = `updated-${round}`;

					const result = forestSummarizer.summarize({
						stringify: JSON.stringify,
						incrementalSummaryContext: {
							summarySequenceNumber: seqNum,
							latestSummarySequenceNumber: prevSeqNum,
							summaryPath: "",
						},
					});
					summaries.push(result.summary);

					// C2 (Sec2.items, depth 3) and D1 (Item1.tags, depth 4) are both handles.
					// Both handle paths must be resolvable in the immediately preceding summary.
					validateHandlesInForestSummary(result.summary, {
						shouldContainHandle: true,
						handleCount: 2,
						lastSummary: summaries[round],
					});
				}
			});

			it("fullTree summary forces all chunks to re-encode; subsequent incremental summary creates handles", () => {
				const { checkout, forestSummarizer } = setupForestSummarization(initialWorkspaceData);
				const view = checkout.viewWith(new TreeViewConfiguration({ schema: Workspace }));

				let seqNum = 0;

				// Initial incremental summary — no handles.
				const initCtx: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: seqNum,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};
				const initResult = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: initCtx,
				});
				validateHandlesInForestSummary(initResult.summary, { shouldContainHandle: false });

				// fullTree=true summary: no handles even though nothing changed.
				seqNum = 10;
				const fullTreeCtx: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: seqNum,
					latestSummarySequenceNumber: 0,
					summaryPath: "",
				};
				const fullTreeResult = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: fullTreeCtx,
					fullTree: true,
				});
				validateHandlesInForestSummary(fullTreeResult.summary, {
					shouldContainHandle: false,
				});

				// Now make a change at depth 1 and take an incremental summary.
				const doc1 = view.root.documents.get("Doc1");
				assert(doc1 !== undefined, "Doc1 not found");
				doc1.docName = "Updated";
				seqNum = 20;
				const incrCtx: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: seqNum,
					latestSummarySequenceNumber: 10,
					summaryPath: "",
				};
				const incrResult = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incrCtx,
				});
				// The sections chunk inside Doc1 is unchanged → 1 handle pointing into the
				// fullTree summary (the latest summary).
				validateHandlesInForestSummary(incrResult.summary, {
					shouldContainHandle: true,
					handleCount: 1,
					lastSummary: fullTreeResult.summary,
				});
			});
		});
	});

	describe("Summary metadata validation", () => {
		it("writes metadata blob with version 2", () => {
			const { forestSummarizer } = createForestSummarizer({
				encodeType: TreeCompressionStrategy.Compressed,
				forestType: ForestTypeOptimized,
				minVersionForCollab: FluidClientVersion.v2_73,
			});

			const summary = forestSummarizer.summarize({ stringify: JSON.stringify });

			// Check if metadata blob exists
			const metadataBlob: SummaryObject | undefined =
				summary.summary.tree[summarizablesMetadataKey];
			assert(metadataBlob !== undefined, "Metadata blob should exist");
			assert.equal(metadataBlob.type, SummaryType.Blob, "Metadata should be a blob");
			const metadataContent = JSON.parse(
				metadataBlob.content as string,
			) as SharedTreeSummarizableMetadata;
			assert.equal(
				metadataContent.version,
				ForestSummaryFormatVersion.v2,
				"Metadata version should be 2",
			);
		});

		it("loads with metadata blob with version 2", async () => {
			const { forestSummarizer } = createForestSummarizer({
				encodeType: TreeCompressionStrategy.Compressed,
				forestType: ForestTypeOptimized,
				minVersionForCollab: FluidClientVersion.v2_73,
			});

			const summary = forestSummarizer.summarize({ stringify: JSON.stringify });

			// Verify metadata exists and has version = 2
			const metadataBlob: SummaryObject | undefined =
				summary.summary.tree[summarizablesMetadataKey];
			assert(metadataBlob !== undefined, "Metadata blob should exist");
			assert.equal(metadataBlob.type, SummaryType.Blob, "Metadata should be a blob");
			const metadataContent = JSON.parse(
				metadataBlob.content as string,
			) as SharedTreeSummarizableMetadata;
			assert.equal(
				metadataContent.version,
				ForestSummaryFormatVersion.v2,
				"Metadata version should be 2",
			);

			// Create a new ForestSummarizer and load with the above summary
			const mockStorage = MockStorage.createFromSummary(summary.summary);
			const { forestSummarizer: forestSummarizer2 } = createForestSummarizer({
				encodeType: TreeCompressionStrategy.Compressed,
				forestType: ForestTypeOptimized,
				minVersionForCollab: FluidClientVersion.v2_73,
			});

			// Should load successfully with version 2
			await assert.doesNotReject(async () => forestSummarizer2.load(mockStorage, JSON.parse));
		});

		it("loads pre-versioning format with no metadata blob", async () => {
			// Create data in v1 summary format.
			const forestDataV1: FormatCommon = {
				version: ForestFormatVersion.v1,
				keys: [],
				fields: {
					version: FieldBatchFormatVersion.v2,
					identifiers: [],
					shapes: [],
					data: [],
				},
			};
			const forestContentBlob: ISummaryBlob = {
				type: SummaryType.Blob,
				content: JSON.stringify(forestDataV1),
			};
			const summaryTree: ISummaryTree = {
				type: SummaryType.Tree,
				tree: {
					[summaryContentBlobKeyV1ToV2]: forestContentBlob,
				},
			};

			// Should load successfully
			const mockStorage = MockStorage.createFromSummary(summaryTree);
			const { forestSummarizer } = createForestSummarizer({
				encodeType: TreeCompressionStrategy.Compressed,
				forestType: ForestTypeOptimized,
				minVersionForCollab: FluidClientVersion.v2_73,
			});

			await assert.doesNotReject(async () => forestSummarizer.load(mockStorage, JSON.parse));
		});

		it("fail to load with metadata blob with version > latest", async () => {
			const { forestSummarizer } = createForestSummarizer({
				encodeType: TreeCompressionStrategy.Compressed,
				forestType: ForestTypeOptimized,
			});

			const summary = forestSummarizer.summarize({ stringify: JSON.stringify });

			// Modify metadata to have version > latest
			const metadataBlob: SummaryObject | undefined =
				summary.summary.tree[summarizablesMetadataKey];
			assert(metadataBlob !== undefined, "Metadata blob should exist");
			assert.equal(metadataBlob.type, SummaryType.Blob, "Metadata should be a blob");
			const modifiedMetadata: SharedTreeSummarizableMetadata = {
				version: ForestSummaryFormatVersion.vLatest + 1,
			};
			metadataBlob.content = JSON.stringify(modifiedMetadata);

			// Create a new ForestSummarizer and load with the above summary
			const mockStorage = MockStorage.createFromSummary(summary.summary);
			const { forestSummarizer: forestSummarizer2 } = createForestSummarizer({
				encodeType: TreeCompressionStrategy.Compressed,
				forestType: ForestTypeOptimized,
			});

			// Should fail to load with version > latest
			await assert.rejects(
				async () => forestSummarizer2.load(mockStorage, JSON.parse),
				validateUsageError(/Cannot read version/),
			);
		});
	});
});
