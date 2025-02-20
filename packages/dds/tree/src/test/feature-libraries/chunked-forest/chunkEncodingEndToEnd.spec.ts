/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { SessionId } from "@fluidframework/id-compressor";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";

import {
	type ChangesetLocalId,
	type FieldKey,
	type JsonableTree,
	mapCursorField,
	RevisionTagCodec,
	rootFieldKey,
	type TaggedChange,
	TreeStoredSchemaRepository,
} from "../../../core/index.js";
import { typeboxValidator } from "../../../external-utilities/index.js";
import {
	Chunker,
	defaultChunkPolicy,
	tryShapeFromSchema,
	uniformChunkFromCursor,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree.js";
// eslint-disable-next-line import/no-internal-modules
import { decode } from "../../../feature-libraries/chunked-forest/codec/chunkDecoding.js";
import {
	TreeShape,
	UniformChunk,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/uniformChunk.js";
import {
	DefaultChangeFamily,
	DefaultEditBuilder,
	ForestSummarizer,
	type ModularChangeset,
	TreeCompressionStrategy,
	buildChunkedForest,
	defaultSchemaPolicy,
	fieldKindConfigurations,
	makeFieldBatchCodec,
	makeModularChangeCodecFamily,
	MockNodeKeyManager,
	jsonableTreeFromCursor,
	cursorForJsonableTreeNode,
} from "../../../feature-libraries/index.js";
import {
	type TreeStoredContent,
	type ISharedTreeEditor,
	Tree,
	ForestTypeOptimized,
} from "../../../shared-tree/index.js";
import {
	MockTreeCheckout,
	checkoutWithContent,
	forestWithContent,
	mintRevisionTag,
	testIdCompressor,
	type SharedTreeWithConnectionStateSetter,
} from "../../utils.js";
import {
	cursorFromInsertable,
	numberSchema,
	SchemaFactory,
	stringSchema,
	TreeViewConfiguration,
} from "../../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { toStoredSchema } from "../../../simple-tree/toStoredSchema.js";
import { SummaryType } from "@fluidframework/driver-definitions";
// eslint-disable-next-line import/no-internal-modules
import type { Format } from "../../../feature-libraries/forest-summary/format.js";
// eslint-disable-next-line import/no-internal-modules
import type { EncodedFieldBatch } from "../../../feature-libraries/chunked-forest/index.js";
import { jsonSequenceRootSchema } from "../../sequenceRootUtils.js";
// eslint-disable-next-line import/no-internal-modules
import { JsonObject } from "../../../jsonDomainSchema.js";
import { brand } from "../../../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { ChunkedForest } from "../../../feature-libraries/chunked-forest/chunkedForest.js";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import { TreeFactory } from "../../../treeFactory.js";

const options = {
	jsonValidator: typeboxValidator,
	forest: ForestTypeOptimized,
	summaryEncodeType: TreeCompressionStrategy.Compressed,
};

const fieldBatchCodec = makeFieldBatchCodec({ jsonValidator: typeboxValidator }, 1);
const sessionId = "beefbeef-beef-4000-8000-000000000001" as SessionId;
const idCompressor = createIdCompressor(sessionId);
const revisionTagCodec = new RevisionTagCodec(idCompressor);

const context = {
	encodeType: options.summaryEncodeType,
	idCompressor,
	originatorId: idCompressor.localSessionId,
	schema: { schema: jsonSequenceRootSchema, policy: defaultSchemaPolicy },
};

const schemaFactory = new SchemaFactory("com.example");
class HasIdentifier extends schemaFactory.object("parent", {
	identifier: schemaFactory.identifier,
}) {}

function getIdentifierEncodingContext(id: string) {
	const initialTree = cursorFromInsertable(
		HasIdentifier,
		new HasIdentifier({ identifier: id }),
		new MockNodeKeyManager(),
	);
	const flexSchema = toStoredSchema(HasIdentifier);
	const flexConfig: TreeStoredContent = {
		schema: flexSchema,
		initialTree,
	};
	const checkout = checkoutWithContent(flexConfig);

	const encoderContext = {
		encodeType: options.summaryEncodeType,
		idCompressor: testIdCompressor,
		originatorId: testIdCompressor.localSessionId,
		schema: {
			schema: flexSchema,
			policy: defaultSchemaPolicy,
		},
	};
	return { encoderContext, checkout };
}

describe("End to end chunked encoding", () => {
	it(`insert ops shares reference with the original chunk.`, () => {
		const treeSchema = new TreeStoredSchemaRepository(jsonSequenceRootSchema);
		const chunker = new Chunker(
			treeSchema,
			defaultSchemaPolicy,
			Number.POSITIVE_INFINITY,
			Number.POSITIVE_INFINITY,
			defaultChunkPolicy.uniformChunkNodeCount,
			tryShapeFromSchema,
		);

		const forest = buildChunkedForest(chunker);
		const numberShape = new TreeShape(brand(numberSchema.identifier), true, []);
		const chunk = new UniformChunk(numberShape.withTopLevelLength(4), [1, 2, 3, 4]);
		assert(!chunk.isShared());
		const changeLog: TaggedChange<ModularChangeset>[] = [];

		const changeReceiver = (taggedChange: TaggedChange<ModularChangeset>) => {
			changeLog.push(taggedChange);
		};
		const codec = makeModularChangeCodecFamily(
			fieldKindConfigurations,
			revisionTagCodec,
			fieldBatchCodec,
			{ jsonValidator: typeboxValidator },
		);
		const dummyEditor = new DefaultEditBuilder(
			new DefaultChangeFamily(codec),
			mintRevisionTag,
			changeReceiver,
		);
		const checkout = new MockTreeCheckout(forest, {
			editor: dummyEditor as unknown as ISharedTreeEditor,
		});
		checkout.editor
			.sequenceField({ field: rootFieldKey, parent: undefined })
			.insert(0, chunk.cursor());
		// Check that inserted change contains chunk which is reference equal to the original chunk.
		const { change: insertedChange, revision } = changeLog[0];
		assert(insertedChange.builds !== undefined);
		const insertedChunk = insertedChange.builds.get([revision, 0 as ChangesetLocalId]);
		assert.equal(insertedChunk, chunk);
		assert(chunk.isShared());
	});

	// This test (and the one below) are testing for an optimization in the decoding logic to save a copy of the data array.
	// This optimization is not implemented, so these tests fail, and are skipped.
	it.skip(`summary values are correct, and shares reference with the original chunk when inserting content.`, () => {
		const numberShape = new TreeShape(brand(numberSchema.identifier), true, []);
		const chunk = new UniformChunk(numberShape.withTopLevelLength(4), [1, 2, 3, 4]);
		assert(!chunk.isShared());
		const checkout = checkoutWithContent({
			schema: jsonSequenceRootSchema,
			initialTree: [],
		});

		checkout.editor
			.sequenceField({ field: rootFieldKey, parent: undefined })
			.insert(0, chunk.cursor());

		const forestSummarizer = new ForestSummarizer(
			checkout.forest,
			revisionTagCodec,
			fieldBatchCodec,
			context,
			options,
			idCompressor,
		);

		// This function is declared in the test to have access to the original uniform chunk for comparison.
		function stringifier(content: unknown) {
			const insertedChunk = decode((content as Format).fields as EncodedFieldBatch, {
				idCompressor,
				originatorId: idCompressor.localSessionId,
			});
			assert.equal(insertedChunk, chunk);
			assert(chunk.isShared());
			return JSON.stringify(content);
		}
		forestSummarizer.getAttachSummary(stringifier);
	});

	// See note on above test.
	it.skip(`summary values are correct, and shares reference with the original chunk when initializing with content.`, () => {
		const numberShape = new TreeShape(brand(numberSchema.identifier), true, []);
		const chunk = new UniformChunk(numberShape.withTopLevelLength(4), [1, 2, 3, 4]);
		assert(!chunk.isShared());

		const forest = forestWithContent({
			schema: jsonSequenceRootSchema,
			initialTree: chunk.cursor(),
		});

		const forestSummarizer = new ForestSummarizer(
			forest,
			revisionTagCodec,
			fieldBatchCodec,
			context,
			options,
			idCompressor,
		);

		// This function is declared in the test to have access to the original uniform chunk for comparison.
		function stringifier(content: unknown) {
			const insertedChunk = decode((content as Format).fields as EncodedFieldBatch, {
				idCompressor,
				originatorId: idCompressor.localSessionId,
			});
			assert.equal(insertedChunk, chunk);
			assert(chunk.isShared());
			return JSON.stringify(content);
		}
		forestSummarizer.getAttachSummary(stringifier);
	});

	describe("identifier field encoding", () => {
		it("is encoded as compressed id when the identifier is a valid stable id.", () => {
			const id = testIdCompressor.decompress(testIdCompressor.generateCompressedId());

			const { encoderContext, checkout } = getIdentifierEncodingContext(id);

			const forestSummarizer = new ForestSummarizer(
				checkout.forest,
				new RevisionTagCodec(testIdCompressor),
				fieldBatchCodec,
				encoderContext,
				options,
				testIdCompressor,
			);

			function stringifier(content: unknown) {
				return JSON.stringify(content);
			}
			const { summary } = forestSummarizer.getAttachSummary(stringifier);
			const tree = summary.tree.ForestTree;
			assert(tree.type === SummaryType.Blob);
			const treeContent = JSON.parse(tree.content as string);
			const identifierValue = treeContent.fields.data[0][1];
			// Check that the identifierValue is compressed.
			assert.equal(identifierValue, testIdCompressor.recompress(id));
		});

		it("is the uncompressed value when it is an unknown  identifier", () => {
			// generate an id from a different id compressor.
			const nodeKeyManager = new MockNodeKeyManager();
			const id = nodeKeyManager.stabilizeNodeKey(nodeKeyManager.generateLocalNodeKey());

			const { encoderContext, checkout } = getIdentifierEncodingContext(id);

			const forestSummarizer = new ForestSummarizer(
				checkout.forest,
				new RevisionTagCodec(testIdCompressor),
				fieldBatchCodec,
				encoderContext,
				options,
				testIdCompressor,
			);

			function stringifier(content: unknown) {
				return JSON.stringify(content);
			}
			const { summary } = forestSummarizer.getAttachSummary(stringifier);
			const tree = summary.tree.ForestTree;
			assert(tree.type === SummaryType.Blob);
			const treeContent = JSON.parse(tree.content as string);
			const identifierValue = treeContent.fields.data[0][1];
			// Check that the identifierValue is the original uncompressed id.
			assert.equal(identifierValue, id);
		});

		it("is the uncompressed value when it is not a UUID", () => {
			const id = "invalidUUID";
			const { encoderContext, checkout } = getIdentifierEncodingContext(id);

			const forestSummarizer = new ForestSummarizer(
				checkout.forest,
				new RevisionTagCodec(testIdCompressor),
				fieldBatchCodec,
				encoderContext,
				options,
				testIdCompressor,
			);

			function stringifier(content: unknown) {
				return JSON.stringify(content);
			}
			const { summary } = forestSummarizer.getAttachSummary(stringifier);
			const tree = summary.tree.ForestTree;
			assert(tree.type === SummaryType.Blob);
			const treeContent = JSON.parse(tree.content as string);
			const identifierValue = treeContent.fields.data[0][1];
			// Check that the identifierValue is the original uncompressed id.
			assert.equal(identifierValue, id);
		});

		it("In memory identifier encoding", () => {
			const identifierField: FieldKey = brand("identifier");
			const nonIdentifierField: FieldKey = brand("nonIdentifierField");
			const unknownStableIdField: FieldKey = brand("unknownIdField");

			const stringShape = new TreeShape(brand(stringSchema.identifier), true, [], true);

			const identifierParent: FieldKey = brand("identifierParent");

			const identifierShape = new TreeShape(brand(JsonObject.identifier), false, [
				[identifierField, stringShape, 1],
			]);

			const parentNodeWithIdentifiersShape = new TreeShape(
				brand(JsonObject.identifier),
				false,
				[
					[identifierParent, identifierShape, 1],
					[nonIdentifierField, stringShape, 1],
					[unknownStableIdField, stringShape, 1],
				],
			);

			const id = testIdCompressor.decompress(testIdCompressor.generateCompressedId());

			// Create a stable id from a different source.
			const nodeKeyManager = new MockNodeKeyManager();
			const unknownStableId = nodeKeyManager.generateStableNodeKey();

			const initialTree = {
				type: brand(JsonObject.identifier),
				fields: {
					identifierParent: [
						{
							type: brand(JsonObject.identifier),
							fields: {
								identifier: [{ type: brand("com.fluidframework.leaf.string"), value: id }],
							},
						},
					],
					nonIdentifierField: [
						{ type: brand("com.fluidframework.leaf.string"), value: "nonIdentifierValue" },
					],
					unknownIdField: [
						{ type: brand("com.fluidframework.leaf.string"), value: unknownStableId },
					],
				},
			} satisfies JsonableTree;

			const chunk = uniformChunkFromCursor(
				cursorForJsonableTreeNode(initialTree),
				parentNodeWithIdentifiersShape,
				1,
				true,
				testIdCompressor,
			);
			assert.deepEqual(chunk.values, [
				testIdCompressor.tryRecompress(id),
				"nonIdentifierValue",
				unknownStableId,
			]);

			const jsonableTree = mapCursorField(chunk.cursor(), jsonableTreeFromCursor);
			assert.deepEqual([initialTree], jsonableTree);
		});

		it("Initializing tree creates uniform chunks with encoded identifiers", async () => {
			const factory = new TreeFactory({
				jsonValidator: typeboxValidator,
				forest: ForestTypeOptimized,
			});

			const runtime = new MockFluidDataStoreRuntime({
				clientId: `test-client`,
				id: "test",
				idCompressor: testIdCompressor,
			});
			const tree = factory.create(
				runtime,
				"TestSharedTree",
			) as SharedTreeWithConnectionStateSetter;

			const stableId = testIdCompressor.decompress(testIdCompressor.generateCompressedId());

			class TreeWithIdentifier extends schemaFactory.object("treeWithIdentifier", {
				identifier: schemaFactory.identifier,
			}) {}
			const view = tree.viewWith(
				new TreeViewConfiguration({
					schema: TreeWithIdentifier,
				}),
			);
			view.initialize({ identifier: stableId });

			const forest = view.checkout.forest;
			assert(forest instanceof ChunkedForest);
			const uniformChunk = forest.roots.fields.get(rootFieldKey)?.at(0);
			assert(uniformChunk instanceof UniformChunk);
			const chunkValues = uniformChunk.values;
			assert.deepEqual(chunkValues, [testIdCompressor.recompress(stableId)]);
			assert.deepEqual(view.root.identifier, stableId);
			assert.deepEqual(Tree.shortId(view.root), testIdCompressor.recompress(stableId));

			// When getting the value from the cursor, check that the value is unencoded string
			const jsonableTree = mapCursorField(uniformChunk.cursor(), jsonableTreeFromCursor);
			assert.deepEqual(jsonableTree, [
				{
					fields: {
						identifier: [
							{
								type: "com.fluidframework.leaf.string",
								value: stableId,
							},
						],
					},
					type: "com.example.treeWithIdentifier",
				},
			]);
		});
	});
});
