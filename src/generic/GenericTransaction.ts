/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail, Result } from '../Common';
import { ReconciliationChange, ReconciliationPath } from '../ReconciliationPath';
import { RevisionView, TransactionView } from '../TreeView';
import { EditStatus } from './PersistedTypes';

/**
 * Result of applying a transaction.
 * @public
 */
export type EditingResult<TChange, TFailure = unknown> =
	| FailedEditingResult<TChange, TFailure>
	| ValidEditingResult<TChange>;

/**
 * Basic result of applying a transaction.
 * @public
 */
export interface EditingResultBase<TChange> {
	/**
	 * The final status of the transaction.
	 */
	readonly status: EditStatus;
	/**
	 * The valid changes applied as part of the transaction.
	 */
	readonly changes: readonly TChange[];
	/**
	 * The editing steps applied as part of the transaction.
	 */
	readonly steps: readonly ReconciliationChange<TChange>[];
	/**
	 * The revision preceding the transaction.
	 */
	readonly before: RevisionView;
}

/**
 * Result of applying an invalid or malformed transaction.
 * @public
 */
export interface FailedEditingResult<TChange, TFailure> extends EditingResultBase<TChange> {
	/**
	 * {@inheritDoc EditingResultBase.status}
	 */
	readonly status: EditStatus.Invalid | EditStatus.Malformed;
	/**
	 * Information about what caused the transaction to fail.
	 */
	readonly failure: TFailure;
	/**
	 * The valid changes applied as part of the transaction.
	 * Those were ultimately abandoned due to the transaction failure.
	 */
	readonly changes: readonly TChange[];
	/**
	 * The editing steps applied as part of the transaction.
	 * Those were ultimately abandoned due to the transaction failure.
	 */
	readonly steps: readonly ReconciliationChange<TChange>[];
}

/**
 * Result of applying a valid transaction.
 * @public
 */
export interface ValidEditingResult<TChange> extends EditingResultBase<TChange> {
	/**
	 * {@inheritDoc EditingResultBase.status}
	 */
	readonly status: EditStatus.Applied;
	/**
	 * The new revision produced by the transaction.
	 */
	readonly after: RevisionView;
}

/**
 * The result of applying a change within a transaction.
 * @public
 */
export type ChangeResult<TFailure = unknown> = Result<TransactionView, TransactionFailure<TFailure>>;

/**
 * The ongoing state of a transaction.
 * @public
 */
export type TransactionState<TChange, TFailure = unknown> =
	| SucceedingTransactionState<TChange>
	| FailingTransactionState<TChange, TFailure>;

/**
 * The state of a transaction that has not encountered an error.
 */
export interface SucceedingTransactionState<TChange> {
	/**
	 * The current status of the transaction.
	 */
	readonly status: EditStatus.Applied;
	/**
	 * The view reflecting the latest applied change.
	 */
	readonly view: TransactionView;
	/**
	 * The applied changes so far.
	 */
	readonly changes: readonly TChange[];
	/**
	 * The editing steps applied so far.
	 */
	readonly steps: readonly ReconciliationChange<TChange>[];
}

/**
 * The state of a transaction that has encountered an error.
 */
export interface FailingTransactionState<TChange, TFailure = unknown> extends TransactionFailure<TFailure> {
	/**
	 * The view reflecting the latest applied change.
	 */
	readonly view: TransactionView;
	/**
	 * The applied changes so far.
	 */
	readonly changes: readonly TChange[];
	/**
	 * The editing steps applied so far.
	 */
	readonly steps: readonly ReconciliationChange<TChange>[];
}

/**
 * The failure state of a transaction.
 */
export interface TransactionFailure<TFailure = unknown> {
	/**
	 * The status indicating the kind of failure encountered.
	 */
	readonly status: EditStatus.Invalid | EditStatus.Malformed;
	/**
	 * Information about what caused the transaction to fail.
	 */
	readonly failure: TFailure;
}

/**
 * A mutable transaction for applying sequences of changes to a TreeView.
 * Allows viewing the intermediate states.
 *
 * Contains necessary state to apply changes within an edit to a TreeView.
 *
 * May have any number of changes applied to make up the edit.
 * Use `close` to complete the transaction, returning the array of changes and an EditingResult showing the
 * results of applying the changes as an Edit to the initial TreeView (passed to the constructor).
 *
 * No data outside the Transaction is modified by Transaction:
 * the results from `close` must be used to actually submit an `Edit`.
 */
export class GenericTransaction<TChange, TFailure = unknown> {
	private readonly policy: GenericTransactionPolicy<TChange, TFailure>;
	protected readonly before: RevisionView;
	private state: TransactionState<TChange, TFailure>;
	private isOpen = true;

	/**
	 * Create and open an edit of the provided `TreeView`. After applying 0 or more changes, this editor should be closed via `close()`.
	 * @param view - the `TreeView` at which this edit begins. The first change will be applied against this view.
	 */
	public constructor(view: RevisionView, policy: GenericTransactionPolicy<TChange, TFailure>) {
		this.before = view;
		this.policy = policy;
		this.state = {
			view: view.openForTransaction(),
			status: EditStatus.Applied,
			changes: [],
			steps: [],
		};
	}

	/**
	 * The most up-to-date `TreeView` for this edit. This is the state of the tree after all changes applied so far.
	 */
	public get view(): TransactionView {
		return this.state.view;
	}

	/**
	 * The status code of the most recent attempted change.
	 */
	public get status(): EditStatus {
		return this.state.status;
	}

	/**
	 * The status code of the most recent attempted change.
	 */
	public get changes(): readonly TChange[] {
		return this.state.changes;
	}

	/**
	 * The status code of the most recent attempted change.
	 */
	public get steps(): readonly ReconciliationChange<TChange>[] {
		return this.state.steps;
	}

	/** @returns the final `EditStatus` and `TreeView` after all changes are applied. */
	public close(): EditingResult<TChange, TFailure> {
		assert(this.isOpen, 'transaction has already been closed');
		this.isOpen = false;
		if (this.state.status === EditStatus.Applied) {
			const validation = this.policy.validateOnClose(this.state);
			if (Result.isOk(validation)) {
				if (validation.result !== this.view) {
					this.state = { ...this.state, view: validation.result };
				}
				return {
					status: EditStatus.Applied,
					steps: this.steps,
					changes: this.changes,
					before: this.before,
					after: this.view.close(),
				};
			}
			this.state = { ...this.state, ...validation.error };
			return {
				...validation.error,
				steps: this.steps,
				changes: this.changes,
				before: this.before,
			};
		}
		return {
			status: this.state.status,
			failure: this.state.failure,
			steps: this.steps,
			changes: this.changes,
			before: this.before,
		};
	}

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

	/**
	 * Attempt to apply the given change as part of this edit. This method should not be called if a previous change in this edit failed to
	 * apply.
	 * @param change - the change to apply
	 * @param path - the reconciliation path for the change.
	 * @returns this
	 */
	public applyChange(change: TChange, path: ReconciliationPath<TChange> = []): this {
		assert(this.isOpen, 'Editor must be open to apply changes.');
		if (this.state.status !== EditStatus.Applied) {
			fail('Cannot apply change to an edit unless all previous changes have applied');
		}
		const resolutionResult = this.policy.tryResolveChange(this.state, change, path);
		if (Result.isError(resolutionResult)) {
			this.state = { ...this.state, ...resolutionResult.error };
			return this;
		}
		const resolvedChange = resolutionResult.result;
		const changeResult = this.policy.dispatchChange(this.state, resolvedChange);
		if (Result.isOk(changeResult)) {
			this.state = {
				status: EditStatus.Applied,
				view: changeResult.result,
				changes: this.changes.concat(change),
				steps: this.steps.concat({ resolvedChange, after: changeResult.result }),
			};
		} else {
			this.state = {
				...this.state,
				...changeResult.error,
			};
		}
		return this;
	}
}

/**
 * An object that encapsulates the rules and state pertaining to a specific subclass of {@link GenericTransaction}.
 * The characteristics that define such a subclass (and an implementation of this interface) are:
 * - The type of change that can be applied
 * - How those changes impact the state of the tree
 * - How those changes are resolved in the face of concurrent changes
 * - What makes a transaction valid
 * - The kind of situations that might lead to a transaction failure
 *
 * Instances of this type are passed to the {@link GenericTransaction} constructor.
 */
export interface GenericTransactionPolicy<TChange, TFailure = unknown> {
	/**
	 * Given a change, attempts to derive an equivalent change which can be applied to the current state even if the given change was issued
	 * over a different state. This can be used to apply a sequence of changes that were issued concurrently, i.e., without knowledge of
	 * each other.
	 * @param state - The current state on which the returned change will be applied.
	 * @param change - The original change issued.
	 * @param path - The reconciliation path for the change.
	 * @returns The change to be applied to the current state, or a failure if the change cannot be resolved.
	 */
	tryResolveChange(
		state: SucceedingTransactionState<TChange>,
		change: TChange,
		path: ReconciliationPath<TChange>
	): Result<TChange, TransactionFailure<TFailure>>;

	/**
	 * Provides a new state given the current state and a change to apply.
	 * @param state - The current state on which the change is applied.
	 * @param change - The change to apply to the current state.
	 * @returns The new state reflecting the applied change, or a failure.
	 */
	dispatchChange(state: SucceedingTransactionState<TChange>, change: TChange): ChangeResult<TFailure>;

	/**
	 * Additional transaction validation when the transaction is closed.
	 * @param state - The current state of the transaction.
	 * @returns The new state reflecting the closed transaction, or a failure if the transaction cannot be closed.
	 */
	validateOnClose(state: SucceedingTransactionState<TChange>): ChangeResult<TFailure>;
}
