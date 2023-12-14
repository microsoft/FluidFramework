/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from '@fluidframework/core-utils';
import { EventEmitterWithErrorHandling, ITelemetryLoggerExt, createChildLogger } from '@fluidframework/telemetry-utils';
import { IDisposable, IErrorEvent, ITelemetryProperties } from '@fluidframework/core-interfaces';
import { assertWithMessage, fail, RestOrArray, unwrapRestOrArray } from './Common';
import { EditId } from './Identifiers';
import { CachingLogViewer } from './LogViewer';
import { TreeView } from './TreeView';
import { RevisionView } from './RevisionView';
import { EditCommittedHandler, SharedTree } from './SharedTree';
import { EditingResult, GenericTransaction, TransactionInternal, ValidEditingResult } from './TransactionInternal';
import { ChangeInternal, Edit, EditStatus } from './persisted-types';
import { SharedTreeEvent } from './EventTypes';
import { newEditId } from './EditUtilities';
import { Change } from './ChangeTypes';

/**
 * An event emitted by a `Checkout` to indicate a state change. See {@link ICheckoutEvents} for event argument information.
 * @alpha
 */
export enum CheckoutEvent {
	/**
	 * `currentView` has changed.
	 * Passed a before and after TreeView.
	 */
	ViewChange = 'viewChange',
}

/**
 * Events which may be emitted by `Checkout`. See {@link CheckoutEvent} for documentation of event semantics.
 * @alpha
 */
export interface ICheckoutEvents extends IErrorEvent {
	(event: 'viewChange', listener: (before: TreeView, after: TreeView) => void);
}

/**
 * The result of validation of an Edit.
 * @alpha
 */
export enum EditValidationResult {
	/**
	 * The edit contained one or more malformed changes (e.g. was missing required fields such as `id`),
	 * or contained a sequence of changes that could not possibly be applied sequentially without error
	 * (e.g. an edit which tries to insert the same detached node twice).
	 */
	Malformed,
	/**
	 * The edit is well-formed but cannot be applied to the current view, generally because concurrent changes
	 * caused one or more merge conflicts.
	 * For example, the edit refers to the `StablePlace` after node `C`, but `C` has since been deleted.
	 */
	Invalid,
	/**
	 * The edit is well-formed and can be applied to the current view.
	 */
	Valid,
}

/**
 * A mutable Checkout of a SharedTree, allowing viewing and interactive transactional editing.
 * Provides {@link https://en.wikipedia.org/wiki/Snapshot_isolation | snapshot-isolation} while editing.
 *
 * A Checkout always shows a consistent sequence of versions of the SharedTree, but it may skip intermediate versions, and may fall behind.
 * In this case consistent means the sequence of versions could occur with fully synchronous shared tree access,
 * though the timing of sequenced edits arriving to the Checkout may be later than they actually arrive in the SharedTree.
 * Specifically no sequenced edits will arrive during an ongoing edit (to implement snapshot isolation):
 * they will be applied asynchronously some time after the ongoing edit is ended.
 *
 * Events emitted by `Checkout` are documented in {@link CheckoutEvent}.
 * Exceptions thrown during event handling will be emitted as error events, which are automatically surfaced as error events on the
 * `SharedTree` used at construction time.
 * @alpha
 */
export abstract class Checkout extends EventEmitterWithErrorHandling<ICheckoutEvents> implements IDisposable {
	/**
	 * The view of the latest committed revision.
	 * Does not include changes from any open edits.
	 *
	 * When this changes, emitChange must be called.
	 */
	protected abstract get latestCommittedView(): RevisionView;

	/**
	 * The last view for which invalidation was sent.
	 * Updated by emitChange.
	 */
	private previousView: TreeView;

	/**
	 * A handler for 'committedEdit' SharedTreeEvent
	 */
	private readonly editCommittedHandler: EditCommittedHandler;

	/**
	 * The shared tree this checkout views/edits.
	 */
	public readonly tree: SharedTree;

	/**
	 * `tree`'s log viewer as a CachingLogViewer if it is one, otherwise undefined.
	 * Used for optimizations if provided.
	 */
	private readonly cachingLogViewer?: CachingLogViewer;

	/**
	 * Holds the state required to manage the currently open edit.
	 * Undefined if there is currently not an open edit.
	 *
	 * Since `currentView` exposes the the intermediate state from this edit,
	 * operations that modify `currentEdit.view` must call `emitChange` to handle invalidation.
	 */
	private currentEdit?: GenericTransaction;

	private readonly logger: ITelemetryLoggerExt;

	public disposed: boolean = false;

	protected constructor(tree: SharedTree, currentView: RevisionView, onEditCommitted: EditCommittedHandler) {
		super((_event, error: unknown) => {
			this.tree.emit('error', error);
		});
		this.tree = tree;
		this.logger = createChildLogger({ logger: this.tree.logger, namespace: 'Checkout' });
		if (tree.logViewer instanceof CachingLogViewer) {
			this.cachingLogViewer = tree.logViewer;
		}
		this.previousView = currentView;
		this.editCommittedHandler = onEditCommitted;

		// If there is an ongoing edit, emitChange will no-op, which is fine.
		this.tree.on(SharedTreeEvent.EditCommitted, this.editCommittedHandler);
	}

	/**
	 * @returns the current view of the tree, including the result of changes applied so far during an edit.
	 * Note that any external edits (from other clients) will not added to view while there is a `currentEdit`.
	 */
	public get currentView(): TreeView {
		return this.currentEdit?.view ?? this.latestCommittedView;
	}

	/**
	 * @returns true iff there is an open edit.
	 */
	public hasOpenEdit(): boolean {
		return this.currentEdit !== undefined;
	}

	/**
	 * Opens a new edit operation.
	 * Changes accumulate in the edit via calls to `applyChanges()`.
	 */
	public openEdit(): void {
		assert(this.currentEdit === undefined, 0x600 /* An edit is already open. */);
		this.currentEdit = TransactionInternal.factory(this.latestCommittedView);
	}

	/**
	 * Ends the ongoing edit operation and commits it to the history.
	 *
	 * Malformed edits are considered an error, and will assert:
	 * All named detached sequences must have been used or the Edit is malformed.
	 *
	 * @returns the `id` of the committed edit
	 */
	public closeEdit(): EditId {
		const { currentEdit } = this;
		assert(currentEdit !== undefined, 0x601 /* An edit is not open. */);
		this.currentEdit = undefined;
		assert(
			currentEdit.failure === undefined,
			0x66d /* Cannot close a transaction that has already failed. Use abortEdit instead. */
		);

		const editingResult = currentEdit.close();
		this.validateChangesApplied(editingResult);
		const id: EditId = newEditId();
		this.handleNewEdit(id, editingResult);
		return id;
	}

	private validateChangesApplied(result: EditingResult): asserts result is ValidEditingResult;
	private validateChangesApplied(result: {
		status: EditStatus;
		failure: TransactionInternal.Failure | undefined;
	}): asserts result is { status: EditStatus.Applied; failure: undefined };
	private validateChangesApplied(
		result: EditingResult | { status: EditStatus; failure: TransactionInternal.Failure | undefined }
	) {
		if (result.status === EditStatus.Applied) {
			return;
		}

		const { failure } = result as { failure: TransactionInternal.Failure };
		const additionalProps: ITelemetryProperties = {};
		switch (failure.kind) {
			case TransactionInternal.FailureKind.BadPlace:
				additionalProps.placeFailure = failure.placeFailure;
				break;
			case TransactionInternal.FailureKind.BadRange: {
				const { rangeFailure } = failure;
				if (typeof rangeFailure === 'string') {
					additionalProps.rangeFailure = rangeFailure;
				} else {
					additionalProps.rangeFailure = rangeFailure.kind;
					additionalProps.rangeEndpointFailure = rangeFailure.placeFailure;
				}
				break;
			}
			default:
				break;
		}

		this.logger.sendErrorEvent({
			eventName: 'FailedLocalEdit',
			status: result.status === 0 ? 'Malformed' : 'Invalid',
			failureKind: failure.kind,
			...additionalProps,
		});
		fail('Locally constructed edits must be well-formed and valid.');
	}

	/**
	 * Inform the Checkout that a particular edit is know to have a specific result when applied to a particular TreeView.
	 * This may be used as a caching hint to avoid recomputation.
	 */
	protected hintKnownEditingResult(edit: Edit<ChangeInternal>, result: ValidEditingResult): void {
		// As an optimization, inform logViewer of this editing result so it can reuse it if applied to the same before revision.
		this.cachingLogViewer?.setKnownEditingResult(edit, result);
	}

	/**
	 * Take any needed action between when an edit is completed.
	 * Usually this will include submitting it to a SharedTree.
	 *
	 * Override this to customize.
	 */
	protected handleNewEdit(id: EditId, result: ValidEditingResult): void {
		const edit: Edit<ChangeInternal> = { id, changes: result.changes };

		this.hintKnownEditingResult(edit, result);

		// Since external edits could have been applied while currentEdit was pending,
		// do not use the produced view: just go to the newest revision
		// (which processLocalEdit will do, including invalidation).
		this.tree.applyEditInternal(edit);
	}

	/**
	 * Applies the supplied changes to the tree and emits a change event.
	 * Must be called during an ongoing edit (see `openEdit()`/`closeEdit()`).
	 * `changes` must be well-formed and valid: it is an error if they do not apply cleanly.
	 */
	public applyChanges(changes: readonly Change[]): void;
	public applyChanges(...changes: readonly Change[]): void;
	public applyChanges(...changes: RestOrArray<Change>): void {
		assert(this.currentEdit !== undefined, 0x602 /* Changes must be applied as part of an ongoing edit. */);
		const changeArray = unwrapRestOrArray(changes);
		const { status } = this.currentEdit.applyChanges(changeArray.map((c) => this.tree.internalizeChange(c)));
		this.validateChangesApplied({ status, failure: this.currentEdit.failure });
		this.emitChange();
	}

	/**
	 * Applies the supplied changes to the tree and emits a change event.
	 * Must be called during an ongoing edit (see `openEdit()`/`closeEdit()`).
	 * `changes` must be well-formed and valid: it is an error if they do not apply cleanly.
	 */
	protected tryApplyChangesInternal(changes: readonly ChangeInternal[]): EditStatus;
	protected tryApplyChangesInternal(...changes: readonly ChangeInternal[]): EditStatus;
	protected tryApplyChangesInternal(...changes: RestOrArray<ChangeInternal>): EditStatus {
		assert(this.currentEdit !== undefined, 0x603 /* Changes must be applied as part of an ongoing edit. */);
		const changeArray = unwrapRestOrArray(changes);
		const { status } = this.currentEdit.applyChanges(changeArray);
		if (status === EditStatus.Applied) {
			this.emitChange();
		}
		return status;
	}

	/**
	 * Convenience helper for applying an edit containing the given changes.
	 * Opens an edit, applies the given changes, and closes the edit. See (`openEdit()`/`applyChanges()`/`closeEdit()`).
	 */
	public applyEdit(changes: readonly Change[]): EditId;
	public applyEdit(...changes: readonly Change[]): EditId;
	public applyEdit(...changes: RestOrArray<Change>): EditId {
		this.openEdit();
		const changeArray = unwrapRestOrArray(changes);
		this.applyChanges(changeArray);
		return this.closeEdit();
	}

	/**
	 * Apply an edit, if valid, otherwise does nothing (the edit is not added to the history).
	 * If the edit applied, its changes will be immediately visible on this checkout, though it still may end up invalid once sequenced due to concurrent edits.
	 * @returns The EditId if the edit was valid and thus applied, and undefined if it was invalid and thus not applied.
	 */
	public tryApplyEdit(changes: readonly Change[]): EditId | undefined;
	public tryApplyEdit(...changes: readonly Change[]): EditId | undefined;
	public tryApplyEdit(...changes: RestOrArray<Change>): EditId | undefined {
		this.openEdit();

		assert(this.currentEdit !== undefined, 0x604 /* Changes must be applied as part of an ongoing edit. */);
		const changeArray = unwrapRestOrArray(changes);
		const { status } = this.currentEdit.applyChanges(changeArray.map((c) => this.tree.internalizeChange(c)));
		if (status === EditStatus.Applied) {
			this.emitChange();
			return this.closeEdit();
		}

		this.abortEdit();
		return undefined;
	}

	/**
	 * Rebases the ongoing edit to the latest revision loaded by this 'Checkout'.
	 *
	 * If the rebase succeeds (none of the changes in the ongoing edit became invalid), the ongoing edit will remain open and the current
	 * view will reflect those changes.
	 *
	 * If the rebase fails (changes become invalid), the ongoing edit will be aborted and
	 * currentView will return to showing the newest committed revision as it always does when there is no ongoing edit.
	 *
	 * Must only be called during an open edit.
	 *
	 * @returns The result of the rebase.
	 */
	public rebaseCurrentEdit(): EditValidationResult.Valid | EditValidationResult.Invalid {
		assert(this.currentEdit !== undefined, 0x605 /* An edit is not open. */);
		assert(this.currentEdit.status === EditStatus.Applied, 0x606 /* Local edits should always be valid. */);
		// When closed, the result might indicate Malformed due to unused detached entities.
		// This is not an error, as the edit was still open and can still use those entities.
		const priorResults = this.currentEdit.close();
		const rebasedEdit = TransactionInternal.factory(this.latestCommittedView).applyChanges(priorResults.changes);
		assert(
			rebasedEdit.status !== EditStatus.Malformed,
			0x607 /* Malformed changes should have been caught on original application. */
		);
		let status: EditValidationResult.Valid | EditValidationResult.Invalid;
		if (rebasedEdit.status === EditStatus.Invalid) {
			status = EditValidationResult.Invalid;
			this.currentEdit = undefined;
		} else {
			status = EditValidationResult.Valid;
			this.currentEdit = rebasedEdit;
		}
		this.emitChange();
		return status;
	}

	/**
	 * Ends the ongoing edit operation without committing it to the history.
	 * Can only be called if an edit is open.
	 */
	public abortEdit(): void {
		const { currentEdit } = this;
		assert(currentEdit !== undefined, 0x608 /* An edit is not open. */);
		this.currentEdit = undefined;
		this.emitChange();
	}

	/**
	 * @returns the {@link EditStatus} of the current edit.
	 * Has no side effects.
	 * Can only be called if an edit is open.
	 */
	public getEditStatus(): EditStatus {
		const { currentEdit } = this;
		assert(currentEdit !== undefined, 0x609 /* An edit is not open. */);
		// TODO: could this ever be anything other than 'Applied'
		// TODO: shouldn't this be an EditValidationResult since 'Applied' does not indicate the edit has been applied?
		return currentEdit.status;
	}

	/**
	 * Reverts a collection of edits.
	 * @param editIds - the edits to revert
	 */
	public revert(editId: EditId): void {
		assertWithMessage(this.currentEdit !== undefined);
		const index = this.tree.edits.getIndexOfId(editId);
		const edit =
			this.tree.edits.tryGetEditAtIndex(index) ?? fail('Edit with the specified ID does not exist in memory');
		const before = this.tree.logViewer.getRevisionViewInMemory(index);
		const changes = this.tree.revertChanges(edit.changes, before);
		if (changes !== undefined) {
			this.tryApplyChangesInternal(changes);
		}
	}

	/**
	 * Send invalidation message for all changes since last call to emitChange.
	 * This must be called every time `currentView` could have changed.
	 * It is ok to make excessive calls to this: change notifications will be cheaply de-duplicated.
	 */
	protected emitChange(): void {
		const current = this.currentView;
		const previous = this.previousView;
		if (!previous.hasEqualForest(current, true)) {
			// Set previousView before calling emit to make reentrant case work (where the event handler causes an edit).
			this.previousView = current;
			this.emit(CheckoutEvent.ViewChange, previous, current);
		}
	}

	/**
	 * @returns a Promise which completes after all currently known edits are available in this checkout.
	 */
	public abstract waitForPendingUpdates(): Promise<void>;

	/**
	 * @returns a Promise which completes after edits that were closed on this checkout (before calling this) have been
	 * submitted to Fluid. This does NOT wait for the Fluid service to ack them
	 */
	public abstract waitForEditsToSubmit(): Promise<void>;

	/**
	 * release all unmanaged resources
	 * e.g. unregister event listeners
	 */
	public dispose(error?: Error): void {
		if (this.disposed) {
			return;
		}

		this.disposed = true;

		// remove registered listener
		this.tree.off(SharedTreeEvent.EditCommitted, this.editCommittedHandler);
	}
}
