/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
	AllowedUpdateType,
	ChangesetLocalId,
	IEditableForest,
	ITreeCursorSynchronous,
	TreeStoredSchemaRepository,
	mapCursorField,
	rootFieldKey,
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
import { ForestType, SharedTreeFactory } from "../../../shared-tree";
import { SummarizeType, TestTreeProvider, jsonSequenceRootSchema } from "../../utils";
import { noopValidator } from "../../../codec";
import { brand } from "../../../util";
import {
	Chunker,
	defaultChunkPolicy,
	tryShapeFromSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/chunkTree";
// eslint-disable-next-line import/no-internal-modules
import { decode } from "../../../feature-libraries/chunked-forest/codec/chunkDecoding";

// TODO: Currently we split up a uniform chunk into several individual basicChunks for each node during op creation.
// Therefore, there is currently no way for us to retrieve a uniform chunk from the tree for us to make the proper checks,
// and the tests are expected to fail. The tests can be unskipped once uniform chunks can be inserted into the tree.
describe.skip("End to End chunked encoding", () => {
	it(`insert op values are correct, and shares reference with the original chunk.`, async () => {
		const treeSchema = new TreeStoredSchemaRepository(intoStoredSchema(jsonSequenceRootSchema));
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
		const chunkCursor = chunk.cursor();

		// This function is declared in the test to have access to the original uniform chunk for comparison.
		function createFlexTree(editableForest: IEditableForest, schema: FlexTreeSchema): Context {
			const changes: ModularChangeset[] = [];
			const changeReceiver = (change: ModularChangeset) => {
				assert(change.builds !== undefined);
				// TODO: This chunk is actually a BasicChunk which was split from the original UniformChunk split up.
				// This is expected to fail currently, but should eventually pass once we have the ability to insert UniformChunk.
				const insertedChunk = change.builds.get(undefined)?.get(0 as ChangesetLocalId);
				assert.equal(insertedChunk, chunk);
				assert(chunk.isShared());
				changes.push(change);
			};
			const dummyEditor = new DefaultEditBuilder(
				new DefaultChangeFamily({ jsonValidator: noopValidator }),
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

		const flexTree = createFlexTree(forest, jsonSequenceRootSchema);
		// This conversion is currently required for inserting a uniform chunk with a topLevelLength > 1.
		const content: ITreeCursorSynchronous[] = prepareFieldCursorForInsert(chunkCursor);

		flexTree.editor
			.sequenceField({ parent: undefined, field: rootFieldKey })
			.insert(0, content);
	});

	it(`summary values are correct, and shares reference with the original chunk.`, async () => {
		const factory = new SharedTreeFactory({
			jsonValidator: typeboxValidator,
			forest: ForestType.Optimized,
			summaryEncodeType: TreeCompressionStrategy.Compressed,
		});
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand, factory);
		const tree = provider.trees[0];
		const flexTree = tree.schematizeInternal({
			allowedSchemaModifications: AllowedUpdateType.None,
			schema: jsonSequenceRootSchema,
			initialTree: [],
		});

		const numberShape = new TreeShape(leaf.number.name, true, []);
		const chunk = new UniformChunk(numberShape.withTopLevelLength(4), [1, 2, 3, 4]);
		assert(!chunk.isShared());

		flexTree.editableTree.insertAt(0, chunk.cursor());
		await provider.ensureSynchronized();

		const options = {
			jsonValidator: noopValidator,
			forest: ForestType.Optimized,
			summaryEncodeType: TreeCompressionStrategy.Compressed,
		};
		const fieldBatchCodec = makeFieldBatchCodec(options);
		const forestSummarizer = new ForestSummarizer(
			tree.view.forest,
			new TreeStoredSchemaRepository(intoStoredSchema(jsonSequenceRootSchema)),
			defaultSchemaPolicy,
			options.summaryEncodeType,
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

function prepareFieldCursorForInsert(cursor: ITreeCursorSynchronous): ITreeCursorSynchronous[] {
	// TODO: optionally validate content against schema.

	// Convert from the desired API (single field cursor) to the currently required API (array of node cursors).
	// This is inefficient, and particularly bad if the data was efficiently chunked using uniform chunks.
	// TODO: update editing APIs to take in field cursors not arrays of node cursors, then remove this copying conversion.
	return mapCursorField(cursor, () => cursorForMapTreeNode(mapTreeFromCursor(cursor)));
}
