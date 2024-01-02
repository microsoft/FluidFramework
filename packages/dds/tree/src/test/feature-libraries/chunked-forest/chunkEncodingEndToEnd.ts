/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { SessionId, createIdCompressor } from "@fluidframework/id-compressor";
import {
	ChangesetLocalId,
	IEditableForest,
	TreeStoredSchemaRepository,
	mapCursorField,
} from "../../../core";
import { leaf } from "../../../domains";
import { typeboxValidator } from "../../../external-utilities";
import {
	Context,
	DefaultChangeFamily,
	DefaultEditBuilder,
	FlexTreeSchema,
	ForestSummarizer,
	ModularChangeset,
	TreeCompressionStrategy,
	buildChunkedForest,
	createMockNodeKeyManager,
	cursorForMapTreeNode,
	defaultSchemaPolicy,
	getTreeContext,
	intoStoredSchema,
	makeFieldBatchCodec,
	mapTreeFromCursor,
	nodeKeyFieldKey,
} from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { TreeShape, UniformChunk } from "../../../feature-libraries/chunked-forest/uniformChunk";
import { ForestType } from "../../../shared-tree";
import { flexTreeViewWithContent, numberSequenceRootSchema } from "../../utils";
import { brand } from "../../../util";
import {
	Chunker,
	defaultChunkPolicy,
	tryShapeFromSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree";
// eslint-disable-next-line import/no-internal-modules
import { decode } from "../../../feature-libraries/chunked-forest/codec/chunkDecoding";

const options = {
	jsonValidator: typeboxValidator,
	forest: ForestType.Optimized,
	summaryEncodeType: TreeCompressionStrategy.Compressed,
};

const context = {
	encodeType: options.summaryEncodeType,
	schema: { schema: intoStoredSchema(numberSequenceRootSchema), policy: defaultSchemaPolicy },
};

const fieldBatchCodec = makeFieldBatchCodec({ jsonValidator: typeboxValidator }, context);
const sessionId = "beefbeef-beef-4000-8000-000000000001" as SessionId;
const idCompressor = createIdCompressor(sessionId);

// TODO: Currently we split up a uniform chunk into several individual basicChunks for each node during op creation.
// Therefore, there is currently no way for us to retrieve a uniform chunk from the tree for us to make the proper checks,
// and the tests are expected to fail. The tests can be unskipped once uniform chunks can be inserted into the tree.
describe.skip("End to End chunked encoding", () => {
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

		// This function is declared in the test to have access to push changes to the changelog declared outside of this function.
		function createFlexTree(editableForest: IEditableForest, schema: FlexTreeSchema): Context {
			const changeReceiver = (change: ModularChangeset) => {
				changeLog.push(change);
			};
			const dummyEditor = new DefaultEditBuilder(
				new DefaultChangeFamily(idCompressor, fieldBatchCodec, {
					jsonValidator: typeboxValidator,
				}),
				changeReceiver,
			);
			return getTreeContext(
				schema,
				editableForest,
				dummyEditor,
				createMockNodeKeyManager(),
				brand(nodeKeyFieldKey),
			);
		}

		const flexTree = createFlexTree(forest, numberSequenceRootSchema);
		const root = flexTree.root;
		assert(root.is(numberSequenceRootSchema.rootFieldSchema));
		root.insertAt(0, chunk.cursor());

		// Check that inserted change contains chunk which is reference equal to the original chunk.
		const insertedChange = changeLog[0];
		assert(insertedChange.builds !== undefined);
		// TODO: This chunk is actually a BasicChunk which was split from the original UniformChunk split up.
		// This is expected to fail currently, but should eventually pass once we have the ability to insert UniformChunk.
		const insertedChunk = insertedChange.builds.get(undefined)?.get(0 as ChangesetLocalId);
		assert.equal(insertedChunk, chunk);
		assert(chunk.isShared());
	});

	it(`summary values are correct, and shares reference with the original chunk when inserting content.`, () => {
		const numberShape = new TreeShape(leaf.number.name, true, []);
		const chunk = new UniformChunk(numberShape.withTopLevelLength(4), [1, 2, 3, 4]);
		assert(!chunk.isShared());
		const flexTree = flexTreeViewWithContent({
			schema: numberSequenceRootSchema,
			initialTree: [],
		});

		flexTree.editableTree.insertAt(0, chunk.cursor());

		const forestSummarizer = new ForestSummarizer(
			flexTree.context.forest as IEditableForest,
			idCompressor,
			fieldBatchCodec,
			options,
		);

		// This function is declared in the test to have access to the original uniform chunk for comparison.
		function stringifier(content: unknown) {
			const insertedChunk = decode((content as any).fields);
			assert.equal(insertedChunk, chunk);
			assert(chunk.isShared());
			return JSON.stringify(content);
		}
		forestSummarizer.getAttachSummary(stringifier);
	});

	it(`summary values are correct, and shares reference with the original chunk when initializing with content.`, () => {
		const numberShape = new TreeShape(leaf.number.name, true, []);
		const chunk = new UniformChunk(numberShape.withTopLevelLength(4), [1, 2, 3, 4]);
		assert(!chunk.isShared());

		const flexTree = flexTreeViewWithContent({
			schema: numberSequenceRootSchema,
			// TODO: Replace mapping of 'fieldCursor' to 'nodeCursors' with 'chunk.cursor()'
			// once 'NewFieldContent' in 'contextuallyTyped.ts' supports 'fieldCursor'.
			// Current implementation is a workaround for type limitations.
			initialTree: mapCursorField(chunk.cursor(), (cursor) =>
				cursorForMapTreeNode(mapTreeFromCursor(cursor)),
			),
		});

		const forestSummarizer = new ForestSummarizer(
			flexTree.context.forest as IEditableForest,
			idCompressor,
			fieldBatchCodec,
			options,
		);

		// This function is declared in the test to have access to the original uniform chunk for comparison.
		function stringifier(content: unknown) {
			const insertedChunk = decode((content as any).fields);
			assert.equal(insertedChunk, chunk);
			assert(chunk.isShared());
			return JSON.stringify(content);
		}
		forestSummarizer.getAttachSummary(stringifier);
	});
});
