/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { ISerializedHandle } from '@fluidframework/core-interfaces';
import { IsoBuffer } from '@fluidframework/common-utils';
import { EditHandle, EditLog, editsPerChunk, separateEditAndId } from '../EditLog';
import { Edit, EditWithoutId } from '../PersistedTypes';
import { newEdit } from '../EditUtilities';
import { EditId } from '../Identifiers';
import { assertNotUndefined } from '../Common';

describe('EditLog', () => {
	const edit0 = newEdit([]);
	const edit1 = newEdit([]);
	const { id: id0, editWithoutId: editWithoutId0 } = separateEditAndId(edit0);
	const { id: id1, editWithoutId: editWithoutId1 } = separateEditAndId(edit1);

	it('can be constructed from sequenced edits', () => {
		const editChunks = [{ key: 0, chunk: [editWithoutId0, editWithoutId1] }];
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
		const editChunks = [{ key: 0, chunk: [editWithoutId0, editWithoutId1] }];
		const editIds = [id0, id1];

		const log = new EditLog({ editChunks, editIds });

		expect(log.getIndexOfId(id0)).to.equal(0);
		expect(log.getIndexOfId(id1)).to.equal(1);
	});

	it('can get the index from an edit id of a local edit', () => {
		const editChunks = [{ key: 0, chunk: [editWithoutId0] }];
		const editIds = [id0];

		const log = new EditLog({ editChunks, editIds });
		log.addLocalEdit(edit1);

		expect(log.getIndexOfId(id0)).to.equal(0);
		expect(log.getIndexOfId(id1)).to.equal(1);
	});

	it('can get an edit from an index', async () => {
		const editChunks = [{ key: 0, chunk: [editWithoutId0, editWithoutId1] }];
		const editIds = [id0, id1];

		const log = new EditLog({ editChunks, editIds });

		expect((await log.getEditAtIndex(0)).id).to.equal(id0);
		expect((await log.getEditAtIndex(1)).id).to.equal(id1);
	});

	it('can get an edit from an edit id', async () => {
		const editChunks = [{ key: 0, chunk: [editWithoutId0, editWithoutId1] }];
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
		log.addSequencedEdit(edit0);

		// Sequenced edits should be iterated before local edits
		const expectedEditIdStack = [id1, id0];

		log.editIds.forEach((editId) => {
			expect(editId).to.equal(expectedEditIdStack.pop());
		});

		expect(expectedEditIdStack.length).to.equal(0);
	});

	it('can add sequenced edits', () => {
		const log = new EditLog();

		log.addSequencedEdit(edit0);
		expect(log.numberOfSequencedEdits).to.equal(1);
		expect(log.numberOfLocalEdits).to.equal(0, 'Log should have only sequenced edits.');

		log.addSequencedEdit(edit1);
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

	it('detects causal ordering violations', () => {
		const log = new EditLog();

		log.addLocalEdit(edit0);
		log.addLocalEdit(edit1);
		expect(() => log.addSequencedEdit(edit1)).throws('ordering');
	});

	it('can sequence a local edit', async () => {
		const log = new EditLog();

		log.addLocalEdit(edit0);
		expect(log.numberOfLocalEdits).to.equal(1);
		let editFromId0 = await log.tryGetEdit(id0);
		expect(editFromId0).to.not.be.undefined;
		expect(assertNotUndefined(editFromId0).id).equals(edit0.id, 'Log should contain local edit.');

		log.addSequencedEdit(edit0);
		expect(log.length).to.equal(1);
		expect(log.numberOfSequencedEdits).to.equal(1);
		expect(log.numberOfLocalEdits).to.equal(0, 'Log should have only sequenced edits.');
		editFromId0 = await log.tryGetEdit(id0);
		expect(editFromId0).to.not.be.undefined;
		expect(assertNotUndefined(editFromId0).id).equals(edit0.id, 'Log should contain sequenced edit.');
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
		const edit0Copy: Edit = { ...edit0 };
		const edit1Copy: Edit = { ...edit1 };
		const { editWithoutId: editWithoutId0Copy } = separateEditAndId(edit0Copy);
		const { editWithoutId: editWithoutId1Copy } = separateEditAndId(edit1Copy);

		const editChunks = [{ key: 0, chunk: [editWithoutId0, editWithoutId1] }];
		const editChunksCopy = [{ key: 0, chunk: [editWithoutId0Copy, editWithoutId1Copy] }];
		const editIds = [id0, id1];

		const log0 = new EditLog({ editChunks, editIds });
		const log1 = new EditLog({ editChunks: editChunksCopy, editIds });

		expect(log0.equals(log1)).to.be.true;

		const log2 = new EditLog({ editChunks: [{ key: 0, chunk: [editWithoutId0] }], editIds: [id0] });
		log2.addLocalEdit(edit1Copy);

		expect(log0.equals(log2)).to.be.true;

		const differentLog = new EditLog({ editChunks: [{ key: 0, chunk: [editWithoutId0] }], editIds: [id0] });

		expect(log0.equals(differentLog)).to.be.false;
	});

	it('creates a new edit chunk once the previous one has been filled', () => {
		const log = new EditLog();

		for (let i = 0; i < editsPerChunk; i++) {
			const edit = newEdit([]);
			log.addSequencedEdit(edit);
			expect(log.getEditLogSummary().editChunks.length).to.be.equal(1);
		}

		const edit = newEdit([]);
		log.addSequencedEdit(edit);
		expect(log.getEditLogSummary().editChunks.length).to.be.equal(2);
	});

	it('can load edits from a handle', async () => {
		const handleMap = new Map<string, EditHandle>();
		const serializationHelpers = {
			serializeHandle: (handle: EditHandle) => {
				const mapSize = String(handleMap.size);
				const serializedHandle: ISerializedHandle = {
					type: '__fluid_handle__',
					url: mapSize,
				};
				handleMap.set(mapSize, handle);
				return serializedHandle;
			},
			deserializeHandle: (serializedHandle: ISerializedHandle) => {
				return assertNotUndefined(handleMap.get(serializedHandle.url));
			},
		};

		const editIds: EditId[] = [];
		const editChunk1: EditWithoutId[] = [];
		const editChunk2: EditWithoutId[] = [];

		for (let i = 0; i < 10; i++) {
			const { id, editWithoutId } = separateEditAndId(newEdit([]));
			editIds.push(id);
			i > 4 ? editChunk1.push(editWithoutId) : editChunk2.push(editWithoutId);
		}

		const handles: EditHandle[] = [
			{
				get: async () => {
					return IsoBuffer.from(JSON.stringify({ edits: editChunk1 }));
				},
			},
			{
				get: async () => {
					return IsoBuffer.from(JSON.stringify({ edits: editChunk2 }));
				},
			},
		];

		let chunkKey = 0;
		const serializedHandles = handles.map((chunk) => {
			const serializedHandle = {
				key: chunkKey,
				chunk: serializationHelpers.serializeHandle(chunk),
			};
			chunkKey = chunkKey + 5;
			return serializedHandle;
		});

		const log = new EditLog({ editChunks: serializedHandles, editIds }, serializationHelpers);

		// Check that each edit can be retrieved correctly
		for (let i = 0; i < 10; i++) {
			expect((await log.getEditAtIndex(i)).id).to.equal(editIds[i]);
		}
	});
});
