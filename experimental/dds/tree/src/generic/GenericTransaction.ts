/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from '../Common';
import { Snapshot } from '../Snapshot';
import { EditResult } from './PersistedTypes';

/**
 * Result of applying a transaction.
 * @public
 */
export type EditingResult<TChange> =
	| {
			readonly result: EditResult.Invalid | EditResult.Malformed;
			readonly changes: readonly TChange[];
			readonly before: Snapshot;
	  }
	| ValidEditingResult<TChange>;

/**
 * Result of applying a valid transaction.
 * @public
 */
export interface ValidEditingResult<TChange> {
	readonly result: EditResult.Applied;
	readonly changes: readonly TChange[];
	readonly before: Snapshot;
	readonly after: Snapshot;
}

/**
 * A mutable transaction for applying sequences of changes to a Snapshot.
 * Allows viewing the intermediate states.
 *
 * Contains necessary state to apply changes within an edit to a Snapshot.
 *
 * May have any number of changes applied to make up the edit.
 * Use `close` to complete the transaction, returning the array of changes and an EditingResult showing the
 * results of applying the changes as an Edit to the initial Snapshot (passed to the constructor).
 *
 * No data outside the Transaction is modified by Transaction:
 * the results from `close` must be used to actually submit an `Edit`.
 */
export abstract class GenericTransaction<TChange> {
	protected readonly before: Snapshot;
	protected _view: Snapshot;
	protected _result: EditResult = EditResult.Applied;
	protected readonly changes: TChange[] = [];
	protected isOpen = true;

	/**
	 * Create and open an edit of the provided `Snapshot`. After applying 0 or more changes, this editor should be closed via `close()`.
	 * @param view - the `Snapshot` at which this edit begins. The first change will be applied against this view.
	 */
	public constructor(view: Snapshot) {
		this._view = view;
		this.before = view;
	}

	/** The most up-to-date `Snapshot` for this edit. This is the state of the tree after all changes applied so far. */
	public get view(): Snapshot {
		return this._view;
	}

	/** The result of the most recent attempted change */
	public get result(): EditResult {
		return this._result;
	}

	/** @returns the final `EditResult` and `Snapshot` after all changes are applied. */
	public close(): EditingResult<TChange> {
		assert(this.isOpen, 'transaction has already been closed');
		this.isOpen = false;
		if (this.result === EditResult.Applied) {
			this._result = this.validateOnClose();
		}
		if (this.result === EditResult.Applied) {
			return {
				result: EditResult.Applied,
				before: this.before,
				after: this._view,
				changes: this.changes,
			};
		}
		return {
			result: this.result,
			changes: this.changes,
			before: this.before,
		};
	}

	/**
	 * Override to provide additional transaction validation when the transaction is closed.
	 * Only invoked when a transaction is otherwise valid.
	 */
	protected abstract validateOnClose(): EditResult;

	/**
	 * A helper to apply a sequence of changes. Changes will be applied one after the other. If a change fails to apply,
	 * the remaining changes in `changes` will be ignored.
	 * @param changes - the sequence of changes to apply
	 * @returns this
	 */
	public applyChanges(changes: Iterable<TChange>): this {
		for (const change of changes) {
			if (this.applyChange(change).result !== EditResult.Applied) {
				return this;
			}
		}

		return this;
	}

	/**
	 * Attempt to apply the given change as part of this edit. This method should not be called if a previous change in this edit failed to
	 * apply.
	 * @param change - the change to apply
	 * @returns this
	 */
	public applyChange(change: TChange): this {
		assert(this.isOpen, 'Editor must be open to apply changes.');
		if (this.result !== EditResult.Applied) {
			fail('Cannot apply change to an edit unless all previous changes have applied');
		}

		this.changes.push(change);
		this._result = this.dispatchChange(change);
		return this;
	}

	protected abstract dispatchChange(change: TChange): EditResult;
}
