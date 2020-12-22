/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitterWithErrorHandling } from '@fluidframework/telemetry-utils';
import { IDisposable } from '@fluidframework/common-definitions';
import { assert } from './Common';
import { EditId } from './Identifiers';
import { Change, Edit, EditResult } from './PersistedTypes';
import { newEdit } from './EditUtilities';
import { EditValidationResult, Snapshot } from './Snapshot';
import { Transaction } from './Transaction';
import { SharedTree, SharedTreeEvent } from './SharedTree';

/**
 * An event emitted by a `Checkout` to indicate a state change
 * @public
 */
export enum CheckoutEvent {
	/**
	 * `currentView` has changed.
	 * Passed `NodeId[]` of all nodes changed since the last ViewChange event.
	 */
	ViewChange = 'viewChange',
}

/**
 * A mutable Checkout of a SharedTree, allowing viewing and interactive transactional editing.
 * Provides (snapshot-isolation)[https://en.wikipedia.org/wiki/Snapshot_isolation] while editing.
 *
 * A Checkout always shows a consistent sequence of versions of the SharedTree, but it may skip intermediate versions, and may fall behind.
 * In this case consistent means the sequence of versions could occur with fully synchronous shared tree access,
 * though the timing of sequenced edits arriving to the Checkout may be later than they actually arrive in the SharedTree.
 * Specifically no sequenced edits will arrive during an ongoing edit (to implement snapshot isolation):
 * they will be applied asynchronously some time after the ongoing edit is ended.
 *
 * @public
 * @sealed
 */
export abstract class Checkout extends EventEmitterWithErrorHandling implements IDisposable {
	/**
	 * The view of the latest committed revision.
	 * Does not include changes from any open edits.
	 *
	 * When this changes, emitChange must be called.
	 */
	protected abstract readonly latestCommittedView: Snapshot;

	/**
	 * The last view for which invalidation was sent.
	 * Updated by emitChange.
	 */
	private previousView: Snapshot;

	/**
	 * A bound handler for 'committedEdit' SharedTreeEvent
	 */
	protected readonly editCommittedHandler;

	/**
	 * The shared tree this checkout views/edits.
	 */
	public readonly tree: SharedTree;

	/**
	 * Holds the state required to manage the currently open edit.
	 * Undefined if there is currently not an open edit.
	 *
	 * Since `currentView` exposes the the intermediate state from this edit,
	 * operations that modify `currentEdit.view` must call `emitChange` to handle invalidation.
	 */
	private currentEdit?: Transaction;

	public disposed: boolean = false;

	protected constructor(tree: SharedTree, currentView: Snapshot) {
		super();
		this.tree = tree;
		this.previousView = currentView;

		// If there is an ongoing edit, emitChange will no-op, which is fine.
		this.tree.on(SharedTreeEvent.EditCommitted, this.editCommittedHandler);
	}

	/**
	 * @returns the current view of the tree, including the result of changes applied so far during an edit.
	 * Note that any external edits (from other clients) will not added to view while there is a `currentEdit`.
	 */
	public get currentView(): Snapshot {
		return this.currentEdit?.view ?? this.latestCommittedView;
	}

	/**
	 * @returns true iff there is an open edit.
	 * @internal
	 */
	public hasOpenEdit(): boolean {
		return this.currentEdit !== undefined;
	}

	/**
	 * Opens a new edit operation.
	 * Changes accumulate in the edit via calls to `applyChanges()`.
	 */
	public openEdit(): void {
		assert(this.currentEdit === undefined, 'An edit is already open.');
		this.currentEdit = new Transaction(this.currentView);
	}

	/**
	 * Ends the ongoing edit operation and commits it to the history.
	 *
	 * Malformed edits are considered an error, and will assert:
	 * All named detached sequences must have been used or theEdit is malformed.
	 *
	 * @returns the `id` of the committed edit
	 */
	public closeEdit(): EditId {
		const { currentEdit } = this;
		assert(currentEdit !== undefined, 'An edit is not open.');
		this.currentEdit = undefined;
		const editingResult = currentEdit.close();
		assert(editingResult.result === EditResult.Applied, 'Locally constructed edits must be well-formed and valid');
		const edit = newEdit(editingResult.changes);

		this.handleNewEdit(edit, editingResult.snapshot);

		return edit.id;
	}

	/**
	 * Take any needed action between when an edit is completed.
	 * Usually this will include submitting it to a SharedTree.
	 */
	protected abstract handleNewEdit(edit: Edit, view: Snapshot): void;

	/**
	 * Applies the supplied changes to the tree and emits a change event.
	 * Must be called during an ongoing edit (see `openEdit()`/`closeEdit()`).
	 * `changes` must be well-formed and valid: it is an error if they do not apply cleanly.
	 */
	public applyChanges(...changes: Change[]): void {
		assert(this.currentEdit, 'Changes must be applied as part of an ongoing edit.');
		const { result } = this.currentEdit.applyChanges(changes);
		assert(result === EditResult.Applied, 'Locally constructed edits must be well-formed and valid.');
		this.emitChange();
	}

	/**
	 * Convenience helper for applying an edit containing the given changes.
	 * Opens an edit, applies the given changes, and closes the edit. See (`openEdit()`/`applyChanges()`/`closeEdit()`).
	 */
	public applyEdit(...changes: Change[]): EditId {
		this.openEdit();
		this.applyChanges(...changes);
		return this.closeEdit();
	}

	/**
	 * Rebases the ongoing edit to the latest revision loaded by this 'Checkout'.
	 * If the rebase succeeds (none of the changes in the ongoing edit became invalid), the ongoing edit will remain open and the current
	 * view will reflect those changes.
	 *
	 * If the rebase fails (changes become invalid), the ongoing edit will be aborted and
	 * currentView will return to showing the newest committed revision as it always does when there is no ongoing edit.
	 *
	 * Must only be called during an open edit.
	 * @returns - the result of the rebase.
	 */
	public rebaseCurrentEdit(): EditValidationResult.Valid | EditValidationResult.Invalid {
		assert(this.currentEdit !== undefined, 'An edit is not open.');
		assert(this.currentEdit.result === EditResult.Applied, 'Local edits should always be valid.');
		// When closed, the result might indicate Malformed due to unused detached entities.
		// This is not an error, as the edit was still open and can still use those entities.
		const priorResults = this.currentEdit.close();
		const rebasedEdit = new Transaction(this.latestCommittedView).applyChanges(priorResults.changes);
		assert(
			rebasedEdit.result !== EditResult.Malformed,
			'Malformed changes should have been caught on original application.'
		);
		let result: EditValidationResult.Valid | EditValidationResult.Invalid;
		if (rebasedEdit.result === EditResult.Invalid) {
			result = EditValidationResult.Invalid;
			this.currentEdit = undefined;
		} else {
			result = EditValidationResult.Valid;
			this.currentEdit = rebasedEdit;
		}
		this.emitChange();
		return result;
	}

	/**
	 * Ends the ongoing edit operation without committing it to the history.
	 * Can only be called if an edit is open.
	 */
	public abortEdit(): void {
		const { currentEdit } = this;
		assert(currentEdit !== undefined, 'An edit is not open.');
		this.currentEdit = undefined;
		this.emitChange();
	}

	/**
	 * @returns the {@link EditResult} of the current edit.
	 * Has no side effects.
	 * Can only be called if an edit is open.
	 */
	public getEditStatus(): EditResult {
		const { currentEdit } = this;
		assert(currentEdit !== undefined, 'An edit is not open.');
		// TODO: could this ever be anything other than 'Applied'
		// TODO: shouldn't this be an EditValidationResult since 'Applied' does not indicate the edit has been applied?
		return currentEdit.result;
	}

	/**
	 * Send invalidation message for all changes since last call to emitChange.
	 * This must be called every time `currentView` could have changed.
	 * It is ok to make excessive calls to this: change notifications will be cheaply de-duplicated.
	 */
	protected emitChange(): void {
		const delta = this.previousView.delta(this.currentView);
		this.previousView = this.currentView;
		if (delta.length !== 0) {
			this.emit(CheckoutEvent.ViewChange, delta);
		}
	}

	/**
	 * @returns a Promise which completes after all currently known edits are available in this checkout.
	 */
	public abstract waitForPendingUpdates(): Promise<void>;

	/**
	 * release all unmanaged resources
	 * e.g. unregister event listeners
	 */
	public dispose(error?: Error): void {
		assert(!this.disposed, 'Checkout must not be disposed twice');
		this.disposed = true;

		// remove registered listener
		this.tree.off(SharedTreeEvent.EditCommitted, this.editCommittedHandler);
	}
}
