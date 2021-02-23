/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import BTree from 'sorted-btree';
import { ITelemetryBaseLogger } from '@fluidframework/common-definitions';
import { assert, fail, noop } from './Common';
import { EditLog } from './EditLog';
import { Snapshot } from './Snapshot';
import { Edit, EditResult } from './PersistedTypes';
import { EditId } from './Identifiers';
import { EditingResult, Transaction } from './Transaction';
import { initialTree } from './InitialTree';

/**
 * Callback for when an edit is applied.
 * Note that edits may be applied multiple times (and with different results due to concurrent edits),
 * and might not be applied when added.
 * This callback cannot be used to simply log each edit as it comes it to see its status.
 */
export type EditResultCallback = (editResult: EditResult, editId: EditId) => void;

/**
 * Creates `Snapshot`s for the revisions in an `EditLog`
 * @internal
 */
export interface LogViewer {
	/**
	 * Returns the snapshot at a revision.
	 *
	 * Revision numbers correspond to indexes in `editLog`.
	 * Revision X means the revision output by the largest index in `editLog` less than (but not equal to) X.
	 *
	 * For example:
	 *  - revision 0 means the initialSnapshot.
	 *  - revision 1 means the output of editLog.getAtIndex(0) (or initialSnapshot if there is no edit 0).
	 *  - revision Number.POSITIVE_INFINITY means the newest revision.
	 */
	getSnapshot(revision: number): Promise<Snapshot>;

	/**
	 * Returns the snapshot at a revision. Can only be used to retrieve revisions added during the current sessions.
	 *
	 * Revision numbers correspond to indexes in `editLog`.
	 * Revision X means the revision output by the largest index in `editLog` less than (but not equal to) X.
	 *
	 * For example:
	 *  - revision 0 means the initialSnapshot.
	 *  - revision 1 means the output of editLog.getAtIndex(0) (or initialSnapshot if there is no edit 0).
	 *  - revision Number.POSITIVE_INFINITY means the newest revision.
	 */
	getSnapshotInSession(revision: number): Snapshot;

	/**
	 * Specify that a particular revision is known to have the specified snapshot.
	 * The LogViewer may optionally use this to optimize future getSnapshot requests.
	 *
	 * It is invalid to call this with a snapshot that is not equal to one
	 * that would be produced by getSnapshot at the same revision.
	 */
	setKnownRevision(revision: number, view: Snapshot): void;
}

/**
 * Creates Snapshots for revisions associated with an EditLog and caches the results.
 * @internal
 */
export class CachingLogViewer implements LogViewer {
	public readonly log: EditLog;

	/**
	 * A cache of previously generated revision snapshots.
	 * Only contains revision snapshots for sequenced revisions.
	 * See `getSnapshot` for details.
	 */
	private readonly sequencedSnapshotCache = new BTree<number, Snapshot>();

	/**
	 * A cached Snapshot for Head (the newest revision) of `log`. It is undefined when not computed or invalidated by a change in the log.
	 * This cache is important as the Head revision is frequently viewed, and just using the sequencedSnapshotCache
	 * would not cache processing of local edits in this case.
	 */
	private lastHeadSnapshot?: Snapshot;

	/**
	 * Called whenever an edit is processed.
	 * This will have been called at least once for any edit if a revision after than edit has been requested.
	 * It may be called multiple times: the number of calls and when they occur depends on caching and is an implementation detail.
	 */
	private readonly processEditResult: EditResultCallback;

	/**
	 * Iff true, the snapshots passed to setKnownRevision will be asserted to be correct.
	 */
	private readonly expensiveValidation: boolean;

	/**
	 * Telemetry logger, used to log events such as edit application rejection.
	 */
	private readonly logger: ITelemetryBaseLogger;

	/**
	 * The ordered list of edits that originated from this client that have never been applied (by this log viewer) in a sequenced state.
	 * This means these edits may be local or sequenced, and may have been applied (possibly multiple times) while still local.
	 * Used to log telemetry about the result of edit application. Edits are removed when first applied after being sequenced.
	 */
	private readonly unappliedSelfEdits: EditId[] = [];

	/**
	 * Create a new LogViewer
	 * @param log - the edit log which snapshots will be based on.
	 * @param baseTree - the tree used in the snapshot corresponding to the 0th revision. Defaults to `initialTree`.
	 * @param expensiveValidation - Iff true, the snapshots passed to setKnownRevision will be asserted to be correct.
	 */
	public constructor(
		log: EditLog,
		baseTree = initialTree,
		expensiveValidation = false,
		processEditResult: EditResultCallback = noop,
		logger: ITelemetryBaseLogger
	) {
		this.log = log;
		const initialSnapshot = Snapshot.fromTree(baseTree);
		this.sequencedSnapshotCache.set(0, initialSnapshot);
		this.processEditResult = processEditResult ?? noop;
		this.expensiveValidation = expensiveValidation;
		this.logger = logger;
		this.log.registerEditAddedHandler(this.handleEditAdded.bind(this));
	}

	private handleEditAdded(edit: Edit, isLocal: boolean): void {
		this.lastHeadSnapshot = undefined; // Invalidate HEAD snapshot cache.
		if (isLocal) {
			this.unappliedSelfEdits.push(edit.id);
		}
	}

	public async getSnapshot(revision: number): Promise<Snapshot> {
		// Per the documentation for this method, the returned snapshot should be the output of the edit at the largest index <= `revision`.
		if (revision >= this.log.length && this.lastHeadSnapshot) {
			return this.lastHeadSnapshot;
		}

		const [startRevision, startSnapshot] =
			this.sequencedSnapshotCache.nextLowerPair(revision + 1) ?? fail('No preceding snapshot cached.');

		let currentSnapshot = startSnapshot;
		for (let i = startRevision; i < revision && i < this.log.length; i++) {
			const edit = await this.log.getEditAtIndex(i);
			const editingResult = new Transaction(currentSnapshot).applyChanges(edit.changes).close();
			if (editingResult.result === EditResult.Applied) {
				currentSnapshot = editingResult.after;
			}

			// Revision is the result of the edit being applied.
			this.cacheRevision(i + 1, currentSnapshot, edit, editingResult);
			this.processEditResult(editingResult.result, this.log.getIdAtIndex(i));
		}

		if (revision >= this.log.length) {
			this.lastHeadSnapshot = currentSnapshot;
		}

		return currentSnapshot;
	}

	public getSnapshotInSession(revision: number): Snapshot {
		// Per the documentation for this method, the returned snapshot should be the output of the edit at the largest index <= `revision`.
		if (revision >= this.log.length && this.lastHeadSnapshot) {
			return this.lastHeadSnapshot;
		}

		const [startRevision, startSnapshot] =
			this.sequencedSnapshotCache.nextLowerPair(revision + 1) ?? fail('No preceding snapshot cached.');

		let currentSnapshot = startSnapshot;
		for (let i = startRevision; i < revision && i < this.log.length; i++) {
			const edit = this.log.getEditInSessionAtIndex(i);
			const editingResult = new Transaction(currentSnapshot).applyChanges(edit.changes).close();
			if (editingResult.result === EditResult.Applied) {
				currentSnapshot = editingResult.after;
			}

			// Revision is the result of the edit being applied.
			this.cacheRevision(i + 1, currentSnapshot, edit, editingResult);
			this.processEditResult(editingResult.result, this.log.getIdAtIndex(i));
		}

		if (revision >= this.log.length) {
			this.lastHeadSnapshot = currentSnapshot;
		}

		return currentSnapshot;
	}

	public async setKnownRevision(revision: number, snapshot: Snapshot): Promise<void> {
		if (this.expensiveValidation) {
			assert(Number.isInteger(revision), 'revision must be an integer');
			assert(
				revision <= this.log.numberOfSequencedEdits + 1,
				'revision must correspond to the result of a SequencedEdit'
			);
			const computed = await this.getSnapshot(revision);
			assert(computed.equals(snapshot), 'setKnownRevision passed invalid snapshot');
		}
		this.sequencedSnapshotCache.set(revision, snapshot);
	}

	/**
	 * Version of setKnownRevision that does not support expensive validation.
	 */
	public setKnownRevisionSynchronous(revision: number, snapshot: Snapshot): void {
		this.sequencedSnapshotCache.set(revision, snapshot);
	}

	private cacheRevision(revision: number, snapshot: Snapshot, edit: Edit, editingResult: EditingResult): void {
		// Only cache the snapshot if the edit has a final revision number assigned by Fluid.
		// This avoids having to invalidate cache entries when concurrent edits cause local revision
		// numbers to change when acknowledged.
		if (revision <= this.log.numberOfSequencedEdits) {
			this.sequencedSnapshotCache.set(revision, snapshot);

			// This is the first time this sequenced edit has been processed by this LogViewer. If it was a local edit, log telemetry
			// in the event that it was invalid or malformed.
			if (this.unappliedSelfEdits.length > 0) {
				if (edit.id === this.unappliedSelfEdits[0]) {
					if (editingResult.result !== EditResult.Applied) {
						this.logger.send({
							category: 'generic',
							eventName:
								editingResult.result === EditResult.Malformed
									? 'MalformedSharedTreeEdit'
									: 'InvalidSharedTreeEdit',
						});
					}
					this.unappliedSelfEdits.shift();
				} else if (this.expensiveValidation) {
					assert(this.unappliedSelfEdits.indexOf(edit.id) < 0, 'Local edits processed out of order.');
				}
			}
		}
	}
}
