/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { LoaderHeader, type IContainer } from "@fluidframework/container-definitions/internal";
import type { ISummarizer } from "@fluidframework/container-runtime/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions";
import {
	createSummarizerFromFactory,
	ITestObjectProvider,
	summarizeNow,
} from "@fluidframework/test-utils/internal";
import {
	ITree,
	SchemaFactory,
	TreeViewConfiguration,
	type TreeView,
} from "@fluidframework/tree";
import {
	configuredSharedTree,
	ForestTypeOptimized,
	Tree,
	TreeAlpha,
} from "@fluidframework/tree/internal";

const schemaFactory = new SchemaFactory("sharedTreeE2ETests");

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

/**
 * Validates that there are handles in the forest summary and for each handle, its path exists in the
 * last summary. This basically validates that the handle paths in the current summary are valid.
 */
export function validateHandlesInForestSummary(
	summary: ISummaryTree,
	lastSummary: ISummaryTree,
) {
	const forestSummary = findForestSummary(summary);
	assert(forestSummary !== undefined, "Forest summary tree not found in summary");

	const validateHandles = (s: ISummaryTree): number => {
		let handleCount = 0;
		for (const [key, summaryObject] of Object.entries(s.tree)) {
			if (summaryObject.type === SummaryType.Handle) {
				// Validate that the handle exists in lastSummary
				validateHandlePathExists(summaryObject.handle, lastSummary);
				handleCount++;
			} else if (summaryObject.type === SummaryType.Tree) {
				// Recursively validate nested trees
				handleCount += validateHandles(summaryObject);
			}
		}
		return handleCount;
	};
	const totalHandles = validateHandles(forestSummary);
	assert(totalHandles > 0, "Expected at least one handle in the forest summary tree");
}

/**
 * Validates that are no handles in the forest's summary tree in the given summary tree.
 */
export function validateNoHandlesInForestSummary(summary: ISummaryTree) {
	const forestSummary = findForestSummary(summary);
	assert(forestSummary !== undefined, "Forest summary tree not found in summary");

	const validateNoHandles = (s: ISummaryTree) => {
		for (const [key, summaryObject] of Object.entries(s.tree)) {
			assert(
				summaryObject.type !== SummaryType.Handle,
				`Unexpected handle in summary tree at key: ${key}`,
			);
			if (summaryObject.type === SummaryType.Tree) {
				// Recursively validate nested trees
				validateNoHandles(summaryObject);
			}
		}
	};
	validateNoHandles(forestSummary);
}

/**
 * Validates that the handle exists in `summaryTree`.
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
 * Finds the forest summary in the given summary tree using breadth-first search.
 * @param summary - The summary tree to search.
 * @returns The forest summary tree, or undefined if not found.
 */
function findForestSummary(summary: ISummaryTree): ISummaryTree | undefined {
	const queue: ISummaryTree[] = [summary];

	while (queue.length > 0) {
		const current = queue.shift();
		if (current === undefined) {
			break;
		}
		for (const [key, summaryObject] of Object.entries(current.tree)) {
			if (summaryObject.type === SummaryType.Tree) {
				if (key === "Forest") {
					return summaryObject;
				}
				// Add to queue for BFS traversal
				queue.push(summaryObject);
			}
		}
	}
	return undefined;
}

/**
 * Validates that the data in actual tree matches the data in the tree with expected view.
 */
function validateTreesEqual(actualTree: ITree, expectedView: TreeView<typeof Board>): void {
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

describeCompat("SharedTree", "NoCompat", (getTestObjectProvider, apis) => {
	const { DataObject, DataObjectFactory } = apis.dataRuntime;
	const { ContainerRuntimeFactoryWithDefaultDataStore } = apis.containerRuntime;
	const SharedTree = configuredSharedTree({ forest: ForestTypeOptimized });

	// An extension of Aqueduct's DataObject that creates a SharedTree during initialization and exposes it.
	class DataObjectWithTree extends DataObject {
		private readonly treeKey = "tree";

		private _tree: ITree | undefined;
		public get tree(): ITree {
			assert(this._tree !== undefined, "Tree not initialized");
			return this._tree;
		}

		protected async initializingFirstTime() {
			const tree = SharedTree.create(this.runtime);
			this.root.set(this.treeKey, tree.handle);
		}

		protected async hasInitialized() {
			const treeHandle = this.root.get<IFluidHandle<ITree>>(this.treeKey);
			assert(treeHandle, "Tree handle not found");
			this._tree = await treeHandle.get();
		}
	}
	// A data object factory that creates DataObjectWithTree instances.
	const dataObjectFactoryWithTree = new DataObjectFactory(
		"DataObjectWithTree",
		DataObjectWithTree,
		[SharedTree.getFactory()],
		{},
	);

	// Runtime factory that can create containers with DataObjectWithTree instances via the above data object factory.
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactoryWithTree,
		registryEntries: [
			[dataObjectFactoryWithTree.type, Promise.resolve(dataObjectFactoryWithTree)],
		],
		runtimeOptions: {
			enableRuntimeIdCompressor: "on",
			summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
		}, // Needed to create a shared tree
	});

	let provider: ITestObjectProvider;
	let container1: IContainer;
	let dataObject1: DataObjectWithTree;
	let tree1: ITree;

	const loadSummarizer = async (container: IContainer, summaryVersion?: string) => {
		return createSummarizerFromFactory(
			provider,
			container,
			dataObjectFactoryWithTree,
			summaryVersion,
		);
	};

	async function loadContainerAndTree(summaryVersion?: string) {
		const loader = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory]]);
		const loadUrl = await container1.getAbsoluteUrl("");
		assert(loadUrl !== undefined, "Container's absolute URL is undefined");
		const container = await loader.resolve({
			url: loadUrl,
			headers: { [LoaderHeader.version]: summaryVersion },
		});
		const dataObject = (await container.getEntryPoint()) as DataObjectWithTree;
		return { container, tree: dataObject.tree };
	}

	beforeEach("setup", async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });

		// These tests are not service specific. They test internals of the SharedTree and different services
		// won't make a difference. So, only run them for local server to reduce the number of test combinations
		// it runs in.
		if (provider.driver.type !== "local") {
			this.skip();
		}

		// Create a loader and a detached container.
		const loader1 = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory]]);
		container1 = await loader1.createDetachedContainer(provider.defaultCodeDetails);
		// Get the create new request to attach the container with.
		const request = provider.driver.createCreateNewRequest(provider.documentId);
		dataObject1 = (await container1.getEntryPoint()) as DataObjectWithTree;
		tree1 = dataObject1.tree;
		await container1.attach(request);
	});

	describe("Incremental tree summary", () => {
		const treeViewConfig = new TreeViewConfiguration({ schema: Board });
		let treeViewClient1: TreeView<typeof Board>;
		let summarizer: ISummarizer;

		beforeEach(async () => {
			treeViewClient1 = tree1.viewWith(treeViewConfig);
			treeViewClient1.initialize(createInitialBoard(3, 2));
			summarizer = (await loadSummarizer(container1)).summarizer;
			await provider.ensureSynchronized();
		});

		it("incremental summaries", async () => {
			// First summary. This should be a full summary because there is no previous incremental summary. The
			// one created by the detached container is not incremental.
			const summary1 = await summarizeNow(summarizer);
			const { container: container2, tree: treeClient2 } = await loadContainerAndTree(
				summary1.summaryVersion,
			);
			validateTreesEqual(treeClient2, treeViewClient1);
			validateNoHandlesInForestSummary(summary1.summaryTree);
			container2.close();

			// Update a note, label, and label text so that in the next summary, the fields and chunks for
			// these will be summarized again but for other fields, summary handles will be used.
			updateNote(treeViewClient1, 0 /* listIndex */, 0 /* noteIndex */);
			updateLabel(treeViewClient1, 1 /* listIndex */, 0 /* noteIndex */);
			updateLabelText(treeViewClient1, 2 /* listIndex */, 0 /* noteIndex */);

			// Second summary. This summary should contain handles for the unchanged fields and its chunks.
			await provider.ensureSynchronized();
			const summary2 = await summarizeNow(summarizer);
			const { container: container3, tree: treeClient3 } = await loadContainerAndTree(
				summary2.summaryVersion,
			);
			validateHandlesInForestSummary(summary2.summaryTree, summary1.summaryTree);
			validateTreesEqual(treeClient3, treeViewClient1);
			container3.close();
		});

		itExpects(
			"incremental summaries with a failed summary in between",
			[
				{ eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel" },
				{ eventName: "fluid:telemetry:Summarizer:Running:SummarizeFailed" },
			],
			async () => {
				// First summary. This should be a full summary because there is no previous incremental summary. The
				// one created by the detached container is not incremental.
				const summary1 = await summarizeNow(summarizer);
				const { tree: treeClient2 } = await loadContainerAndTree(summary1.summaryVersion);
				validateTreesEqual(treeClient2, treeViewClient1);

				// Update a note, label, and label text so that in the next summary, the fields and chunks for
				// these will be summarized again but for other fields, summary handles will be used.
				updateNote(treeViewClient1, 0 /* listIndex */, 0 /* noteIndex */);
				updateLabel(treeViewClient1, 1 /* listIndex */, 0 /* noteIndex */);
				updateLabelText(treeViewClient1, 2 /* listIndex */, 0 /* noteIndex */);

				await provider.ensureSynchronized();

				// Second summary - simulate failure after tree is summarized but before it is uploaded.
				const summaryFailErrorMessage = "Simulated failed summary upload";
				const containerRuntime = (summarizer as any).runtime as IContainerRuntime;
				const uploadSummaryUploaderFunc = containerRuntime.storage.uploadSummaryWithContext;
				const failUploadSummaryWithContext = async (...args: any[]) => {
					throw new Error(summaryFailErrorMessage);
				};
				containerRuntime.storage.uploadSummaryWithContext = failUploadSummaryWithContext;
				await assert.rejects(summarizeNow(summarizer), (error: any) => {
					assert(error.message === summaryFailErrorMessage);
					return true;
				});

				// Restore the original upload summary function.
				containerRuntime.storage.uploadSummaryWithContext = uploadSummaryUploaderFunc;

				updateNote(treeViewClient1, 0 /* listIndex */, 0 /* noteIndex */);
				updateLabel(treeViewClient1, 0 /* listIndex */, 0 /* noteIndex */);
				updateLabel(treeViewClient1, 1 /* listIndex */, 0 /* noteIndex */);

				// Third summary. This should use the first summary as reference for generating handles since
				// the second summary failed.
				await provider.ensureSynchronized();
				const summary3 = await summarizeNow(summarizer);
				const { tree: treeClient3 } = await loadContainerAndTree(summary3.summaryVersion);
				validateTreesEqual(treeClient3, treeViewClient1);
				validateHandlesInForestSummary(summary3.summaryTree, summary1.summaryTree);
			},
		);
	});
});
