/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from '@fluidframework/common-definitions';
import Denque from 'denque';
import { assert, fail, noop } from './Common';
import { EditLog } from './EditLog';
import { Snapshot } from './Snapshot';
import { ChangeNode, Edit, EditResult, EditingResult, GenericTransaction } from './generic';
import { EditId } from './Identifiers';
import { initialTree } from './InitialTree';
import { RevisionValueCache } from './RevisionValueCache';

/**
 * Callback for when an edit is applied (meaning the result of applying it to a particular snapshot is computed).
 *
 * Edits may be applied any time a Snapshot is computed that includes them.
 * Depending on the caching policy of the LogViewer, a given edit may or may not be applied in order to compute a Snapshot containing it.
 *
 * If the same edit occurs in different contexts (ex: a local edit is adjusted for a new remote edit),
 * that it will be reapplied, and this may result in different results.
 *
 * Edits may additionally be reapplied at other times since their previous output might not be cached.
 *
 * If an application requests the current view, this will force all edits to be applied.
 * Such an application can use this callback can be log each edit as it comes it to see its status,
 * however this may include duplicates, as well as entries for reapplications in modified contexts.
 *
 * In the context of this callback,
 * skipping the first evaluation of an edit in a particular context due to setKnownEditingResult is still considered applying.
 * To use this call back to track when the actual computational work of applying edits is done, only count cases when `wasCached` is false.
 */
export type EditResultCallback = (editResult: EditResult, editId: EditId, wasCached: boolean) => void;

/**
 * A revision corresponds to an index in an `EditLog`.
 *
 * It is associated with the output `Snapshot` of applying the edit at the index to the previous revision.
 * For example:
 *  - revision 0 corresponds to the initialSnapshot.
 *  - revision 1 corresponds to the output of editLog[0] applied to the initialSnapshot.
 */
export type Revision = number;

/**
 * Creates `Snapshot`s for the revisions in an `EditLog`
 */
export interface LogViewer {
	/**
	 * Returns the `Snapshot` output associated with the largest revision in `editLog` less than (but not equal to) the supplied revision.
	 *
	 * For example:
	 *  - revision 0 returns the initialSnapshot.
	 *  - revision 1 returns the output of editLog[0] (or initialSnapshot if there is no edit 0).
	 *  - revision Number.POSITIVE_INFINITY returns the newest revision.
	 */
	getSnapshot(revision: Revision): Promise<Snapshot>;

	/**
	 * Returns the `Snapshot` output associated with the largest revision in `editLog` less than (but not equal to) the supplied revision.
	 * Can only be used to retrieve revisions added during the current sessions.
	 *
	 * For example:
	 *  - revision 0 returns the initialSnapshot.
	 *  - revision 1 returns the output of editLog[0] (or initialSnapshot if there is no edit 0).
	 *  - revision Number.POSITIVE_INFINITY returns the newest revision.
	 */
	getSnapshotInSession(revision: Revision): Snapshot;
}

/**
 * Creates Snapshots for revisions associated with an EditLog and caches the results.
 * @internal
 */
export class CachingLogViewer<TChange> implements LogViewer {
	public readonly log: EditLog<TChange>;

	/**
	 * Maximum size of the sequenced snapshot cache.
	 */
	public static readonly sequencedCacheSizeMax = 50;

	/**
	 * A cache for local snapshots.
	 * It is invalidated whenever a new sequenced edit (that was not already a local edit) is added to the log.
	 * When a previously local edit is sequenced, this cache is adjusted to account for it, not invalidated.
	 */
	private readonly localSnapshotCache = new Denque<{ snapshot: Snapshot; result: EditingResult<TChange> }>();

	/**
	 * Cache of sequenced snapshots.
	 */
	private readonly sequencedSnapshotCache: RevisionValueCache<Snapshot>;

	/**
	 * Called whenever an edit is processed.
	 * This will have been called at least once for any edit if a revision after than edit has been requested.
	 * It may be called multiple times: the number of calls and when they occur depends on caching and is an implementation detail.
	 */
	private readonly processEditResult: EditResultCallback;

	/**
	 * Iff true, additional correctness assertions will be run during LogViewer operations.
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
	private readonly unappliedSelfEdits = new Denque<EditId>();

	/**
	 * Cache of applying a edit.
	 * Due to use of Transactions in checkouts, a common pattern involves applying an edit
	 * as part of the transaction, then submitting it.
	 * This cache helps optimize that case by avoiding recomputing the edit if no other edits were added during the transaction.
	 */
	private cachedEditResult?: { editId: EditId; result: EditingResult<TChange> };

	private readonly transactionFactory: (snapshot: Snapshot) => GenericTransaction<TChange>;

	/**
	 * Create a new LogViewer
	 * @param log - the edit log which snapshots will be based on.
	 * @param baseTree - the tree used in the snapshot corresponding to the 0th revision. Defaults to `initialTree`.
	 * @param knownRevisions - a set of [sequencedRevision, snapshot] pairs that are known (have been precomputed) at construction time.
	 * These revisions are guaranteed to never be evicted from the cache.
	 * @param expensiveValidation - Iff true, additional correctness assertions will be run during LogViewer operations.
	 * @param processEditResult - called after applying an edit.
	 * @param logger - used to log telemetry
	 */
	public constructor(
		log: EditLog<TChange>,
		baseTree: ChangeNode = initialTree,
		knownRevisions: [Revision, Snapshot][] = [],
		expensiveValidation = false,
		processEditResult: EditResultCallback = noop,
		logger: ITelemetryBaseLogger,
		transactionFactory: (snapshot: Snapshot) => GenericTransaction<TChange>,
		minimumSequenceNumber = 0
	) {
		this.log = log;
		if (expensiveValidation) {
			knownRevisions.forEach(([revision]) => {
				assert(Number.isInteger(revision), 'revision must be an integer');
				assert(
					this.log.isSequencedRevision(revision),
					'revision must correspond to the result of a SequencedEdit'
				);
			});
		}
		const initialSnapshot = Snapshot.fromTree(baseTree, expensiveValidation);
		this.sequencedSnapshotCache = new RevisionValueCache(
			CachingLogViewer.sequencedCacheSizeMax,
			minimumSequenceNumber,
			[...knownRevisions, [0, initialSnapshot]]
		);
		this.processEditResult = processEditResult ?? noop;
		this.expensiveValidation = expensiveValidation;
		this.logger = logger;
		this.transactionFactory = transactionFactory;
		this.log.registerEditAddedHandler(this.handleEditAdded.bind(this));
	}

	/**
	 * Performs the tracking needed to log telemetry about failed (invalid/malformed) local edits when they are sequenced.
	 * As a performance optimization, this method also caches snapshots generated by local edits if they are sequenced without
	 * being interleaved with remote edits.
	 */
	private handleEditAdded(edit: Edit<TChange>, isLocal: boolean, wasLocal: boolean): void {
		if (isLocal) {
			this.unappliedSelfEdits.push(edit.id);
		} else if (wasLocal) {
			// If the new sequenced edit was generated by this client, the corresponding cache entry (if there is one)
			// will be at the front of the queue. If the queue is empty, then a concurrent sequenced edit from remote client
			// must have invalidated the queue cache.
			const entry = this.localSnapshotCache.shift();
			if (entry !== undefined) {
				const revision = this.log.numberOfSequencedEdits;
				const snapshot = entry.snapshot;
				this.sequencedSnapshotCache.cacheValue(revision, snapshot);
				this.handleSequencedEditResult(edit, entry.result);
			}
		} else {
			// Invalidate any cached results of applying edits which are ordered after `edit` (which are all remaining local edits)
			this.localSnapshotCache.clear();
		}
	}

	public async getSnapshot(revision: Revision): Promise<Snapshot> {
		const startingPoint = this.getStartingPoint(revision);
		const { startRevision } = startingPoint;
		let { currentSnapshot } = startingPoint;
		for (let i = startRevision; i < revision && i < this.log.length; i++) {
			const edit = await this.log.getEditAtIndex(i);
			currentSnapshot = this.applyEdit(currentSnapshot, edit, i);
		}
		return currentSnapshot;
	}

	public getSnapshotInSession(revision: Revision): Snapshot {
		const startingPoint = this.getStartingPoint(revision);
		const { startRevision } = startingPoint;
		let { currentSnapshot } = startingPoint;
		for (let i = startRevision; i < revision && i < this.log.length; i++) {
			const edit = this.log.getEditInSessionAtIndex(i);
			currentSnapshot = this.applyEdit(currentSnapshot, edit, i);
		}
		return currentSnapshot;
	}

	/**
	 * Informs the CachingLogViewer of the latest known minimumSequenceNumber for all connected clients.
	 * This can be used to provide more aggressive caching of revisions within the collaboration window, as those revisions
	 * are more likely to be demanded to resolve conflicts.
	 * @param minSequenceNumber - the minimum known sequence number of all connected clients.
	 */
	public setMinimumSequenceNumber(minimumSequenceNumber: number): void {
		// Sequence numbers in fluid are 1-indexed, meaning they correspond to revisions, and can be used as revisions.
		// This ensures that all revisions >= minimumSequenceNumber are kept in the cache, meaning that even if all clients are caught up
		// the most recent sequenced revision will be cached.
		this.sequencedSnapshotCache.updateRetentionWindow(minimumSequenceNumber);
	}

	/**
	 * Inform the CachingLogViewer that a particular edit is know to have a specific result when applied to a particular Snapshot.
	 * LogViewer may use this information to as a optimization to avoid re-running the edit if re-applied to the same Snapshot.
	 */
	public setKnownEditingResult(edit: Edit<TChange>, result: EditingResult<TChange>): void {
		this.cachedEditResult = { editId: edit.id, result };
	}

	/**
	 * @returns the cached snapshot closest to the requested `revision`.
	 */
	private getStartingPoint(revision: Revision): { startRevision: Revision; currentSnapshot: Snapshot } {
		// Per the documentation for revision, the returned snapshot should be the output of the edit at the largest index <= `revision`.
		const revisionClamped = Math.min(revision, this.log.length);
		let currentSnapshot: Snapshot;
		let startRevision: Revision;
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
				this.sequencedSnapshotCache.getClosestEntry(revision) ?? fail('No preceding snapshot cached.');
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
	private applyEdit(prevSnapshot: Snapshot, edit: Edit<TChange>, editIndex: number): Snapshot {
		let editingResult: EditingResult<TChange>;
		let cached;
		if (
			this.cachedEditResult !== undefined &&
			this.cachedEditResult.editId === edit.id &&
			this.cachedEditResult.result.before === prevSnapshot
		) {
			editingResult = this.cachedEditResult.result;
			cached = true;
		} else {
			editingResult = this.transactionFactory(prevSnapshot).applyChanges(edit.changes).close();
			cached = false;
		}

		const revision = editIndex + 1;
		let nextSnapshot: Snapshot;
		if (editingResult.result === EditResult.Applied) {
			nextSnapshot = editingResult.after;
		} else {
			nextSnapshot = prevSnapshot;
		}

		if (this.log.isSequencedRevision(revision)) {
			this.sequencedSnapshotCache.cacheValue(revision, nextSnapshot);
			this.handleSequencedEditResult(edit, editingResult);
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

		this.processEditResult(editingResult.result, this.log.getIdAtIndex(editIndex), cached);
		return nextSnapshot;
	}

	/**
	 * Helper for performing caching and telemetry logging when a sequenced local edit is first applied.
	 * Must only be called for non-cached sequenced edits.
	 */
	private handleSequencedEditResult(edit: Edit<TChange>, result: EditingResult<TChange>): void {
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
