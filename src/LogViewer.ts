/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import BTree from '@taylorsw04/sorted-btree';
import { ITelemetryBaseLogger } from '@fluidframework/common-definitions';
import Denque from 'denque';
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
	 * A cache for local snapshots.
	 * It is invalidated whenever a new sequenced edit (that was not already a local edit) is added to the log.
	 * When a previously local edit is sequenced, this cache is adjusted to account for it, not invalidated.
	 */
	private readonly localSnapshotCache: Denque<{ snapshot: Snapshot; result: EditingResult }> = new Denque();

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
	 * The ordered queue of edits that originated from this client that have never been applied (by this log viewer) in a sequenced state.
	 * This means these edits may be local or sequenced, and may have been applied (possibly multiple times) while still local.
	 * Used to log telemetry about the result of edit application. Edits are removed when first applied after being sequenced.
	 */
	private readonly unappliedSelfEdits: Denque<EditId> = new Denque();

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

	private handleEditAdded(edit: Edit, isLocal: boolean, wasLocal: boolean): void {
		if (isLocal) {
			this.unappliedSelfEdits.push(edit.id);
		} else if (wasLocal) {
			// If the new sequenced edit was generated by this client, the corresponding cache entry (if there is one)
			// will be at the front of the queue. If the queue is empty, then a concurrent sequenced edit from remote client
			// must have invalidated the queue cache.
			const entry = this.localSnapshotCache.shift();
			if (entry !== undefined) {
				this.handleSequencedEditResult(this.log.numberOfSequencedEdits, entry.snapshot, edit, entry.result);
			}
		} else {
			// Invalidate any cached results of applying edits which are ordered after `edit` (which are all remaining local edits)
			this.localSnapshotCache.clear();
		}
	}

	public async getSnapshot(revision: number): Promise<Snapshot> {
		const startingPoint = this.getStartingPoint(revision);
		const { startRevision } = startingPoint;
		let { currentSnapshot } = startingPoint;
		for (let i = startRevision; i < revision && i < this.log.length; i++) {
			const edit = await this.log.getEditAtIndex(i);
			currentSnapshot = this.applyEdit(currentSnapshot, edit, i);
		}

		return currentSnapshot;
	}

	public getSnapshotInSession(revision: number): Snapshot {
		const startingPoint = this.getStartingPoint(revision);
		const { startRevision } = startingPoint;
		let { currentSnapshot } = startingPoint;
		for (let i = startRevision; i < revision && i < this.log.length; i++) {
			const edit = this.log.getEditInSessionAtIndex(i);
			currentSnapshot = this.applyEdit(currentSnapshot, edit, i);
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

	/**
	 * @returns the cached snapshot closest to the requested `revision`.
	 */
	private getStartingPoint(revision: number): { startRevision: number; currentSnapshot: Snapshot } {
		// Per the documentation for revision, the returned snapshot should be the output of the edit at the largest index <= `revision`.
		const revisionClamped = Math.min(revision, this.log.length);
		let currentSnapshot: Snapshot;
		let startRevision: number;
		const { numberOfSequencedEdits } = this.log;
		const isLocalRevision = revisionClamped > numberOfSequencedEdits;
		if (isLocalRevision && !this.localSnapshotCache.isEmpty()) {
			const { length } = this.localSnapshotCache;
			// Local snapshot cache is indexed such that the snapshot for revision 0 (a local edit) is stored at index 0 in the cache.
			// This is because the local cache does not contain an entry for the implicit initial tree edit.
			const localCacheIndex = revisionClamped - 1 - numberOfSequencedEdits;
			if (localCacheIndex < length) {
				return {
					startRevision: revisionClamped,
					currentSnapshot: (
						this.localSnapshotCache.peekAt(localCacheIndex) ?? fail('missing tail of localSnapshotCache')
					).snapshot,
				};
			} else {
				startRevision = numberOfSequencedEdits + length;
				currentSnapshot = (
					this.localSnapshotCache.peekAt(length - 1) ?? fail('missing tail of localSnapshotCache')
				).snapshot;
			}
		} else {
			const [cachedRevision, cachedSnapshot] =
				this.sequencedSnapshotCache.nextLowerPair(revisionClamped + 1) ?? fail('No preceding snapshot cached.');
			startRevision = cachedRevision;
			currentSnapshot = cachedSnapshot;
		}
		return { startRevision, currentSnapshot };
	}

	/**
	 * Helper for applying an edit at the supplied snapshot.
	 * Must only be called in the order that edits appear in the log.
	 * Must only be called once for a given local edit as long as the local cache has not been invalidated.
	 * Must only be called once for a given sequenced edit.
	 * @returns the resulting snapshot
	 */
	private applyEdit(prevSnapshot: Snapshot, edit: Edit, editIndex: number): Snapshot {
		const editingResult = new Transaction(prevSnapshot).applyChanges(edit.changes).close();
		const revision = editIndex + 1;
		let nextSnapshot: Snapshot;
		if (editingResult.result === EditResult.Applied) {
			nextSnapshot = editingResult.after;
		} else {
			nextSnapshot = prevSnapshot;
		}

		// If the edit has a final revision number assigned by Fluid, cache it in the b-tree cache.
		// This cache benefits from avoiding any need to invalidate cache entries.
		if (revision <= this.log.numberOfSequencedEdits) {
			this.handleSequencedEditResult(revision, nextSnapshot, edit, editingResult);
		} else {
			// This relies on local edits being append only, and that generating the snapshot for a local revision requires generating
			// the snapshot for all local revisions before it in the log. Thus, generating such a snapshot will necessarily require
			// calls to this method for all local revisions prior, guaranteeing the correct push order.
			assert(
				revision === this.log.numberOfSequencedEdits + this.localSnapshotCache.length + 1,
				'Local snapshot cached out of order.'
			);
			this.localSnapshotCache.push({ snapshot: nextSnapshot, result: editingResult });
		}

		this.processEditResult(editingResult.result, this.log.getIdAtIndex(editIndex));
		return nextSnapshot;
	}

	/**
	 * Helper for performing caching and telemetry logging when a sequenced edit is first applied.
	 * Must only be called once for each sequenced edit.
	 */
	private handleSequencedEditResult(revision: number, snapshot: Snapshot, edit: Edit, result: EditingResult): void {
		if (this.expensiveValidation) {
			assert(!this.sequencedSnapshotCache.has(revision), 'Resulting snapshot has already been cached.');
		}
		this.sequencedSnapshotCache.set(revision, snapshot);
		// This is the first time this sequenced edit has been processed by this LogViewer. If it was a local edit, log telemetry
		// in the event that it was invalid or malformed.
		if (this.unappliedSelfEdits.length > 0) {
			if (edit.id === this.unappliedSelfEdits.peekFront()) {
				if (result.result !== EditResult.Applied) {
					this.logger.send({
						category: 'generic',
						eventName:
							result.result === EditResult.Malformed
								? 'MalformedSharedTreeEdit'
								: 'InvalidSharedTreeEdit',
					});
				}
				this.unappliedSelfEdits.shift();
			} else if (this.expensiveValidation) {
				for (let i = 0; i < this.unappliedSelfEdits.length; i++) {
					assert(this.unappliedSelfEdits.peekAt(i) !== edit.id, 'Local edits processed out of order.');
				}
			}
		}
	}
}
