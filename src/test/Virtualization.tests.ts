// Copyright (C) Microsoft Corporation. All rights reserved.

import { expect } from 'chai';
import { ISerializedHandle } from '@fluidframework/core-interfaces';
import { TestObjectProvider } from '@fluidframework/test-utils';
import { editsPerChunk } from '../EditLog';
import { newEdit, setTrait } from '../EditUtilities';
import { Edit, EditWithoutId } from '../PersistedTypes';
import { SharedTree, SharedTreeEvent } from '../SharedTree';
import { fullHistorySummarizer_0_1_0, SharedTreeSummary } from '../Summary';
import { assertNotUndefined } from '../Common';
import {
	ITestContainerConfig,
	makeTestNode,
	setUpLocalServerTestSharedTree,
	testTrait,
} from './utilities/TestUtilities';

describe('SharedTree history virtualization', () => {
	let sharedTree: SharedTree;
	let testObjectProvider: TestObjectProvider<ITestContainerConfig>;

	beforeEach(async () => {
		const testingComponents = await setUpLocalServerTestSharedTree({ summarizer: fullHistorySummarizer_0_1_0 });
		sharedTree = testingComponents.tree;
		testObjectProvider = testingComponents.testObjectProvider;
	});

	afterEach(async () => {
		testObjectProvider.reset();
	});

	// Adds edits to sharedTree1 to make up the specified number of chunks.
	const processNewEditChunks = async (numberOfChunks = 1) => {
		const expectedEdits: Edit[] = [];

		// Add some edits to create a chunk with.
		while (expectedEdits.length < editsPerChunk * numberOfChunks) {
			const edit = newEdit(setTrait(testTrait, [makeTestNode()]));
			expectedEdits.push(edit);
			sharedTree.processLocalEdit(edit);
		}

		// Wait for the ops to to be submitted and processed across the containers.
		await testObjectProvider.opProcessingController.process();

		// Initiate the edit upload
		sharedTree.saveSummary();

		// Wait for each chunk to be uploaded
		await new Promise((resolve) => sharedTree.once(SharedTreeEvent.ChunksUploaded, resolve));

		// Wait for the handle op to be processed.
		await testObjectProvider.opProcessingController.process();

		return expectedEdits;
	};

	it('can upload edit chunks and load chunks from handles', async () => {
		const expectedEdits: Edit[] = await processNewEditChunks();

		const summary = sharedTree.saveSummary();

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

		// Initiate edit upload
		sharedTree.saveSummary();

		// Wait for each chunk to be uploaded
		await new Promise((resolve) => sharedTree.once(SharedTreeEvent.ChunksUploaded, resolve));

		// Wait for any handle ops to be processed.
		await testObjectProvider.opProcessingController.process();

		const { editHistory } = sharedTree.saveSummary() as SharedTreeSummary;
		const { editChunks } = assertNotUndefined(editHistory);
		expect(editChunks.length).to.equal(1);

		// The chunk given by the summary should be an array of length 1.
		const { chunk } = editChunks[0];
		expect(Array.isArray(chunk)).to.be.true;
		expect((chunk as EditWithoutId[]).length).to.equal(1);
	});

	it('can upload full chunks with incomplete chunks in the edit log', async () => {
		const expectedEdits: Edit[] = [];

		// Add some edits to create a chunk with.
		while (expectedEdits.length < editsPerChunk + 10) {
			const edit = newEdit(setTrait(testTrait, [makeTestNode()]));
			expectedEdits.push(edit);
			sharedTree.processLocalEdit(edit);
		}

		// Wait for the ops to to be submitted and processed across the containers.
		await testObjectProvider.opProcessingController.process();

		// Initiate edit upload
		sharedTree.saveSummary();

		// Wait for each chunk to be uploaded
		await new Promise((resolve) => sharedTree.once(SharedTreeEvent.ChunksUploaded, resolve));

		// Wait for the handle op to be processed.
		await testObjectProvider.opProcessingController.process();

		const { editHistory } = sharedTree.saveSummary() as SharedTreeSummary;
		const { editChunks } = assertNotUndefined(editHistory);
		expect(editChunks.length).to.equal(2);
		expect((editChunks[0].chunk as ISerializedHandle).type === '__fluid_handle__');
		expect(Array.isArray(editChunks[1].chunk)).to.be.true;
		expect((editChunks[1].chunk as EditWithoutId[]).length).to.equal(10);
	});

	it('correctly saves handles and their corresponding keys to the summary', async () => {
		await processNewEditChunks(4);

		const { editHistory } = sharedTree.saveSummary() as SharedTreeSummary;
		const { editChunks } = assertNotUndefined(editHistory);
		expect(editChunks.length).to.equal(4);

		// Make sure each key is correct and each chunk in the summary is a handle
		editChunks.forEach(({ key, chunk }, index) => {
			expect(key).to.equal(index * editsPerChunk);
			expect((chunk as ISerializedHandle).type === '__fluid_handle__');
		});
	});

	it('sends handle ops to connected clients when chunks are uploaded', async () => {
		const { tree: sharedTree2 } = await setUpLocalServerTestSharedTree({
			testObjectProvider,
			summarizer: fullHistorySummarizer_0_1_0,
		});
		const { tree: sharedTree3 } = await setUpLocalServerTestSharedTree({
			testObjectProvider,
			summarizer: fullHistorySummarizer_0_1_0,
		});

		// All shared trees should have no edits or chunks
		expect((sharedTree.saveSummary() as SharedTreeSummary).editHistory?.editChunks.length).to.equal(0);
		expect((sharedTree2.saveSummary() as SharedTreeSummary).editHistory?.editChunks.length).to.equal(0);
		expect((sharedTree3.saveSummary() as SharedTreeSummary).editHistory?.editChunks.length).to.equal(0);

		await processNewEditChunks();

		// All shared trees should have the new handle
		const sharedTreeSummary = sharedTree.saveSummary() as SharedTreeSummary;
		const sharedTree2Summary = sharedTree2.saveSummary() as SharedTreeSummary;
		const sharedTree3Summary = sharedTree3.saveSummary() as SharedTreeSummary;
		const sharedTreeChunk = assertNotUndefined(sharedTreeSummary.editHistory).editChunks[0].chunk;

		// Make sure the chunk is the first shared tree is a serialized handle
		expect((sharedTreeChunk as ISerializedHandle).type === '__fluid_handle__');

		expect(sharedTreeSummary).to.deep.equal(sharedTree2Summary);
		expect(sharedTree2Summary).to.deep.equal(sharedTree3Summary);
	});
});
