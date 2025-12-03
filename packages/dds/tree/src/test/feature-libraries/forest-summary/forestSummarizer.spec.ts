/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	SummaryType,
	type ISummaryTree,
	type SummaryObject,
} from "@fluidframework/driver-definitions";
import type { IExperimentalIncrementalSummaryContext } from "@fluidframework/runtime-definitions/internal";
import { MockStorage } from "@fluidframework/test-runtime-utils/internal";

import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import { FluidClientVersion, type CodecWriteOptions } from "../../../codec/index.js";
import {
	ForestSummarizer,
	TreeCompressionStrategy,
	defaultSchemaPolicy,
	makeFieldBatchCodec,
	type FieldBatchEncodingContext,
	type IncrementalEncodingPolicy,
} from "../../../feature-libraries/index.js";
import {
	checkoutWithContent,
	fieldCursorFromInsertable,
	testIdCompressor,
	testRevisionTagCodec,
	type TreeStoredContentStrict,
} from "../../utils.js";
import { jsonSequenceRootSchema } from "../../sequenceRootUtils.js";
import {
	ForestTypeOptimized,
	ForestTypeReference,
	type ForestType,
	type TreeCheckout,
} from "../../../shared-tree/index.js";
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
// eslint-disable-next-line import-x/no-internal-modules
import { forestSummaryContentKey } from "../../../feature-libraries/forest-summary/incrementalSummaryBuilder.js";

function createForestSummarizer(args: {
	// The encoding strategy to use when summarizing the forest.
	encodeType: TreeCompressionStrategy;
	// The type of forest to create.
	forestType: ForestType;
	// The content and schema to initialize the forest with. By default, it is an empty forest.
	initialContent?: TreeStoredContentStrict;
	shouldEncodeIncrementally?: IncrementalEncodingPolicy;
}): { forestSummarizer: ForestSummarizer; checkout: TreeCheckout } {
	const {
		initialContent = {
			schema: jsonSequenceRootSchema,
			initialTree: undefined,
		},
		encodeType,
		forestType,
		shouldEncodeIncrementally,
	} = args;
	const options: CodecWriteOptions = {
		jsonValidator: FormatValidatorBasic,
		minVersionForCollab: FluidClientVersion.v2_73,
	};
	const fieldBatchCodec = makeFieldBatchCodec(options);
	const checkout = checkoutWithContent(initialContent, {
		forestType,
		shouldEncodeIncrementally,
	});
	const encoderContext: FieldBatchEncodingContext = {
		encodeType,
		idCompressor: testIdCompressor,
		originatorId: testIdCompressor.localSessionId,
		schema: { schema: initialContent.schema, policy: defaultSchemaPolicy },
	};
	return {
		checkout,
		forestSummarizer: new ForestSummarizer(
			checkout.forest,
			testRevisionTagCodec,
			fieldBatchCodec,
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
	/**
	 * The handle path is split by "/" into pathParts where the first element should exist in the root
	 * of the summary tree, the second element in the first element's subtree, and so on.
	 */
	const pathParts = handle.split("/").slice(1);
	const currentPath = pathParts[0];
	let found = false;
	for (const [key, summaryObject] of Object.entries(summaryTree.tree)) {
		if (key === currentPath) {
			found = true;
			if (pathParts.length > 1) {
				assert(
					summaryObject.type === SummaryType.Tree || summaryObject.type === SummaryType.Handle,
					`Handle path ${currentPath} should be for a subtree or a handle`,
				);
				if (summaryObject.type === SummaryType.Tree) {
					validateHandlePathExists(`/${pathParts.slice(1).join("/")}`, summaryObject);
				}
			}
			break;
		}
	}
	assert(found, `Handle path ${currentPath} not found in summary tree`);
}

/**
 * Validates that the summary in incremental by validating that there is at least one node for incremental fields.
 * @param summary - The summary to validate.
 * @param incrementalNodeCount - The expected number of nodes for incremental fields at the top-level. If provided,
 * the summary is validated to have at exactly these many nodes at the top-level. Otherwise, this validation is skipped.
 */
function validateSummaryIsIncremental(summary: ISummaryTree, incrementalNodeCount?: number) {
	assert(
		Object.keys(summary.tree).length >= 2,
		"There should be at least one node for incremental fields",
	);

	let incrementalNodesFound = 0;
	for (const [key, value] of Object.entries(summary.tree)) {
		if (key === forestSummaryContentKey) {
			assert(value.type === SummaryType.Blob, "Forest summary contents not found");
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
	assert(
		Object.keys(summary.tree).length === 1,
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
				const { forestSummarizer } = createForestSummarizer({ encodeType, forestType });
				const summary = forestSummarizer.summarize({ stringify: JSON.stringify });
				assert(
					Object.keys(summary.summary.tree).length === 1,
					"Summary tree should only contain one entry for the forest contents",
				);
				const forestContentsBlob: SummaryObject | undefined =
					summary.summary.tree[forestSummaryContentKey];
				assert(
					forestContentsBlob?.type === SummaryType.Blob,
					"Forest summary contents not found",
				);

				// Create a new ForestSummarizer and load with the above summary.
				const mockStorage = MockStorage.createFromSummary(summary.summary);
				const { forestSummarizer: forestSummarizer2 } = createForestSummarizer({
					encodeType,
					forestType,
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
				});
				const summary = forestSummarizer.summarize({ stringify: JSON.stringify });
				assert(
					Object.keys(summary.summary.tree).length === 1,
					"Summary tree should only contain one entry for the forest contents",
				);
				const forestContentsBlob: SummaryObject | undefined =
					summary.summary.tree[forestSummaryContentKey];
				assert(
					forestContentsBlob?.type === SummaryType.Blob,
					"Forest summary contents not found",
				);

				// Create a new empty ForestSummarizer and load with the above summary.
				const mockStorage = MockStorage.createFromSummary(summary.summary);
				const { forestSummarizer: forestSummarizer2 } = createForestSummarizer({
					encodeType,
					forestType,
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
	});
});
