// Copyright (C) Microsoft Corporation. All rights reserved.

import { expect } from 'chai';
import { TestObjectProvider } from '@fluidframework/test-utils';
import { EditHandle, editsPerChunk } from '../EditLog';
import { SharedTreeSummary, Edit, EditWithoutId, newEdit } from '../generic';
import { SharedTree, setTrait, Change } from '../default-edits';
import { assertNotUndefined } from '../Common';
import { makeTestNode, setUpLocalServerTestSharedTree, testTrait } from './utilities/TestUtilities';

// TODO:#49901: Enable these tests once we write edit chunk handles to summaries
describe.skip('SharedTree history virtualization', () => {
	let sharedTree: SharedTree;
	let testObjectProvider: TestObjectProvider<unknown>;

	beforeEach(async () => {
		const testingComponents = await setUpLocalServerTestSharedTree({
			summarizeHistory: true,
		});
		sharedTree = testingComponents.tree;
		testObjectProvider = testingComponents.testObjectProvider;
	});

	afterEach(async () => {
		testObjectProvider.reset();
	});

	// Adds edits to sharedTree1 to make up the specified number of chunks.
	const processNewEditChunks = async (numberOfChunks = 1) => {
		const expectedEdits: Edit<Change>[] = [];

		// Add some edits to create a chunk with.
		while (expectedEdits.length < editsPerChunk * numberOfChunks) {
			const edit = newEdit(setTrait(testTrait, [makeTestNode()]));
			expectedEdits.push(edit);
			sharedTree.processLocalEdit(edit);
		}

		// Wait for the ops to to be submitted and processed across the containers.
		await testObjectProvider.opProcessingController.process();

		return expectedEdits;
	};

	it('can upload edit chunks and load chunks from handles', async () => {
		const expectedEdits: Edit<Change>[] = await processNewEditChunks();

		const summary = sharedTree.saveSummary();

		const { editHistory } = summary as SharedTreeSummary<Change>;
		const { editChunks } = assertNotUndefined(editHistory);
		expect(editChunks.length).to.equal(1);
		expect(typeof (editChunks[0].chunk as EditHandle).get).to.equal('function');

		// Load a second tree using the summary
		const { tree: sharedTree2 } = await setUpLocalServerTestSharedTree({ testObjectProvider });

		sharedTree2.loadSummary(summary);

		// Ensure chunked edit can be retrieved
		expect((await sharedTree2.edits.getEditAtIndex(2)).id).to.equal(expectedEdits[2].id);
	});

	it("doesn't upload incomplete chunks", async () => {
		const edit = newEdit(setTrait(testTrait, [makeTestNode()]));
		sharedTree.processLocalEdit(edit);

		// Wait for the op to to be submitted and processed across the containers.
		await testObjectProvider.opProcessingController.process();

		const { editHistory } = sharedTree.saveSummary() as SharedTreeSummary<Change>;
		const { editChunks } = assertNotUndefined(editHistory);
		expect(editChunks.length).to.equal(1);

		// The chunk given by the summary should be an array of length 1.
		const { chunk } = editChunks[0];
		expect(Array.isArray(chunk)).to.be.true;
		expect((chunk as EditWithoutId<Change>[]).length).to.equal(1);
	});

	it('can upload full chunks with incomplete chunks in the edit log', async () => {
		const expectedEdits: Edit<Change>[] = [];

		// Add some edits to create a chunk with.
		while (expectedEdits.length < editsPerChunk + 10) {
			const edit = newEdit(setTrait(testTrait, [makeTestNode()]));
			expectedEdits.push(edit);
			sharedTree.processLocalEdit(edit);
		}

		// Wait for the ops to to be submitted and processed across the containers.
		await testObjectProvider.opProcessingController.process();

		const { editHistory } = sharedTree.saveSummary() as SharedTreeSummary<Change>;
		const { editChunks } = assertNotUndefined(editHistory);
		expect(editChunks.length).to.equal(2);
		expect(typeof (editChunks[0].chunk as EditHandle).get).to.equal('function');
		expect(Array.isArray(editChunks[1].chunk)).to.be.true;
		expect((editChunks[1].chunk as EditWithoutId<Change>[]).length).to.equal(10);
	});

	it('correctly saves handles and their corresponding keys to the summary', async () => {
		await processNewEditChunks(4);

		const { editHistory } = sharedTree.saveSummary() as SharedTreeSummary<Change>;
		const { editChunks } = assertNotUndefined(editHistory);
		expect(editChunks.length).to.equal(4);

		// Make sure each key is correct and each chunk in the summary is a handle
		editChunks.forEach(({ key, chunk }, index) => {
			expect(key).to.equal(index * editsPerChunk);
			expect(typeof (chunk as EditHandle).get).to.equal('function');
		});
	});

	it('sends handle ops to connected clients when chunks are uploaded', async () => {
		const { tree: sharedTree2 } = await setUpLocalServerTestSharedTree({
			testObjectProvider,
			summarizeHistory: true,
		});
		const { tree: sharedTree3 } = await setUpLocalServerTestSharedTree({
			testObjectProvider,
			summarizeHistory: true,
		});

		// All shared trees should have no edits or chunks
		expect((sharedTree.saveSummary() as SharedTreeSummary<Change>).editHistory?.editChunks.length).to.equal(0);
		expect((sharedTree2.saveSummary() as SharedTreeSummary<Change>).editHistory?.editChunks.length).to.equal(0);
		expect((sharedTree3.saveSummary() as SharedTreeSummary<Change>).editHistory?.editChunks.length).to.equal(0);

		await processNewEditChunks();

		// All shared trees should have the new handle
		const sharedTreeSummary = sharedTree.saveSummary() as SharedTreeSummary<Change>;
		const sharedTree2Summary = sharedTree2.saveSummary() as SharedTreeSummary<Change>;
		const sharedTree3Summary = sharedTree3.saveSummary() as SharedTreeSummary<Change>;
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
});
