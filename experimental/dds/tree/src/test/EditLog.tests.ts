/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { EditLog } from '../EditLog';
import { Edit } from '../PersistedTypes';
import { newEdit } from '../EditUtilities';

describe('EditLog', () => {
	const edit0: Edit = newEdit([]);
	const edit1: Edit = newEdit([]);

	it('can be constructed from sequenced edits', () => {
		const sequencedEdits = [edit0, edit1];

		const log = new EditLog(sequencedEdits);
		expect(log.numberOfLocalEdits).to.equal(0, 'Newly initialized log should not have local edits.');
		expect(log.numberOfSequencedEdits).to.equal(
			sequencedEdits.length,
			'Log should have as many sequenced edits as it was initialized with.'
		);
		expect(log.length).to.equal(
			sequencedEdits.length,
			"Log's total length should match its sequenced edits on construction"
		);

		expect(log.getAtIndex(0).id).to.equal(edit0.id, 'Log should have edits in order of construction.');
		expect(log.getAtIndex(1).id).to.equal(edit1.id, 'Log should have edits in order of construction.');
	});

	it('can get the index from an edit id of sequenced edits', () => {
		const log = new EditLog([edit0, edit1]);

		expect(log.indexOf(edit0.id)).to.equal(0);
		expect(log.indexOf(edit1.id)).to.equal(1);
	});

	it('can get the index from an edit id of a local edit', () => {
		const log = new EditLog([edit0]);
		log.addLocalEdit(edit1);

		expect(log.indexOf(edit0.id)).to.equal(0);
		expect(log.indexOf(edit1.id)).to.equal(1);
	});

	it('can get an edit from an index', () => {
		const log = new EditLog([edit0, edit1]);

		expect(log.getAtIndex(0).id).to.equal(edit0.id);
		expect(log.getAtIndex(1).id).to.equal(edit1.id);
	});

	it('can get an edit from an edit id', () => {
		const log = new EditLog([edit0, edit1]);

		expect(log.tryGetEdit(edit0.id)).to.equal(edit0);
		expect(log.tryGetEdit(edit1.id)).to.equal(edit1);
	});

	it('can be iterated', () => {
		const log = new EditLog();

		log.addLocalEdit(edit1);
		log.addSequencedEdit(edit0);

		// Sequenced edits should be iterated before local edits
		const expectedEditIdStack = [edit1.id, edit0.id];

		for (const edit of log) {
			expect(edit.id).to.equal(expectedEditIdStack.pop());
		}

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

	it('can sequence a local edit', () => {
		const log = new EditLog();

		log.addLocalEdit(edit0);
		expect(log.numberOfLocalEdits).to.equal(1);
		expect(log.tryGetEdit(edit0.id)).equals(edit0, 'Log should contain local edit.');

		log.addSequencedEdit(edit0);
		expect(log.length).to.equal(1);
		expect(log.numberOfSequencedEdits).to.equal(1);
		expect(log.numberOfLocalEdits).to.equal(0, 'Log should have only sequenced edits.');
		expect(log.tryGetEdit(edit0.id)).equals(edit0, 'Log should contain sequenced edit.');
	});

	it('can sequence multiple local edits', () => {
		const log = new EditLog();

		const numEdits = 10;
		for (let i = 0; i < numEdits; i++) {
			const edit = newEdit([]);
			log.addLocalEdit(edit);
			expect(log.indexOf(edit.id)).equals(i, 'Local edits should be appended to the end of the log.');
		}
		expect(log.length).equals(log.numberOfLocalEdits).and.equals(numEdits, 'Only local edits should be present.');

		for (let i = 0; i < numEdits; i++) {
			const nextEditToSequence = log.getAtIndex(log.numberOfSequencedEdits);
			log.addSequencedEdit(nextEditToSequence);
			expect(log.indexOf(nextEditToSequence.id)).equals(
				log.numberOfSequencedEdits - 1,
				'Sequencing a local edit should not change its index.'
			);
			expect(log.tryGetEdit(nextEditToSequence.id)).equals(
				nextEditToSequence,
				'Sequencing a local edit should keep it in the log.'
			);
		}
		expect(log.length)
			.equals(log.numberOfSequencedEdits)
			.and.equals(numEdits, 'Only sequenced edits should be present.');
	});

	it('can correctly compare equality to other edit logs', () => {
		const edit0Copy: Edit = { ...edit0 };
		const edit1Copy: Edit = { ...edit1 };

		const log0 = new EditLog([edit0, edit1]);
		const log1 = new EditLog([edit0Copy, edit1Copy]);

		expect(log0.equals(log1)).to.be.true;

		const log2 = new EditLog([edit0Copy]);
		log2.addLocalEdit(edit1Copy);

		expect(log0.equals(log2)).to.be.true;

		const differentLog = new EditLog([edit0Copy]);

		expect(log0.equals(differentLog)).to.be.false;
	});
});
