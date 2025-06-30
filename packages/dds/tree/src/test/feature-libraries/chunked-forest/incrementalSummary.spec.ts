/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { IExperimentalIncrementalSummaryContext } from "@fluidframework/runtime-definitions/internal";

import { typeboxValidator } from "../../../external-utilities/index.js";
import { Tree, ForestTypeOptimized, TreeAlpha } from "../../../shared-tree/index.js";
import { testIdCompressor } from "../../utils.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type TreeView,
} from "../../../simple-tree/index.js";
import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions";
// eslint-disable-next-line import/no-internal-modules
import { ChunkedForest } from "../../../feature-libraries/chunked-forest/chunkedForest.js";
import {
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";
import { configuredSharedTree, type ISharedTree } from "../../../treeFactory.js";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";

const schemaFactory = new SchemaFactory("com.example");

/* eslint-disable jsdoc/check-indentation */
/**
 * A schema that has the following structure to test 3 levels in the tree where incremental summaries
 * is possible:
 * Board
 * ├── boardId: string
 * └── lists: NoteList[]
 *     ├── listId: string
 *     └── notes: Note[] ---- supports incremental summaries
 *         ├── noteId: number
 *         ├── text: string
 *         ├── color: string
 *         └── metadata: NoteMetadata (optional) ---- supports incremental summaries
 *             ├── metadataId: number
 *             └── metaText: string (optional) ---- supports incremental summaries
 */
/* eslint-enable jsdoc/check-indentation */
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

function createInitialBoard(noteListCount: number, notesInListCount: number) {
	let nextNoteId = 1;
	const noteLists: NoteList[] = [];
	for (let i = 0; i < noteListCount; i++) {
		const notes: Note[] = [];
		for (let j = 0; j < notesInListCount; j++) {
			const addMetadata = j % 2 === 0; // Add metadata to every even number note in a list
			const addMetadataText: boolean = addMetadata && j % 4 === 0; // Add metadata text to every 2nd note with metadata
			const note = new Note({
				noteId: nextNoteId,
				text: `Note ${nextNoteId}`,
				color: `Color ${nextNoteId}`,
				metadata: addMetadata
					? {
							metadataId: nextNoteId,
							metaText: addMetadataText ? `Meta for Note ${nextNoteId}` : undefined,
						}
					: undefined,
			});
			notes.push(note);
			nextNoteId++;
		}
		const noteList = new NoteList({
			listId: `l${i}`,
			notes,
		});
		noteLists.push(noteList);
	}
	return new Board({
		boardId: "b1",
		lists: noteLists,
	});
}

/**
 * Helper function to update a note at noteIndex in list at listIndex in the given view.
 */
function updateNote(view: TreeView<typeof Board>, listIndex: number, noteIndex: number) {
	const list = view.root.lists.at(listIndex);
	assert(list !== undefined, `List at index ${listIndex} not found`);
	const note = list.notes.at(noteIndex);
	assert(note !== undefined, `Note at index ${noteIndex} not found in list ${listIndex}`);
	note.text = `Note ${noteIndex + 1} updated`;
}

/**
 * Helper function to update metadata for a note at noteIndex in list at listIndex in the given view.
 */
function updateMetadata(view: TreeView<typeof Board>, listIndex: number, noteIndex: number) {
	const list = view.root.lists.at(listIndex);
	assert(list !== undefined, `List at index ${listIndex} not found`);
	const note = list.notes.at(noteIndex);
	assert(note !== undefined, `Note at index ${noteIndex} not found in list ${listIndex}`);
	const metadata = note.metadata;
	assert(metadata !== undefined, `No metadata found for note at index ${noteIndex}`);
	metadata.metadataId = 100;
}

/**
 * Helper function to update metadata text for a note at noteIndex in list at listIndex in the given view.
 */
function updateMetadataText(
	view: TreeView<typeof Board>,
	listIndex: number,
	noteIndex: number,
) {
	const list = view.root.lists.at(listIndex);
	assert(list !== undefined, `List at index ${listIndex} not found`);
	const note = list.notes.at(noteIndex);
	assert(note !== undefined, `Note at index ${noteIndex} not found in list ${listIndex}`);
	const metadata = note.metadata;
	assert(metadata !== undefined, `No metadata found for note at index ${noteIndex}`);
	metadata.metaText = `Metadata for ${noteIndex + 1} updated`;
}

/**
 * Validates that the data in actual tree matches the data in the tree with expected view.
 */
function validateTreesEqual(
	actualTree: ISharedTree,
	expectedView: TreeView<typeof Board>,
): void {
	const actualView = actualTree.viewWith(
		new TreeViewConfiguration({
			schema: Board,
		}),
	);
	const actualRoot = actualView.root;
	const expectedRoot = expectedView.root;
	if (actualRoot === undefined || expectedRoot === undefined) {
		assert.equal(actualRoot === undefined, expectedRoot === undefined);
		return;
	}

	assert.equal(Tree.schema(actualRoot), Tree.schema(expectedRoot));
	assert.deepEqual(TreeAlpha.exportVerbose(actualRoot), TreeAlpha.exportVerbose(expectedRoot));
	assert.deepEqual(TreeAlpha.exportConcise(actualRoot), TreeAlpha.exportConcise(expectedRoot));
}

/**
 * Validates that the handle path exists in the summary tree. The handle path is split by "/" into
 * pathPaths where the first element should exist in the root of the summary tree, the second element
 * in the first element's subtree, and so on.
 */
function validateHandlePathExists(pathPaths: string[], summaryTree: ISummaryTree) {
	const currentPath = pathPaths[0];
	let found = false;
	for (const [key, summaryObject] of Object.entries(summaryTree.tree)) {
		if (key === currentPath) {
			found = true;
			if (pathPaths.length > 1) {
				assert(
					summaryObject.type === SummaryType.Tree || summaryObject.type === SummaryType.Handle,
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

/**
 * Validates that for each handle in the current summary, it's path exists in the last summary. This basically
 * validates that the handle paths in the current summary are valid.
 */
function validateHandlesInSummary(summary: ISummaryTree, lastSummary: ISummaryTree) {
	for (const [key, summaryObject] of Object.entries(summary.tree)) {
		if (summaryObject.type === SummaryType.Handle) {
			// Validate that the id (summary path) exists in lastSummary
			validateHandlePathExists(summaryObject.handle.split("/").slice(1), lastSummary);
		} else if (summaryObject.type === SummaryType.Tree) {
			// Recursively validate nested trees
			validateHandlesInSummary(summaryObject, lastSummary);
		}
	}
}

/**
 * Validates that there are no handles in the forest's summary tree.
 */
function validateNoHandlesInForest(forestSummary: ISummaryTree) {
	for (const [key, summaryObject] of Object.entries(forestSummary.tree)) {
		assert(
			summaryObject.type !== SummaryType.Handle,
			`Unexpected handle in summary tree at key: ${key}`,
		);
		if (summaryObject.type === SummaryType.Tree) {
			// Recursively validate nested trees
			validateNoHandlesInForest(summaryObject);
		}
	}
}

/**
 * Validates that are no handles in the forest's summary subtree in the given summary tree.
 */
function validateNoHandlesInSummary(summary: ISummaryTree) {
	for (const [key, summaryObject] of Object.entries(summary.tree)) {
		if (summaryObject.type === SummaryType.Tree) {
			if (key === "Forest") {
				validateNoHandlesInForest(summaryObject);
			} else {
				// Recursively find forest tree
				validateNoHandlesInSummary(summaryObject);
			}
		}
	}
}

describe("Forest incremental summary", () => {
	let factory: IChannelFactory;
	let tree1: ISharedTree;
	let view1: TreeView<typeof Board>;
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
		tree1 = factory.create(dataStoreRuntime1, "TestSharedTree") as ISharedTree;

		view1 = tree1.viewWith(
			new TreeViewConfiguration({
				schema: Board,
			}),
		);

		view1.initialize(createInitialBoard(3, 2));

		const forest = tree1.kernel.checkout.forest;
		assert(forest instanceof ChunkedForest);
	});

	const testWithSuccessfulSummaries = async () => {
		// This mocks the first summary at sequence number 0.
		const summary1 = await tree1.summarize();

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
				objectStorage: MockStorage.createFromSummary(summary1.summary),
			},
			factory.attributes,
		)) as ISharedTree;
		validateTreesEqual(tree2, view1);

		updateNote(view1, 0 /* listIndex */, 0 /* noteIndex */);
		updateMetadata(view1, 1 /* listIndex */, 0 /* noteIndex */);
		updateMetadataText(view1, 2 /* listIndex */, 0 /* noteIndex */);

		// Second summary at sequence number 10 - previous was at sequence number 0.
		const incrementalSummaryContext2: IExperimentalIncrementalSummaryContext = {
			summarySequenceNumber: 10,
			latestSummarySequenceNumber: 0,
			summaryPath: "",
		};
		const summary2 = await tree1.summarize(
			undefined,
			undefined,
			undefined,
			incrementalSummaryContext2,
		);
		assert(summary2 !== undefined);
		validateHandlesInSummary(summary2.summary, summary1.summary);

		updateNote(view1, 0 /* listIndex */, 0 /* noteIndex */);
		updateMetadata(view1, 0 /* listIndex */, 0 /* noteIndex */);
		updateMetadata(view1, 1 /* listIndex */, 0 /* noteIndex */);

		// Third summary at sequence number 20 - previous was at sequence number 10.
		const incrementalSummaryContext3: IExperimentalIncrementalSummaryContext = {
			summarySequenceNumber: 20,
			latestSummarySequenceNumber: 10,
			summaryPath: "",
		};
		const summary3 = await tree1.summarize(
			undefined,
			undefined,
			undefined,
			incrementalSummaryContext3,
		);
		assert(summary3 !== undefined);
		validateHandlesInSummary(summary3.summary, summary2.summary);

		return incrementalSummaryContext3;
	};

	it("incremental summaries", async () => {
		await testWithSuccessfulSummaries();
	});

	it("incremental summaries with a failed summary in between", async () => {
		const previousIncrementalSummaryContext = await testWithSuccessfulSummaries();

		// Simulate a scenario where the precious summary fails by setting the latest summary sequence number
		// in the next summary's incrementalSummaryContext not to the previous summary but the last successful
		// summary before that.
		// This next summary should be a full tree summary.
		const newIncrementalSummaryContext: IExperimentalIncrementalSummaryContext = {
			summarySequenceNumber: 30,
			latestSummarySequenceNumber:
				previousIncrementalSummaryContext.latestSummarySequenceNumber,
			summaryPath: "",
		};
		const newSummary = await tree1.summarize(
			undefined,
			undefined,
			undefined,
			newIncrementalSummaryContext,
		);
		assert(newSummary !== undefined);
		validateNoHandlesInSummary(newSummary.summary);
	});
});
