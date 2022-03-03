/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, copyPropertyIfDefined, fail, Result } from '../Common';
import { NodeId, DetachedSequenceId, TraitLabel, StableNodeId } from '../Identifiers';
import {
	GenericTransaction,
	EditStatus,
	ChangeResult,
	GenericTransactionPolicy,
	SucceedingTransactionState,
	RevisionView,
	TreeViewNode,
	NodeIdConverter,
} from '../generic';
import { rangeFromStableRange } from '../TreeViewUtilities';
import {
	BuildInternal,
	BuildNodeInternal,
	ChangeInternal,
	ChangeTypeInternal,
	ConstraintEffect,
	ConstraintInternal,
	DetachInternal,
	InsertInternal,
	SetValueInternal,
	StablePlace_0_0_2,
	StableRange_0_0_2,
} from './PersistedTypes';
import {
	detachRange,
	insertIntoTrait,
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
 * @public
 */
export namespace Transaction {
	/**
	 * Makes a new {@link GenericTransaction} that follows the {@link Transaction.Policy} policy.
	 */
	export function factory(
		view: RevisionView,
		nodeIdConverter: NodeIdConverter
	): GenericTransaction<ChangeInternal, Failure> {
		return new GenericTransaction(view, new Policy(nodeIdConverter));
	}

	type ValidState = SucceedingTransactionState<ChangeInternal>;

	/**
	 * The policy followed by a {@link Transaction}.
	 */
	export class Policy implements GenericTransactionPolicy<ChangeInternal, Failure> {
		/**
		 * Maps detached sequences of nodes to their NodeIds
		 */
		protected readonly detached: Map<DetachedSequenceId, readonly NodeId[]> = new Map();

		/**
		 * @param nodeIdManager - Used for node creation and identifier conversion
		 */
		public constructor(protected readonly nodeIdConverter: NodeIdConverter) {}

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

		/**
		 * Applies a given change
		 *
		 * @param state - Current state
		 * @param change - Change to apply
		 * @returns a {@link ChangeResult} containing either the change result or a Failure
		 */
		public dispatchChange(state: ValidState, change: ChangeInternal): ChangeResult<Failure> {
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

		private applyBuild(state: ValidState, change: BuildInternal): ChangeResult<Failure> {
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

			let idAlreadyPresent: StableNodeId | undefined;
			let duplicateIdInBuild: StableNodeId | undefined;
			let invalidId: StableNodeId | undefined;
			let detachedSequenceNotFound: DetachedSequenceId | undefined;
			const map = new Map<StableNodeId, TreeViewNode>();
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
				(stableId) => {
					invalidId = stableId;
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

		private applyInsert(state: ValidState, change: InsertInternal): ChangeResult<Failure> {
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

			const validatedDestination = validateStablePlace(state.view, change.destination, this.nodeIdConverter);
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

		private applyDetach(state: ValidState, change: DetachInternal): ChangeResult<Failure> {
			const validatedSource = validateStableRange(state.view, change.source, this.nodeIdConverter);
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

		private applyConstraint(state: ValidState, change: ConstraintInternal): ChangeResult<Failure> {
			// TODO: Implement identityHash and contentHash
			assert(change.identityHash === undefined, 'identityHash constraint is not implemented');
			assert(change.contentHash === undefined, 'contentHash constraint is not implemented');

			const validatedChange = validateStableRange(state.view, change.toConstrain, this.nodeIdConverter);
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

			const parentId = this.nodeIdConverter.convertToStableNodeId(end.trait.parent);
			if (change.parentNode !== undefined && change.parentNode !== parentId) {
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

		private applySetValue(state: ValidState, change: SetValueInternal): ChangeResult<Failure> {
			const nodeToModify = this.nodeIdConverter.tryConvertToNodeId(change.nodeToModify);
			if (nodeToModify === undefined || !state.view.hasNode(nodeToModify)) {
				return Result.error({
					status: EditStatus.Invalid,
					failure: { kind: FailureKind.UnknownId, change, id: change.nodeToModify },
				});
			}

			const newView = state.view.setNodeValue(nodeToModify, change.payload);
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
			onCreateNode: (stableId: StableNodeId, node: TreeViewNode) => boolean,
			onInvalidId: (stableId: StableNodeId) => void,
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
					const nodeId = this.nodeIdConverter.tryConvertToNodeId(buildNode.identifier);
					if (nodeId === undefined) {
						onInvalidId(buildNode.identifier);
						return undefined;
					}
					topLevelIds.push(nodeId);
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
									const nodeId = this.nodeIdConverter.tryConvertToNodeId(child.identifier);
									if (nodeId === undefined) {
										onInvalidId(child.identifier);
										return undefined;
									}
									childIds.push(nodeId);
									unprocessed.push(child);
								}
							}
							traits.set(key as TraitLabel, childIds);
						}
					}
				}
				const identifier = this.nodeIdConverter.tryConvertToNodeId(node.identifier);
				if (identifier === undefined) {
					onInvalidId(node.identifier);
					return undefined;
				}
				const newNode: TreeViewNode = {
					identifier,
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
		readonly id: StableNodeId;
	}

	/**
	 * Error thrown when a build node ID is already used in the current state
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
		readonly id: StableNodeId;
	}

	/**
	 * Error thrown when a change is attempted on an unknown NodeId
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
		readonly id: StableNodeId;
	}

	/**
	 * Error thrown when an insert change uses an invalid Place
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
		readonly place: StablePlace_0_0_2;
		/**
		 * The reason for the failure
		 */
		readonly placeFailure: BadPlaceValidationResult;
	}

	/**
	 * Error thrown when a detach operation is given an invalid or malformed Range
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
		readonly range: StableRange_0_0_2;
		/**
		 * The reason for the failure
		 */
		readonly rangeFailure: BadRangeValidationResult;
	}

	/**
	 * Error thrown when a constraint fails to apply
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
				readonly actual: StableNodeId;
		  }
		| {
				readonly kind: ConstraintViolationKind.BadLabel;
				readonly actual: TraitLabel;
		  };

	/**
	 * Enum of possible kinds of constraint violations that can be encountered
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
