/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { TestObjectProvider } from '@fluidframework/test-utils';
import { EditHandle, EditLog } from '../EditLog';
import { Edit, EditWithoutId, newEdit, fullHistorySummarizer_0_1_0, SharedTreeSummary } from '../generic';
import { SharedTree, setTrait, Change } from '../default-edits';
import { assertNotUndefined } from '../Common';
import { SharedTreeSummary_0_0_2 } from '../SummaryBackCompatibility';
import { initialTree } from '../InitialTree';
import { SharedTreeDiagnosticEvent, SharedTreeSummaryWriteFormat } from '../generic/GenericSharedTree';
import { EditId } from '../Identifiers';
import { createStableEdits, makeTestNode, setUpLocalServerTestSharedTree, testTrait } from './utilities/TestUtilities';

describe('SharedTree history virtualization', () => {
	let sharedTree: SharedTree;
	let testObjectProvider: TestObjectProvider;
	let editChunksUploaded = 0;

	// Create a summary used to test catchup blobbing
	const summaryToCatchUp: SharedTreeSummary_0_0_2<Change> = {
		currentTree: initialTree,
		version: '0.0.2',
		sequencedEdits: createStableEdits(250),
	};

	beforeEach(async () => {
		const testingComponents = await setUpLocalServerTestSharedTree();
		sharedTree = testingComponents.tree;
		testObjectProvider = testingComponents.testObjectProvider;

		sharedTree.on(SharedTreeDiagnosticEvent.EditChunkUploaded, () => {
			editChunksUploaded++;
		});
	});

	afterEach(async () => {
		testObjectProvider.reset();
		editChunksUploaded = 0;
	});

	// Replace sharedTree with one that writes summary format 0.1.0
	const useSharedTreeSummaryFormat_0_1_0 = async () => {
		const testingComponents = await setUpLocalServerTestSharedTree({
			writeSummaryFormat: SharedTreeSummaryWriteFormat.Format_0_1_0,
		});
		sharedTree = testingComponents.tree;
		testObjectProvider = testingComponents.testObjectProvider;

		sharedTree.on(SharedTreeDiagnosticEvent.EditChunkUploaded, () => {
			editChunksUploaded++;
		});
	};

	// Adds edits to sharedTree1 to make up the specified number of chunks.
	const addNewEditChunks = async (numberOfChunks = 1, additionalEdits = 0) => {
		const expectedEdits: Edit<Change>[] = [];

		// Add some edits to create a chunk with.
		while (
			expectedEdits.length <
			(sharedTree.edits as EditLog<Change>).editsPerChunk * numberOfChunks + additionalEdits
		) {
			const edit = newEdit(setTrait(testTrait, [makeTestNode()]));
			expectedEdits.push(edit);
			sharedTree.processLocalEdit(edit);
		}

		// `ensureSynchronized` does not guarantee blob upload
		await new Promise((resolve) => setImmediate(resolve));
		// Wait for the ops to to be submitted and processed across the containers.
		await testObjectProvider.ensureSynchronized();

		return expectedEdits;
	};

	it('can upload edit chunks and load chunks from handles', async () => {
		const expectedEdits: Edit<Change>[] = await addNewEditChunks();

		const summary = fullHistorySummarizer_0_1_0(sharedTree.edits, sharedTree.currentView);

		const { editHistory } = summary;
		const { editChunks } = assertNotUndefined(editHistory);
		expect(editChunks.length).to.equal(1);
		expect(typeof (editChunks[0].chunk as EditHandle).get).to.equal('function');

		// Load a second tree using the summary
		const { tree: sharedTree2 } = await setUpLocalServerTestSharedTree({
			testObjectProvider,
		});

		sharedTree2.loadSummary(summary);

		// Ensure chunked edit can be retrieved
		expect((await sharedTree2.edits.getEditAtIndex(2)).id).to.equal(expectedEdits[2].id);
	});

	it('can upload catchup blobs', async () => {
		let catchUpBlobsUploaded = 0;
		sharedTree.on(SharedTreeDiagnosticEvent.CatchUpBlobUploaded, () => {
			catchUpBlobsUploaded++;
		});

		// Wait for the op to to be submitted and processed across the containers.
		await testObjectProvider.ensureSynchronized();

		sharedTree.loadSummary(summaryToCatchUp);

		await testObjectProvider.ensureSynchronized();
		expect(catchUpBlobsUploaded).to.equal(1);

		const { editHistory } = fullHistorySummarizer_0_1_0(sharedTree.edits, sharedTree.currentView);
		const { editChunks } = assertNotUndefined(editHistory);
		expect(editChunks.length).to.equal(1);
		expect(typeof (editChunks[0].chunk as EditHandle).get).to.equal('function');
	});

	it('only uploads catchup blobs from one client', async () => {
		// Create more connected trees
		const { tree: sharedTree2 } = await setUpLocalServerTestSharedTree({
			testObjectProvider,
		});
		const { tree: sharedTree3 } = await setUpLocalServerTestSharedTree({
			testObjectProvider,
		});

		let catchUpBlobsUploaded = 0;
		sharedTree.on(SharedTreeDiagnosticEvent.CatchUpBlobUploaded, () => {
			catchUpBlobsUploaded++;
		});
		sharedTree2.on(SharedTreeDiagnosticEvent.CatchUpBlobUploaded, () => {
			catchUpBlobsUploaded++;
		});
		sharedTree3.on(SharedTreeDiagnosticEvent.CatchUpBlobUploaded, () => {
			catchUpBlobsUploaded++;
		});

		// Wait for processing again in case there are more no ops
		await testObjectProvider.ensureSynchronized();

		// Try to load summaries on all the trees
		sharedTree.loadSummary(summaryToCatchUp);
		sharedTree2.loadSummary(summaryToCatchUp);
		sharedTree3.loadSummary(summaryToCatchUp);

		// `ensureSynchronized` does not guarantee blob upload
		await new Promise((resolve) => setImmediate(resolve));
		await testObjectProvider.ensureSynchronized();
		expect(catchUpBlobsUploaded).to.equal(1);

		// Make sure the trees are still the same
		expect(sharedTree.equals(sharedTree2)).to.be.true;
		expect(sharedTree.equals(sharedTree3)).to.be.true;
	});

	it("doesn't upload incomplete chunks", async () => {
		await addNewEditChunks(0, 50);
		expect(editChunksUploaded).to.equal(0);
	});

	it('can upload full chunks with incomplete chunks in the edit log', async () => {
		await addNewEditChunks(1, 50);
		expect(editChunksUploaded).to.equal(1);
	});

	it('correctly saves handles and their corresponding starting revisions to the summary', async () => {
		await addNewEditChunks(4);

		const { editHistory } = fullHistorySummarizer_0_1_0(sharedTree.edits, sharedTree.currentView);
		const { editChunks } = assertNotUndefined(editHistory);
		expect(editChunks.length).to.equal(4);

		// Make sure each starting revision is correct and each chunk in the summary is a handle
		editChunks.forEach(({ startRevision, chunk }, index) => {
			expect(startRevision).to.equal(index * (sharedTree.edits as EditLog<Change>).editsPerChunk);
			expect(typeof (chunk as EditHandle).get).to.equal('function');
		});
	});

	it('sends handle ops to connected clients when chunks are uploaded', async () => {
		const { tree: sharedTree2 } = await setUpLocalServerTestSharedTree({
			testObjectProvider,
		});
		const { tree: sharedTree3 } = await setUpLocalServerTestSharedTree({
			testObjectProvider,
		});

		// All shared trees should have no edits or chunks
		expect(
			fullHistorySummarizer_0_1_0(sharedTree.edits, sharedTree.currentView).editHistory?.editChunks.length
		).to.equal(0);
		expect(
			fullHistorySummarizer_0_1_0(sharedTree2.edits, sharedTree2.currentView).editHistory?.editChunks.length
		).to.equal(0);
		expect(
			fullHistorySummarizer_0_1_0(sharedTree3.edits, sharedTree3.currentView).editHistory?.editChunks.length
		).to.equal(0);

		await addNewEditChunks();

		// All shared trees should have the new handle
		const sharedTreeSummary = fullHistorySummarizer_0_1_0(sharedTree.edits, sharedTree.currentView);
		const sharedTree2Summary = fullHistorySummarizer_0_1_0(sharedTree2.edits, sharedTree2.currentView);
		const sharedTree3Summary = fullHistorySummarizer_0_1_0(sharedTree3.edits, sharedTree3.currentView);
		const sharedTreeChunk = assertNotUndefined(sharedTreeSummary.editHistory).editChunks[0].chunk;
		const sharedTree2Chunk = assertNotUndefined(sharedTree2Summary.editHistory).editChunks[0].chunk;
		const sharedTree3Chunk = assertNotUndefined(sharedTree3Summary.editHistory).editChunks[0].chunk;

		// Make sure the chunk of the first shared tree is a handle
		expect(typeof (sharedTreeChunk as EditHandle).get).to.equal('function');

		const sharedTreeHandleRoute = (sharedTreeChunk as any).absolutePath;
		const sharedTree2HandleRoute = (sharedTree2Chunk as any).absolutePath;
		const sharedTree3HandleRoute = (sharedTree3Chunk as any).absolutePath;

		// Make sure the handle route of the first shared tree is a string
		expect(typeof sharedTreeHandleRoute).to.equal('string');

		expect(sharedTreeHandleRoute).to.equal(sharedTree2HandleRoute);
		expect(sharedTree2HandleRoute).to.equal(sharedTree3HandleRoute);
	});

	it('does not cause misaligned chunks', async () => {
		await useSharedTreeSummaryFormat_0_1_0();
		await addNewEditChunks(1, 50);

		const summary = sharedTree.saveSummary();

		// Connect another client
		const { tree: sharedTree2 } = await setUpLocalServerTestSharedTree({
			testObjectProvider,
			writeSummaryFormat: SharedTreeSummaryWriteFormat.Format_0_1_0,
		});

		let unexpectedHistoryChunk = false;
		sharedTree2.on(SharedTreeDiagnosticEvent.UnexpectedHistoryChunk, () => {
			unexpectedHistoryChunk = true;
		});

		sharedTree2.loadSummary(summary);

		// Finish off the incomplete chunk
		await addNewEditChunks();

		expect(unexpectedHistoryChunk).to.be.false;
	});

	it('causes misaligned chunks for format version 0.0.2', async () => {
		// Add enough edits for a chunk and a half
		await addNewEditChunks(1, 50);

		// Connect another client
		const { tree: sharedTree2 } = await setUpLocalServerTestSharedTree({
			testObjectProvider,
		});

		let unexpectedHistoryChunk = false;
		sharedTree2.on(SharedTreeDiagnosticEvent.UnexpectedHistoryChunk, () => {
			unexpectedHistoryChunk = true;
		});

		sharedTree2.loadSummary(sharedTree.saveSummary());

		// Finish off the incomplete chunk
		await addNewEditChunks();

		expect(unexpectedHistoryChunk).to.be.true;
	});

	it('does not upload blobs larger than 4MB', async () => {
		await useSharedTreeSummaryFormat_0_1_0();
		const numberOfEdits = 10000;
		const edits: EditWithoutId<Change>[] = [];
		const editIds: EditId[] = [];

		// Add some edits to create a chunk with.
		while (edits.length < numberOfEdits) {
			const edit = newEdit(setTrait(testTrait, [makeTestNode()]));
			edits.push({ changes: edit.changes });
			editIds.push(edit.id);
		}

		const fakeSummary: SharedTreeSummary<Change> = {
			version: '0.1.0',
			currentTree: initialTree,
			editHistory: {
				editChunks: [
					{
						startRevision: 0,
						chunk: edits,
					},
				],
				editIds,
			},
		};

		sharedTree.loadSummary(fakeSummary);

		// `ensureSynchronized` does not guarantee blob upload
		await new Promise((resolve) => setImmediate(resolve));
		await testObjectProvider.ensureSynchronized();
		expect(editChunksUploaded).to.equal(0);
	});
});
