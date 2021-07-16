/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, copyPropertyIfDefined, fail } from '../Common';
import { NodeId, DetachedSequenceId, TraitLabel } from '../Identifiers';
import { GenericTransaction, BuildNode, EditStatus } from '../generic';
import { RevisionView, TreeViewNode } from '../TreeView';
import { EditValidationResult } from '../Checkout';
import { Build, Change, ChangeType, Constraint, ConstraintEffect, Detach, Insert, SetValue } from './PersistedTypes';
import {
	detachRange,
	insertIntoTrait,
	rangeFromStableRange,
	validateStablePlace,
	validateStableRange,
	isDetachedSequenceId,
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
export class Transaction extends GenericTransaction<Change> {
	protected readonly detached: Map<DetachedSequenceId, readonly NodeId[]> = new Map();

	public static factory(view: RevisionView): Transaction {
		return new Transaction(view);
	}

	protected validateOnClose(): EditStatus {
		// Making the policy choice that storing a detached sequences in an edit but not using it is an error.
		return this.detached.size !== 0 ? EditStatus.Malformed : EditStatus.Applied;
	}

	protected dispatchChange(change: Change): EditStatus {
		switch (change.type) {
			case ChangeType.Build:
				return this.applyBuild(change);
			case ChangeType.Insert:
				return this.applyInsert(change);
			case ChangeType.Detach:
				return this.applyDetach(change);
			case ChangeType.Constraint:
				return this.applyConstraint(change);
			case ChangeType.SetValue:
				return this.applySetValue(change);
			default:
				return fail('Attempted to apply unsupported change');
		}
	}

	private applyBuild(change: Build): EditStatus {
		if (this.detached.has(change.destination)) {
			return EditStatus.Malformed;
		}

		let idAlreadyPresent = false;
		let duplicateIdInBuild = false;
		const map = new Map<NodeId, TreeViewNode>();
		let detachedSequenceNotFound = false;
		const newIds = this.createViewNodesForTree(
			change.source,
			(id, viewNode) => {
				if (map.has(id)) {
					duplicateIdInBuild = true;
					return true;
				}
				if (this.view.hasNode(id)) {
					idAlreadyPresent = true;
					return true;
				}
				map.set(id, viewNode);
				return false;
			},
			() => {
				detachedSequenceNotFound = true;
			}
		);

		if (detachedSequenceNotFound || duplicateIdInBuild) {
			return EditStatus.Malformed;
		}
		if (idAlreadyPresent) {
			return EditStatus.Invalid;
		}

		const view = this.view.addNodes(map.values());
		this._view = view;
		this.detached.set(change.destination, newIds ?? fail());
		return EditStatus.Applied;
	}

	private applyInsert(change: Insert): EditStatus {
		const source = this.detached.get(change.source);
		if (source === undefined) {
			return EditStatus.Malformed;
		}

		const destinationChangeResult = validateStablePlace(this.view, change.destination);
		if (destinationChangeResult !== EditValidationResult.Valid) {
			return destinationChangeResult === EditValidationResult.Invalid ? EditStatus.Invalid : EditStatus.Malformed;
		}

		this.detached.delete(change.source);
		this._view = insertIntoTrait(this.view, source, change.destination);
		return EditStatus.Applied;
	}

	private applyDetach(change: Detach): EditStatus {
		const sourceChangeResult = validateStableRange(this.view, change.source);
		if (sourceChangeResult !== EditValidationResult.Valid) {
			return sourceChangeResult === EditValidationResult.Invalid ? EditStatus.Invalid : EditStatus.Malformed;
		}

		const result = detachRange(this.view, change.source);
		let modifiedView = result.view;
		const { detached } = result;

		// Store or dispose detached
		if (change.destination !== undefined) {
			if (this.detached.has(change.destination)) {
				return EditStatus.Malformed;
			}
			this.detached.set(change.destination, detached);
		} else {
			modifiedView = modifiedView.deleteNodes(detached);
		}

		this._view = modifiedView;
		return EditStatus.Applied;
	}

	private applyConstraint(change: Constraint): EditStatus {
		// TODO: Implement identityHash and contentHash
		assert(change.identityHash === undefined, 'identityHash constraint is not implemented');
		assert(change.contentHash === undefined, 'contentHash constraint is not implemented');

		const sourceChangeResult = validateStableRange(this.view, change.toConstrain);
		const onViolation = change.effect === ConstraintEffect.ValidRetry ? EditStatus.Applied : EditStatus.Invalid;
		if (sourceChangeResult !== EditValidationResult.Valid) {
			return sourceChangeResult === EditValidationResult.Invalid ? onViolation : EditStatus.Malformed;
		}

		const { start, end } = rangeFromStableRange(this.view, change.toConstrain);
		const startIndex = this.view.findIndexWithinTrait(start);
		const endIndex = this.view.findIndexWithinTrait(end);

		if (change.length !== undefined && change.length !== endIndex - startIndex) {
			return onViolation;
		}

		if (change.parentNode !== undefined && change.parentNode !== end.trait.parent) {
			return onViolation;
		}

		if (change.label !== undefined && change.label !== end.trait.label) {
			return onViolation;
		}

		return EditStatus.Applied;
	}

	private applySetValue(change: SetValue): EditStatus {
		if (!this.view.hasNode(change.nodeToModify)) {
			return EditStatus.Invalid;
		}

		this._view = this.view.setNodeValue(change.nodeToModify, change.payload);
		return EditStatus.Applied;
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
		onInvalidDetachedId: () => void
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
		onInvalidDetachedId: () => void
	): readonly NodeId[] | undefined {
		// Retrieve the detached sequence from the void.
		const detachedNodeIds = this.detached.get(detachedId);
		if (detachedNodeIds === undefined) {
			onInvalidDetachedId();
			return undefined;
		}
		// Since we have retrieved the sequence, remove it from the void to prevent a second tree from multi-parenting it later
		this.detached.delete(detachedId);
		return detachedNodeIds;
	}
}
