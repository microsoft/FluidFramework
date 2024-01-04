/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from '@fluidframework/core-utils';
import { assertWithMessage, copyPropertyIfDefined, fail, Result } from './Common';
import { NodeId, DetachedSequenceId, TraitLabel, isDetachedSequenceId } from './Identifiers';
import { rangeFromStableRange } from './TreeViewUtilities';
import {
	BuildInternal,
	BuildNodeInternal,
	ChangeInternal,
	ChangeTypeInternal,
	ConstraintEffect,
	ConstraintInternal,
	DetachInternal,
	EditStatus,
	InsertInternal,
	SetValueInternal,
	StablePlaceInternal,
	StableRangeInternal,
} from './persisted-types';
import {
	detachRange,
	insertIntoTrait,
	validateStablePlace,
	validateStableRange,
	BadPlaceValidationResult,
	BadRangeValidationResult,
	PlaceValidationResult,
	RangeValidationResultKind,
} from './EditUtilities';
import { RevisionView, TransactionView } from './RevisionView';
import { ReconciliationChange, ReconciliationPath } from './ReconciliationPath';
import { TreeViewNode } from './TreeView';

/**
 * Result of applying a transaction.
 * @internal
 */
export type EditingResult = FailedEditingResult | ValidEditingResult;

/**
 * Basic result of applying a transaction.
 * @alpha
 */
export interface EditingResultBase {
	/**
	 * The final status of the transaction.
	 */
	readonly status: EditStatus;
	/**
	 * The valid changes applied as part of the transaction.
	 */
	readonly changes: readonly ChangeInternal[];
	/**
	 * The editing steps applied as part of the transaction.
	 */
	readonly steps: readonly ReconciliationChange[];
	/**
	 * The revision preceding the transaction.
	 */
	readonly before: RevisionView;
}

/**
 * Result of applying an invalid or malformed transaction.
 * @internal
 */
export interface FailedEditingResult extends EditingResultBase {
	/**
	 * {@inheritDoc EditingResultBase.status}
	 */
	readonly status: EditStatus.Invalid | EditStatus.Malformed;
	/**
	 * Information about what caused the transaction to fail.
	 */
	readonly failure: TransactionInternal.Failure;
	/**
	 * The valid changes applied as part of the transaction.
	 * Those were ultimately abandoned due to the transaction failure.
	 */
	readonly changes: readonly ChangeInternal[];
	/**
	 * The editing steps applied as part of the transaction.
	 * Those were ultimately abandoned due to the transaction failure.
	 */
	readonly steps: readonly ReconciliationChange[];
}

/**
 * Result of applying a valid transaction.
 * @alpha
 */
export interface ValidEditingResult extends EditingResultBase {
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
 * @internal
 */
export type ChangeResult = Result<TransactionView, TransactionFailure>;

/**
 * The ongoing state of a transaction.
 * @internal
 */
export type TransactionState = SucceedingTransactionState | FailingTransactionState;

/**
 * The state of a transaction that has not encountered an error.
 * @alpha
 */
export interface SucceedingTransactionState {
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
	readonly changes: readonly ChangeInternal[];
	/**
	 * The editing steps applied so far.
	 */
	readonly steps: readonly ReconciliationChange[];
}

/**
 * The state of a transaction that has encountered an error.
 * @internal
 */
export interface FailingTransactionState extends TransactionFailure {
	/**
	 * The view reflecting the latest applied change.
	 */
	readonly view: TransactionView;
	/**
	 * The applied changes so far.
	 */
	readonly changes: readonly ChangeInternal[];
	/**
	 * The editing steps applied so far.
	 */
	readonly steps: readonly ReconciliationChange[];
}

/**
 * The failure state of a transaction.
 * @internal
 */
export interface TransactionFailure {
	/**
	 * The status indicating the kind of failure encountered.
	 */
	readonly status: EditStatus.Invalid | EditStatus.Malformed;
	/**
	 * Information about what caused the transaction to fail.
	 */
	readonly failure: TransactionInternal.Failure;
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
 * @internal
 */
export class GenericTransaction {
	private readonly policy: GenericTransactionPolicy;
	protected readonly before: RevisionView;
	private state: TransactionState;
	private open = true;

	/**
	 * Create and open an edit of the provided `TreeView`. After applying 0 or more changes, this editor should be closed via `close()`.
	 * @param view - the `TreeView` at which this edit begins. The first change will be applied against this view.
	 */
	public constructor(view: RevisionView, policy: GenericTransactionPolicy) {
		this.before = view;
		this.policy = policy;
		this.state = {
			view: view.openForTransaction(),
			status: EditStatus.Applied,
			changes: [],
			steps: [],
		};
	}

	/** Whether or not this transaction has been closed via `close()` */
	public get isOpen(): boolean {
		return this.open;
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
	public get changes(): readonly ChangeInternal[] {
		return this.state.changes;
	}

	/**
	 * The status code of the most recent attempted change.
	 */
	public get steps(): readonly ReconciliationChange[] {
		return this.state.steps;
	}

	/**
	 * Information about why the transaction failed. Defined if and only if `status` is invalid or malformed.
	 */
	public get failure(): TransactionInternal.Failure | undefined {
		return (this.state as FailingTransactionState).failure;
	}

	/** @returns the final `EditStatus` and `TreeView` after all changes are applied. */
	public close(): EditingResult {
		assert(this.open, 0x638 /* transaction has already been closed */);
		this.open = false;
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
	public applyChanges(changes: Iterable<ChangeInternal>, path: ReconciliationPath = []): this {
		const iter = changes[Symbol.iterator]();
		const firsChangeInternal = iter.next().value;
		let iterResult = iter.next();
		if (iterResult.done === true) {
			for (const change of changes) {
				if (this.applyChange(change, path).status !== EditStatus.Applied) {
					return this;
				}
			}
			return this;
		}

		if (this.applyChange(firsChangeInternal, path).status !== EditStatus.Applied) {
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
			get: (target: ReconciliationPath, prop: string): ReconciliationPath[number | 'length'] => {
				if (prop === 'length') {
					return target.length + 1;
				}
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
	public applyChange(change: ChangeInternal, path: ReconciliationPath = []): this {
		assert(this.open, 0x639 /* Editor must be open to apply changes. */);
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
		this.state = Result.isOk(changeResult)
			? {
					status: EditStatus.Applied,
					view: changeResult.result,
					changes: this.changes.concat(change),
					steps: this.steps.concat({ resolvedChange, after: changeResult.result }),
			  }
			: {
					...this.state,
					...changeResult.error,
			  };
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
 * @internal
 */
export interface GenericTransactionPolicy {
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
		state: SucceedingTransactionState,
		change: ChangeInternal,
		path: ReconciliationPath
	): Result<ChangeInternal, TransactionFailure>;

	/**
	 * Provides a new state given the current state and a change to apply.
	 * @param state - The current state on which the change is applied.
	 * @param change - The change to apply to the current state.
	 * @returns The new state reflecting the applied change, or a failure.
	 */
	dispatchChange(state: SucceedingTransactionState, change: ChangeInternal): ChangeResult;

	/**
	 * Additional transaction validation when the transaction is closed.
	 * @param state - The current state of the transaction.
	 * @returns The new state reflecting the closed transaction, or a failure if the transaction cannot be closed.
	 */
	validateOnClose(state: SucceedingTransactionState): ChangeResult;
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
 * @alpha
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace TransactionInternal {
	/**
	 * Makes a new {@link GenericTransaction} that follows the {@link TransactionInternal.Policy} policy.
	 * @internal
	 */
	export function factory(view: RevisionView): GenericTransaction {
		return new GenericTransaction(view, new Policy());
	}

	type ValidState = SucceedingTransactionState;

	/**
	 * The policy followed by a {@link TransactionInternal}.
	 * @internal
	 */
	export class Policy implements GenericTransactionPolicy {
		/**
		 * Maps detached sequences of nodes to their NodeIds
		 */
		protected readonly detached: Map<DetachedSequenceId, readonly NodeId[]> = new Map();

		/**
		 * Resolves change with Result.Ok
		 *
		 * @param state - Unused
		 * @param change - Change to resolve
		 * @returns Result.Ok which contains change
		 */
		public tryResolveChange(state: ValidState, change: ChangeInternal): Result.Ok<ChangeInternal> {
			return Result.ok(change);
		}

		/**
		 * Validates the transaction when it is closed
		 *
		 * @param state - Current state
		 * @returns a {@link ChangeResult} containing either the change result or a Failure
		 */
		public validateOnClose(state: ValidState): ChangeResult {
			// Making the policy choice that storing a detached sequences in an edit but not using it is an error.
			return this.detached.size !== 0
				? Result.error({
						status: EditStatus.Malformed,
						failure: {
							kind: FailureKind.UnusedDetachedSequence,
							sequenceId: this.detached.keys().next().value,
						},
				  })
				: Result.ok(state.view);
		}

		/**
		 * Applies a given change
		 *
		 * @param state - Current state
		 * @param change - Change to apply
		 * @returns a {@link ChangeResult} containing either the change result or a Failure
		 */
		public dispatchChange(state: ValidState, change: ChangeInternal): ChangeResult {
			switch (change.type) {
				case ChangeTypeInternal.Build:
					return this.applyBuild(state, change);
				case ChangeTypeInternal.Insert:
					return this.applyInsert(state, change);
				case ChangeTypeInternal.Detach:
					return this.applyDetach(state, change);
				case ChangeTypeInternal.Constraint:
					return this.applyConstraint(state, change);
				case ChangeTypeInternal.SetValue:
					return this.applySetValue(state, change);
				default:
					return fail('Attempted to apply unsupported change');
			}
		}

		private applyBuild(state: ValidState, change: BuildInternal): ChangeResult {
			if (this.detached.has(change.destination)) {
				return Result.error({
					status: EditStatus.Malformed,
					failure: {
						kind: FailureKind.DetachedSequenceIdAlreadyInUse,
						change,
						sequenceId: change.destination,
					},
				});
			}

			let idAlreadyPresent: NodeId | undefined;
			let duplicateIdInBuild: NodeId | undefined;
			let invalidId: NodeId | undefined;
			let detachedSequenceNotFound: DetachedSequenceId | undefined;
			const map = new Map<NodeId, TreeViewNode>();
			const newIds = this.createViewNodesForTree(
				change.source,
				(id, viewNode) => {
					if (map.has(id)) {
						duplicateIdInBuild = id;
						return true;
					}
					if (state.view.hasNode(viewNode.identifier)) {
						idAlreadyPresent = id;
						return true;
					}
					map.set(id, viewNode);
					return false;
				},
				(detachedId) => {
					detachedSequenceNotFound = detachedId;
				}
			);

			if (idAlreadyPresent !== undefined) {
				return Result.error({
					status: EditStatus.Invalid,
					failure: { kind: FailureKind.IdAlreadyInUse, change, id: idAlreadyPresent },
				});
			}
			if (duplicateIdInBuild !== undefined) {
				return Result.error({
					status: EditStatus.Malformed,
					failure: { kind: FailureKind.DuplicateIdInBuild, change, id: duplicateIdInBuild },
				});
			}
			if (invalidId !== undefined) {
				return Result.error({
					status: EditStatus.Invalid,
					failure: { kind: FailureKind.UnknownId, change, id: invalidId },
				});
			}
			if (detachedSequenceNotFound !== undefined) {
				return Result.error({
					status: EditStatus.Malformed,
					failure: {
						kind: FailureKind.DetachedSequenceNotFound,
						change,
						sequenceId: detachedSequenceNotFound,
					},
				});
			}

			const view = state.view.addNodes(map.values());
			this.detached.set(
				change.destination,
				newIds ?? fail('Unhandled failure case in Transaction.createViewNodesForTree')
			);
			return Result.ok(view);
		}

		private applyInsert(state: ValidState, change: InsertInternal): ChangeResult {
			const source = this.detached.get(change.source);
			if (source === undefined) {
				return Result.error({
					status: EditStatus.Malformed,
					failure: {
						kind: FailureKind.DetachedSequenceNotFound,
						change,
						sequenceId: change.source,
					},
				});
			}

			const validatedDestination = validateStablePlace(state.view, change.destination);
			if (validatedDestination.result !== PlaceValidationResult.Valid) {
				return Result.error({
					status:
						validatedDestination.result === PlaceValidationResult.Malformed
							? EditStatus.Malformed
							: EditStatus.Invalid,
					failure: {
						kind: FailureKind.BadPlace,
						change,
						place: change.destination,
						placeFailure: validatedDestination.result,
					},
				});
			}

			this.detached.delete(change.source);
			const view = insertIntoTrait(state.view, source, validatedDestination);
			return Result.ok(view);
		}

		private applyDetach(state: ValidState, change: DetachInternal): ChangeResult {
			const validatedSource = validateStableRange(state.view, change.source);
			if (validatedSource.result !== RangeValidationResultKind.Valid) {
				return Result.error({
					status:
						validatedSource.result === RangeValidationResultKind.PlacesInDifferentTraits ||
						validatedSource.result === RangeValidationResultKind.Inverted ||
						validatedSource.result.placeFailure !== PlaceValidationResult.Malformed
							? EditStatus.Invalid
							: EditStatus.Malformed,
					failure: {
						kind: FailureKind.BadRange,
						change,
						range: change.source,
						rangeFailure: validatedSource.result,
					},
				});
			}

			const result = detachRange(state.view, validatedSource);
			let modifiedView = result.view;
			const { detached } = result;

			// Store or dispose detached
			if (change.destination !== undefined) {
				if (this.detached.has(change.destination)) {
					return Result.error({
						status: EditStatus.Malformed,
						failure: {
							kind: FailureKind.DetachedSequenceIdAlreadyInUse,
							change,
							sequenceId: change.destination,
						},
					});
				}
				this.detached.set(change.destination, detached);
			} else {
				modifiedView = modifiedView.deleteNodes(detached);
			}
			return Result.ok(modifiedView);
		}

		private applyConstraint(state: ValidState, change: ConstraintInternal): ChangeResult {
			// TODO: Implement identityHash and contentHash
			assert(change.identityHash === undefined, 0x63a /* identityHash constraint is not implemented */);
			assert(change.contentHash === undefined, 0x63b /* contentHash constraint is not implemented */);

			const validatedChange = validateStableRange(state.view, change.toConstrain);
			if (validatedChange.result !== RangeValidationResultKind.Valid) {
				return validatedChange.result !== RangeValidationResultKind.PlacesInDifferentTraits &&
					validatedChange.result !== RangeValidationResultKind.Inverted &&
					validatedChange.result.placeFailure !== PlaceValidationResult.Malformed
					? change.effect === ConstraintEffect.ValidRetry
						? Result.ok(state.view)
						: Result.error({
								status: EditStatus.Invalid,
								failure: {
									kind: FailureKind.ConstraintViolation,
									constraint: change,
									violation: {
										kind: ConstraintViolationKind.BadRange,
										rangeFailure: validatedChange.result,
									},
								},
						  })
					: Result.error({
							status: EditStatus.Malformed,
							failure: {
								kind: FailureKind.ConstraintViolation,
								constraint: change,
								violation: {
									kind: ConstraintViolationKind.BadRange,
									rangeFailure: validatedChange.result,
								},
							},
					  });
			}

			const { start, end } = rangeFromStableRange(state.view, validatedChange);
			const startIndex = state.view.findIndexWithinTrait(start);
			const endIndex = state.view.findIndexWithinTrait(end);

			if (change.length !== undefined && change.length !== endIndex - startIndex) {
				return Result.error({
					status: EditStatus.Invalid,
					failure: {
						kind: FailureKind.ConstraintViolation,
						constraint: change,
						violation: {
							kind: ConstraintViolationKind.BadLength,
							actual: endIndex - startIndex,
						},
					},
				});
			}

			if (change.parentNode !== undefined && change.parentNode !== end.trait.parent) {
				return Result.error({
					status: EditStatus.Invalid,
					failure: {
						kind: FailureKind.ConstraintViolation,
						constraint: change,
						violation: {
							kind: ConstraintViolationKind.BadParent,
							actual: change.parentNode,
						},
					},
				});
			}

			if (change.label !== undefined && change.label !== end.trait.label) {
				return Result.error({
					status: EditStatus.Invalid,
					failure: {
						kind: FailureKind.ConstraintViolation,
						constraint: change,
						violation: {
							kind: ConstraintViolationKind.BadLabel,
							actual: end.trait.label,
						},
					},
				});
			}

			return Result.ok(state.view);
		}

		private applySetValue(state: ValidState, change: SetValueInternal): ChangeResult {
			if (!state.view.hasNode(change.nodeToModify)) {
				return Result.error({
					status: EditStatus.Invalid,
					failure: { kind: FailureKind.UnknownId, change, id: change.nodeToModify },
				});
			}

			const newView = state.view.setNodeValue(change.nodeToModify, change.payload);
			return Result.ok(newView);
		}

		/**
		 * Generates tree view nodes from the supplied edit nodes.
		 * Invokes onCreateNode for each new node, and halts creation early if it returns true.
		 * Invokes onInvalidDetachedId and halts early for any invalid detached IDs referenced in the edit node sequence.
		 * @returns all the top-level node IDs in `sequence` (both from nodes and from detached sequences).
		 */
		protected createViewNodesForTree(
			sequence: Iterable<BuildNodeInternal>,
			onCreateNode: (stableId: NodeId, node: TreeViewNode) => boolean,
			onInvalidDetachedId: (sequenceId: DetachedSequenceId) => void
		): NodeId[] | undefined {
			const topLevelIds: NodeId[] = [];
			const unprocessed: BuildNodeInternal[] = [];
			for (const buildNode of sequence) {
				if (isDetachedSequenceId(buildNode)) {
					const detachedIds = this.getDetachedNodeIds(buildNode, onInvalidDetachedId);
					if (detachedIds === undefined) {
						return undefined;
					}
					topLevelIds.push(...detachedIds);
				} else {
					unprocessed.push(buildNode);
					topLevelIds.push(buildNode.identifier);
				}
			}
			while (unprocessed.length > 0) {
				const node = unprocessed.pop();
				assertWithMessage(node !== undefined && !isDetachedSequenceId(node));
				const traits = new Map<TraitLabel, readonly NodeId[]>();
				// eslint-disable-next-line no-restricted-syntax
				for (const key in node.traits) {
					if (Object.prototype.hasOwnProperty.call(node.traits, key)) {
						const children = node.traits[key];
						if (children.length > 0) {
							const childIds: NodeId[] = [];
							for (const child of children) {
								if (isDetachedSequenceId(child)) {
									const detachedIds = this.getDetachedNodeIds(child, onInvalidDetachedId);
									if (detachedIds === undefined) {
										return undefined;
									}
									childIds.push(...detachedIds);
								} else {
									childIds.push(child.identifier);
									unprocessed.push(child);
								}
							}
							traits.set(key as TraitLabel, childIds);
						}
					}
				}
				const newNode: TreeViewNode = {
					identifier: node.identifier,
					definition: node.definition,
					traits,
				};
				copyPropertyIfDefined(node, newNode, 'payload');
				if (onCreateNode(node.identifier, newNode)) {
					return undefined;
				}
			}
			return topLevelIds;
		}

		private getDetachedNodeIds(
			detachedId: DetachedSequenceId,
			onInvalidDetachedId: (sequenceId: DetachedSequenceId) => void
		): readonly NodeId[] | undefined {
			// Retrieve the detached sequence from the void.
			const detachedNodeIds = this.detached.get(detachedId);
			if (detachedNodeIds === undefined) {
				onInvalidDetachedId(detachedId);
				return undefined;
			}
			// Since we have retrieved the sequence, remove it from the void to prevent a second tree from multi-parenting it later
			this.detached.delete(detachedId);
			return detachedNodeIds;
		}
	}

	/**
	 * The kinds of failures that a transaction might encounter.
	 * @alpha
	 */
	export enum FailureKind {
		/**
		 * Transaction has an unused DetachedSequenceId
		 */
		UnusedDetachedSequence = 'UnusedDetachedSequence',
		/**
		 * Transaction has a build operation using an already in use DetachedSequenceID.
		 */
		DetachedSequenceIdAlreadyInUse = 'DetachedSequenceIdAlreadyInUse',
		/**
		 * Transaction tries to operate on an unknown DetachedSequenceID
		 */
		DetachedSequenceNotFound = 'DetachedSequenceNotFound',
		/**
		 * Transaction has a build which uses a duplicated NodeId
		 */
		DuplicateIdInBuild = 'DuplicateIdInBuild',
		/**
		 * Transaction tries to build a node using an ID which is already used in the current state
		 */
		IdAlreadyInUse = 'IdAlreadyInUse',
		/**
		 * Transaction tries to set value of an unknown node
		 */
		UnknownId = 'UnknownId',
		/**
		 * Transaction tries to insert in an invalid Place
		 */
		BadPlace = 'BadPlace',
		/**
		 * Transaction tries to detach an invalid Range
		 */
		BadRange = 'BadRange',
		/**
		 * Transaction has an invalid constraint
		 */
		ConstraintViolation = 'ConstraintViolation',
	}

	/**
	 * A failure encountered by a transaction.
	 * @alpha
	 */
	export type Failure =
		| UnusedDetachedSequenceFailure
		| DetachedSequenceIdAlreadyInUseFailure
		| DetachedSequenceNotFoundFailure
		| DuplicateIdInBuildFailure
		| IdAlreadyInUseFailure
		| UnknownIdFailure
		| BadPlaceFailure
		| BadRangeFailure
		| ConstraintViolationFailure;

	/**
	 * Error returned when a transaction is closed while there is an unused detached sequence.
	 * @alpha
	 */
	export interface UnusedDetachedSequenceFailure {
		/**
		 * Failure kind (will always be FailureKind.UnusedDetachedSequence)
		 */
		readonly kind: FailureKind.UnusedDetachedSequence;
		/**
		 * The unused DetachedSequenceId
		 */
		readonly sequenceId: DetachedSequenceId;
	}

	/**
	 * Error thrown when a transaction encounters a build operation using an already in use DetachedSequenceID.
	 * @alpha
	 */
	export interface DetachedSequenceIdAlreadyInUseFailure {
		/**
		 * Failure kind (will always be FailureKind.DetachedSequenceIdAlreadyInUse)
		 */
		readonly kind: FailureKind.DetachedSequenceIdAlreadyInUse;
		/**
		 * Faulting Change
		 */
		readonly change: ChangeInternal;
		/**
		 * The DetachedSequenceId that is already in use
		 */
		readonly sequenceId: DetachedSequenceId;
	}

	/**
	 * Error thrown when a transaction tries to operate on an unknown DetachedSequenceID
	 * @alpha
	 */
	export interface DetachedSequenceNotFoundFailure {
		/**
		 * Failure kind (will always be FailureKind.DetachedSequenceNotFound)
		 */
		readonly kind: FailureKind.DetachedSequenceNotFound;
		/**
		 * Faulting Change
		 */
		readonly change: ChangeInternal;
		/**
		 * The DetachedSequenceId that wasn't found
		 */
		readonly sequenceId: DetachedSequenceId;
	}

	/**
	 * Error thrown when a build uses a duplicated NodeId
	 * @alpha
	 */
	export interface DuplicateIdInBuildFailure {
		/**
		 * Failure kind (will always be FailureKind.DuplicateIdInBuild)
		 */
		readonly kind: FailureKind.DuplicateIdInBuild;
		/**
		 * Faulting Change
		 */
		readonly change: ChangeInternal;
		/**
		 * ID of duplicated node
		 */
		readonly id: NodeId;
	}

	/**
	 * Error thrown when a build node ID is already used in the current state
	 * @alpha
	 */
	export interface IdAlreadyInUseFailure {
		/**
		 * Failure kind (will always be FailureKind.IdAlreadyInUse)
		 */
		readonly kind: FailureKind.IdAlreadyInUse;
		/**
		 * Faulting Change
		 */
		readonly change: ChangeInternal;
		/**
		 * ID of already in use node
		 */
		readonly id: NodeId;
	}

	/**
	 * Error thrown when a change is attempted on an unknown NodeId
	 * @alpha
	 */
	export interface UnknownIdFailure {
		/**
		 * Failure kind (will always be FailureKind.UnknownId)
		 */
		readonly kind: FailureKind.UnknownId;
		/**
		 * Faulting Change
		 */
		readonly change: ChangeInternal;
		/**
		 * The unknown ID
		 */
		readonly id: NodeId;
	}

	/**
	 * Error thrown when an insert change uses an invalid Place
	 * @alpha
	 */
	export interface BadPlaceFailure {
		/**
		 * Failure kind (will always be FailureKind.BadPlace)
		 */
		readonly kind: FailureKind.BadPlace;
		/**
		 * Faulting Change
		 */
		readonly change: ChangeInternal;
		/**
		 * The faulting place
		 */
		readonly place: StablePlaceInternal;
		/**
		 * The reason for the failure
		 */
		readonly placeFailure: BadPlaceValidationResult;
	}

	/**
	 * Error thrown when a detach operation is given an invalid or malformed Range
	 * @alpha
	 */
	export interface BadRangeFailure {
		/**
		 * Failure kind (will always be FailureKind.BadRange)
		 */
		readonly kind: FailureKind.BadRange;
		/**
		 * Faulting Change
		 */
		readonly change: ChangeInternal;
		/**
		 * Faulting range
		 */
		readonly range: StableRangeInternal;
		/**
		 * The reason for the failure
		 */
		readonly rangeFailure: BadRangeValidationResult;
	}

	/**
	 * Error thrown when a constraint fails to apply
	 * @alpha
	 */
	export interface ConstraintViolationFailure {
		/**
		 * Failure kind (will always be FailureKind.ConstraintViolation)
		 */
		readonly kind: FailureKind.ConstraintViolation;
		/**
		 * Faulting Change
		 */
		readonly constraint: ConstraintInternal;
		/**
		 * The first violation the constraint encounters (there may be others).
		 */
		readonly violation: ConstraintViolationResult;
	}

	/**
	 * The details of what kind of constraint was violated and caused a ConstraintViolationFailure error to occur
	 * @alpha
	 */
	export type ConstraintViolationResult =
		| {
				readonly kind: ConstraintViolationKind.BadRange;
				readonly rangeFailure: BadRangeValidationResult;
		  }
		| {
				readonly kind: ConstraintViolationKind.BadLength;
				readonly actual: number;
		  }
		| {
				readonly kind: ConstraintViolationKind.BadParent;
				readonly actual: NodeId;
		  }
		| {
				readonly kind: ConstraintViolationKind.BadLabel;
				readonly actual: TraitLabel;
		  };

	/**
	 * Enum of possible kinds of constraint violations that can be encountered
	 * @alpha
	 */
	export enum ConstraintViolationKind {
		/**
		 * The constraint failed because it applies to an invalid range
		 */
		BadRange = 'BadRange',
		/**
		 * The constraint failed because the length prescribed by the constraint does not match the length of range being constrained
		 */
		BadLength = 'BadLength',
		/**
		 * The constraint failed because the parent prescribed by the constraint does not match the actual parent of the range being constrained
		 */
		BadParent = 'BadParent',
		/**
		 * The constraint failed because the trait label prescribed by the constraint does not match the actual trait label of the range being constrained
		 */
		BadLabel = 'BadLabel',
	}
}
