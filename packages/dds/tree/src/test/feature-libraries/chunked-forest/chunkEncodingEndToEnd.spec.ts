/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import type { SessionId } from "@fluidframework/id-compressor";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";

import {
	type ChangesetLocalId,
	type IEditableForest,
	RevisionTagCodec,
	TreeStoredSchemaRepository,
} from "../../../core/index.js";
import { leaf } from "../../../domains/index.js";
import { typeboxValidator } from "../../../external-utilities/index.js";
import {
	Chunker,
	defaultChunkPolicy,
	tryShapeFromSchema,
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
	getTreeContext,
	intoStoredSchema,
	makeFieldBatchCodec,
	makeModularChangeCodecFamily,
	MockNodeKeyManager,
} from "../../../feature-libraries/index.js";
import {
	ForestType,
	type ISharedTreeEditor,
	type TreeContent,
} from "../../../shared-tree/index.js";
import {
	MockTreeCheckout,
	checkoutWithContent,
	cursorFromInsertableTreeField,
	flexTreeViewWithContent,
	numberSequenceRootSchema,
	testIdCompressor,
} from "../../utils.js";
import { SchemaFactory } from "../../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { toFlexSchema } from "../../../simple-tree/toFlexSchema.js";
import { SummaryType } from "@fluidframework/driver-definitions";
// eslint-disable-next-line import/no-internal-modules
import type { Format } from "../../../feature-libraries/forest-summary/format.js";
// eslint-disable-next-line import/no-internal-modules
import type { EncodedFieldBatch } from "../../../feature-libraries/chunked-forest/index.js";

const options = {
	jsonValidator: typeboxValidator,
	forest: ForestType.Optimized,
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
	schema: { schema: intoStoredSchema(numberSequenceRootSchema), policy: defaultSchemaPolicy },
};

const schemaFactory = new SchemaFactory("com.example");
class HasIdentifier extends schemaFactory.object("parent", {
	identifier: schemaFactory.identifier,
}) {}

function getIdentifierEncodingContext(id: string) {
	const initialTree = cursorFromInsertableTreeField(
		HasIdentifier,
		new HasIdentifier({ identifier: id }),
		new MockNodeKeyManager(),
	);
	const flexSchema = toFlexSchema(HasIdentifier);
	const flexConfig: TreeContent = {
		schema: flexSchema,
		initialTree,
	};
	const checkout = checkoutWithContent(flexConfig);

	const encoderContext = {
		encodeType: options.summaryEncodeType,
		idCompressor: testIdCompressor,
		originatorId: testIdCompressor.localSessionId,
		schema: {
			schema: intoStoredSchema(flexSchema),
			policy: defaultSchemaPolicy,
		},
	};
	return { encoderContext, checkout };
}

describe("End to end chunked encoding", () => {
	it(`insert ops shares reference with the original chunk.`, () => {
		const treeSchema = new TreeStoredSchemaRepository(
			intoStoredSchema(numberSequenceRootSchema),
		);
		const chunker = new Chunker(
			treeSchema,
			defaultSchemaPolicy,
			Number.POSITIVE_INFINITY,
			Number.POSITIVE_INFINITY,
			defaultChunkPolicy.uniformChunkNodeCount,
			tryShapeFromSchema,
		);

		const forest = buildChunkedForest(chunker);
		const numberShape = new TreeShape(leaf.number.name, true, []);
		const chunk = new UniformChunk(numberShape.withTopLevelLength(4), [1, 2, 3, 4]);
		assert(!chunk.isShared());
		const changeLog: ModularChangeset[] = [];

		const changeReceiver = (change: ModularChangeset) => {
			changeLog.push(change);
		};
		const codec = makeModularChangeCodecFamily(
			fieldKindConfigurations,
			revisionTagCodec,
			fieldBatchCodec,
			{ jsonValidator: typeboxValidator },
		);
		const dummyEditor = new DefaultEditBuilder(new DefaultChangeFamily(codec), changeReceiver);
		const checkout = new MockTreeCheckout(forest, dummyEditor as unknown as ISharedTreeEditor);
		const flexTree = getTreeContext(
			numberSequenceRootSchema,
			// Note: deliberately passing an editor that doesn't have the property for schema edition; test doesn't need it
			checkout,
			new MockNodeKeyManager(),
		);

		const root = flexTree.root;
		assert(root.is(numberSequenceRootSchema.rootFieldSchema));
		checkout.editor.sequenceField(root.getFieldPath()).insert(0, chunk.cursor());

		// Check that inserted change contains chunk which is reference equal to the original chunk.
		const insertedChange = changeLog[0];
		assert(insertedChange.builds !== undefined);
		const insertedChunk = insertedChange.builds.get([undefined, 0 as ChangesetLocalId]);
		assert.equal(insertedChunk, chunk);
		assert(chunk.isShared());
	});

	// This test (and the one below) are testing for an optimization in the decoding logic to save a copy of the data array.
	// This optimization is not implemented, so these tests fail, and are skipped.
	it.skip(`summary values are correct, and shares reference with the original chunk when inserting content.`, () => {
		const numberShape = new TreeShape(leaf.number.name, true, []);
		const chunk = new UniformChunk(numberShape.withTopLevelLength(4), [1, 2, 3, 4]);
		assert(!chunk.isShared());
		const flexTree = flexTreeViewWithContent({
			schema: numberSequenceRootSchema,
			initialTree: [],
		});

		flexTree.checkout.editor
			.sequenceField(flexTree.flexTree.getFieldPath())
			.insert(0, chunk.cursor());

		const forestSummarizer = new ForestSummarizer(
			flexTree.context.checkout.forest as IEditableForest,
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
		const numberShape = new TreeShape(leaf.number.name, true, []);
		const chunk = new UniformChunk(numberShape.withTopLevelLength(4), [1, 2, 3, 4]);
		assert(!chunk.isShared());

		const flexTree = flexTreeViewWithContent({
			schema: numberSequenceRootSchema,
			initialTree: chunk.cursor(),
		});

		const forestSummarizer = new ForestSummarizer(
			flexTree.context.checkout.forest as IEditableForest,
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
	});
});
