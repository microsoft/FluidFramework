/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, copyPropertyIfDefined, fail, Result } from '../Common';
import { NodeId, DetachedSequenceId, TraitLabel } from '../Identifiers';
import {
	GenericTransaction,
	BuildNode,
	EditStatus,
	ChangeResult,
	GenericTransactionPolicy,
	SucceedingTransactionState,
} from '../generic';
import { RevisionView, TreeViewNode } from '../TreeView';
import {
	Build,
	Change,
	ChangeType,
	Constraint,
	ConstraintEffect,
	Detach,
	Insert,
	SetValue,
	StablePlace,
	StableRange,
} from './PersistedTypes';
import {
	detachRange,
	insertIntoTrait,
	rangeFromStableRange,
	validateStablePlace,
	validateStableRange,
	isDetachedSequenceId,
	BadPlaceValidationResult,
	BadRangeValidationResult,
	PlaceValidationResult,
	RangeValidationResultKind,
} from './EditUtilities';

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
export namespace Transaction {
	/**
	 * Makes a new {@link GenericTransaction} that follows the {@link Transaction.Policy} policy.
	 */
	export function factory(view: RevisionView): GenericTransaction<Change, Failure> {
		return new GenericTransaction(view, new Policy());
	}

	type ValidState = SucceedingTransactionState<Change>;

	/**
	 * The policy followed by a {@link Transaction}.
	 */
	export class Policy implements GenericTransactionPolicy<Change, Failure> {
		protected readonly detached: Map<DetachedSequenceId, readonly NodeId[]> = new Map();

		public tryResolveChange(state: ValidState, change: Change): Result.Ok<Change> {
			return Result.ok(change);
		}

		public validateOnClose(state: ValidState): ChangeResult<Failure> {
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

		public dispatchChange(state: ValidState, change: Change): ChangeResult<Failure> {
			switch (change.type) {
				case ChangeType.Build:
					return this.applyBuild(state, change);
				case ChangeType.Insert:
					return this.applyInsert(state, change);
				case ChangeType.Detach:
					return this.applyDetach(state, change);
				case ChangeType.Constraint:
					return this.applyConstraint(state, change);
				case ChangeType.SetValue:
					return this.applySetValue(state, change);
				default:
					return fail('Attempted to apply unsupported change');
			}
		}

		private applyBuild(state: ValidState, change: Build): ChangeResult<Failure> {
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
			let detachedSequenceNotFound: DetachedSequenceId | undefined;
			const map = new Map<NodeId, TreeViewNode>();
			const newIds = this.createViewNodesForTree(
				change.source,
				(id, viewNode) => {
					if (map.has(id)) {
						duplicateIdInBuild = id;
						return true;
					}
					if (state.view.hasNode(id)) {
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
			if (duplicateIdInBuild !== undefined) {
				return Result.error({
					status: EditStatus.Malformed,
					failure: { kind: FailureKind.DuplicateIdInBuild, change, id: duplicateIdInBuild },
				});
			}
			if (idAlreadyPresent !== undefined) {
				return Result.error({
					status: EditStatus.Invalid,
					failure: { kind: FailureKind.IdAlreadyInUse, change, id: idAlreadyPresent },
				});
			}

			const view = state.view.addNodes(map.values());
			this.detached.set(change.destination, newIds ?? fail());
			return Result.ok(view);
		}

		private applyInsert(state: ValidState, change: Insert): ChangeResult<Failure> {
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

			const destinationChangeResult = validateStablePlace(state.view, change.destination);
			if (destinationChangeResult !== PlaceValidationResult.Valid) {
				return Result.error({
					status:
						destinationChangeResult === PlaceValidationResult.Malformed
							? EditStatus.Malformed
							: EditStatus.Invalid,
					failure: {
						kind: FailureKind.BadPlace,
						change,
						place: change.destination,
						placeFailure: destinationChangeResult,
					},
				});
			}

			this.detached.delete(change.source);
			const view = insertIntoTrait(state.view, source, change.destination);
			return Result.ok(view);
		}

		private applyDetach(state: ValidState, change: Detach): ChangeResult<Failure> {
			const sourceChangeResult = validateStableRange(state.view, change.source);
			if (sourceChangeResult !== RangeValidationResultKind.Valid) {
				return Result.error({
					status:
						sourceChangeResult === RangeValidationResultKind.PlacesInDifferentTraits ||
						sourceChangeResult === RangeValidationResultKind.Inverted ||
						sourceChangeResult.placeFailure !== PlaceValidationResult.Malformed
							? EditStatus.Invalid
							: EditStatus.Malformed,
					failure: {
						kind: FailureKind.BadRange,
						change,
						range: change.source,
						rangeFailure: sourceChangeResult,
					},
				});
			}

			const result = detachRange(state.view, change.source);
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

		private applyConstraint(state: ValidState, change: Constraint): ChangeResult<Failure> {
			// TODO: Implement identityHash and contentHash
			assert(change.identityHash === undefined, 'identityHash constraint is not implemented');
			assert(change.contentHash === undefined, 'contentHash constraint is not implemented');

			const sourceChangeResult = validateStableRange(state.view, change.toConstrain);
			if (sourceChangeResult !== RangeValidationResultKind.Valid) {
				return sourceChangeResult !== RangeValidationResultKind.PlacesInDifferentTraits &&
					sourceChangeResult !== RangeValidationResultKind.Inverted &&
					sourceChangeResult.placeFailure !== PlaceValidationResult.Malformed
					? change.effect === ConstraintEffect.ValidRetry
						? Result.ok(state.view)
						: Result.error({
								status: EditStatus.Invalid,
								failure: {
									kind: FailureKind.ConstraintViolation,
									constraint: change,
									violation: {
										kind: ConstraintViolationKind.BadRange,
										rangeFailure: sourceChangeResult,
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
									rangeFailure: sourceChangeResult,
								},
							},
					  });
			}

			const { start, end } = rangeFromStableRange(state.view, change.toConstrain);
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
							actual: end.trait.parent,
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

		private applySetValue(state: ValidState, change: SetValue): ChangeResult<Failure> {
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
			sequence: Iterable<BuildNode>,
			onCreateNode: (id: NodeId, node: TreeViewNode) => boolean,
			onInvalidDetachedId: (sequenceId: DetachedSequenceId) => void
		): NodeId[] | undefined {
			const topLevelIds: NodeId[] = [];
			const unprocessed: BuildNode[] = [];
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
				assert(node !== undefined && !isDetachedSequenceId(node));
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
				if (onCreateNode(newNode.identifier, newNode)) {
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
	 */
	export enum FailureKind {
		UnusedDetachedSequence = 'UnusedDetachedSequence',
		DetachedSequenceIdAlreadyInUse = 'DetachedSequenceIdAlreadyInUse',
		DetachedSequenceNotFound = 'DetachedSequenceNotFound',
		DuplicateIdInBuild = 'DuplicateIdInBuild',
		IdAlreadyInUse = 'IdAlreadyInUse',
		UnknownId = 'UnknownId',
		BadPlace = 'BadPlace',
		BadRange = 'BadRange',
		ConstraintViolation = 'ConstraintViolation',
	}

	/**
	 * A failure encountered by a transaction.
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

	export interface UnusedDetachedSequenceFailure {
		readonly kind: FailureKind.UnusedDetachedSequence;
		readonly sequenceId: DetachedSequenceId;
	}

	export interface DetachedSequenceIdAlreadyInUseFailure {
		readonly kind: FailureKind.DetachedSequenceIdAlreadyInUse;
		readonly change: Change;
		readonly sequenceId: DetachedSequenceId;
	}

	export interface DetachedSequenceNotFoundFailure {
		readonly kind: FailureKind.DetachedSequenceNotFound;
		readonly change: Change;
		readonly sequenceId: DetachedSequenceId;
	}

	export interface DuplicateIdInBuildFailure {
		readonly kind: FailureKind.DuplicateIdInBuild;
		readonly change: Change;
		readonly id: NodeId;
	}

	export interface IdAlreadyInUseFailure {
		readonly kind: FailureKind.IdAlreadyInUse;
		readonly change: Change;
		readonly id: NodeId;
	}

	export interface UnknownIdFailure {
		readonly kind: FailureKind.UnknownId;
		readonly change: Change;
		readonly id: NodeId;
	}

	export interface BadPlaceFailure {
		readonly kind: FailureKind.BadPlace;
		readonly change: Change;
		readonly place: StablePlace;
		readonly placeFailure: BadPlaceValidationResult;
	}

	export interface BadRangeFailure {
		readonly kind: FailureKind.BadRange;
		readonly change: Change;
		readonly range: StableRange;
		readonly rangeFailure: BadRangeValidationResult;
	}

	export interface ConstraintViolationFailure {
		readonly kind: FailureKind.ConstraintViolation;
		readonly constraint: Constraint;
		readonly violation: ConstraintViolationResult;
	}

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

	export enum ConstraintViolationKind {
		BadRange = 'BadRange',
		BadLength = 'BadLength',
		BadParent = 'BadParent',
		BadLabel = 'BadLabel',
	}
}
