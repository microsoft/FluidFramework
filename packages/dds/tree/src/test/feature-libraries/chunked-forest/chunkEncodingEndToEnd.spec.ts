/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { SessionId } from "@fluidframework/id-compressor";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import type { IExperimentalIncrementalSummaryContext } from "@fluidframework/runtime-definitions/internal";

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
	MockNodeIdentifierManager,
	jsonableTreeFromCursor,
	cursorForJsonableTreeNode,
} from "../../../feature-libraries/index.js";
import {
	type ISharedTreeEditor,
	Tree,
	ForestTypeOptimized,
	type ITreePrivate,
	TreeAlpha,
} from "../../../shared-tree/index.js";
import {
	MockTreeCheckout,
	checkoutWithContent,
	forestWithContent,
	getView,
	mintRevisionTag,
	testIdCompressor,
} from "../../utils.js";
import {
	numberSchema,
	SchemaFactory,
	stringSchema,
	TreeViewConfiguration,
	type TreeView,
} from "../../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { toStoredSchema } from "../../../simple-tree/toStoredSchema.js";
import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions";
// eslint-disable-next-line import/no-internal-modules
import type { Format } from "../../../feature-libraries/forest-summary/format.js";
import type {
	EncodedFieldBatch,
	FieldBatchEncodingContext,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/chunked-forest/index.js";
import { jsonSequenceRootSchema } from "../../sequenceRootUtils.js";
import { JsonAsTree } from "../../../jsonDomainSchema.js";
import { brand } from "../../../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { ChunkedForest } from "../../../feature-libraries/chunked-forest/chunkedForest.js";
import {
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";
import { configuredSharedTree, type ISharedTree } from "../../../treeFactory.js";
import type {
	IChannel,
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";
import { FluidClientVersion, type CodecWriteOptions } from "../../../codec/index.js";

const options: CodecWriteOptions = {
	jsonValidator: typeboxValidator,
	oldestCompatibleClient: FluidClientVersion.v2_0,
};

const fieldBatchCodec = makeFieldBatchCodec({ jsonValidator: typeboxValidator }, 1);
const sessionId = "beefbeef-beef-4000-8000-000000000001" as SessionId;
const idCompressor = createIdCompressor(sessionId);
const revisionTagCodec = new RevisionTagCodec(idCompressor);

const context: FieldBatchEncodingContext = {
	encodeType: TreeCompressionStrategy.Compressed,
	idCompressor,
	originatorId: idCompressor.localSessionId,
	schema: { schema: jsonSequenceRootSchema, policy: defaultSchemaPolicy },
};

const schemaFactory = new SchemaFactory("com.example");
class HasIdentifier extends schemaFactory.object("parent", {
	identifier: schemaFactory.identifier,
}) {}

function getIdentifierEncodingContext(id: string) {
	const view = getView(new TreeViewConfiguration({ schema: HasIdentifier }));
	view.initialize({ identifier: id });
	const flexSchema = toStoredSchema(HasIdentifier);
	const checkout = view.checkout;

	const encoderContext: FieldBatchEncodingContext = {
		encodeType: TreeCompressionStrategy.Compressed,
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
		checkout.editor.sequenceField({ field: rootFieldKey, parent: undefined }).insert(0, chunk);
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

		checkout.editor.sequenceField({ field: rootFieldKey, parent: undefined }).insert(0, chunk);

		const forestSummarizer = new ForestSummarizer(
			checkout.forest,
			revisionTagCodec,
			fieldBatchCodec,
			context,
			options,
			idCompressor,
		);

		// This function is declared in the test to have access to the original uniform chunk for comparison.
		function stringify(content: unknown) {
			const insertedChunk = decode((content as Format).fields as EncodedFieldBatch, {
				idCompressor,
				originatorId: idCompressor.localSessionId,
			});
			assert.equal(insertedChunk, chunk);
			assert(chunk.isShared());
			return JSON.stringify(content);
		}
		forestSummarizer.summarize({ stringify });
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
		function stringify(content: unknown) {
			const insertedChunk = decode((content as Format).fields as EncodedFieldBatch, {
				idCompressor,
				originatorId: idCompressor.localSessionId,
			});
			assert.equal(insertedChunk, chunk);
			assert(chunk.isShared());
			return JSON.stringify(content);
		}
		forestSummarizer.summarize({ stringify });
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

			const { summary } = forestSummarizer.summarize({ stringify: JSON.stringify });
			const tree = summary.tree.ForestTree;
			assert(tree.type === SummaryType.Blob);
			const treeContent = JSON.parse(tree.content as string);
			const identifierValue = treeContent.fields.data[0][1];
			// Check that the identifierValue is compressed.
			assert.equal(identifierValue, testIdCompressor.recompress(id));
		});

		it("is the uncompressed value when it is an unknown  identifier", () => {
			// generate an id from a different id compressor.
			const nodeKeyManager = new MockNodeIdentifierManager();
			const id = nodeKeyManager.stabilizeNodeIdentifier(
				nodeKeyManager.generateLocalNodeIdentifier(),
			);

			const { encoderContext, checkout } = getIdentifierEncodingContext(id);

			const forestSummarizer = new ForestSummarizer(
				checkout.forest,
				new RevisionTagCodec(testIdCompressor),
				fieldBatchCodec,
				encoderContext,
				options,
				testIdCompressor,
			);

			const { summary } = forestSummarizer.summarize({ stringify: JSON.stringify });
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

			const { summary } = forestSummarizer.summarize({ stringify: JSON.stringify });
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

			const identifierShape = new TreeShape(brand(JsonAsTree.JsonObject.identifier), false, [
				[identifierField, stringShape, 1],
			]);

			const parentNodeWithIdentifiersShape = new TreeShape(
				brand(JsonAsTree.JsonObject.identifier),
				false,
				[
					[identifierParent, identifierShape, 1],
					[nonIdentifierField, stringShape, 1],
					[unknownStableIdField, stringShape, 1],
				],
			);

			const id = testIdCompressor.decompress(testIdCompressor.generateCompressedId());

			// Create a stable id from a different source.
			const nodeKeyManager = new MockNodeIdentifierManager();
			const unknownStableId = nodeKeyManager.generateStableNodeIdentifier();

			const initialTree = {
				type: brand(JsonAsTree.JsonObject.identifier),
				fields: {
					identifierParent: [
						{
							type: brand(JsonAsTree.JsonObject.identifier),
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
			const factory = configuredSharedTree({
				jsonValidator: typeboxValidator,
				forest: ForestTypeOptimized,
			}).getFactory();

			const runtime = new MockFluidDataStoreRuntime({
				clientId: `test-client`,
				id: "test",
				idCompressor: testIdCompressor,
			});
			const tree = factory.create(runtime, "TestSharedTree") as ITreePrivate & IChannel;

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

			const forest = tree.kernel.checkout.forest;
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

	describe.only("Forest incremental summary", () => {
		class NoteMetadata extends schemaFactory.object("subNote", {
			metadataId: schemaFactory.number,
			metaText: schemaFactory.optional(schemaFactory.string),
		}) {}
		class Note extends schemaFactory.object("note", {
			noteId: schemaFactory.number,
			text: schemaFactory.string,
			color: schemaFactory.string,
			metadata: schemaFactory.optional(NoteMetadata),
		}) {}
		class NoteList extends schemaFactory.object("noteList", {
			listId: schemaFactory.identifier,
			notes: schemaFactory.array(Note),
		}) {}

		class Board extends schemaFactory.object("board", {
			boardId: schemaFactory.string,
			lists: schemaFactory.array(NoteList),
		}) {}

		let factory: IChannelFactory;
		let tree: ISharedTree;
		let dataStoreRuntime1: MockFluidDataStoreRuntime;

		beforeEach(() => {
			factory = configuredSharedTree({
				jsonValidator: typeboxValidator,
				forest: ForestTypeOptimized,
			}).getFactory();

			dataStoreRuntime1 = new MockFluidDataStoreRuntime({
				clientId: `test-client`,
				id: "test",
				idCompressor: testIdCompressor,
			});
			tree = factory.create(dataStoreRuntime1, "TestSharedTree") as ISharedTree;
		});

		function createInitialBoard() {
			const note1 = new Note({
				noteId: 1,
				text: "Note 1",
				color: "red",
				metadata: {
					metadataId: 1,
					metaText: "Meta 1",
				},
			});
			const note2 = new Note({
				noteId: 2,
				text: "Note 2",
				color: "yellow",
				metadata: {
					metadataId: 2,
				},
			});
			const noteList1 = new NoteList({
				listId: "l1",
				notes: [note1, note2],
			});

			const note3 = new Note({
				noteId: 3,
				text: "Note 3",
				color: "blue",
				metadata: {
					metadataId: 3,
					metaText: "Meta 3",
				},
			});
			const note4 = new Note({
				noteId: 4,
				text: "Note 4",
				color: "green",
			});
			const noteList2 = new NoteList({
				listId: "l2",
				notes: [note3, note4],
			});

			const note5 = new Note({
				noteId: 5,
				text: "Note 5",
				color: "purple",
				metadata: {
					metadataId: 5,
					metaText: "Meta 5",
				},
			});
			const noteList3 = new NoteList({
				listId: "l3",
				notes: [note5],
			});
			return new Board({
				boardId: "b1",
				lists: [noteList1, noteList2, noteList3],
			});
		}

		function validateTreesEqual(
			actualView: TreeView<typeof Board>,
			expectedView: TreeView<typeof Board>,
		): void {
			const actualRoot = actualView.root;
			const expectedRoot = expectedView.root;
			if (actualRoot === undefined || expectedRoot === undefined) {
				assert.equal(actualRoot === undefined, expectedRoot === undefined);
				return;
			}

			// Validate the same schema objects are used.
			assert.equal(Tree.schema(actualRoot), Tree.schema(expectedRoot));

			// This should catch all cases, assuming exportVerbose works correctly.
			assert.deepEqual(
				TreeAlpha.exportVerbose(actualRoot),
				TreeAlpha.exportVerbose(expectedRoot),
			);

			// Since this uses some of the tools to compare trees that this is testing for, perform the comparison in a few ways to reduce risk of a bug making this pass when it shouldn't:
			// This case could have false negatives (two trees with ambiguous schema could export the same concise tree),
			// but should have no false positives since equal trees always have the same concise tree.
			assert.deepEqual(
				TreeAlpha.exportConcise(actualRoot),
				TreeAlpha.exportConcise(expectedRoot),
			);
		}

		function validateHandlePathExists(pathPaths: string[], summaryTree: ISummaryTree) {
			const currentPath = pathPaths[0];
			let found = false;
			for (const [key, summaryObject] of Object.entries(summaryTree.tree)) {
				if (key === currentPath) {
					found = true;
					if (pathPaths.length > 1) {
						assert(
							summaryObject.type === SummaryType.Tree ||
								summaryObject.type === SummaryType.Handle,
							`Handle path ${currentPath} should be for a subtree or a handle`,
						);
						if (summaryObject.type === SummaryType.Tree) {
							validateHandlePathExists(pathPaths.slice(1), summaryObject);
						}
					}
					break;
				}
			}
			assert(found, `Handle path ${currentPath} not found in summary tree`);
		}

		function validateSummaryTree(currentSummary: ISummaryTree, lastSummary: ISummaryTree) {
			for (const [key, summaryObject] of Object.entries(currentSummary.tree)) {
				if (summaryObject.type === SummaryType.Handle) {
					// Validate that the id (summary path) exists in lastSummary
					validateHandlePathExists(summaryObject.handle.split("/").slice(1), lastSummary);
					console.log(`Validated handle path: ${summaryObject.handle}`);
				} else if (summaryObject.type === SummaryType.Tree) {
					// Recursively validate nested trees
					validateSummaryTree(summaryObject, lastSummary);
				}
			}
		}

		it("3 levels of incrementality", async () => {
			const view = tree.viewWith(
				new TreeViewConfiguration({
					schema: Board,
				}),
			);

			view.initialize(createInitialBoard());

			const forest = tree.kernel.checkout.forest;
			assert(forest instanceof ChunkedForest);

			// This mocks the first summary at sequence number 0.
			const summary = await tree.summarize();

			const dataStoreRuntime2 = new MockFluidDataStoreRuntime({
				clientId: `test-client-2`,
				id: "test",
				idCompressor: testIdCompressor,
			});
			const tree2 = (await factory.load(
				dataStoreRuntime2,
				"TestSharedTree2",
				{
					deltaConnection: dataStoreRuntime2.createDeltaConnection(),
					objectStorage: MockStorage.createFromSummary(summary.summary),
				},
				factory.attributes,
			)) as ISharedTree;
			assert(tree2 !== undefined);
			const view2 = tree2.viewWith(
				new TreeViewConfiguration({
					schema: Board,
				}),
			);
			validateTreesEqual(view2, view);

			const updateNote = (listIndex: number, noteIndex: number) => {
				const list = view.root.lists.at(listIndex);
				assert(list !== undefined);
				const note = list.notes.at(noteIndex);
				assert(note !== undefined);
				note.text = `Note ${noteIndex + 1} updated`;
			};

			const updateMetadata = (listIndex: number, noteIndex: number) => {
				const list = view.root.lists.at(listIndex);
				assert(list !== undefined);
				const note = list.notes.at(noteIndex);
				assert(note !== undefined);
				const metadata = note.metadata;
				assert(metadata !== undefined, "No metadata to update");
				metadata.metadataId = 100;
			};

			const updateMetadataText = (listIndex: number, noteIndex: number) => {
				const list = view.root.lists.at(listIndex);
				assert(list !== undefined);
				const note = list.notes.at(noteIndex);
				assert(note !== undefined);
				const metadata = note.metadata;
				assert(metadata !== undefined, "No metadata to update");
				metadata.metaText = `Metadata for ${noteIndex + 1} updated`;
			};

			updateNote(0, 0);
			updateMetadata(1, 0);
			updateMetadataText(2, 0);

			// Second summary at sequence number 10 - previous was at sequence number 0.
			const incrementalSummaryContext: IExperimentalIncrementalSummaryContext = {
				summarySequenceNumber: 10,
				latestSummarySequenceNumber: 0,
				summaryPath: "",
			};
			const summary2 = await tree.summarize(
				undefined,
				undefined,
				undefined,
				incrementalSummaryContext,
			);
			assert(summary2 !== undefined);
			validateSummaryTree(summary2.summary, summary.summary);

			updateNote(0, 0);
			updateMetadata(0, 0);
			updateMetadata(1, 0);

			// Third summary at sequence number 20 - previous was at sequence number 10.
			const incrementalSummaryContext2: IExperimentalIncrementalSummaryContext = {
				summarySequenceNumber: 20,
				latestSummarySequenceNumber: 10,
				summaryPath: "",
			};
			const summary3 = await tree.summarize(
				undefined,
				undefined,
				undefined,
				incrementalSummaryContext2,
			);
			assert(summary3 !== undefined);
			validateSummaryTree(summary3.summary, summary2.summary);
		});
	});
});
