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

import { typeboxValidator } from "../../../external-utilities/index.js";
import { FluidClientVersion, type CodecWriteOptions } from "../../../codec/index.js";
import {
	ForestSummarizer,
	TreeCompressionStrategy,
	TreeCompressionStrategyExtended,
	defaultSchemaPolicy,
	makeFieldBatchCodec,
	type FieldBatchEncodingContext,
	type TreeCompressionStrategyPrivate,
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
	permissiveStoredSchemaGenerationOptions,
	SchemaFactory,
	toStoredSchema,
	TreeViewConfiguration,
} from "../../../simple-tree/index.js";
import { fieldJsonCursor } from "../../json/index.js";
// eslint-disable-next-line import/no-internal-modules
import { forestSummaryContentKey } from "../../../feature-libraries/forest-summary/forestSummarizer.js";
import type { FieldKey, TreeNodeSchemaIdentifier } from "../../../core/index.js";
import {
	brand,
	setInNestedMap,
	tryGetFromNestedMap,
	type NestedMap,
} from "../../../util/index.js";

function createForestSummarizer(args: {
	// The encoding strategy to use when summarizing the forest.
	encodeType: TreeCompressionStrategyPrivate;
	// The type of forest to create.
	forestType: ForestType;
	// The content and schema to initialize the forest with. By default, it is an empty forest.
	initialContent?: TreeStoredContentStrict;
	shouldEncodeFieldIncrementally?: (
		nodeIdentifier: TreeNodeSchemaIdentifier,
		fieldKey: FieldKey,
	) => boolean;
}): { forestSummarizer: ForestSummarizer; checkout: TreeCheckout } {
	const {
		initialContent = {
			schema: jsonSequenceRootSchema,
			initialTree: undefined,
		},
		encodeType,
		forestType,
		shouldEncodeFieldIncrementally,
	} = args;
	const fieldBatchCodec = makeFieldBatchCodec({ jsonValidator: typeboxValidator }, 1);
	const options: CodecWriteOptions = {
		jsonValidator: typeboxValidator,
		oldestCompatibleClient: FluidClientVersion.v2_0,
	};
	const checkout = checkoutWithContent(initialContent, {
		forestType,
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
			shouldEncodeFieldIncrementally,
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
		const sf = new SchemaFactory("IncrementalSummarization");

		function validateSummaryIsIncremental(summary: ISummaryTree) {
			assert(
				Object.keys(summary.tree).length >= 2,
				"There should be at least one node for incremental fields",
			);

			for (const [key, value] of Object.entries(summary.tree)) {
				if (key === forestSummaryContentKey) {
					assert(value.type === SummaryType.Blob, "Forest summary contents not found");
				} else {
					assert(value.type === SummaryType.Tree, "Incremental summary node should be a tree");
				}
			}
		}

		describe("Simple schema", () => {
			it("can incrementally summarize forest with simple content", async () => {
				class SimpleObject extends sf.object("simpleObject", {
					foo: sf.string,
				}) {}
				const initialContent: TreeStoredContentStrict = {
					schema: toStoredSchema(SimpleObject, permissiveStoredSchemaGenerationOptions),
					initialTree: fieldCursorFromInsertable(SimpleObject, {
						foo: "bar",
					}),
				};

				const shouldEncodeFieldIncrementally = (
					nodeIdentifier: TreeNodeSchemaIdentifier,
					fieldKey: FieldKey,
				): boolean => {
					if (nodeIdentifier === SimpleObject.identifier && fieldKey === "foo") {
						return true;
					}
					return false;
				};

				const { forestSummarizer } = createForestSummarizer({
					initialContent,
					encodeType: TreeCompressionStrategyExtended.CompressedIncremental,
					forestType: ForestTypeOptimized,
					shouldEncodeFieldIncrementally,
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
				validateSummaryIsIncremental(summary.summary);

				// Validate that the forest can successfully load from the above summary.
				const mockStorage = MockStorage.createFromSummary(summary.summary);
				const { forestSummarizer: forestSummarizer2 } = createForestSummarizer({
					encodeType: TreeCompressionStrategyExtended.CompressedIncremental,
					forestType: ForestTypeOptimized,
					shouldEncodeFieldIncrementally,
				});
				await assert.doesNotReject(async () => {
					await forestSummarizer2.load(mockStorage, JSON.parse);
				});
			});
		});

		describe("multi-depth schema", () => {
			// The tests in this block use the following schema:
			class ItemDepth2 extends sf.object("depth2", {
				id: sf.number,
				propertyDepth3: sf.required(sf.string), // Incremental field
			}) {}
			class ItemDepth1 extends sf.object("depth1", {
				id: sf.number,
				itemDepth2: sf.optional(ItemDepth2), // Incremental field
			}) {}
			class Root extends sf.object("root", {
				id: sf.number,
				itemsDepth1: sf.array(ItemDepth1), // Incremental field
			}) {}

			/**
			 * Sets up the forest summarizer for incremental summarization. It creates a forest and sets up some
			 * of the fields to support incremental encoding.
			 * Note that it creates a chunked forest of type `ForestTypeOptimized` with compression strategy
			 * `TreeCompressionStrategyExtended.CompressedIncremental` since incremental summarization is only
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

				const incrementalFieldsMap: NestedMap<TreeNodeSchemaIdentifier, FieldKey, boolean> =
					new Map();
				setInNestedMap(
					incrementalFieldsMap,
					brand<TreeNodeSchemaIdentifier>(Root.identifier),
					brand<FieldKey>("itemsDepth1"),
					true,
				);
				setInNestedMap(
					incrementalFieldsMap,
					brand<TreeNodeSchemaIdentifier>(ItemDepth1.identifier),
					brand<FieldKey>("itemDepth2"),
					true,
				);
				setInNestedMap(
					incrementalFieldsMap,
					brand<TreeNodeSchemaIdentifier>(ItemDepth2.identifier),
					brand<FieldKey>("propertyDepth3"),
					true,
				);

				const shouldEncodeFieldIncrementally = (
					nodeIdentifier: TreeNodeSchemaIdentifier,
					fieldKey: FieldKey,
				): boolean => {
					return tryGetFromNestedMap(incrementalFieldsMap, nodeIdentifier, fieldKey) ?? false;
				};

				return createForestSummarizer({
					initialContent,
					encodeType: TreeCompressionStrategyExtended.CompressedIncremental,
					forestType: ForestTypeOptimized,
					shouldEncodeFieldIncrementally,
				});
			}

			/**
			 * Creates an initial Root object with the specified number of items under it.
			 * Each item will have a unique ID, and every other item will have a label so as to test incremental
			 * summarization on optional fields which may or may not be present.
			 * @param itemsCount - The number of items to create.
			 */
			function createInitialBoard(itemsCount: number) {
				let nextItemId = 1;
				const itemsDepth1: ItemDepth1[] = [];
				for (let i = 0; i < itemsCount; i++) {
					const addDepth2 = i % 2 === 0; // Add depth 2 item to every other item in a list
					const item = new ItemDepth1({
						id: nextItemId,
						itemDepth2: addDepth2
							? {
									id: nextItemId,
									propertyDepth3: `Property for itemDepth2 ${nextItemId}`,
								}
							: undefined,
					});
					itemsDepth1.push(item);
					nextItemId++;
				}
				return new Root({
					id: 1,
					itemsDepth1,
				});
			}

			it("can incrementally summarize a forest", async () => {
				const { forestSummarizer } = setupForestForIncrementalSummarization(
					createInitialBoard(3 /* itemsCount */),
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

				// Validate that this summary has just one handle - nothing changed, so the first incremental summary
				// node (for `Root::itemsDepth1`) should now be a handle.
				validateHandlesInForestSummary(summary2.summary, {
					shouldContainHandle: true,
					handleCount: 1,
					lastSummary: summary1.summary,
				});
			});

			it("can incrementally summarize a forest with changes in between", async () => {
				const { checkout, forestSummarizer } = setupForestForIncrementalSummarization(
					createInitialBoard(3 /* itemsCount */),
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
					latestSummarySequenceNumber: 0,
					summaryPath: "",
				};
				const summary2 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incrementalSummaryContext2,
				});

				// Validate that this summary has just one handle - nothing changed, so the first incremental summary
				// node (for chunk of `Root::itemsDepth1`) should now be a handle.
				validateHandlesInForestSummary(summary2.summary, {
					shouldContainHandle: true,
					handleCount: 1,
					lastSummary: summary1.summary,
				});

				// Make changes to the field `Root::itemsDepth1`. This should cause the first incremental summary node
				// for it to be updated. The two summary nodes under that for chunks of `ItemDepth1::itemDepth2` should
				// now be handles.
				const view = checkout.viewWith(new TreeViewConfiguration({ schema: Root }));
				const root = view.root;
				const firstItem = root.itemsDepth1.at(0);
				assert(firstItem !== undefined, "Could not find first item at depth 1");
				firstItem.id++;

				// Incremental summary context for the third summary. `latestSummarySequenceNumber` should
				// be the `summarySequenceNumber` of the previous summary.
				const incrementalSummaryContext3: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 20,
					latestSummarySequenceNumber: 10,
					summaryPath: "",
				};
				const summary3 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incrementalSummaryContext3,
				});
				// This summary should have two handles as per the changes to the tree above.
				validateHandlesInForestSummary(summary3.summary, {
					shouldContainHandle: true,
					handleCount: 2,
					lastSummary: summary1.summary,
				});
			});

			it("can incrementally summarize a forest with a summary failure in between", async () => {
				const { checkout, forestSummarizer } = setupForestForIncrementalSummarization(
					createInitialBoard(3 /* itemsCount */),
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

				// Make changes to the field `Root::itemsDepth1`. This should cause the first incremental summary node
				// for it to be updated. The two summary nodes under that for chunks of `ItemDepth1::itemDepth2` should
				// now be handles.
				const view = checkout.viewWith(new TreeViewConfiguration({ schema: Root }));
				const root = view.root;
				const firstItem = root.itemsDepth1.at(0);
				assert(firstItem !== undefined, "Could not find first item at depth 1");
				firstItem.id++;

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

				// This summary should have two handles as per the changes to the tree above.
				validateHandlesInForestSummary(summary2.summary, {
					shouldContainHandle: true,
					handleCount: 2,
					lastSummary: summary1.summary,
				});

				// Incremental summary context for the third summary. This simulates a scenario where the second summary
				// failed by setting `latestSummarySequenceNumber` to the `summarySequenceNumber` of the first summary.
				const incrementalSummaryContext3: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 20,
					latestSummarySequenceNumber: 0,
					summaryPath: "",
				};
				const summary3 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incrementalSummaryContext3,
				});
				// This summary should have two handles similar to the second summary that failed. Also, the handle
				// paths must exist in the first summary tree (not the second).
				validateHandlesInForestSummary(summary3.summary, {
					shouldContainHandle: true,
					handleCount: 2,
					lastSummary: summary1.summary,
				});
			});
		});
	});
});
