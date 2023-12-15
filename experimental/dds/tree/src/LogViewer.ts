/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Denque from 'denque';
import { TypedEventEmitter } from '@fluid-internal/client-utils';
import { IEvent } from '@fluidframework/core-interfaces';
import { assert } from '@fluidframework/core-utils';
import { fail, noop } from './Common';
import { EditLog, SequencedOrderedEditId } from './EditLog';
import { EditId } from './Identifiers';
import { Revision, RevisionValueCache } from './RevisionValueCache';
import { ReconciliationChange, ReconciliationEdit, ReconciliationPath } from './ReconciliationPath';
import { ChangeInternal, Edit, EditStatus } from './persisted-types';
import { RevisionView } from './RevisionView';
import { EditingResult, TransactionInternal } from './TransactionInternal';

/**
 * Callback for when an edit is applied (meaning the result of applying it to a particular revision is computed).
 *
 * Edits may be applied any time a TreeView is computed that includes them.
 * Depending on the caching policy of the LogViewer, a given edit may or may not be applied in order to compute a TreeView containing it.
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
 * Callback for when a sequenced edit is applied.
 * This includes local edits though the callback is only invoked once the sequenced version is received.
 *
 * For edits that were local (see {@link SequencedEditResult.wasLocal}, this callback will only be called once.
 * For non-local edits, it may be called multiple times: the number of calls and when they occur depends on caching and is an implementation
 * detail.
 */
export type SequencedEditResultCallback = (args: SequencedEditResult) => void;

/**
 * The relevant information pertaining to the application of a sequenced edit.
 */
export interface SequencedEditResult {
	/**
	 * The edit that was applied.
	 */
	edit: Edit<ChangeInternal>;
	/**
	 * true iff the edit was local.
	 */
	wasLocal: boolean;
	/**
	 * The result of applying the edit.
	 */
	result: AttemptedEditResultCacheEntry;
	/**
	 * The reconciliation path for the edit.
	 */
	reconciliationPath: ReconciliationPath;
}

/**
 * The data cached by `CachingLogViewer` for an edit.
 */
export type EditCacheEntry = SuccessfulEditCacheEntry | UnsuccessfulEditCacheEntry | SummarizedEditResultCacheEntry;

/**
 * The data cached by `CachingLogViewer` for an edit that it has attempted to apply locally.
 */
export type AttemptedEditResultCacheEntry = SuccessfulEditCacheEntry | UnsuccessfulEditCacheEntry;

/**
 * The data cached by `CachingLogViewer` for an edit that it has successfully applied locally.
 */
export interface SuccessfulEditCacheEntry {
	/**
	 * The revision view resulting from the edit.
	 */
	readonly view: RevisionView;
	/**
	 * The status code for the edit that produced the revision.
	 */
	readonly status: EditStatus.Applied;
	/**
	 * The resolved changes that were applied during the edit and their associated outcome.
	 */
	readonly steps: readonly ReconciliationChange[];
}

/**
 * The data cached by `CachingLogViewer` for an edit that it has unsuccessfully attempted to apply locally.
 */
export interface UnsuccessfulEditCacheEntry {
	/**
	 * The revision view resulting from the edit.
	 */
	readonly view: RevisionView;
	/**
	 * The status code for the edit that produced the revision.
	 */
	readonly status: EditStatus.Invalid | EditStatus.Malformed;
	/**
	 * Information about the failure encountered by the edit
	 */
	readonly failure: TransactionInternal.Failure;
}

/**
 * The data cached by `CachingLogViewer` for an edit that it has retrieved from a summary.
 * TODO:#57176: once summarized edits carry enough information remove this interface and use `AttemptedEditResultCacheEntry` instead.
 */
export interface SummarizedEditResultCacheEntry {
	/**
	 * The revision view resulting from the edit.
	 */
	readonly view: RevisionView;
	/**
	 * Not specified on `SummarizedEditResultCacheEntry`.
	 * Declared to allow checking `entry.status` against undefined.
	 */
	readonly status?: never;
}

export type CachedEditingResult = AttemptedEditResultCacheEntry & {
	/**
	 * Unique identifier for this edit. Must never be reused.
	 * Used for referencing and de-duplicating edits.
	 */
	readonly id: EditId;
	readonly before: RevisionView;
	readonly changes: readonly ChangeInternal[];
};

/**
 * Creates `RevisionView`s for the revisions in an `EditLog`
 * @alpha
 */
export interface LogViewer {
	/**
	 * Returns the `TreeView` output associated with the largest revision in `editLog` less than (but not equal to) the supplied revision.
	 *
	 * For example:
	 *
	 * - revision 0 returns the initialRevision.
	 *
	 * - revision 1 returns the output of editLog[0] (or initialRevision if there is no edit 0).
	 *
	 * - revision Number.POSITIVE_INFINITY returns the newest revision.
	 *
	 * @deprecated Edit virtualization is no longer supported, use {@link LogViewer.getRevisionViewInMemory}
	 */
	getRevisionView(revision: Revision): Promise<RevisionView>;

	/**
	 * Returns the `TreeView` output associated with the largest revision in `editLog` less than (but not equal to) the supplied revision.
	 * Can only be used to retrieve revisions added during the current sessions.
	 *
	 * For example:
	 *
	 * - revision 0 returns the initialRevision.
	 *
	 * - revision 1 returns the output of editLog[0] (or initialRevision if there is no edit 0).
	 *
	 * - revision Number.POSITIVE_INFINITY returns the newest revision.
	 *
	 * @deprecated Edit virtualization is no longer supported so the 'inSession' APIs will be removed, use {@link LogViewer.getRevisionViewInMemory}
	 */
	getRevisionViewInSession(revision: Revision): RevisionView;

	/**
	 * Returns the `TreeView` output associated with the largest revision in `editLog` less than (but not equal to) the supplied revision.
	 * Can only be used to retrieve revisions added during the current session that have not been evicted from `editLog`.
	 *
	 * For example:
	 *
	 * - revision 0 returns the oldest edit in the log (which might be initialRevision).
	 *
	 * - revision 1 returns the output of editLog[0] (or initialRevision if there is no edit 0).
	 *
	 * - revision Number.POSITIVE_INFINITY returns the newest revision.
	 */
	getRevisionViewInMemory(revision: Revision): RevisionView;
}

/**
 * Events reported by {@link CachingLogViewer} for diagnostics or testing purposes.
 */
export enum CachingLogViewerDiagnosticEvents {
	RevisionRetained = 'revisionRetained',
}

/**
 * Events which may be emitted by {@link CachingLogViewer}
 * @public
 */
export interface ICachingLogViewerEvents extends IEvent {
	(event: CachingLogViewerDiagnosticEvents.RevisionRetained, listener: (revision: Revision) => void);
}

/**
 * Creates views for revisions associated with an EditLog and caches the results.
 *
 * Does so by listening for edits added to the log. If the underlying EditLog or its listeners need to be reused beyond the lifetime of
 * a CachingLogViewer instance, that instance should be disposed with `detachFromEditLog` to ensure it is garbage-collectable.
 * @alpha
 */
export class CachingLogViewer extends TypedEventEmitter<ICachingLogViewerEvents> implements LogViewer {
	public readonly log: EditLog<ChangeInternal>;

	/**
	 * Maximum size of the sequenced revision cache.
	 */
	public static readonly sequencedCacheSizeMax = 50;

	/**
	 * A cache for local revisions.
	 * It is invalidated whenever a new sequenced edit (that was not already a local edit) is added to the log.
	 * When a previously local edit is sequenced, this cache is adjusted to account for it, not invalidated.
	 */
	private readonly localRevisionCache = new Denque<AttemptedEditResultCacheEntry>();

	/**
	 * Cache of sequenced revisions.
	 */
	private readonly sequencedRevisionCache: RevisionValueCache<EditCacheEntry>;

	/**
	 * Called whenever a sequenced edit is applied.
	 * This will have been called at least once for any edit if a revision after than edit has been requested.
	 * It may be called multiple times: the number of calls and when they occur depends on caching and is an implementation detail.
	 */
	private readonly processSequencedEditResult: SequencedEditResultCallback;

	/**
	 * Called whenever an edit is processed.
	 * This will have been called at least once for any edit if a revision after than edit has been requested.
	 * It may be called multiple times: the number of calls and when they occur depends on caching and is an implementation detail.
	 */
	private readonly processEditStatus: EditStatusCallback;

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
	private cachedEditResult?: { editId: EditId; result: EditingResult };

	/**
	 * Cache entry for the highest revision.
	 * `undefined` when not cached.
	 */
	private highestRevisionCacheEntry?: EditCacheEntry;

	/**
	 * Removes this log viewer from the set of handleEditAdded listeners on its underlying log.
	 * This should be called if the underlying log or its listeners are re-used past the lifetime of this log viewer.
	 */
	public readonly detachFromEditLog: () => void;

	/**
	 * @returns true if the highest revision is cached.
	 */
	public highestRevisionCached(): boolean {
		return this.highestRevisionCacheEntry !== undefined;
	}

	/**
	 * Create a new LogViewer
	 * @param log - the edit log which revisions will be based on.
	 * @param baseTree - the tree used in the view corresponding to the 0th revision.
	 * @param initialRevision - a [sequencedRevision, view] pair that is known (been precomputed) at construction time.
	 * This revision is guaranteed to never be evicted from the cache unless it is replaced as the oldest in memory revision.
	 * @param expensiveValidation - Iff true, additional correctness assertions will be run during LogViewer operations.
	 * @param processEditStatus - called after applying an edit.
	 * @param processSequencedEditResult - called after applying a sequenced edit.
	 */
	public constructor(
		log: EditLog<ChangeInternal>,
		baseView: RevisionView,
		initialRevision?: [Revision, EditCacheEntry],
		processEditStatus: EditStatusCallback = noop,
		processSequencedEditResult: SequencedEditResultCallback = noop,
		minimumSequenceNumber = 0
	) {
		super();
		this.log = log;
		if (initialRevision !== undefined) {
			assert(Number.isInteger(initialRevision[0]), 0x628 /* revision must be an integer */);
			assert(
				this.log.isSequencedRevision(initialRevision[0]),
				0x629 /* revision must correspond to the result of a SequencedEdit */
			);
		}

		this.sequencedRevisionCache = new RevisionValueCache(
			CachingLogViewer.sequencedCacheSizeMax,
			minimumSequenceNumber,
			initialRevision ?? [0, { view: baseView }]
		);
		this.processEditStatus = processEditStatus ?? noop;
		this.processSequencedEditResult = processSequencedEditResult ?? noop;
		this.detachFromEditLog = this.log.registerEditAddedHandler(this.handleEditAdded.bind(this));

		// Registers a handler that is called when edits are evicted
		this.log.registerEditEvictionHandler(this.evictCachedRevisions.bind(this));
	}

	/**
	 * As a performance optimization, this method caches views generated by local edits if they are sequenced without
	 * being interleaved with remote edits.
	 */
	private handleEditAdded(edit: Edit<ChangeInternal>, isLocal: boolean, wasLocal: boolean): void {
		// Clear highestRevisionCacheEntry, since what revision is highest might change.
		// Note that as an optimization we could skip clearing this when a local edit is sequenced.
		this.highestRevisionCacheEntry = undefined;

		if (isLocal) {
			this.unappliedSelfEdits.push(edit.id);
		} else if (wasLocal) {
			// If the new sequenced edit was generated by this client, the corresponding cache entry (if there is one)
			// will be at the front of the queue. If the queue is empty, then a concurrent sequenced edit from remote client
			// must have invalidated the queue cache.
			const entry = this.localRevisionCache.shift();
			if (entry !== undefined) {
				const revision = this.log.numberOfSequencedEdits;
				const { view } = entry;
				this.sequencedRevisionCache.cacheValue(
					revision,
					entry.status === EditStatus.Applied
						? {
								view,
								status: entry.status,
								steps: entry.steps,
						  }
						: {
								view,
								status: entry.status,
								failure: entry.failure,
						  }
				);
				this.handleSequencedEditResult(edit, entry, []);
			}
		} else {
			// Invalidate any cached results of applying edits which are ordered after `edit` (which are all remaining local edits)
			this.localRevisionCache.clear();
		}
	}

	/**
	 * {@inheritDoc LogViewer.getRevisionViewInMemory}
	 */
	public getRevisionViewInMemory(revision: number): RevisionView {
		return this.getEditResultInMemory(revision).view;
	}

	/**
	 * @returns the {@link EditCacheEntry} for the requested revision
	 */
	public getEditResultInMemory(revision: Revision): EditCacheEntry {
		assert(revision >= this.log.earliestAvailableEditIndex, 0x62a /* revision not stored in memory */);
		const startingPoint = this.getStartingPoint(revision);
		const { startRevision } = startingPoint;
		let current: EditCacheEntry = startingPoint;
		for (let i = startRevision; i < revision && i < this.log.length; i++) {
			const edit = this.log.tryGetEditAtIndex(i) ?? fail('edit not found');
			current = this.applyEdit(current.view, edit, i);
		}
		return current;
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
		this.sequencedRevisionCache.updateRetentionWindow(minimumSequenceNumber);
	}

	/**
	 * Inform the CachingLogViewer that a particular edit is known to have a specific result when applied to a particular TreeView.
	 * CachingLogViewer may use this information as an optimization to avoid re-running the edit if re-applied to the same TreeView.
	 */
	public setKnownEditingResult(edit: Edit<ChangeInternal>, result: EditingResult): void {
		this.cachedEditResult = { editId: edit.id, result };
	}

	/**
	 * Handler that is called before the stored edit log evicts any edits.
	 * This caches the revision that corresponds to the edit that will be the oldest in memory after eviction
	 * to ensure that there is always a base revision that any in memory edit can be applied to.
	 */
	private evictCachedRevisions(editsToEvict: number): void {
		const revisionToRetain = this.log.earliestAvailableEditIndex + editsToEvict;
		const cacheEntry: EditCacheEntry = this.getEditResultInMemory(revisionToRetain);
		this.sequencedRevisionCache.cacheRetainedValue(revisionToRetain, cacheEntry);
		this.emit(CachingLogViewerDiagnosticEvents.RevisionRetained, revisionToRetain);
	}

	/**
	 * @returns the cached revision view closest to the requested `revision`.
	 */
	private getStartingPoint(revision: Revision): { startRevision: Revision } & EditCacheEntry {
		// Per the documentation for revision, the returned view should be the output of the edit at the largest index <= `revision`.
		const revisionClamped = Math.min(revision, this.log.length);

		// If the highest revision is requested, and it's cached, use highestRevisionCacheEntry.
		if (revisionClamped === this.log.length && this.highestRevisionCacheEntry !== undefined) {
			return { ...this.highestRevisionCacheEntry, startRevision: revisionClamped };
		}

		let current: EditCacheEntry;
		let startRevision: Revision;
		const { numberOfSequencedEdits } = this.log;
		const isLocalRevision = revisionClamped > numberOfSequencedEdits;
		if (isLocalRevision && !this.localRevisionCache.isEmpty()) {
			const { length } = this.localRevisionCache;
			// Local revision view cache is indexed such that the view for revision 0 (a local edit) is stored at index 0 in the cache.
			// This is because the local cache does not contain an entry for the implicit initial tree edit.
			const localCacheIndex = revisionClamped - 1 - numberOfSequencedEdits;
			if (localCacheIndex < length) {
				const cached =
					this.localRevisionCache.peekAt(localCacheIndex) ?? fail('missing tail of localRevisionViewCache');
				return {
					...cached,
					startRevision: revisionClamped,
				};
			} else {
				current = this.localRevisionCache.peekAt(length - 1) ?? fail('missing tail of localRevisionViewCache');
				startRevision = numberOfSequencedEdits + length;
			}
		} else {
			const [cachedRevision, cachedView] =
				this.sequencedRevisionCache.getClosestEntry(revisionClamped) ??
				fail('No preceding revision view cached.');

			startRevision = cachedRevision;
			current = cachedView;
		}
		return { startRevision, ...current };
	}

	/**
	 * Helper for applying an edit at the supplied revision view.
	 * Must only be called in the order that edits appear in the log.
	 * Must only be called once for a given local edit as long as the local cache has not been invalidated.
	 * Must only be called once for a given sequenced edit.
	 * @returns the resulting revision view and the outcome of edit that produced it.
	 */
	private applyEdit(
		prevView: RevisionView,
		edit: Edit<ChangeInternal>,
		editIndex: number
	): AttemptedEditResultCacheEntry {
		let editingResult: EditingResult;
		let cached;
		let reconciliationPath: ReconciliationPath = [];
		if (
			this.cachedEditResult !== undefined &&
			this.cachedEditResult.editId === edit.id &&
			this.cachedEditResult.result.before === prevView
		) {
			editingResult = this.cachedEditResult.result;
			cached = true;
		} else {
			reconciliationPath = this.reconciliationPathFromEdit(edit.id);
			editingResult = TransactionInternal.factory(prevView)
				.applyChanges(edit.changes, reconciliationPath)
				.close();
			cached = false;
		}

		const revision = editIndex + 1;
		const nextView: RevisionView = editingResult.status === EditStatus.Applied ? editingResult.after : prevView;

		const computedCacheEntry =
			editingResult.status === EditStatus.Applied
				? { view: nextView, status: editingResult.status, steps: editingResult.steps }
				: { view: nextView, status: editingResult.status, failure: editingResult.failure };

		if (this.log.isSequencedRevision(revision)) {
			this.sequencedRevisionCache.cacheValue(revision, computedCacheEntry);
			this.handleSequencedEditResult(edit, computedCacheEntry, reconciliationPath);
		} else {
			// This relies on local edits being append only, and that generating the view for a local revision requires generating
			// the views for all local revisions before it in the log. Thus, generating such a view will necessarily require
			// calls to this method for all local revisions prior, guaranteeing the correct push order.
			assert(
				revision === this.log.numberOfSequencedEdits + this.localRevisionCache.length + 1,
				0x62b /* Local revision view cached out of order. */
			);
			this.localRevisionCache.push(computedCacheEntry);
		}

		// Only update highestRevisionCacheEntry if this snapshot is the highest revision.
		if (revision >= this.log.length) {
			this.highestRevisionCacheEntry = computedCacheEntry;
		}

		this.processEditStatus(editingResult.status, this.log.getIdAtIndex(editIndex), cached);
		return computedCacheEntry;
	}

	/**
	 * Helper for performing caching when a sequenced local edit is first applied.
	 * Invokes the `processSequencedEditResult` handler that was passed to the constructor (if any).
	 * Must only be called for non-cached sequenced edits.
	 */
	private handleSequencedEditResult(
		edit: Edit<ChangeInternal>,
		result: AttemptedEditResultCacheEntry,
		reconciliationPath: ReconciliationPath
	): void {
		let wasLocal = false;
		// This is the first time this sequenced edit has been processed by this LogViewer. If it was a local edit, log telemetry
		// in the event that it was invalid or malformed.
		if (this.unappliedSelfEdits.length > 0) {
			if (edit.id === this.unappliedSelfEdits.peekFront()) {
				wasLocal = true;
				this.unappliedSelfEdits.shift();
			}
		}
		this.processSequencedEditResult({ edit, wasLocal, result, reconciliationPath });
	}

	/**
	 * We currently compute only the "main branch" part of the reconciliation path (meaning we don't include inverts of the edits
	 * that occurred on the rebased branch). Doing so is only needed for the sequential anchor resolution approach which is not
	 * yet supported.
	 * @param editId - The ID for the edit to get the reconciliation path for.
	 */
	public reconciliationPathFromEdit(editId: EditId): ReconciliationPath {
		const reconciliationPath: ReconciliationEdit[] = [];
		let cached = false;
		return new Proxy(reconciliationPath, {
			get: (target, prop): unknown => {
				if (!cached) {
					cached = true;
					const orderedId = this.log.getOrderedEditId(editId);
					if (orderedId.isLocal === false && orderedId.sequenceInfo !== undefined) {
						const earliestSequenced = this.earliestSequencedEditInMemory();
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
										const firstEditInfo = this.log.getOrderedEditId(
											firstEdit.id
										) as SequencedOrderedEditId;
										if (
											firstEditInfo.sequenceInfo !== undefined &&
											firstEditInfo.sequenceInfo.sequenceNumber >
												orderedId.sequenceInfo.referenceSequenceNumber
										) {
											reconciliationPath.push({
												...firstEdit.steps,
												before: firstEdit.before,
												after: firstEdit.view,
												length: firstEdit.steps.length,
											});
										}
									}
									const lowestIndex = this.log.getIndexOfId(firstEdit.id) + 1;
									const highestIndex = this.log.getIndexOfId(editId) - 1;
									for (let index = lowestIndex; index <= highestIndex; ++index) {
										const edit = this.getEditResultFromIndex(index);
										if (edit.status === EditStatus.Applied) {
											reconciliationPath.push({
												...edit.steps,
												before: edit.before,
												after: edit.view,
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
	public earliestSequencedEditInMemory(): { edit: Edit<ChangeInternal>; sequenceNumber: number } | undefined {
		const earliestEditIndex = this.log.earliestAvailableEditIndex;
		const lastSequencedEdit = this.log.numberOfSequencedEdits + earliestEditIndex - 1;
		for (let index = earliestEditIndex; index <= lastSequencedEdit; ++index) {
			const edit = this.log.tryGetEditAtIndex(index);
			if (edit !== undefined) {
				const editOrderedId = this.log.getOrderedEditId(edit.id) as SequencedOrderedEditId;
				if (editOrderedId.sequenceInfo !== undefined) {
					return { edit, sequenceNumber: editOrderedId.sequenceInfo.sequenceNumber };
				}
			}
		}
		return undefined;
	}

	/**
	 * @returns Edit result information for the edit at the given `index`.
	 */
	private getEditResultFromIndex(index: number): CachedEditingResult {
		const edit = this.log.tryGetEditAtIndex(index) ?? fail('edit does not exist in memory');
		const before = this.getRevisionViewInMemory(index);
		const resultAfter = this.getEditResultInMemory(index + 1);
		if (resultAfter.status === undefined) {
			fail('The status of every edit in memory should be known');
		}
		return resultAfter.status === EditStatus.Applied
			? {
					id: edit.id,
					status: EditStatus.Applied,
					before,
					changes: edit.changes,
					view: resultAfter.view,
					steps: resultAfter.steps,
			  }
			: {
					id: edit.id,
					status: resultAfter.status,
					failure: resultAfter.failure,
					before,
					view: resultAfter.view,
					changes: edit.changes,
			  };
	}

	/**
	 * @param sequenceNumber - The server-assigned sequenced number assigned to the edit of interest.
	 * @returns Edit result information for the edit with the given sequence number or the nearest sequenced edit before that.
	 * Undefined if no sequenced edit occurred at or prior to the given sequenceNumber.
	 */
	public getEditResultFromSequenceNumber(sequenceNumber: number): CachedEditingResult | undefined {
		const earliestSequenced = this.earliestSequencedEditInMemory();
		if (earliestSequenced !== undefined && sequenceNumber >= earliestSequenced.sequenceNumber) {
			const lowestIndex = this.log.getIndexOfId(earliestSequenced.edit.id);
			const highestIndex = this.log.numberOfSequencedEdits - 1;
			for (let index = highestIndex; index >= lowestIndex; --index) {
				const edit = this.log.tryGetEditAtIndex(index);
				if (edit !== undefined) {
					const orderedId = this.log.getOrderedEditId(edit.id) as SequencedOrderedEditId;
					// If `orderedId.sequenceInfo.sequenceNumber` is equal to the requested `sequenceNumber` then we have found the edit of
					// interest and simply return its associated information.
					// Note that the check bellow also is also satisfied if `orderedId.sequenceInfo.sequenceNumber`is lower than the requested
					// `sequenceNumber`. This can happen when the edit for the requested `sequenceNumber` has either not yet been received or
					// has been processed by a different DDS (several DDSes can share the same stream of operations and will only see those
					// relevant to them). In such cases, we return the edit info for the last known edit before that.
					if (orderedId.sequenceInfo && orderedId.sequenceInfo.sequenceNumber <= sequenceNumber) {
						const before = this.getRevisionViewInMemory(index);
						const resultAfter = this.getEditResultInMemory(index + 1);
						if (resultAfter.status === undefined) {
							fail('The status of every edit in session should be known');
						}
						return resultAfter.status === EditStatus.Applied
							? {
									id: edit.id,
									status: EditStatus.Applied,
									before,
									changes: edit.changes,
									view: resultAfter.view,
									steps: resultAfter.steps,
							  }
							: {
									id: edit.id,
									status: resultAfter.status,
									failure: resultAfter.failure,
									before,
									view: resultAfter.view,
									changes: edit.changes,
							  };
					}
				}
			}
		}
		return undefined;
	}

	// DEPRECATED APIS

	/**
	 * @deprecated Edit virtualization is no longer supported, do not use the asynchronous APIs.
	 */
	public async getEditResult(revision: Revision): Promise<EditCacheEntry> {
		return this.getEditResultInMemory(revision);
	}

	/**
	 * @deprecated Edit virtualization is no longer supported, use {@link LogViewer.getRevisionViewInMemory}
	 */
	public async getRevisionView(revision: Revision): Promise<RevisionView> {
		return this.getEditResultInMemory(revision).view;
	}

	/**
	 * @deprecated Edit virtualization is no longer supported, do not use the 'InSession' APIs.
	 */
	public getEditResultInSession(revision: Revision): EditCacheEntry {
		return this.getEditResultInMemory(revision);
	}

	/**
	 * @deprecated Edit virtualization is no longer supported, use {@link LogViewer.getRevisionViewInMemory}
	 */
	public getRevisionViewInSession(revision: Revision): RevisionView {
		return this.getEditResultInMemory(revision).view;
	}
}
