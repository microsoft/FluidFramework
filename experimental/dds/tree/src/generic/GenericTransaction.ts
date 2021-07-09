/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from '../Common';
import { ReconciliationChange, ReconciliationPath } from '../ReconciliationPath';
import { Snapshot } from '../Snapshot';
import { EditStatus } from './PersistedTypes';

/**
 * Result of applying a transaction.
 * @public
 */
export type EditingResult<TChange> =
	| {
			readonly status: EditStatus.Invalid | EditStatus.Malformed;
			readonly changes: readonly TChange[];
			readonly steps?: undefined;
			readonly before: Snapshot;
	  }
	| ValidEditingResult<TChange>;

/**
 * Result of applying a valid transaction.
 * @public
 */
export interface ValidEditingResult<TChange> {
	readonly status: EditStatus.Applied;
	readonly changes: readonly TChange[];
	readonly steps: readonly { resolvedChange: TChange; after: Snapshot }[];
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
	protected _status: EditStatus = EditStatus.Applied;
	protected readonly changes: TChange[] = [];
	protected readonly steps: ReconciliationChange<TChange>[] = [];
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

	/** The status code of the most recent attempted change */
	public get status(): EditStatus {
		return this._status;
	}

	/** @returns the final `EditStatus` and `Snapshot` after all changes are applied. */
	public close(): EditingResult<TChange> {
		assert(this.isOpen, 'transaction has already been closed');
		this.isOpen = false;
		if (this.status === EditStatus.Applied) {
			this._status = this.validateOnClose();
		}
		if (this.status === EditStatus.Applied) {
			return {
				status: EditStatus.Applied,
				before: this.before,
				after: this._view,
				changes: this.changes,
				steps: this.steps,
			};
		}
		return {
			status: this.status,
			changes: this.changes,
			before: this.before,
		};
	}

	/**
	 * Override to provide additional transaction validation when the transaction is closed.
	 * Only invoked when a transaction is otherwise valid.
	 */
	protected abstract validateOnClose(): EditStatus;

	/**
	 * A helper to apply a sequence of changes. Changes will be applied one after the other. If a change fails to apply,
	 * the remaining changes in `changes` will be ignored.
	 * @param changes - the sequence of changes to apply.
	 * @param path - the reconciliation path for the first change.
	 * @returns this
	 */
	public applyChanges(changes: Iterable<TChange>, path: ReconciliationPath<TChange> = []): this {
		const iter = changes[Symbol.iterator]();
		const firstChange = iter.next().value;
		let iterResult = iter.next();
		if (iterResult.done === true) {
			for (const change of changes) {
				if (this.applyChange(change, path).status !== EditStatus.Applied) {
					return this;
				}
			}
			return this;
		}

		if (this.applyChange(firstChange, path).status !== EditStatus.Applied) {
			return this;
		}

		const ongoingEdit = {
			0: this.steps[this.steps.length - 1],
			before: this.view,
			after: this.view,
			length: 1,
		};

		/**
		 * We use a Proxy instead of `{ ...path, ...objectWithOngoingEdit }` to avoid eagerly demanding all parts of the path, which may
		 * require extensive computation.
		 */
		const pathWithOngoingEdit = new Proxy(path, {
			get: (
				target: ReconciliationPath<TChange>,
				prop: string
			): ReconciliationPath<TChange>[number | 'length'] => {
				if (prop === 'length') {
					return target.length + 1;
				}
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				return prop === String(target.length) ? ongoingEdit : target[prop];
			},
		});

		while (iterResult.done !== true) {
			if (this.applyChange(iterResult.value, pathWithOngoingEdit).status !== EditStatus.Applied) {
				return this;
			}

			ongoingEdit[ongoingEdit.length] = this.steps[this.steps.length - 1];
			ongoingEdit.length += 1;
			ongoingEdit.after = this.view;
			iterResult = iter.next();
		}
		return this;
	}

	protected tryResolveChange(change: TChange, path: ReconciliationPath<TChange>): TChange | undefined {
		return change;
	}

	/**
	 * Attempt to apply the given change as part of this edit. This method should not be called if a previous change in this edit failed to
	 * apply.
	 * @param change - the change to apply
	 * @param path - the reconciliation path for the change.
	 * @returns this
	 */
	public applyChange(change: TChange, path: ReconciliationPath<TChange> = []): this {
		assert(this.isOpen, 'Editor must be open to apply changes.');
		if (this.status !== EditStatus.Applied) {
			fail('Cannot apply change to an edit unless all previous changes have applied');
		}
		const resolvedChange = this.tryResolveChange(change, path);
		if (resolvedChange === undefined) {
			this._status = EditStatus.Invalid;
			return this;
		}
		this.changes.push(change);
		this._status = this.dispatchChange(resolvedChange);
		this.steps.push({ resolvedChange, after: this.view });
		return this;
	}

	protected abstract dispatchChange(change: TChange): EditStatus;
}
