/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { IsoBuffer } from '@fluidframework/common-utils';
import { EditLog, separateEditAndId } from '../EditLog';
import { EditId } from '../Identifiers';
import { assertNotUndefined } from '../Common';
import { Edit, EditChunkContents, EditWithoutId, FluidEditHandle } from '../persisted-types';
import { newEdit } from '../EditUtilities';

type DummyChange = never;

/**
 * Creates an edit log with the specified number of chunks, stored as handles instead of edits.
 * @param numberOfChunks - The number of chunks to add to the edit log.
 * @param editsPerChunk - The number of edits per chunk that gets added to the edit log.
 * @param editsPerChunkOnEditLog - The number of edits per chunk that gets set for future edits to the edit log.
 * @returns The edit log created with handles.
 */
function createEditLogWithHandles(numberOfChunks = 2, editsPerChunk = 5): EditLog<DummyChange> {
	const editIds: EditId[] = [];
	const editChunks: EditWithoutId<DummyChange>[][] = [];

	let inProgessChunk: EditWithoutId<DummyChange>[] = [];
	for (let i = 0; i < numberOfChunks * editsPerChunk; i++) {
		const { id, editWithoutId } = separateEditAndId(newEdit([]));
		editIds.push(id);

		inProgessChunk.push(editWithoutId);

		if (inProgessChunk.length === editsPerChunk) {
			editChunks.push(inProgessChunk.slice());
			inProgessChunk = [];
		}
	}

	const handles: FluidEditHandle[] = editChunks.map((chunk) => {
		return {
			absolutePath: 'test blob',
			get: async () => {
				return IsoBuffer.from(JSON.stringify({ edits: chunk }));
			},
		};
	});

	let startRevision = 0;
	const handlesWithKeys = handles.map((baseHandle) => {
		const handle = {
			startRevision,
			chunk: {
				get: async () =>
					(
						JSON.parse(IsoBuffer.from(await baseHandle.get()).toString()) as Omit<
							EditChunkContents,
							'edits'
						> & { edits: EditWithoutId<DummyChange>[] }
					).edits,
				baseHandle,
			},
		};
		startRevision = startRevision + 5;
		return handle;
	});

	const editLog = new EditLog({ editChunks: handlesWithKeys, editIds });

	return editLog;
}

describe('EditLog', () => {
	const edit0 = newEdit([]);
	const edit1 = newEdit([]);
	const { id: id0, editWithoutId: editWithoutId0 } = separateEditAndId(edit0);
	const { id: id1, editWithoutId: editWithoutId1 } = separateEditAndId(edit1);

	it('can be constructed from sequenced edits', () => {
		const editChunks = [{ startRevision: 0, chunk: [editWithoutId0, editWithoutId1] }];
		const editIds = [id0, id1];

		const log = new EditLog({ editChunks, editIds });
		expect(log.numberOfLocalEdits).to.equal(0, 'Newly initialized log should not have local edits.');
		expect(log.numberOfSequencedEdits).to.equal(
			editChunks[0].chunk.length,
			'Log should have as many sequenced edits as it was initialized with.'
		);
		expect(log.length).to.equal(
			editChunks[0].chunk.length,
			"Log's total length should match its sequenced edits on construction"
		);

		expect(log.getIdAtIndex(0)).to.equal(id0, 'Log should have edits in order of construction.');
		expect(log.getIdAtIndex(1)).to.equal(id1, 'Log should have edits in order of construction.');
	});

	it('can get the index from an edit id of sequenced edits', () => {
		const editChunks = [{ startRevision: 0, chunk: [editWithoutId0, editWithoutId1] }];
		const editIds = [id0, id1];

		const log = new EditLog({ editChunks, editIds });

		expect(log.getIndexOfId(id0)).to.equal(0);
		expect(log.getIndexOfId(id1)).to.equal(1);
	});

	it('can get the index from an edit id of a local edit', () => {
		const editChunks = [{ startRevision: 0, chunk: [editWithoutId0] }];
		const editIds = [id0];

		const log = new EditLog({ editChunks, editIds });
		log.addLocalEdit(edit1);

		expect(log.getIndexOfId(id0)).to.equal(0);
		expect(log.getIndexOfId(id1)).to.equal(1);
	});

	describe('tryGetIndexOfId', () => {
		it('can get the index from an existing edit', () => {
			const editChunks = [{ startRevision: 0, chunk: [editWithoutId0] }];
			const editIds = [id0];
			const log = new EditLog({ editChunks, editIds });
			expect(log.tryGetIndexOfId(id0)).to.equal(0);
		});

		it('returns undefined when queried with a nonexistent edit', () => {
			const editChunks = [{ startRevision: 0, chunk: [editWithoutId0] }];
			const editIds = ['f9379af1-6f1a-4f71-8f8c-859359621404' as EditId];
			const log = new EditLog({ editChunks, editIds });
			expect(log.tryGetIndexOfId('aa203fc3-bc28-437d-b01c-f9398dc859ef' as EditId)).to.equal(undefined);
		});
	});

	it('can get an edit from an index', async () => {
		const editChunks = [{ startRevision: 0, chunk: [editWithoutId0, editWithoutId1] }];
		const editIds = [id0, id1];

		const log = new EditLog({ editChunks, editIds });

		expect((await log.getEditAtIndex(0)).id).to.equal(id0);
		expect((await log.getEditAtIndex(1)).id).to.equal(id1);
	});

	it('can get an edit from an edit id', async () => {
		const editChunks = [{ startRevision: 0, chunk: [editWithoutId0, editWithoutId1] }];
		const editIds = [id0, id1];

		const log = new EditLog({ editChunks, editIds });

		const editFromId0 = await log.tryGetEdit(id0);
		const editFromId1 = await log.tryGetEdit(id1);

		expect(editFromId0).to.not.be.undefined;
		expect(editFromId1).to.not.be.undefined;
		expect(assertNotUndefined(editFromId0).id).to.equal(edit0.id);
		expect(assertNotUndefined(editFromId1).id).to.equal(edit1.id);
	});

	it('can be iterated', () => {
		const log = new EditLog();

		log.addLocalEdit(edit1);
		log.addSequencedEdit(edit0, { sequenceNumber: 1, referenceSequenceNumber: 0 });

		// Sequenced edits should be iterated before local edits
		const expectedEditIdStack = [id1, id0];

		log.editIds.forEach((editId) => {
			expect(editId).to.equal(expectedEditIdStack.pop());
		});

		expect(expectedEditIdStack.length).to.equal(0);
	});

	it('can add sequenced edits', () => {
		const log = new EditLog();

		log.addSequencedEdit(edit0, { sequenceNumber: 1, referenceSequenceNumber: 0 });
		expect(log.numberOfSequencedEdits).to.equal(1);
		expect(log.numberOfLocalEdits).to.equal(0, 'Log should have only sequenced edits.');

		log.addSequencedEdit(edit1, { sequenceNumber: 2, referenceSequenceNumber: 1 });
		expect(log.numberOfSequencedEdits).to.equal(2);
		expect(log.numberOfLocalEdits).to.equal(0, 'Log should have only sequenced edits.');
		expect(log.length).to.equal(2);
	});

	it('can add local edits', () => {
		const log = new EditLog();

		log.addLocalEdit(edit0);
		expect(log.numberOfLocalEdits).to.equal(1);
		expect(log.numberOfSequencedEdits).to.equal(0, 'Log should have only local edits.');

		log.addLocalEdit(edit1);
		expect(log.numberOfLocalEdits).to.equal(2);
		expect(log.numberOfSequencedEdits).to.equal(0, 'Log should have only local edits.');
		expect(log.length).to.equal(2);
	});

	it('tracks the min sequence number of sequenced edits', () => {
		const log = new EditLog();

		expect(log.minSequenceNumber).equals(0);
		log.addSequencedEdit(edit0, { sequenceNumber: 1, referenceSequenceNumber: 0 });
		expect(log.minSequenceNumber).equals(0);
		log.addSequencedEdit(edit1, { sequenceNumber: 43, referenceSequenceNumber: 42, minimumSequenceNumber: 42 });
		expect(log.minSequenceNumber).equals(42);
		expect(() =>
			log.addSequencedEdit('fake-edit' as unknown as Edit<unknown>, {
				sequenceNumber: 44,
				referenceSequenceNumber: 43,
			})
		).throws('min number');
	});

	it('detects causal ordering violations', () => {
		const log = new EditLog();

		log.addLocalEdit(edit0);
		log.addLocalEdit(edit1);
		expect(() => log.addSequencedEdit(edit1, { sequenceNumber: 1, referenceSequenceNumber: 0 })).throws('ordering');
	});

	it('can sequence a local edit', async () => {
		const log = new EditLog();

		log.addLocalEdit(edit0);
		expect(log.numberOfLocalEdits).to.equal(1);
		let editFromId0 = await log.tryGetEdit(id0);
		expect(editFromId0).to.not.be.undefined;
		expect(assertNotUndefined(editFromId0).id).equals(edit0.id, 'Log should contain local edit.');

		log.addSequencedEdit(edit0, { sequenceNumber: 1, referenceSequenceNumber: 0 });
		expect(log.length).to.equal(1);
		expect(log.numberOfSequencedEdits).to.equal(1);
		expect(log.numberOfLocalEdits).to.equal(0, 'Log should have only sequenced edits.');
		editFromId0 = await log.tryGetEdit(id0);
		expect(editFromId0).to.not.be.undefined;
		expect(assertNotUndefined(editFromId0).id).equals(edit0.id, 'Log should contain sequenced edit.');
	});

	it('Throws on duplicate sequenced edits', async () => {
		const log = new EditLog();
		log.addSequencedEdit(edit0, { sequenceNumber: 1, referenceSequenceNumber: 0 });
		expect(() => log.addSequencedEdit(edit0, { sequenceNumber: 1, referenceSequenceNumber: 0 }))
			.to.throw(Error)
			.that.has.property('message')
			.which.matches(/Duplicate/);
	});

	it('can sequence multiple local edits', async () => {
		const log = new EditLog();
		const ids: EditId[] = [];

		const numEdits = 10;
		for (let i = 0; i < numEdits; i++) {
			const edit = newEdit([]);
			log.addLocalEdit(edit);
			ids.push(edit.id);
			expect(log.getIndexOfId(edit.id)).equals(i, 'Local edits should be appended to the end of the log.');
		}
		expect(log.length).equals(log.numberOfLocalEdits).and.equals(numEdits, 'Only local edits should be present.');

		log.sequenceLocalEdits();

		expect(log.editIds).to.deep.equal(ids, 'Sequencing a local edit should not change its index.');

		expect(log.length)
			.equals(log.numberOfSequencedEdits)
			.and.equals(numEdits, 'Only sequenced edits should be present.');
	});

	it('can correctly compare equality to other edit logs', () => {
		const edit0Copy: Edit<DummyChange> = { ...edit0 };
		const edit1Copy: Edit<DummyChange> = { ...edit1 };
		const { editWithoutId: editWithoutId0Copy } = separateEditAndId(edit0Copy);
		const { editWithoutId: editWithoutId1Copy } = separateEditAndId(edit1Copy);

		const editChunks = [{ startRevision: 0, chunk: [editWithoutId0, editWithoutId1] }];
		const editChunksCopy = [{ startRevision: 0, chunk: [editWithoutId0Copy, editWithoutId1Copy] }];
		const editIds = [id0, id1];

		const log0 = new EditLog({ editChunks, editIds });
		const log1 = new EditLog({ editChunks: editChunksCopy, editIds });

		expect(log0.equals(log1)).to.be.true;

		const log2 = new EditLog<DummyChange>({
			editChunks: [{ startRevision: 0, chunk: [editWithoutId0] }],
			editIds: [id0],
		});
		log2.addLocalEdit(edit1Copy);

		expect(log0.equals(log2)).to.be.true;

		const differentLog = new EditLog({
			editChunks: [{ startRevision: 0, chunk: [editWithoutId0] }],
			editIds: [id0],
		});

		expect(log0.equals(differentLog)).to.be.false;
	});

	it('creates a new edit chunk once the previous one has been filled', () => {
		const log = new EditLog();

		for (let i = 0; i < log.editsPerChunk; i++) {
			const edit = newEdit([]);
			log.addSequencedEdit(edit, { sequenceNumber: i + 1, referenceSequenceNumber: i });
			expect(log.getEditLogSummary().editChunks.length).to.be.equal(1);
		}

		const edit = newEdit([]);
		log.addSequencedEdit(edit, {
			sequenceNumber: log.editsPerChunk,
			referenceSequenceNumber: log.editsPerChunk - 1,
		});
		expect(log.getEditLogSummary().editChunks.length).to.be.equal(2);
	});

	it('can load edits from a handle', async () => {
		const log = createEditLogWithHandles();

		// Check that each edit can be retrieved correctly
		for (let i = 0; i < 10; i++) {
			expect((await log.getEditAtIndex(i)).id).to.equal(log.editIds[i]);
		}
	});

	it('can add edits to logs with varying edit chunk sizes', async () => {
		const numberOfChunks = 2;
		const editsPerChunk = 5;
		const log = createEditLogWithHandles(numberOfChunks, editsPerChunk);

		// Load the edits for the last edit chunk
		await log.getEditAtIndex(numberOfChunks * editsPerChunk - 1);

		// Add a sequenced edit and check it's been added
		const edit = newEdit([]);
		log.addSequencedEdit(edit, {
			sequenceNumber: log.editsPerChunk,
			referenceSequenceNumber: log.editsPerChunk - 1,
		});

		expect(log.getIdAtIndex(numberOfChunks * editsPerChunk)).to.equal(edit.id);
	});
});
