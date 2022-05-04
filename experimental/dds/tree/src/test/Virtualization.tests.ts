/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { TestObjectProvider } from '@fluidframework/test-utils';
import { EditLog } from '../EditLog';
import { assertNotUndefined } from '../Common';
import { initialTree } from '../InitialTree';
import { SharedTree } from '../SharedTree';
import {
	ChangeInternal,
	Edit,
	Payload,
	reservedIdCount,
	FluidEditHandle,
	SharedTreeSummary,
	WriteFormat,
	editsPerChunk,
} from '../persisted-types';
import { SharedTreeDiagnosticEvent } from '../EventTypes';
import { IdCompressor } from '../id-compressor';
import { createSessionId } from '../id-compressor/NumericUuid';
import { SharedTreeEncoder_0_1_1 } from '../SharedTreeEncoder';
import { CachingLogViewer } from '../LogViewer';
import { RevisionView } from '../RevisionView';
import { MutableStringInterner } from '../StringInterner';
import {
	applyNoop,
	createStableEdits,
	makeNodeIdContext,
	setUpLocalServerTestSharedTree,
} from './utilities/TestUtilities';
import { SimpleTestTree } from './utilities/TestNode';

describe('SharedTree history virtualization', () => {
	let sharedTree: SharedTree;
	let testObjectProvider: TestObjectProvider;
	let editChunksUploaded = 0;
	const editCount = 250;
	const expectedFullChunkCount = Math.floor(editCount / editsPerChunk);

	// Create a summary used to test catchup blobbing
	function createCatchUpSummary(numberOfEdits: number, payload?: (i: number) => Payload): SharedTreeSummary {
		const idCompressor = new IdCompressor(createSessionId(), reservedIdCount);
		const context = makeNodeIdContext(idCompressor);
		const edits = createStableEdits(numberOfEdits, context, payload);
		idCompressor.finalizeCreationRange(idCompressor.takeNextCreationRange());
		const editLog = new EditLog<ChangeInternal>();
		for (let i = 0; i < edits.length; i++) {
			editLog.addSequencedEdit(edits[i], { sequenceNumber: i + 1, referenceSequenceNumber: i });
		}
		const logViewer = new CachingLogViewer(editLog, RevisionView.fromTree(initialTree, context, true));

		const internedStrings = [
			SimpleTestTree.definition,
			SimpleTestTree.traitLabel,
			SimpleTestTree.leftTraitLabel,
			SimpleTestTree.rightTraitLabel,
		];
		const interner = new MutableStringInterner(internedStrings);
		const encoder = new SharedTreeEncoder_0_1_1(true);
		return encoder.encodeSummary(
			editLog,
			logViewer.getRevisionViewInSession(Number.POSITIVE_INFINITY),
			context,
			context,
			interner,
			idCompressor.serialize(false)
		);
	}

	beforeEach(async () => {
		const testingComponents = await setUpLocalServerTestSharedTree({
			summarizeHistory: true,
			writeFormat: WriteFormat.v0_1_1,
		});
		sharedTree = testingComponents.tree;
		testObjectProvider = testingComponents.testObjectProvider;

		sharedTree.on(SharedTreeDiagnosticEvent.EditChunkUploaded, () => {
			editChunksUploaded++;
		});
	});

	afterEach(() => {
		editChunksUploaded = 0;
	});

	// Replace sharedTree with one that writes summary format 0.0.2
	const useSharedTreeSummaryv0_0_2 = async () => {
		const testingComponents = await setUpLocalServerTestSharedTree({
			summarizeHistory: true,
			writeFormat: WriteFormat.v0_0_2,
		});
		sharedTree = testingComponents.tree;
		testObjectProvider = testingComponents.testObjectProvider;

		sharedTree.on(SharedTreeDiagnosticEvent.EditChunkUploaded, () => {
			editChunksUploaded++;
		});
	};

	// Adds edits to sharedTree1 to make up the specified number of chunks.
	const addNewEditChunks = async (numberOfChunks = 1, additionalEdits = 0) => {
		const expectedEdits: Edit<unknown>[] = [];

		// Add some edits to create a chunk with.
		while (expectedEdits.length < (sharedTree.edits as EditLog).editsPerChunk * numberOfChunks + additionalEdits) {
			expectedEdits.push(applyNoop(sharedTree));
		}

		// `ensureSynchronized` does not guarantee blob upload
		await new Promise((resolve) => setImmediate(resolve));
		// Wait for the ops to to be submitted and processed across the containers.
		await testObjectProvider.ensureSynchronized();

		return expectedEdits;
	};

	it('can upload edit chunks and load chunks from handles', async () => {
		const expectedEdits: Edit<unknown>[] = await addNewEditChunks();

		const summary = sharedTree.saveSummary() as SharedTreeSummary;

		const { editHistory } = summary;
		const { editChunks } = assertNotUndefined(editHistory);
		expect(editChunks.length).to.equal(1);
		expect(typeof (editChunks[0].chunk as FluidEditHandle).get).to.equal('function');

		// Load a second tree using the summary
		const { tree: sharedTree2 } = await setUpLocalServerTestSharedTree({
			testObjectProvider,
			writeFormat: WriteFormat.v0_1_1,
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

		sharedTree.loadSummary(createCatchUpSummary(250));

		await testObjectProvider.ensureSynchronized();
		expect(catchUpBlobsUploaded).to.equal(expectedFullChunkCount);

		const { editHistory } = sharedTree.saveSummary() as SharedTreeSummary;
		const { editChunks } = assertNotUndefined(editHistory);
		expect(editChunks.length).to.equal(expectedFullChunkCount + 1);
		expect(typeof (editChunks[0].chunk as FluidEditHandle).get).to.equal('function');
	});

	it('only uploads catchup blobs from one client', async () => {
		// Create more connected trees
		const { tree: sharedTree2 } = await setUpLocalServerTestSharedTree({
			testObjectProvider,
			summarizeHistory: true,
			writeFormat: WriteFormat.v0_1_1,
		});
		const { tree: sharedTree3 } = await setUpLocalServerTestSharedTree({
			testObjectProvider,
			summarizeHistory: true,
			writeFormat: WriteFormat.v0_1_1,
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
		const summary = createCatchUpSummary(250);
		sharedTree.loadSummary(summary);
		sharedTree2.loadSummary(summary);
		sharedTree3.loadSummary(summary);

		// `ensureSynchronized` does not guarantee blob upload
		await new Promise((resolve) => setImmediate(resolve));
		await testObjectProvider.ensureSynchronized();
		expect(catchUpBlobsUploaded).to.equal(expectedFullChunkCount);

		// Make sure the trees are still the same
		expect(sharedTree.equals(sharedTree2)).to.be.true;
		expect(sharedTree.equals(sharedTree3)).to.be.true;
	});

	it("doesn't upload incomplete chunks", async () => {
		await addNewEditChunks(0, 50);
		expect(editChunksUploaded).to.equal(0);
	});

	it('can upload full chunks with incomplete chunks in the edit log', async () => {
		testObjectProvider.logger.registerExpectedEvent(
			{ eventName: 'fluid:telemetry:Batching:LengthTooBig' },
			{ eventName: 'fluid:telemetry:Batching:LengthTooBig' }
		);
		await addNewEditChunks(1, 50);
		expect(editChunksUploaded).to.equal(1);
	});

	it('correctly saves handles and their corresponding starting revisions to the summary', async () => {
		testObjectProvider.logger.registerExpectedEvent(
			{ eventName: 'fluid:telemetry:Batching:LengthTooBig' },
			{ eventName: 'fluid:telemetry:Batching:LengthTooBig' }
		);
		await addNewEditChunks(4);

		const { editHistory } = sharedTree.saveSummary() as SharedTreeSummary;
		const { editChunks } = assertNotUndefined(editHistory);
		expect(editChunks.length).to.equal(4);

		// Make sure each starting revision is correct and each chunk in the summary is a handle
		editChunks.forEach(({ startRevision, chunk }, index) => {
			expect(startRevision).to.equal(index * (sharedTree.edits as EditLog).editsPerChunk);
			expect(typeof (chunk as FluidEditHandle).get).to.equal('function');
		});
	});

	it('sends handle ops to connected clients when chunks are uploaded', async () => {
		const { tree: sharedTree2 } = await setUpLocalServerTestSharedTree({
			testObjectProvider,
			summarizeHistory: true,
			writeFormat: WriteFormat.v0_1_1,
		});
		const { tree: sharedTree3 } = await setUpLocalServerTestSharedTree({
			testObjectProvider,
			summarizeHistory: true,
			writeFormat: WriteFormat.v0_1_1,
		});

		// All shared trees should have no edits or chunks
		expect((sharedTree.saveSummary() as SharedTreeSummary).editHistory?.editChunks.length).to.equal(0);
		expect((sharedTree2.saveSummary() as SharedTreeSummary).editHistory?.editChunks.length).to.equal(0);
		expect((sharedTree3.saveSummary() as SharedTreeSummary).editHistory?.editChunks.length).to.equal(0);

		await addNewEditChunks();

		// All shared trees should have the new handle
		const sharedTreeSummary = sharedTree.saveSummary() as SharedTreeSummary;
		const sharedTree2Summary = sharedTree2.saveSummary() as SharedTreeSummary;
		const sharedTree3Summary = sharedTree3.saveSummary() as SharedTreeSummary;
		const sharedTreeChunk = assertNotUndefined(sharedTreeSummary.editHistory).editChunks[0].chunk;
		const sharedTree2Chunk = assertNotUndefined(sharedTree2Summary.editHistory).editChunks[0].chunk;
		const sharedTree3Chunk = assertNotUndefined(sharedTree3Summary.editHistory).editChunks[0].chunk;

		// Make sure the chunk of the first shared tree is a handle
		expect(typeof (sharedTreeChunk as FluidEditHandle).get).to.equal('function');

		const sharedTreeHandleRoute = (sharedTreeChunk as any).absolutePath;
		const sharedTree2HandleRoute = (sharedTree2Chunk as any).absolutePath;
		const sharedTree3HandleRoute = (sharedTree3Chunk as any).absolutePath;

		// Make sure the handle route of the first shared tree is a string
		expect(typeof sharedTreeHandleRoute).to.equal('string');

		expect(sharedTreeHandleRoute).to.equal(sharedTree2HandleRoute);
		expect(sharedTree2HandleRoute).to.equal(sharedTree3HandleRoute);
	});

	it('does not cause misaligned chunks', async () => {
		testObjectProvider.logger.registerExpectedEvent(
			{ eventName: 'fluid:telemetry:Batching:LengthTooBig' },
			{ eventName: 'fluid:telemetry:Batching:LengthTooBig' },
			{ eventName: 'fluid:telemetry:Batching:LengthTooBig' }
		);
		await addNewEditChunks(1, 50);

		const summary = sharedTree.saveSummary();

		// Connect another client
		const { tree: sharedTree2 } = await setUpLocalServerTestSharedTree({
			testObjectProvider,
			summarizeHistory: true,
			writeFormat: WriteFormat.v0_1_1,
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

	it('does not cause misaligned chunks for format version 0.0.2', async () => {
		await useSharedTreeSummaryv0_0_2();
		testObjectProvider.logger.registerExpectedEvent(
			{ eventName: 'fluid:telemetry:Batching:LengthTooBig' },
			{ eventName: 'fluid:telemetry:Batching:LengthTooBig' },
			{ eventName: 'fluid:telemetry:Batching:LengthTooBig' }
		);

		// Add enough edits for a chunk and a half
		await addNewEditChunks(1, 50);

		// Connect another client
		const { tree: sharedTree2 } = await setUpLocalServerTestSharedTree({
			testObjectProvider,
			summarizeHistory: true,
			writeFormat: WriteFormat.v0_0_2,
		});

		let unexpectedHistoryChunk = false;
		sharedTree2.on(SharedTreeDiagnosticEvent.UnexpectedHistoryChunk, () => {
			unexpectedHistoryChunk = true;
		});

		sharedTree2.loadSummary(sharedTree.saveSummary());

		// Finish off the incomplete chunk
		await addNewEditChunks();

		expect(unexpectedHistoryChunk).to.be.false;
	});

	it('does not upload blobs larger than 4MB', async () => {
		testObjectProvider.logger.registerExpectedEvent({
			eventName: 'fluid:telemetry:FluidDataStoreRuntime:SharedTree:EditChunkUploadFailure',
		});
		const numberOfEdits = editsPerChunk;
		const fourMegas = 2 ** 22;
		// Without the 1.1, we would generate 100 edits of size roughly 40kb here, but not all of them end up in the first edit chunk
		// due to some setup edits.
		// So we'd barely land within the 4MB limit. Bumping each payload size by 10% is enough to account for this.
		const bigPayload = 'a'.repeat(Math.ceil((1.1 * fourMegas) / numberOfEdits));
		const fakeSummary = createCatchUpSummary(numberOfEdits, () => bigPayload);
		sharedTree.loadSummary(fakeSummary);
		// `ensureSynchronized` does not guarantee blob upload
		await new Promise((resolve) => setImmediate(resolve));
		await testObjectProvider.ensureSynchronized();
		expect(editChunksUploaded).to.equal(0);
	});
});
