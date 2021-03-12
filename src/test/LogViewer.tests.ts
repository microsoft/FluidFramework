/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from '@fluidframework/common-definitions';
import { EditLog } from '../EditLog';
import { ChangeNode, Edit, EditResult, Insert, StablePlace } from '../PersistedTypes';
import { newEdit } from '../EditUtilities';
import { CachingLogViewer, EditResultCallback, LogViewer } from '../LogViewer';
import { Snapshot } from '../Snapshot';
import { initialTree } from '../InitialTree';
import { Transaction } from '../Transaction';
import { noop } from '../Common';
import {
	asyncFunctionThrowsCorrectly,
	initialSnapshot,
	left,
	leftTraitLabel,
	leftTraitLocation,
	makeEmptyNode,
	right,
	rightTraitLocation,
	simpleTestTree,
	simpleTreeSnapshot,
} from './utilities/TestUtilities';

const initialSimpleTree = { ...simpleTestTree, traits: {} };

function getSimpleLog(): EditLog {
	const log = new EditLog();
	log.addSequencedEdit(newEdit(Insert.create([left], StablePlace.atStartOf(leftTraitLocation))));
	log.addSequencedEdit(newEdit(Insert.create([right], StablePlace.atStartOf(rightTraitLocation))));
	return log;
}

function getSimpleLogWithLocalEdits(): EditLog {
	const logWithLocalEdits = getSimpleLog();
	logWithLocalEdits.addLocalEdit(newEdit(Insert.create([makeEmptyNode()], StablePlace.atEndOf(leftTraitLocation))));
	logWithLocalEdits.addLocalEdit(newEdit(Insert.create([makeEmptyNode()], StablePlace.atEndOf(rightTraitLocation))));
	logWithLocalEdits.addLocalEdit(newEdit(Insert.create([makeEmptyNode()], StablePlace.atStartOf(leftTraitLocation))));
	return logWithLocalEdits;
}

function getSnapshotsForLog(log: EditLog, baseTree: ChangeNode): Snapshot[] {
	const snapshots: Snapshot[] = [Snapshot.fromTree(baseTree)];
	for (let i = 0; i < log.length; i++) {
		const edit = log.getEditInSessionAtIndex(i);
		snapshots.push(new Transaction(snapshots[i]).applyChanges(edit.changes).view);
	}
	return snapshots;
}

function runLogViewerCorrectnessTests(viewerCreator: (log: EditLog, baseTree?: ChangeNode) => LogViewer): Mocha.Suite {
	return describe('LogViewer', () => {
		const log = getSimpleLog();

		it('generates initialTree by default for the 0th revision', () => {
			const viewer = viewerCreator(new EditLog());
			const headSnapshot = viewer.getSnapshotInSession(0);
			expect(headSnapshot.equals(Snapshot.fromTree(initialTree))).to.be.true;
		});

		it('can be constructed from a non-empty EditLog', () => {
			const viewer = viewerCreator(log, initialSimpleTree);
			const headSnapshot = viewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
			expect(headSnapshot.equals(simpleTreeSnapshot)).to.be.true;
		});

		it('can generate all snapshots for an EditLog', () => {
			const viewer = viewerCreator(log, initialSimpleTree);
			const initialSnapshot = viewer.getSnapshotInSession(0);
			expect(initialSnapshot.equals(Snapshot.fromTree(initialSimpleTree))).to.be.true;
			const leftOnlySnapshot = viewer.getSnapshotInSession(1);
			expect(
				leftOnlySnapshot.equals(Snapshot.fromTree({ ...simpleTestTree, traits: { [leftTraitLabel]: [left] } }))
			).to.be.true;
			const fullTreeSnapshot = viewer.getSnapshotInSession(2);
			expect(fullTreeSnapshot.equals(simpleTreeSnapshot)).to.be.true;
		});

		it('can set snapshots', () => {
			const snapshots = getSnapshotsForLog(log, initialSimpleTree);
			const viewer = viewerCreator(log, initialSimpleTree);
			for (let i = log.length; i >= 0; i--) {
				const snapshot = snapshots[i];
				viewer.setKnownRevision(i, snapshot);
				expect(viewer.getSnapshotInSession(i).equals(snapshot)).to.be.true;
			}
		});

		it('produces correct snapshots when the log is mutated', () => {
			const simpleLog = getSimpleLog();
			const mutableLog = new EditLog();
			const viewer = viewerCreator(mutableLog, initialSimpleTree);
			const snapshotsForLog = getSnapshotsForLog(simpleLog, initialSimpleTree);
			// This test takes an empty log (A) and a log with edits in it (B), and adds the edits from B to A.
			// After each addition, the test code will iterate from [0, length_of_A] and get a snapshot for each revision via LogViewer
			// and assert that none of the snapshots differ from those created via pure Transaction APIs.
			for (let i = 0; i <= simpleLog.length; i++) {
				for (let j = 0; j <= mutableLog.length; j++) {
					const viewerSnapshot = viewer.getSnapshotInSession(j);
					expect(viewerSnapshot.equals(snapshotsForLog[j])).to.be.true;
				}
				// Revisions are from [0, simpleLog.length], edits are at indices [0, simpleLog.length)
				if (i < simpleLog.length) {
					const edit = simpleLog.getEditInSessionAtIndex(i);
					mutableLog.addSequencedEdit(edit);
				}
			}
		});

		it('produces correct snapshots when local edits are shifted in the log due to sequenced edits being added', () => {
			function getSnapshotsFromViewer(viewer: LogViewer, lastRevision: number): Snapshot[] {
				const snapshots: Snapshot[] = [];
				for (let i = 0; i <= lastRevision; i++) {
					snapshots.push(viewer.getSnapshotInSession(i));
				}
				return snapshots;
			}

			function expectSnapshotsAreEqual(log: EditLog, viewer: LogViewer): void {
				const snapshotsForLog = getSnapshotsForLog(log, initialSimpleTree);
				const snapshotsForViewer = getSnapshotsFromViewer(viewer, log.length);
				expect(snapshotsForLog.length).to.equal(snapshotsForViewer.length);
				for (let i = 0; i < snapshotsForLog.length; i++) {
					expect(snapshotsForLog[i].equals(snapshotsForViewer[i])).to.be.true;
				}
			}

			const logWithLocalEdits = getSimpleLogWithLocalEdits();
			const viewer = viewerCreator(logWithLocalEdits, initialSimpleTree);
			expectSnapshotsAreEqual(logWithLocalEdits, viewer);

			// Sequence the existing local edits and ensure viewer generates the correct snapshots
			while (logWithLocalEdits.numberOfLocalEdits > 0) {
				// Add a remote sequenced edit
				logWithLocalEdits.addSequencedEdit(
					newEdit(Insert.create([makeEmptyNode()], StablePlace.atStartOf(rightTraitLocation)))
				);
				expectSnapshotsAreEqual(logWithLocalEdits, viewer);
				// Sequence a local edit
				logWithLocalEdits.addSequencedEdit(
					logWithLocalEdits.getEditInSessionAtIndex(logWithLocalEdits.numberOfSequencedEdits)
				);
				expectSnapshotsAreEqual(logWithLocalEdits, viewer);
			}
		});
	});
}

describe('CachingLogViewer', () => {
	function getMockLogger(callback?: (event: ITelemetryBaseEvent) => void): ITelemetryBaseLogger {
		return { send: callback ?? noop };
	}

	function getCachingLogViewer(
		log: EditLog,
		baseTree?: ChangeNode,
		editCallback?: EditResultCallback,
		logger?: ITelemetryBaseLogger
	): CachingLogViewer {
		return new CachingLogViewer(
			log,
			baseTree,
			/* expensiveValidation */ true,
			editCallback,
			logger ?? getMockLogger()
		);
	}

	runLogViewerCorrectnessTests(getCachingLogViewer);

	const log = getSimpleLog();

	it('detects non-integer revisions when setting snapshots', async () => {
		const viewer = getCachingLogViewer(log, initialSimpleTree);
		expect(
			await asyncFunctionThrowsCorrectly(
				async () => viewer.setKnownRevision(2.4, simpleTreeSnapshot),
				'revision must be an integer'
			)
		).to.be.true;
	});

	it('detects out-of-bounds revisions when setting snapshots', async () => {
		const viewer = getCachingLogViewer(log, initialSimpleTree);
		expect(
			await asyncFunctionThrowsCorrectly(
				async () => viewer.setKnownRevision(1000, simpleTreeSnapshot),
				'revision must correspond to the result of a SequencedEdit'
			)
		).to.be.true;
	});

	it('detects invalid snapshots', async () => {
		const viewer = getCachingLogViewer(log, initialSimpleTree);
		// Set the head revision snapshot to something different than what is produced by applying edits sequentially.
		expect(
			await asyncFunctionThrowsCorrectly(
				async () => viewer.setKnownRevision(2, initialSnapshot),
				'setKnownRevision passed invalid snapshot'
			)
		).to.be.true;
	});

	it('reuses cached snapshots for sequenced edits', async () => {
		let editsProcessed = 0;
		const viewer = getCachingLogViewer(log, initialSimpleTree, () => editsProcessed++);

		// Force all snapshots to be generated.
		await viewer.getSnapshot(Number.POSITIVE_INFINITY);
		expect(editsProcessed).to.equal(log.length);
		// Ask for every snapshot; no edit application should occur, since the snapshots will be cached.
		for (let i = 0; i <= log.length; i++) {
			await viewer.getSnapshot(i);
		}
		expect(editsProcessed).to.equal(log.length);
	});

	it('caches snapshots for local revisions', async () => {
		const logWithLocalEdits = getSimpleLogWithLocalEdits();
		let editsProcessed = 0;
		const viewer = getCachingLogViewer(logWithLocalEdits, initialSimpleTree, () => editsProcessed++);

		await viewer.getSnapshot(Number.POSITIVE_INFINITY);
		expect(editsProcessed).to.equal(logWithLocalEdits.length);

		// Local edits should now be cached until next remote sequenced edit arrives
		editsProcessed = 0;
		for (let i = logWithLocalEdits.numberOfSequencedEdits + 1; i <= logWithLocalEdits.length; i++) {
			await viewer.getSnapshot(i);
			expect(editsProcessed).to.equal(0);
		}

		// Add a new local edit, and request the latest view.
		// This should apply only a single edit, as the most recent HEAD should be cached.
		editsProcessed = 0;
		logWithLocalEdits.addLocalEdit(
			newEdit(Insert.create([makeEmptyNode()], StablePlace.atEndOf(rightTraitLocation)))
		);
		await viewer.getSnapshot(Number.POSITIVE_INFINITY);
		expect(editsProcessed).to.equal(1);

		editsProcessed = 0;
		while (logWithLocalEdits.numberOfLocalEdits > 0) {
			logWithLocalEdits.addSequencedEdit(
				logWithLocalEdits.getEditInSessionAtIndex(logWithLocalEdits.numberOfSequencedEdits)
			);
			await viewer.getSnapshot(Number.POSITIVE_INFINITY);
			expect(editsProcessed).to.equal(0);
		}
	});

	it('invalidates cached snapshots for local revisions when remote edits are received', () => {
		const logWithLocalEdits = getSimpleLogWithLocalEdits();
		let editsProcessed = 0;
		const viewer = getCachingLogViewer(logWithLocalEdits, initialSimpleTree, () => editsProcessed++);

		// Request twice, should only process edits once
		viewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
		viewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).to.equal(logWithLocalEdits.length);

		// Remote edit arrives
		editsProcessed = 0;
		logWithLocalEdits.addSequencedEdit(
			newEdit(Insert.create([makeEmptyNode()], StablePlace.atEndOf(rightTraitLocation)))
		);
		viewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).to.equal(logWithLocalEdits.numberOfLocalEdits + 1);
	});

	// An arbitrary snapshot which can be used to check to see if it gets used when provided as a cached value.
	const arbitrarySnapshot = Snapshot.fromTree(makeEmptyNode());

	it('uses known editing result', () => {
		const log = new EditLog();
		const editsProcessed: boolean[] = [];
		const viewer = getCachingLogViewer(log, initialSimpleTree, (_, _2, wasCached) =>
			editsProcessed.push(wasCached)
		);
		const before = viewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
		const edit = newEdit([]);
		log.addLocalEdit(edit);
		viewer.setKnownEditingResult(edit, {
			result: EditResult.Applied,
			changes: edit.changes,
			before,
			after: arbitrarySnapshot,
		});
		const after = viewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).deep.equal([true]);
		expect(after).equal(arbitrarySnapshot);
	});

	it('ignores known editing if for wrong before snapshot', () => {
		const log = new EditLog();
		const editsProcessed: boolean[] = [];
		const viewer = getCachingLogViewer(log, initialSimpleTree, (_, _2, wasCached) =>
			editsProcessed.push(wasCached)
		);
		const edit = newEdit([]);
		log.addLocalEdit(edit);
		viewer.setKnownEditingResult(edit, {
			result: EditResult.Applied,
			changes: edit.changes,
			before: arbitrarySnapshot,
			after: arbitrarySnapshot,
		});
		const after = viewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).deep.equal([false]);
		expect(after).not.equal(arbitrarySnapshot);
	});

	it('ignores known editing if for wrong edit', () => {
		const log = new EditLog();
		const editsProcessed: boolean[] = [];
		const viewer = getCachingLogViewer(log, initialSimpleTree, (_, _2, wasCached) =>
			editsProcessed.push(wasCached)
		);
		const before = viewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
		const edit = newEdit([]);
		log.addLocalEdit(edit);
		viewer.setKnownEditingResult(newEdit([]), {
			result: EditResult.Applied,
			changes: edit.changes,
			before,
			after: arbitrarySnapshot,
		});
		const after = viewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).deep.equal([false]);
		expect(after).not.equal(arbitrarySnapshot);
	});

	it('uses known editing result with multiple edits', () => {
		const log = new EditLog();
		const editsProcessed: boolean[] = [];
		const viewer = getCachingLogViewer(log, initialSimpleTree, (_, _2, wasCached) =>
			editsProcessed.push(wasCached)
		);
		const edit1 = newEdit([]);
		const edit2 = newEdit([]);
		const edit3 = newEdit([]);
		log.addLocalEdit(edit1);

		const before = viewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).deep.equal([false]);
		log.addLocalEdit(edit2);
		viewer.setKnownEditingResult(edit2, {
			result: EditResult.Applied,
			changes: edit2.changes,
			before,
			after: arbitrarySnapshot,
		});
		const after = viewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).deep.equal([false, true]);
		expect(after).equal(arbitrarySnapshot);
		log.addLocalEdit(edit3);
		viewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).deep.equal([false, true, false]);
	});

	describe('Telemetry', () => {
		function getViewer(): { log: EditLog; viewer: CachingLogViewer; events: ITelemetryBaseEvent[] } {
			const log = getSimpleLog();
			const events: ITelemetryBaseEvent[] = [];
			const viewer = new CachingLogViewer(
				log,
				initialSimpleTree,
				/* expensiveValidation */ true,
				undefined,
				getMockLogger((event) => events.push(event))
			);
			return { log, viewer, events };
		}

		function addInvalidEdit(log: EditLog): Edit {
			// Add a local edit that will be invalid (inserts a node at a location that doesn't exist)
			const edit = newEdit(
				Insert.create(
					[makeEmptyNode()],
					StablePlace.atEndOf({
						parent: initialTree.identifier,
						label: leftTraitLabel,
					})
				)
			);
			log.addLocalEdit(edit);
			return edit;
		}

		it('is logged for invalid locally generated edits when those edits are sequenced', async () => {
			const { log, events, viewer } = getViewer();
			const edit = addInvalidEdit(log);
			await viewer.getSnapshot(Number.POSITIVE_INFINITY);
			expect(events.length).equals(0, 'Invalid local edit should not log telemetry');
			log.addSequencedEdit(edit);
			await viewer.getSnapshot(Number.POSITIVE_INFINITY);
			expect(events.length).equals(1);
		});

		it('is only logged once upon first application for invalid locally generated edits', async () => {
			const { log, events, viewer } = getViewer();
			const numEdits = 10;
			const localEdits = [...Array(numEdits).keys()].map(() => addInvalidEdit(log));
			await viewer.getSnapshot(Number.POSITIVE_INFINITY);
			expect(events.length).equals(0);
			for (let i = 0; i < numEdits; i++) {
				const localEdit = localEdits[i];
				log.addSequencedEdit(localEdit);
				await viewer.getSnapshot(Number.POSITIVE_INFINITY);
				expect(events.length).equals(i + 1);
				const currentEvent = events[i];
				expect(currentEvent.category).equals('generic');
				expect(currentEvent.eventName).equals('InvalidSharedTreeEdit');
			}
		});
	});
});
