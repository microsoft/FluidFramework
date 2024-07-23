/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'assert';

import { validateAssertionError } from '@fluidframework/test-runtime-utils/internal';
import { expect } from 'chai';

import { assertNotUndefined } from '../Common.js';
import { EditLog, separateEditAndId } from '../EditLog.js';
import { newEdit } from '../EditUtilities.js';
import { EditId } from '../Identifiers.js';
import { Edit } from '../persisted-types/index.js';

type DummyChange = never;

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

		expect(log.tryGetEditAtIndex(0)?.id).to.equal(id0);
		expect(log.tryGetEditAtIndex(1)?.id).to.equal(id1);
	});

	it('can get an edit from an edit id', async () => {
		const editChunks = [{ startRevision: 0, chunk: [editWithoutId0, editWithoutId1] }];
		const editIds = [id0, id1];

		const log = new EditLog({ editChunks, editIds });

		const editFromId0 = log.tryGetEditFromId(id0);
		const editFromId1 = log.tryGetEditFromId(id1);

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

	it('tracks the min sequence index of sequenced edits', () => {
		const log = new EditLog();

		expect(log.minSequenceNumber).equals(0);
		log.addSequencedEdit(edit0, { sequenceNumber: 1, referenceSequenceNumber: 0 });
		expect(log.minSequenceNumber).equals(0);
		log.addSequencedEdit(edit1, {
			sequenceNumber: 43,
			referenceSequenceNumber: 42,
			minimumSequenceNumber: 42,
		});
		expect(log.minSequenceNumber).equals(42);
		assert.throws(
			() =>
				log.addSequencedEdit('fake-edit' as unknown as Edit<unknown>, {
					sequenceNumber: 44,
					referenceSequenceNumber: 43,
				}),
			(e: Error) => validateAssertionError(e, /min number/)
		);
	});

	it('detects causal ordering violations', () => {
		const log = new EditLog();

		log.addLocalEdit(edit0);
		log.addLocalEdit(edit1);
		assert.throws(
			() => log.addSequencedEdit(edit1, { sequenceNumber: 1, referenceSequenceNumber: 0 }),
			(e: Error) => validateAssertionError(e, /ordering/)
		);
	});

	it('can sequence a local edit', async () => {
		const log = new EditLog();

		log.addLocalEdit(edit0);
		expect(log.numberOfLocalEdits).to.equal(1);
		let editFromId0 = log.tryGetEditFromId(id0);
		expect(editFromId0).to.not.be.undefined;
		expect(assertNotUndefined(editFromId0).id).equals(edit0.id, 'Log should contain local edit.');

		log.addSequencedEdit(edit0, { sequenceNumber: 1, referenceSequenceNumber: 0 });
		expect(log.length).to.equal(1);
		expect(log.numberOfSequencedEdits).to.equal(1);
		expect(log.numberOfLocalEdits).to.equal(0, 'Log should have only sequenced edits.');
		editFromId0 = log.tryGetEditFromId(id0);
		expect(editFromId0).to.not.be.undefined;
		expect(assertNotUndefined(editFromId0).id).equals(edit0.id, 'Log should contain sequenced edit.');
	});

	it('Throws on duplicate sequenced edits', async () => {
		const log = new EditLog();
		log.addSequencedEdit(edit0, { sequenceNumber: 1, referenceSequenceNumber: 0 });
		assert.throws(
			() => log.addSequencedEdit(edit0, { sequenceNumber: 1, referenceSequenceNumber: 0 }),
			(e: Error) => validateAssertionError(e, /Duplicate/)
		);
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

	it('can configure a maximum size and evict edits once it grows larger than that size', () => {
		const targetEditLogSize = 10;
		const log = new EditLog(undefined, undefined, undefined, targetEditLogSize, targetEditLogSize * 2);
		const ids: EditId[] = [];

		let editsEvicted = 0;

		log.registerEditEvictionHandler((editsToEvict) => {
			editsEvicted += editsToEvict;
		});

		for (let i = 0; i < targetEditLogSize; i++) {
			const edit = newEdit([]);
			log.addSequencedEdit(edit, {
				sequenceNumber: i,
				referenceSequenceNumber: i - 1,
			});
			ids.push(edit.id);
			expect(log.getIndexOfId(edit.id)).equals(i);
		}
		expect(log.length)
			.equals(log.numberOfSequencedEdits)
			.and.equals(targetEditLogSize, 'Only sequenced edits should be present.');

		const newIds: EditId[] = [];
		for (let i = 0; i < targetEditLogSize; i++) {
			const edit = newEdit([]);
			const sequenceNumber = targetEditLogSize + i;
			log.addSequencedEdit(edit, {
				sequenceNumber,
				referenceSequenceNumber: sequenceNumber - 1,
				minimumSequenceNumber: sequenceNumber - 1,
			});
			newIds.push(edit.id);
		}

		expect(log.editIds).to.deep.equal(newIds, 'Edit IDs should have been evicted.');
		expect(log.length)
			.equals(log.numberOfSequencedEdits)
			.and.equals(targetEditLogSize, 'Edits should have been evicted');
		expect(editsEvicted).to.equal(targetEditLogSize);

		// Check that indices are the same after eviction
		expect(log.tryGetEditAtIndex(15)?.id).to.equal(ids.concat(newIds)[15]);
	});

	it('can handle sparse sequence numbers', () => {
		const targetEditLogSize = 10;
		const log = new EditLog(undefined, undefined, undefined, targetEditLogSize, targetEditLogSize * 2);
		const sequenceNumberInterval = 3;

		let editsEvicted = 0;

		log.registerEditEvictionHandler((editsToEvict) => {
			editsEvicted += editsToEvict;
		});

		let sequenceNumber = 0;

		for (let i = 0; i < targetEditLogSize; i++) {
			const edit = newEdit([]);
			log.addSequencedEdit(edit, {
				sequenceNumber,
				referenceSequenceNumber: sequenceNumber - 1,
			});
			sequenceNumber += sequenceNumberInterval;
			expect(log.getIndexOfId(edit.id)).equals(i);
		}
		expect(log.length)
			.equals(log.numberOfSequencedEdits)
			.and.equals(targetEditLogSize, 'Only sequenced edits should be present.');

		const extraEditsToKeep = 3;
		const collaborationWindowSize = targetEditLogSize + extraEditsToKeep;
		const minimumSequenceNumber = sequenceNumber - extraEditsToKeep * sequenceNumberInterval;
		for (let i = 0; i < targetEditLogSize; i++) {
			const edit = newEdit([]);
			log.addSequencedEdit(edit, {
				sequenceNumber,
				referenceSequenceNumber: sequenceNumber - 1,
				minimumSequenceNumber,
			});
			sequenceNumber += sequenceNumberInterval;
		}

		expect(log.length)
			.equals(log.numberOfSequencedEdits)
			.and.equals(collaborationWindowSize, 'Edits should have been evicted');
		expect(editsEvicted).to.equal(targetEditLogSize * 2 - collaborationWindowSize);
	});

	it("can handle sparse sequence numbers with a minimum sequence number that's not in memory", () => {
		const targetEditLogSize = 10;
		const log = new EditLog(undefined, undefined, undefined, targetEditLogSize, targetEditLogSize * 2);
		const sequenceNumberInterval = 3;

		let editsEvicted = 0;

		log.registerEditEvictionHandler((editsToEvict) => {
			editsEvicted += editsToEvict;
		});

		let sequenceNumber = 0;

		for (let i = 0; i < targetEditLogSize; i++) {
			const edit = newEdit([]);
			log.addSequencedEdit(edit, {
				sequenceNumber,
				referenceSequenceNumber: sequenceNumber - 1,
			});
			sequenceNumber += sequenceNumberInterval;
			expect(log.getIndexOfId(edit.id)).equals(i);
		}
		expect(log.length)
			.equals(log.numberOfSequencedEdits)
			.and.equals(targetEditLogSize, 'Only sequenced edits should be present.');

		const extraEditsToKeep = 3;
		const collaborationWindowSize = targetEditLogSize + extraEditsToKeep;
		// Adjusts the minimum sequence number to one that's not associated with any of the edits added
		const minimumSequenceNumber = sequenceNumber - 1 - extraEditsToKeep * sequenceNumberInterval;
		for (let i = 0; i < targetEditLogSize; i++) {
			const edit = newEdit([]);
			log.addSequencedEdit(edit, {
				sequenceNumber,
				referenceSequenceNumber: sequenceNumber - 1,
				minimumSequenceNumber,
			});
			sequenceNumber += sequenceNumberInterval;
		}

		expect(log.length)
			.equals(log.numberOfSequencedEdits)
			.and.equals(collaborationWindowSize, 'Edits should have been evicted');
		expect(editsEvicted).to.equal(targetEditLogSize * 2 - collaborationWindowSize);
	});

	describe('does not evict edits in the collaboration window', () => {
		[0, 2, 8, 23, 50, 68, 255].forEach((startSequenceNumber) => {
			[1, 7, 10, 13, 52].forEach((targetEditLogSize) => {
				[2, 15, 21, Math.floor(targetEditLogSize * 1.5), targetEditLogSize * 2].forEach((collaborationWindowSize) => {
					it(`when accepting edits starting from sequence number ${startSequenceNumber} and targeting an edit log size of ${targetEditLogSize} and a collaboration window size of ${collaborationWindowSize}`, () => {
						const log = new EditLog(undefined, undefined, undefined, targetEditLogSize, targetEditLogSize * 2);

						let editsEvicted = 0;

						log.registerEditEvictionHandler((editsToEvict) => {
							editsEvicted += editsToEvict;
						});

						let sequenceNumber = startSequenceNumber;

						const addEditsTillEviction = (minimumSequenceNumber?: number) => {
							for (let i = 0; i < targetEditLogSize; i++) {
								const edit = newEdit([]);
								log.addSequencedEdit(edit, {
									sequenceNumber,
									referenceSequenceNumber: sequenceNumber - 1,
									minimumSequenceNumber,
								});
								sequenceNumber += 1;
							}
						};

						// Add enough edits to hit the target size
						addEditsTillEviction();
						expect(log.length)
							.equals(log.numberOfSequencedEdits)
							.and.equals(targetEditLogSize, 'Only sequenced edits should be present.');

						// Add another set of edits to trigger eviction while setting the collaboration window size
						const minimumSequenceNumber = Math.max(
							0,
							startSequenceNumber + targetEditLogSize * 2 - collaborationWindowSize
						);
						addEditsTillEviction(minimumSequenceNumber);

						const expectedEditLogSize =
							// If the target edit log size is larger than the collaboration window size, we can evict everything we want to
							targetEditLogSize > collaborationWindowSize
								? targetEditLogSize
								: Math.min(targetEditLogSize * 2, collaborationWindowSize);
						expect(log.length)
							.equals(log.numberOfSequencedEdits)
							.and.equals(expectedEditLogSize, 'Only edits outside the collab window should have been evicted');
						expect(editsEvicted).to.equal(targetEditLogSize * 2 - expectedEditLogSize);

						// Trigger a second eviction to ensure that eviction works after an eviction has already occurred
						const secondMinimumSequenceNumber = Math.max(
							0,
							startSequenceNumber + targetEditLogSize * 3 - collaborationWindowSize
						);
						addEditsTillEviction(secondMinimumSequenceNumber);

						const secondExpectedEditLogSize =
							// If the target edit log size is larger than the collaboration window size, we can evict everything we want to
							targetEditLogSize > collaborationWindowSize
								? targetEditLogSize
								: Math.min(targetEditLogSize * 3, collaborationWindowSize);
						expect(log.length)
							.equals(log.numberOfSequencedEdits)
							.and.equals(secondExpectedEditLogSize, 'Only edits outside the collab window should have been evicted');
						expect(editsEvicted).to.equal(targetEditLogSize * 3 - secondExpectedEditLogSize);
					});
				});
			});
		});
	});
});
