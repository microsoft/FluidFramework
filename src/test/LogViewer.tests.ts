/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from '@fluidframework/common-definitions';
import { EditLog } from '../EditLog';
import { Change, Insert, StablePlace, Transaction } from '../default-edits';
import { CachingLogViewer, EditStatusCallback, LogViewer } from '../LogViewer';
import { Snapshot } from '../Snapshot';
import { assert, noop } from '../Common';
import { newEdit, Edit, EditStatus } from '../generic';
import {
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

const simpleTreeNoTraits = { ...simpleTestTree, traits: {} };
const simpleSnapshotNoTraits = Snapshot.fromTree(simpleTreeNoTraits);

function getSimpleLog(numEdits: number = 2): EditLog<Change> {
	const log = new EditLog<Change>();
	for (let i = 0; i < numEdits; i++) {
		if (i % 2 === 0) {
			log.addSequencedEdit(newEdit(Insert.create([left], StablePlace.atStartOf(leftTraitLocation))));
		} else {
			log.addSequencedEdit(newEdit(Insert.create([right], StablePlace.atStartOf(rightTraitLocation))));
		}
	}
	return log;
}

function getSimpleLogWithLocalEdits(numSequencedEdits: number = 2): EditLog<Change> {
	const logWithLocalEdits = getSimpleLog(numSequencedEdits);
	logWithLocalEdits.addLocalEdit(newEdit(Insert.create([makeEmptyNode()], StablePlace.atEndOf(leftTraitLocation))));
	logWithLocalEdits.addLocalEdit(newEdit(Insert.create([makeEmptyNode()], StablePlace.atEndOf(rightTraitLocation))));
	logWithLocalEdits.addLocalEdit(newEdit(Insert.create([makeEmptyNode()], StablePlace.atStartOf(leftTraitLocation))));
	return logWithLocalEdits;
}

function getSnapshotsForLog(log: EditLog<Change>, baseSnapshot: Snapshot): Snapshot[] {
	const snapshots = [baseSnapshot];
	for (let i = 0; i < log.length; i++) {
		const edit = log.getEditInSessionAtIndex(i);
		snapshots.push(new Transaction(snapshots[i]).applyChanges(edit.changes).view);
	}
	return snapshots;
}

function runLogViewerCorrectnessTests(
	viewerCreator: (log: EditLog<Change>, baseSnapshot?: Snapshot) => LogViewer
): Mocha.Suite {
	return describe('LogViewer', () => {
		const log = getSimpleLog();

		it('generates initialTree by default for the 0th revision', () => {
			const viewer = viewerCreator(new EditLog());
			const headSnapshot = viewer.getSnapshotInSession(0);
			expect(headSnapshot.equals(initialSnapshot)).to.be.true;
		});

		it('can be constructed from a non-empty EditLog', () => {
			const viewer = viewerCreator(log, simpleSnapshotNoTraits);
			const headSnapshot = viewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
			expect(headSnapshot.equals(simpleTreeSnapshot)).to.be.true;
		});

		it('can generate all snapshots for an EditLog', () => {
			const viewer = viewerCreator(log, simpleSnapshotNoTraits);
			const initialSnapshot = viewer.getSnapshotInSession(0);
			expect(initialSnapshot.equals(simpleSnapshotNoTraits)).to.be.true;
			const leftOnlySnapshot = viewer.getSnapshotInSession(1);
			expect(
				leftOnlySnapshot.equals(Snapshot.fromTree({ ...simpleTestTree, traits: { [leftTraitLabel]: [left] } }))
			).to.be.true;
			const fullTreeSnapshot = viewer.getSnapshotInSession(2);
			expect(fullTreeSnapshot.equals(simpleTreeSnapshot)).to.be.true;
		});

		it('produces correct snapshots when the log is mutated', () => {
			const simpleLog = getSimpleLog();
			const mutableLog = new EditLog<Change>();
			const viewer = viewerCreator(mutableLog, simpleSnapshotNoTraits);
			const snapshotsForLog = getSnapshotsForLog(simpleLog, simpleSnapshotNoTraits);
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

			function expectSnapshotsAreEqual(log: EditLog<Change>, viewer: LogViewer): void {
				const snapshotsForLog = getSnapshotsForLog(log, simpleSnapshotNoTraits);
				const snapshotsForViewer = getSnapshotsFromViewer(viewer, log.length);
				expect(snapshotsForLog.length).to.equal(snapshotsForViewer.length);
				for (let i = 0; i < snapshotsForLog.length; i++) {
					expect(snapshotsForLog[i].equals(snapshotsForViewer[i])).to.be.true;
				}
			}

			const logWithLocalEdits = getSimpleLogWithLocalEdits();
			const viewer = viewerCreator(logWithLocalEdits, simpleSnapshotNoTraits);
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
		log: EditLog<Change>,
		baseSnapshot?: Snapshot,
		editCallback?: EditStatusCallback,
		logger?: ITelemetryBaseLogger,
		knownRevisions?: [number, Snapshot][]
	): CachingLogViewer<Change> {
		return new CachingLogViewer(
			log,
			baseSnapshot,
			knownRevisions,
			/* expensiveValidation */ true,
			editCallback,
			logger ?? getMockLogger(),
			Transaction.factory,
			log.numberOfSequencedEdits
		);
	}

	runLogViewerCorrectnessTests(getCachingLogViewer);

	it('detects non-integer revisions when setting snapshots', async () => {
		expect(() =>
			getCachingLogViewer(getSimpleLog(), simpleSnapshotNoTraits, undefined, undefined, [
				[2.4, simpleTreeSnapshot],
			])
		).to.throw('revision must be an integer');
	});

	it('detects out-of-bounds revisions when setting snapshots', async () => {
		expect(() =>
			getCachingLogViewer(getSimpleLog(), simpleSnapshotNoTraits, undefined, undefined, [
				[1000, simpleTreeSnapshot],
			])
		).to.throw('revision must correspond to the result of a SequencedEdit');
	});

	it('can be created with known revisions', async () => {
		const log = getSimpleLog();
		const snapshots = getSnapshotsForLog(log, simpleSnapshotNoTraits);
		const viewer = getCachingLogViewer(
			log,
			simpleSnapshotNoTraits,
			undefined,
			undefined,
			Array.from(snapshots.keys()).map((revision) => [revision, snapshots[revision]])
		);
		for (let i = log.length; i >= 0; i--) {
			const snapshot = snapshots[i];
			expect(viewer.getSnapshotInSession(i).equals(snapshot)).to.be.true;
		}
	});

	async function requestAllSnapshots(viewer: CachingLogViewer<Change>, log: EditLog<Change>): Promise<void> {
		for (let i = 0; i <= log.length; i++) {
			await viewer.getSnapshot(i);
		}
	}

	it('caches snapshots for sequenced edits', async () => {
		const log = getSimpleLog();
		let editsProcessed = 0;
		const viewer = getCachingLogViewer(log, simpleSnapshotNoTraits, () => editsProcessed++);
		assert(log.length < CachingLogViewer.sequencedCacheSizeMax);

		await requestAllSnapshots(viewer, log);
		expect(editsProcessed).to.equal(log.length);

		// Ask for every snapshot; no edit application should occur, since the snapshots will be cached.
		for (let i = 0; i <= log.length; i++) {
			await viewer.getSnapshot(i);
		}
		expect(editsProcessed).to.equal(log.length);
	});

	it('evicts least recently set cached snapshots for sequenced edits', async () => {
		let editsProcessed = 0;
		const log = getSimpleLog(CachingLogViewer.sequencedCacheSizeMax * 2);
		const viewer = getCachingLogViewer(log, simpleSnapshotNoTraits, () => editsProcessed++);
		viewer.setMinimumSequenceNumber(log.length + 1); // simulate all edits being subject to eviction

		await requestAllSnapshots(viewer, log);
		expect(editsProcessed).to.equal(log.length);

		editsProcessed = 0;
		for (let i = CachingLogViewer.sequencedCacheSizeMax + 1; i <= log.length; i++) {
			await viewer.getSnapshot(i);
		}
		expect(editsProcessed).to.equal(0);

		await viewer.getSnapshot(CachingLogViewer.sequencedCacheSizeMax);
		expect(editsProcessed).to.equal(CachingLogViewer.sequencedCacheSizeMax);
	});

	it('never evicts the snapshot for the most recent sequenced edit', async () => {
		let editsProcessed = 0;
		const log = getSimpleLog(CachingLogViewer.sequencedCacheSizeMax * 2);
		const viewer = getCachingLogViewer(log, simpleSnapshotNoTraits, () => editsProcessed++);

		// Simulate all clients being caught up.
		viewer.setMinimumSequenceNumber(log.numberOfSequencedEdits);

		await requestAllSnapshots(viewer, log);
		expect(editsProcessed).to.equal(log.length);

		editsProcessed = 0;
		for (let i = 0; i <= CachingLogViewer.sequencedCacheSizeMax; i++) {
			await viewer.getSnapshot(i);
		}
		expect(editsProcessed).to.equal(CachingLogViewer.sequencedCacheSizeMax);

		editsProcessed = 0;
		await viewer.getSnapshot(log.numberOfSequencedEdits);
		expect(editsProcessed).to.equal(0);
	});

	it('caches snapshots for local revisions', async () => {
		const logWithLocalEdits = getSimpleLogWithLocalEdits();
		let editsProcessed = 0;
		const viewer = getCachingLogViewer(logWithLocalEdits, simpleSnapshotNoTraits, () => editsProcessed++);
		assert(logWithLocalEdits.length < CachingLogViewer.sequencedCacheSizeMax);

		await requestAllSnapshots(viewer, logWithLocalEdits);
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
		await requestAllSnapshots(viewer, logWithLocalEdits);
		expect(editsProcessed).to.equal(1);

		editsProcessed = 0;
		while (logWithLocalEdits.numberOfLocalEdits > 0) {
			logWithLocalEdits.addSequencedEdit(
				logWithLocalEdits.getEditInSessionAtIndex(logWithLocalEdits.numberOfSequencedEdits)
			);
			await viewer.getSnapshot(logWithLocalEdits.numberOfSequencedEdits); // get the latest (just added) sequenced edit
			await viewer.getSnapshot(Number.POSITIVE_INFINITY); // get the last snapshot, which is a local revision
			expect(editsProcessed).to.equal(0);
		}
	});

	it('invalidates cached snapshots for local revisions when remote edits are received', () => {
		const logWithLocalEdits = getSimpleLogWithLocalEdits();
		let editsProcessed = 0;
		const viewer = getCachingLogViewer(logWithLocalEdits, simpleSnapshotNoTraits, () => editsProcessed++);

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
		const log = new EditLog<Change>();
		const editsProcessed: boolean[] = [];
		const viewer = getCachingLogViewer(log, simpleSnapshotNoTraits, (_, _2, wasCached) =>
			editsProcessed.push(wasCached)
		);
		const before = viewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
		const edit = newEdit([]);
		log.addLocalEdit(edit);
		viewer.setKnownEditingResult(edit, {
			status: EditStatus.Applied,
			changes: edit.changes,
			before,
			after: arbitrarySnapshot,
		});
		const after = viewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).deep.equal([true]);
		expect(after).equal(arbitrarySnapshot);
	});

	it('ignores known editing if for wrong before snapshot', () => {
		const log = new EditLog<Change>();
		const editsProcessed: boolean[] = [];
		const viewer = getCachingLogViewer(log, simpleSnapshotNoTraits, (_, _2, wasCached) =>
			editsProcessed.push(wasCached)
		);
		const edit = newEdit([]);
		log.addLocalEdit(edit);
		viewer.setKnownEditingResult(edit, {
			status: EditStatus.Applied,
			changes: edit.changes,
			before: arbitrarySnapshot,
			after: arbitrarySnapshot,
		});
		const after = viewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).deep.equal([false]);
		expect(after).not.equal(arbitrarySnapshot);
	});

	it('ignores known editing if for wrong edit', () => {
		const log = new EditLog<Change>();
		const editsProcessed: boolean[] = [];
		const viewer = getCachingLogViewer(log, simpleSnapshotNoTraits, (_, _2, wasCached) =>
			editsProcessed.push(wasCached)
		);
		const before = viewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
		const edit = newEdit([]);
		log.addLocalEdit(edit);
		viewer.setKnownEditingResult(newEdit([]), {
			status: EditStatus.Applied,
			changes: edit.changes,
			before,
			after: arbitrarySnapshot,
		});
		const after = viewer.getSnapshotInSession(Number.POSITIVE_INFINITY);
		expect(editsProcessed).deep.equal([false]);
		expect(after).not.equal(arbitrarySnapshot);
	});

	it('uses known editing result with multiple edits', () => {
		const log = new EditLog<Change>();
		const editsProcessed: boolean[] = [];
		const viewer = getCachingLogViewer(log, simpleSnapshotNoTraits, (_, _2, wasCached) =>
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
			status: EditStatus.Applied,
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
		function getViewer(): {
			log: EditLog<Change>;
			viewer: CachingLogViewer<Change>;
			events: ITelemetryBaseEvent[];
		} {
			const log = getSimpleLog();
			const events: ITelemetryBaseEvent[] = [];
			const viewer = new CachingLogViewer(
				log,
				simpleSnapshotNoTraits,
				[],
				/* expensiveValidation */ true,
				undefined,
				getMockLogger((event) => events.push(event)),
				Transaction.factory
			);
			return { log, viewer, events };
		}

		function addInvalidEdit(log: EditLog<Change>): Edit<Change> {
			// Add a local edit that will be invalid (inserts a node at a location that doesn't exist)
			const edit = newEdit(
				Insert.create(
					[makeEmptyNode()],
					StablePlace.atEndOf({
						parent: initialSnapshot.root,
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
