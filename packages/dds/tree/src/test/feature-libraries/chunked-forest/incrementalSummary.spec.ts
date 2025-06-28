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

const updateNote = (view: TreeView<typeof Board>, listIndex: number, noteIndex: number) => {
	const list = view.root.lists.at(listIndex);
	assert(list !== undefined);
	const note = list.notes.at(noteIndex);
	assert(note !== undefined);
	note.text = `Note ${noteIndex + 1} updated`;
};

const updateMetadata = (
	view: TreeView<typeof Board>,
	listIndex: number,
	noteIndex: number,
) => {
	const list = view.root.lists.at(listIndex);
	assert(list !== undefined);
	const note = list.notes.at(noteIndex);
	assert(note !== undefined);
	const metadata = note.metadata;
	assert(metadata !== undefined, "No metadata to update");
	metadata.metadataId = 100;
};

const updateMetadataText = (
	view: TreeView<typeof Board>,
	listIndex: number,
	noteIndex: number,
) => {
	const list = view.root.lists.at(listIndex);
	assert(list !== undefined);
	const note = list.notes.at(noteIndex);
	assert(note !== undefined);
	const metadata = note.metadata;
	assert(metadata !== undefined, "No metadata to update");
	metadata.metaText = `Metadata for ${noteIndex + 1} updated`;
};

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

	// Validate the same schema objects are used.
	assert.equal(Tree.schema(actualRoot), Tree.schema(expectedRoot));

	// This should catch all cases, assuming exportVerbose works correctly.
	assert.deepEqual(TreeAlpha.exportVerbose(actualRoot), TreeAlpha.exportVerbose(expectedRoot));

	// Since this uses some of the tools to compare trees that this is testing for, perform the comparison in a few ways to reduce risk of a bug making this pass when it shouldn't:
	// This case could have false negatives (two trees with ambiguous schema could export the same concise tree),
	// but should have no false positives since equal trees always have the same concise tree.
	assert.deepEqual(TreeAlpha.exportConcise(actualRoot), TreeAlpha.exportConcise(expectedRoot));
}

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

function validateSummaryTree(currentSummary: ISummaryTree, lastSummary: ISummaryTree) {
	for (const [key, summaryObject] of Object.entries(currentSummary.tree)) {
		if (summaryObject.type === SummaryType.Handle) {
			// Validate that the id (summary path) exists in lastSummary
			validateHandlePathExists(summaryObject.handle.split("/").slice(1), lastSummary);
		} else if (summaryObject.type === SummaryType.Tree) {
			// Recursively validate nested trees
			validateSummaryTree(summaryObject, lastSummary);
		}
	}
}

function validateNoHandlesInForestTree(summary: ISummaryTree) {
	for (const [key, summaryObject] of Object.entries(summary.tree)) {
		assert(
			summaryObject.type !== SummaryType.Handle,
			`Unexpected handle in summary tree at key: ${key}`,
		);
		if (summaryObject.type === SummaryType.Tree) {
			// Recursively validate nested trees
			validateNoHandlesInForestTree(summaryObject);
		}
	}
}

function validateNoHandlesInSummaryTree(summary: ISummaryTree) {
	for (const [key, summaryObject] of Object.entries(summary.tree)) {
		if (summaryObject.type === SummaryType.Tree) {
			if (key === "Forest") {
				validateNoHandlesInForestTree(summaryObject);
			} else {
				// Recursively find forest tree
				validateNoHandlesInSummaryTree(summaryObject);
			}
		}
	}
}

describe.only("Forest incremental summary", () => {
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

		updateNote(view1, 0, 0);
		updateMetadata(view1, 1, 0);
		updateMetadataText(view1, 2, 0);

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
		validateSummaryTree(summary2.summary, summary1.summary);

		updateNote(view1, 0, 0);
		updateMetadata(view1, 0, 0);
		updateMetadata(view1, 1, 0);

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
		validateSummaryTree(summary3.summary, summary2.summary);

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
		validateNoHandlesInSummaryTree(newSummary.summary);
	});
});
