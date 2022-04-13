/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeInternal, Edit, EditStatus } from './persisted-types';
import { newEditId } from './EditUtilities';
import { TreeView } from './TreeView';
import { Change } from './ChangeTypes';
import { SharedTree } from './SharedTree';
import { GenericTransaction, TransactionInternal } from './TransactionInternal';
import { CachingLogViewer } from './LogViewer';

/**
 * Buffers changes to be applied to an isolated view of a `SharedTree` over time before applying them directly to the tree itself as a
 * single edit
 */
export class Transaction {
	/** The view of the tree when this transaction was created */
	public readonly startingView: TreeView;

	private readonly transaction: GenericTransaction;
	private open: boolean = true;

	/**
	 * Create a new transaction over the given tree. The tree's `currentView` at this time will become the `startingView` for this
	 * transaction.
	 * @param tree - the `SharedTree` that this transaction applies changes to
	 */
	public constructor(public readonly tree: SharedTree) {
		const { currentView } = tree;
		this.transaction = new GenericTransaction(currentView, new TransactionInternal.Policy());
		this.startingView = currentView;
	}

	/**
	 * True if this transaction is open, false if it is closed. A transaction may be closed manually via `closeAndApplyEdit()`, or may
	 * be automatically closed by a change in this transaction failing to apply (see `applyChange()`).
	 */
	public get isOpen(): boolean {
		return this.open && this.status === EditStatus.Applied;
	}

	/**
	 * The status of the most recently applied change in this transaction
	 */
	public get status(): EditStatus {
		return this.transaction.status;
	}

	/**
	 * The state of the tree following the most change that was successfully applied. If no changes have been applied, this is the same as
	 * `startingView`.
	 */
	public get currentView(): TreeView {
		return this.transaction.view;
	}

	/**
	 * Attempt to apply a sequence of changes in this transaction. The `currentView` will be updated to reflect the new tree state after all
	 * applied changes. If any change fails to apply, the remaining changes will be ignored and this transaction will be automatically
	 * closed (see `isOpen`). If this transaction is already closed, this method has no effect.
	 * @param changes - the changes to apply
	 * @returns either the `EditStatus` of the given changes or the `EditStatus` of the last change before the transaction was closed
	 */
	public apply(...changes: Change[]): EditStatus;
	public apply(changes: Change[]): EditStatus;
	public apply(headOrChanges: Change | Change[], ...tail: Change[]): EditStatus {
		if (this.isOpen) {
			const changes = Array.isArray(headOrChanges) ? headOrChanges : [headOrChanges, ...tail];
			this.transaction.applyChanges(changes.map((c) => this.tree.internalizeChange(c)));
		}
		return this.status;
	}

	/**
	 * Close this transaction and apply its changes to the `SharedTree`. If this transaction is already closed, this method has no effect.
	 */
	public closeAndCommit(): void {
		if (this.isOpen) {
			if (this.transaction.changes.length > 0) {
				const edit: Edit<ChangeInternal> = { id: newEditId(), changes: this.transaction.changes };
				const result = this.transaction.close();
				if (this.tree.editsInternal instanceof CachingLogViewer) {
					this.tree.editsInternal.setKnownEditingResult(edit, result);
				}
				this.tree.applyEditInternal(edit);
			}
			this.open = false;
		}
	}
}
