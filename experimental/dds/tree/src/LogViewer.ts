/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from '@fluidframework/common-definitions';
import Denque from 'denque';
import { assert, fail, noop } from './Common';
import { EditLog, SequencedOrderedEditId } from './EditLog';
import { Snapshot } from './Snapshot';
import { Edit, EditStatus, EditingResult, GenericTransaction } from './generic';
import { EditId } from './Identifiers';
import { RevisionValueCache } from './RevisionValueCache';
import { initialTree } from './InitialTree';
import { ReconciliationEdit, ReconciliationPath } from './ReconciliationPath';

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
export type EditStatusCallback = (editResult: EditStatus, editId: EditId, wasCached: boolean) => void;

/**
 * Result of applying an identified transaction.
 * @public
 */
export type EditingResultWithId<TChange> = EditingResult<TChange> & {
	/**
	 * Unique identifier for this edit. Must never be reused.
	 * Used for referencing and de-duplicating edits.
	 */
	readonly id: EditId;
};

/**
 * The data cached by `CachingLogViewer` for an edit.
 */
export type EditCacheEntry<TChange> =
	| SuccessfulEditCacheEntry<TChange>
	| UnsuccessfulEditCacheEntry
	| SummarizedEditResultCacheEntry;

/**
 * The data cached by `CachingLogViewer` for an edit that it has attempted to apply locally.
 */
export type AttemptedEditResultCacheEntry<TChange> = SuccessfulEditCacheEntry<TChange> | UnsuccessfulEditCacheEntry;

/**
 * The data cached by `CachingLogViewer` for an edit that it has successfully applied locally.
 */
export interface SuccessfulEditCacheEntry<TChange> {
	/**
	 * The snapshot resulting from the edit.
	 */
	snapshot: Snapshot;
	/**
	 * The status code for the edit that produced the snapshot.
	 */
	status: EditStatus.Applied;
	/**
	 * The resolved changes that were applied during the edit and their associated outcome.
	 */
	steps: readonly { resolvedChange: TChange; after: Snapshot }[];
}

/**
 * The data cached by `CachingLogViewer` for an edit that it has unsuccessfully attempted to apply locally.
 */
export interface UnsuccessfulEditCacheEntry {
	/**
	 * The snapshot resulting from the edit.
	 */
	readonly snapshot: Snapshot;
	/**
	 * The status code for the edit that produced the snapshot.
	 */
	status: EditStatus.Invalid | EditStatus.Malformed;
}

/**
 * The data cached by `CachingLogViewer` for an edit that it has retrieved from a summary.
 * TODO:#57176: once summarized edits carry enough information remove this interface and use `AttemptedEditResultCacheEntry` instead.
 */
export interface SummarizedEditResultCacheEntry {
	/**
	 * The snapshot resulting from the edit.
	 */
	snapshot: Snapshot;
	status?: undefined;
}

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
	private readonly localSnapshotCache = new Denque<AttemptedEditResultCacheEntry<TChange>>();

	/**
	 * Cache of sequenced snapshots.
	 */
	private readonly sequencedSnapshotCache: RevisionValueCache<EditCacheEntry<TChange>>;

	/**
	 * Called whenever an edit is processed.
	 * This will have been called at least once for any edit if a revision after than edit has been requested.
	 * It may be called multiple times: the number of calls and when they occur depends on caching and is an implementation detail.
	 */
	private readonly processEditStatus: EditStatusCallback;

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
	 * @param processEditStatus - called after applying an edit.
	 * @param logger - used to log telemetry
	 */
	public constructor(
		log: EditLog<TChange>,
		baseSnapshot: Snapshot = Snapshot.fromTree(initialTree),
		knownRevisions: [Revision, EditCacheEntry<TChange>][] = [],
		expensiveValidation = false,
		processEditStatus: EditStatusCallback = noop,
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

		this.sequencedSnapshotCache = new RevisionValueCache(
			CachingLogViewer.sequencedCacheSizeMax,
			minimumSequenceNumber,
			[...knownRevisions, [0, { snapshot: baseSnapshot }]]
		);
		this.processEditStatus = processEditStatus ?? noop;
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
				this.sequencedSnapshotCache.cacheValue(
					revision,
					entry.status === EditStatus.Applied
						? {
								snapshot,
								status: entry.status,
								steps: entry.steps,
						  }
						: {
								snapshot,
								status: entry.status,
						  }
				);
				this.handleSequencedEditResult(edit, entry);
			}
		} else {
			// Invalidate any cached results of applying edits which are ordered after `edit` (which are all remaining local edits)
			this.localSnapshotCache.clear();
		}
	}

	public async getEditResult(revision: Revision): Promise<EditCacheEntry<TChange>> {
		const startingPoint = this.getStartingPoint(revision);
		const { startRevision } = startingPoint;
		let current: EditCacheEntry<TChange> = startingPoint;
		for (let i = startRevision; i < revision && i < this.log.length; i++) {
			const edit = await this.log.getEditAtIndex(i);
			current = this.applyEdit(current.snapshot, edit, i);
		}
		return current;
	}

	public async getSnapshot(revision: Revision): Promise<Snapshot> {
		return (await this.getEditResult(revision)).snapshot;
	}

	public getEditResultInSession(revision: Revision): EditCacheEntry<TChange> {
		const startingPoint = this.getStartingPoint(revision);
		const { startRevision } = startingPoint;
		let current: EditCacheEntry<TChange> = startingPoint;
		for (let i = startRevision; i < revision && i < this.log.length; i++) {
			const edit = this.log.getEditInSessionAtIndex(i);
			current = this.applyEdit(current.snapshot, edit, i);
		}
		return current;
	}

	public getSnapshotInSession(revision: Revision): Snapshot {
		return this.getEditResultInSession(revision).snapshot;
	}

	/**
	 * Informs the CachingLogViewer of the latest known minimumSequenceNumber for all connected clients.
	 * This can be used to provide more aggressive caching of revisions within the collaboration window, as those revisions
	 * are more likely to be demanded to resolve conflicts.
	 * @param minSequenceNumber - the minimum known sequence number of all connected clients.
	 */
	public setMinimumSequenceNumber(minimumSequenceNumber: number): void {
		// Sequence numbers in Fluid are 1-indexed, meaning they correspond to revisions, and can be used as revisions.
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
	private getStartingPoint(revision: Revision): { startRevision: Revision } & EditCacheEntry<TChange> {
		// Per the documentation for revision, the returned snapshot should be the output of the edit at the largest index <= `revision`.
		const revisionClamped = Math.min(revision, this.log.length);
		let current: EditCacheEntry<TChange>;
		let startRevision: Revision;
		const { numberOfSequencedEdits } = this.log;
		const isLocalRevision = revisionClamped > numberOfSequencedEdits;
		if (isLocalRevision && !this.localSnapshotCache.isEmpty()) {
			const { length } = this.localSnapshotCache;
			// Local snapshot cache is indexed such that the snapshot for revision 0 (a local edit) is stored at index 0 in the cache.
			// This is because the local cache does not contain an entry for the implicit initial tree edit.
			const localCacheIndex = revisionClamped - 1 - numberOfSequencedEdits;
			if (localCacheIndex < length) {
				const cached =
					this.localSnapshotCache.peekAt(localCacheIndex) ?? fail('missing tail of localSnapshotCache');
				return {
					...cached,
					startRevision: revisionClamped,
				};
			} else {
				current = this.localSnapshotCache.peekAt(length - 1) ?? fail('missing tail of localSnapshotCache');
				startRevision = numberOfSequencedEdits + length;
			}
		} else {
			const [cachedRevision, cachedSnapshot] =
				this.sequencedSnapshotCache.getClosestEntry(revisionClamped) ?? fail('No preceding snapshot cached.');
			startRevision = cachedRevision;
			current = cachedSnapshot;
		}
		return { startRevision, ...current };
	}

	/**
	 * Helper for applying an edit at the supplied snapshot.
	 * Must only be called in the order that edits appear in the log.
	 * Must only be called once for a given local edit as long as the local cache has not been invalidated.
	 * Must only be called once for a given sequenced edit.
	 * @returns the resulting snapshot and the outcome of edit that produced it.
	 */
	private applyEdit(
		prevSnapshot: Snapshot,
		edit: Edit<TChange>,
		editIndex: number
	): AttemptedEditResultCacheEntry<TChange> {
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
			editingResult = this.transactionFactory(prevSnapshot)
				.applyChanges(edit.changes, this.reconciliationPathFromEdit(edit.id))
				.close();
			cached = false;
		}

		const revision = editIndex + 1;
		let nextSnapshot: Snapshot;
		if (editingResult.status === EditStatus.Applied) {
			nextSnapshot = editingResult.after;
		} else {
			nextSnapshot = prevSnapshot;
		}

		const computedCacheEntry =
			editingResult.status === EditStatus.Applied
				? { snapshot: nextSnapshot, status: editingResult.status, steps: editingResult.steps }
				: { snapshot: nextSnapshot, status: editingResult.status };

		if (this.log.isSequencedRevision(revision)) {
			this.sequencedSnapshotCache.cacheValue(revision, computedCacheEntry);
			this.handleSequencedEditResult(edit, computedCacheEntry);
		} else {
			// This relies on local edits being append only, and that generating the snapshot for a local revision requires generating
			// the snapshot for all local revisions before it in the log. Thus, generating such a snapshot will necessarily require
			// calls to this method for all local revisions prior, guaranteeing the correct push order.
			assert(
				revision === this.log.numberOfSequencedEdits + this.localSnapshotCache.length + 1,
				'Local snapshot cached out of order.'
			);
			this.localSnapshotCache.push(computedCacheEntry);
		}

		this.processEditStatus(editingResult.status, this.log.getIdAtIndex(editIndex), cached);
		return computedCacheEntry;
	}

	/**
	 * Helper for performing caching and telemetry logging when a sequenced local edit is first applied.
	 * Must only be called for non-cached sequenced edits.
	 */
	private handleSequencedEditResult(edit: Edit<TChange>, result: AttemptedEditResultCacheEntry<TChange>): void {
		// This is the first time this sequenced edit has been processed by this LogViewer. If it was a local edit, log telemetry
		// in the event that it was invalid or malformed.
		if (this.unappliedSelfEdits.length > 0) {
			if (edit.id === this.unappliedSelfEdits.peekFront()) {
				if (result.status !== EditStatus.Applied) {
					this.logger.send({
						category: 'generic',
						eventName:
							result.status === EditStatus.Malformed
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

	/**
	 * We currently compute only the "main branch" part of the reconciliation path (meaning we don't include inverts of the edits
	 * that occurred on the rebased branch). Doing so is only needed for the sequential anchor resolution approach which is not
	 * yet supported.
	 * @param editId - The ID for the edit to get the reconciliation path for.
	 */
	public reconciliationPathFromEdit(editId: EditId): ReconciliationPath<TChange> {
		const reconciliationPath: ReconciliationEdit<TChange>[] = [];
		let cached = false;
		return new Proxy(reconciliationPath, {
			get: (target, prop): unknown => {
				if (!cached) {
					cached = true;
					const orderedId = this.log.getOrderedEditId(editId);
					if (orderedId.isLocal === false && orderedId.sequenceInfo !== undefined) {
						const earliestSequenced = this.earliestSequencedEditInSession();
						if (earliestSequenced !== undefined) {
							const earliestEditSequenceNumber = earliestSequenced.sequenceNumber;
							const targetSequenceNumber = Math.max(
								earliestEditSequenceNumber,
								orderedId.sequenceInfo.referenceSequenceNumber
							);
							if (targetSequenceNumber < orderedId.sequenceInfo.sequenceNumber) {
								const firstEdit = this.getEditResultFromSequenceNumber(targetSequenceNumber);
								if (firstEdit !== undefined) {
									if (firstEdit.status === EditStatus.Applied) {
										reconciliationPath.push({
											...firstEdit.steps,
											before: firstEdit.before,
											after: firstEdit.after,
											length: firstEdit.steps.length,
										});
									}
									const lowestIndex = this.log.getIndexOfId(firstEdit.id) + 1;
									const highestIndex = this.log.getIndexOfId(editId) - 1;
									for (let index = lowestIndex; index <= highestIndex; ++index) {
										const edit = this.getEditResultFromIndex(index);
										if (edit.status === EditStatus.Applied) {
											reconciliationPath.push({
												...edit.steps,
												before: edit.before,
												after: edit.after,
												length: edit.steps.length,
											});
										}
									}
								}
							}
						}
					}
				}
				return target[prop];
			},
		});
	}

	/**
	 * @returns Edit information for the earliest known sequenced edit.
	 */
	public earliestSequencedEditInSession(): { edit: Edit<TChange>; sequenceNumber: number } | undefined {
		const earliestEditIndex = this.log.earliestAvailableEditIndex;
		const lastSequencedEdit = this.log.numberOfSequencedEdits + earliestEditIndex - 1;
		for (let index = earliestEditIndex; index <= lastSequencedEdit; ++index) {
			const edit = this.log.getEditInSessionAtIndex(index);
			const editOrderedId = this.log.getOrderedEditId(edit.id) as SequencedOrderedEditId;
			if (editOrderedId.sequenceInfo !== undefined) {
				return { edit, sequenceNumber: editOrderedId.sequenceInfo.sequenceNumber };
			}
		}
		return undefined;
	}

	/**
	 * @returns Edit result information for the edit at the given `index`.
	 */
	private getEditResultFromIndex(index: number): EditingResultWithId<TChange> {
		const edit = this.log.getEditInSessionAtIndex(index);
		const before = this.getSnapshotInSession(index);
		const resultAfter = this.getEditResultInSession(index + 1);
		if (resultAfter.status === undefined) {
			fail('The status of every edit in session should be known');
		}
		return resultAfter.status === EditStatus.Applied
			? {
					id: edit.id,
					status: EditStatus.Applied,
					before,
					changes: edit.changes,
					after: resultAfter.snapshot,
					steps: resultAfter.steps,
			  }
			: {
					id: edit.id,
					status: resultAfter.status,
					before,
					changes: edit.changes,
			  };
	}

	/**
	 * @param sequenceNumber - The server-assigned sequenced number assigned to the edit of interest.
	 * @returns Edit result information for the edit with the given sequence number. Undefined if no such edit is known.
	 */
	public getEditResultFromSequenceNumber(sequenceNumber: number): EditingResultWithId<TChange> | undefined {
		const earliestSequenced = this.earliestSequencedEditInSession();
		if (earliestSequenced !== undefined && sequenceNumber >= earliestSequenced.sequenceNumber) {
			const lowestIndex = this.log.getIndexOfId(earliestSequenced.edit.id);
			const highestIndex = this.log.numberOfSequencedEdits - 1;
			for (let index = highestIndex; index >= lowestIndex; --index) {
				const edit = this.log.getEditInSessionAtIndex(index);
				const orderedId = this.log.getOrderedEditId(edit.id) as SequencedOrderedEditId;
				// If `orderedId.sequenceInfo.sequenceNumber` is equal to the requested `sequenceNumber` then we have found the edit of
				// interest and simply return its associated information.
				// Note that the check bellow also is also satisfied if `orderedId.sequenceInfo.sequenceNumber`is lower than the requested
				// `sequenceNumber`. This can happen when the edit for the requested `sequenceNumber` has either not yet been received or
				// has been processed by a different DDS (several DDSes can share the same stream of operations and will only see those
				// relevant to them). In such cases, we return the edit info for the last known edit before that.
				if (orderedId.sequenceInfo && orderedId.sequenceInfo.sequenceNumber <= sequenceNumber) {
					const before = this.getSnapshotInSession(index);
					const resultAfter = this.getEditResultInSession(index + 1);
					if (resultAfter.status === undefined) {
						fail('The status of every edit in session should be known');
					}
					return resultAfter.status === EditStatus.Applied
						? {
								id: edit.id,
								status: EditStatus.Applied,
								before,
								changes: edit.changes,
								after: resultAfter.snapshot,
								steps: resultAfter.steps,
						  }
						: {
								id: edit.id,
								status: resultAfter.status,
								before,
								changes: edit.changes,
						  };
				}
			}
		}
		return undefined;
	}
}
