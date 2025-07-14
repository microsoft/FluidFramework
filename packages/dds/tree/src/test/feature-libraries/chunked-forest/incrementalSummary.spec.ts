/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import type {
	IExperimentalIncrementalSummaryContext,
	ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions/internal";

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
// eslint-disable-next-line import/no-internal-modules
import { forestSummaryKey } from "../../../feature-libraries/forest-summary/forestSummarizer.js";
// eslint-disable-next-line import/no-internal-modules
import { expectTreesEqual } from "../../simple-tree/api/treeNodeApi.spec.js";

const schemaFactory = new SchemaFactory("com.example");

/* eslint-disable jsdoc/check-indentation */
/**
 * A schema that has the following structure to test incremental summaries at 3 levels in the tree:
 * Board
 * ├── boardId: string
 * └── lists: NoteList[]
 *     ├── listId: string
 *     └── notes: Note[] ---- supports incremental summaries
 *         ├── noteId: number
 *         ├── text: string
 *         ├── color: string
 *         └── label: NoteLabel (optional) ---- supports incremental summaries
 *             ├── labelId: number
 *             └── labelText: string (optional) ---- supports incremental summaries
 */
/* eslint-enable jsdoc/check-indentation */
class NoteLabel extends schemaFactory.object("noteLabel", {
	labelId: schemaFactory.number,
	labelText: schemaFactory.optional(schemaFactory.string),
}) {}
class Note extends schemaFactory.object("note", {
	noteId: schemaFactory.number,
	text: schemaFactory.string,
	color: schemaFactory.string,
	label: schemaFactory.optional(NoteLabel),
}) {}
class NoteList extends schemaFactory.object("noteList", {
	listId: schemaFactory.identifier,
	notes: schemaFactory.array(Note),
}) {}
class Board extends schemaFactory.object("board", {
	boardId: schemaFactory.string,
	lists: schemaFactory.array(NoteList),
}) {}

/**
 * Creates an initial board with the specified number of note lists and notes in each list.
 * Each note will have a unique ID, and every even-numbered note will have a label.
 * Every 4th even-numbered note will have label text.
 *
 * @param noteListCount - The number of note lists to create.
 * @param notesInListCount - The number of notes in each list.
 */
function createInitialBoard(noteListCount: number, notesInListCount: number) {
	let nextNoteId = 1;
	const noteLists: NoteList[] = [];
	for (let i = 0; i < noteListCount; i++) {
		const notes: Note[] = [];
		for (let j = 0; j < notesInListCount; j++) {
			const addLabel = j % 2 === 0; // Add label to every even number note in a list
			const addLabelText: boolean = addLabel && j % 4 === 0; // Add label text to every 2nd note with label
			const note = new Note({
				noteId: nextNoteId,
				text: `Note ${nextNoteId}`,
				color: `Color ${nextNoteId}`,
				label: addLabel
					? {
							labelId: nextNoteId,
							labelText: addLabelText ? `Label for Note ${nextNoteId}` : undefined,
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
 * Helper function to update label for a note at noteIndex in list at listIndex in the given view.
 */
function updateLabel(view: TreeView<typeof Board>, listIndex: number, noteIndex: number) {
	const list = view.root.lists.at(listIndex);
	assert(list !== undefined, `List at index ${listIndex} not found`);
	const note = list.notes.at(noteIndex);
	assert(note !== undefined, `Note at index ${noteIndex} not found in list ${listIndex}`);
	const label = note.label;
	assert(label !== undefined, `No label found for note at index ${noteIndex}`);
	label.labelId = 100;
}

/**
 * Helper function to update label text for a note at noteIndex in list at listIndex in the given view.
 */
function updateLabelText(view: TreeView<typeof Board>, listIndex: number, noteIndex: number) {
	const list = view.root.lists.at(listIndex);
	assert(list !== undefined, `List at index ${listIndex} not found`);
	const note = list.notes.at(noteIndex);
	assert(note !== undefined, `Note at index ${noteIndex} not found in list ${listIndex}`);
	const label = note.label;
	assert(label !== undefined, `No label found for note at index ${noteIndex}`);
	label.labelText = `Label for ${noteIndex + 1} updated`;
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

	async function loadTreeView(treeNumber: number, summary: ISummaryTreeWithStats) {
		const dataStoreRuntime = new MockFluidDataStoreRuntime({
			clientId: `test-client-${treeNumber}`,
			id: "test",
			idCompressor: testIdCompressor,
		});
		const tree = (await factory.load(
			dataStoreRuntime,
			`TestSharedTree${treeNumber}`,
			{
				deltaConnection: dataStoreRuntime.createDeltaConnection(),
				objectStorage: MockStorage.createFromSummary(summary.summary),
			},
			factory.attributes,
		)) as ISharedTree;
		return tree.viewWith(
			new TreeViewConfiguration({
				schema: Board,
			}),
		);
	}

	const testWithSuccessfulSummaries = async () => {
		// This mocks the first summary at sequence number 0. This summary will not generate an
		// incremental forest summary because `IExperimentalIncrementalSummaryContext` is not provided.
		// This is done to mimic the first summary in detached containers.
		const summary1 = await tree1.summarize();

		const tree2View = await loadTreeView(2, summary1);
		expectTreesEqual(tree2View.root, view1.root);
		validateNoHandlesInForestSummary(summary1.summary);

		// Second summary at sequence number 10 - previous was at sequence number 0.
		// This summary will generate an incremental forest summary.
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
		const treeView2 = await loadTreeView(3, summary2);
		expectTreesEqual(treeView2.root, view1.root);
		validateNoHandlesInForestSummary(summary2.summary);

		// Update a note, label, and label text so that in the next summary, the fields and chunks for
		// these will be summarized again but for other fields, summary handles will be used.
		updateNote(view1, 0 /* listIndex */, 0 /* noteIndex */);
		updateLabel(view1, 1 /* listIndex */, 0 /* noteIndex */);
		updateLabelText(view1, 2 /* listIndex */, 0 /* noteIndex */);

		// Third summary at sequence number 20 - previous was at sequence number 10.
		// This summary should contain handles for the unchanged fields and its chunks.
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
		validateHandlesInForestSummary(summary3.summary, summary2.summary);

		return {
			previousSummary: summary2,
			previousSummarySequenceNumber: incrementalSummaryContext2.summarySequenceNumber,
		};
	};

	it("incremental summaries", async () => {
		await testWithSuccessfulSummaries();
	});

	it("incremental summaries with a failed summary in between", async () => {
		const previousSummaryInfo = await testWithSuccessfulSummaries();

		updateNote(view1, 0 /* listIndex */, 0 /* noteIndex */);
		updateLabel(view1, 0 /* listIndex */, 0 /* noteIndex */);
		updateLabel(view1, 1 /* listIndex */, 0 /* noteIndex */);

		// Simulate a scenario where the precious summary fails by setting the latest summary sequence number
		// in the next summary's incrementalSummaryContext not to the previous summary but the last successful
		// summary before that.
		// This next summary should be a full tree summary.
		const newIncrementalSummaryContext: IExperimentalIncrementalSummaryContext = {
			summarySequenceNumber: 30,
			latestSummarySequenceNumber: previousSummaryInfo.previousSummarySequenceNumber,
			summaryPath: "",
		};
		const newSummary = await tree1.summarize(
			undefined,
			undefined,
			undefined,
			newIncrementalSummaryContext,
		);
		assert(newSummary !== undefined);
		// This summary should reference the summary before the failed one to generate handles.
		validateHandlesInForestSummary(
			newSummary.summary,
			previousSummaryInfo.previousSummary.summary,
		);
	});
});
