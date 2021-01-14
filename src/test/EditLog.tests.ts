/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { EditLog } from '../EditLog';
import { Edit } from '../PersistedTypes';
import { newEdit } from '../EditUtilities';
import { EditId } from '../Identifiers';

describe('EditLog', () => {
	const [id0, edit0]: [EditId, Edit] = newEdit([]);
	const [id1, edit1]: [EditId, Edit] = newEdit([]);

	it('can be constructed from sequenced edits', () => {
		const editChunks = [[edit0, edit1]];
		const editIds = [id0, id1];

		const log = new EditLog({ editChunks, editIds });
		expect(log.numberOfLocalEdits).to.equal(0, 'Newly initialized log should not have local edits.');
		expect(log.numberOfSequencedEdits).to.equal(
			editChunks[0].length,
			'Log should have as many sequenced edits as it was initialized with.'
		);
		expect(log.length).to.equal(
			editChunks[0].length,
			"Log's total length should match its sequenced edits on construction"
		);

		expect(log.idOf(0)).to.equal(id0, 'Log should have edits in order of construction.');
		expect(log.idOf(1)).to.equal(id1, 'Log should have edits in order of construction.');
	});

	it('can get the index from an edit id of sequenced edits', () => {
		const editChunks = [[edit0, edit1]];
		const editIds = [id0, id1];

		const log = new EditLog({ editChunks, editIds });

		expect(log.indexOf(id0)).to.equal(0);
		expect(log.indexOf(id1)).to.equal(1);
	});

	it('can get the index from an edit id of a local edit', () => {
		const editChunks = [[edit0]];
		const editIds = [id0];

		const log = new EditLog({ editChunks, editIds });
		log.addLocalEdit(id1, edit1);

		expect(log.indexOf(id0)).to.equal(0);
		expect(log.indexOf(id1)).to.equal(1);
	});

	it('can get an edit from an index', async () => {
		const editChunks = [[edit0, edit1]];
		const editIds = [id0, id1];

		const log = new EditLog({ editChunks, editIds });

		expect(await log.getAtIndex(0)).to.equal(edit0);
		expect(await log.getAtIndex(1)).to.equal(edit1);
	});

	it('can get an edit from an edit id', async () => {
		const editChunks = [[edit0, edit1]];
		const editIds = [id0, id1];

		const log = new EditLog({ editChunks, editIds });

		expect(await log.tryGetEdit(id0)).to.equal(edit0);
		expect(await log.tryGetEdit(id1)).to.equal(edit1);
	});

	it('can be iterated', () => {
		const log = new EditLog();

		log.addLocalEdit(id1, edit1);
		log.addSequencedEdit(id0, edit0);

		// Sequenced edits should be iterated before local edits
		const expectedEditIdStack = [id1, id0];

		for (const editId of log) {
			expect(editId).to.equal(expectedEditIdStack.pop());
		}

		expect(expectedEditIdStack.length).to.equal(0);
	});

	it('can add sequenced edits', () => {
		const log = new EditLog();

		log.addSequencedEdit(id0, edit0);
		expect(log.numberOfSequencedEdits).to.equal(1);
		expect(log.numberOfLocalEdits).to.equal(0, 'Log should have only sequenced edits.');

		log.addSequencedEdit(id1, edit1);
		expect(log.numberOfSequencedEdits).to.equal(2);
		expect(log.numberOfLocalEdits).to.equal(0, 'Log should have only sequenced edits.');
		expect(log.length).to.equal(2);
	});

	it('can add local edits', () => {
		const log = new EditLog();

		log.addLocalEdit(id0, edit0);
		expect(log.numberOfLocalEdits).to.equal(1);
		expect(log.numberOfSequencedEdits).to.equal(0, 'Log should have only local edits.');

		log.addLocalEdit(id1, edit1);
		expect(log.numberOfLocalEdits).to.equal(2);
		expect(log.numberOfSequencedEdits).to.equal(0, 'Log should have only local edits.');
		expect(log.length).to.equal(2);
	});

	it('detects causal ordering violations', () => {
		const log = new EditLog();

		log.addLocalEdit(id0, edit0);
		log.addLocalEdit(id1, edit1);
		expect(() => log.addSequencedEdit(id1, edit1)).throws('ordering');
	});

	it('can sequence a local edit', async () => {
		const log = new EditLog();

		log.addLocalEdit(id0, edit0);
		expect(log.numberOfLocalEdits).to.equal(1);
		expect(await log.tryGetEdit(id0)).equals(edit0, 'Log should contain local edit.');

		log.addSequencedEdit(id0, edit0);
		expect(log.length).to.equal(1);
		expect(log.numberOfSequencedEdits).to.equal(1);
		expect(log.numberOfLocalEdits).to.equal(0, 'Log should have only sequenced edits.');
		expect(await log.tryGetEdit(id0)).equals(edit0, 'Log should contain sequenced edit.');
	});

	it('can sequence multiple local edits', async () => {
		const log = new EditLog();
		const ids: EditId[] = [];

		const numEdits = 10;
		for (let i = 0; i < numEdits; i++) {
			const [id, edit] = newEdit([]);
			log.addLocalEdit(id, edit);
			ids.push(id);
			expect(log.indexOf(id)).equals(i, 'Local edits should be appended to the end of the log.');
		}
		expect(log.length).equals(log.numberOfLocalEdits).and.equals(numEdits, 'Only local edits should be present.');

		log.sequenceLocalEdits();

		expect(log.getEditIds()).to.deep.equal(ids, 'Sequencing a local edit should not change its index.');

		expect(log.length)
			.equals(log.numberOfSequencedEdits)
			.and.equals(numEdits, 'Only sequenced edits should be present.');
	});

	it('can correctly compare equality to other edit logs', () => {
		const edit0Copy: Edit = { ...edit0 };
		const edit1Copy: Edit = { ...edit1 };

		const editChunks = [[edit0, edit1]];
		const editChunksCopy = [[edit0Copy, edit1Copy]];
		const editIds = [id0, id1];

		const log0 = new EditLog({ editChunks, editIds });
		const log1 = new EditLog({ editChunks: editChunksCopy, editIds });

		expect(log0.equals(log1)).to.be.true;

		const log2 = new EditLog({ editChunks: [[edit0Copy]], editIds: [id0] });
		log2.addLocalEdit(id1, edit1Copy);

		expect(log0.equals(log2)).to.be.true;

		const differentLog = new EditLog({ editChunks: [[edit0Copy]], editIds: [id0] });

		expect(log0.equals(differentLog)).to.be.false;
	});
});
