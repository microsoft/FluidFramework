/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from './Common';
import { DetachedSequenceId, NodeId, TraitLabel } from './Identifiers';
import {
	EditResult,
	Build,
	Change,
	ChangeType,
	Detach,
	EditNode,
	Insert,
	TreeNode,
	Constraint,
	ConstraintEffect,
	SetValue,
	Payload,
} from './PersistedTypes';
import { EditValidationResult, SnapshotNode, Snapshot } from './Snapshot';

// eslint-disable-next-line import/no-unused-modules
export type EditingResult =
	| { result: EditResult.Invalid | EditResult.Malformed; changes: readonly Change[] }
	| { result: EditResult.Applied; changes: readonly Change[]; snapshot: Snapshot };

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
export class Transaction {
	private _view: Snapshot;
	private _result: EditResult = EditResult.Applied;
	private readonly changes: Change[] = [];
	private readonly detached: Map<DetachedSequenceId, readonly NodeId[]> = new Map();
	private isOpen = true;

	/**
	 * Create and open an edit of the provided `Snapshot`. After applying 0 or more changes, this editor should be closed via `close()`.
	 * @param view - the `Snapshot` at which this edit begins. The first change will be applied against this view.
	 */
	public constructor(view: Snapshot) {
		this._view = view;
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
	public close(): EditingResult {
		assert(this.isOpen, 'transaction has already been closed');
		this.isOpen = false;
		if (this.result === EditResult.Applied) {
			// Making the policy choice that storing a detached sequences in an edit but not using it is an error.
			this._result = this.detached.size !== 0 ? EditResult.Malformed : EditResult.Applied;
		}

		if (this.result === EditResult.Applied) {
			return {
				result: EditResult.Applied,
				snapshot: this._view,
				changes: this.changes,
			};
		}
		return {
			result: this.result,
			changes: this.changes,
		};
	}

	/**
	 * A helper to apply a sequence of changes. Changes will be applied one after the other. If a change fails to apply,
	 * the remaining changes in `changes` will be ignored.
	 * @param changes - the sequence of changes to apply
	 * @returns this
	 */
	public applyChanges(changes: Iterable<Change>): this {
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
	public applyChange(change: Change): this {
		assert(this.isOpen, 'Editor must be open to apply changes.');
		if (this.result !== EditResult.Applied) {
			fail('Cannot apply change to an edit unless all previous changes have applied');
		}

		this.changes.push(change);
		this._result = this.dispatchChange(change);
		return this;
	}

	private dispatchChange(change: Change): EditResult {
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

	private applyBuild(change: Build): EditResult {
		if (this.detached.has(change.destination)) {
			return EditResult.Malformed;
		}

		const map = new Map<NodeId, SnapshotNode>();
		let detachedSequenceNotFound = false;
		const newIds = [
			...this.createSnapshotNodesForTree(change.source, map, () => {
				detachedSequenceNotFound = true;
			}),
		];
		if (detachedSequenceNotFound) {
			return EditResult.Malformed;
		}
		let duplicateId = false;
		const view = this.view.mergeWith(map, (old, _new, _key) => {
			duplicateId = true;
			return old;
		});
		if (duplicateId) {
			return EditResult.Invalid;
		}

		this._view = view;
		this.detached.set(change.destination, newIds);
		return EditResult.Applied;
	}

	private applyInsert(change: Insert): EditResult {
		const source = this.detached.get(change.source);
		if (source === undefined) {
			return EditResult.Malformed;
		}

		const destinationChangeResult = this.view.validateStablePlace(change.destination);
		if (destinationChangeResult !== EditValidationResult.Valid) {
			return destinationChangeResult === EditValidationResult.Invalid ? EditResult.Invalid : EditResult.Malformed;
		}

		this.detached.delete(change.source);
		const place = this.view.placeFromStablePlace(change.destination);
		const nodes = this.view.getTrait(place.trait);
		const index = this.view.findIndexWithinTrait(place);
		const newNodes = [...nodes.slice(0, index), ...source, ...nodes.slice(index)];
		this._view = this.view.updateTraitContents(place.trait, newNodes);

		return EditResult.Applied;
	}

	private applyDetach(change: Detach): EditResult {
		const sourceChangeResult = this.view.validateStableRange(change.source);
		if (sourceChangeResult !== EditValidationResult.Valid) {
			return sourceChangeResult === EditValidationResult.Invalid ? EditResult.Invalid : EditResult.Malformed;
		}

		const { start, end } = this.view.rangeFromStableRange(change.source);
		const { trait: traitLocation } = start;
		const nodes = this.view.getTrait(traitLocation);

		const startIndex = this.view.findIndexWithinTrait(start);
		const endIndex = this.view.findIndexWithinTrait(end);

		const detached: NodeId[] = nodes.slice(startIndex, endIndex);
		const keep = [...nodes.slice(0, startIndex), ...nodes.slice(endIndex)];

		let modifiedView = this.view.updateTraitContents(traitLocation, keep);

		// Store or dispose detached
		if (change.destination !== undefined) {
			if (this.detached.has(change.destination)) {
				return EditResult.Malformed;
			}
			this.detached.set(change.destination, detached);
		} else {
			modifiedView = modifiedView.deleteNodes(detached);
		}

		this._view = modifiedView;
		return EditResult.Applied;
	}

	private applyConstraint(change: Constraint): EditResult {
		// TODO: Implement identityHash and contentHash
		assert(change.identityHash === undefined, 'identityHash constraint is not implemented');
		assert(change.contentHash === undefined, 'contentHash constraint is not implemented');

		const sourceChangeResult = this.view.validateStableRange(change.toConstrain);
		const onViolation = change.effect === ConstraintEffect.ValidRetry ? EditResult.Applied : EditResult.Invalid;
		if (sourceChangeResult !== EditValidationResult.Valid) {
			return sourceChangeResult === EditValidationResult.Invalid ? onViolation : EditResult.Malformed;
		}

		const { start, end } = this.view.rangeFromStableRange(change.toConstrain);
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

		return EditResult.Applied;
	}

	private applySetValue(change: SetValue): EditResult {
		if (!this.view.hasNode(change.nodeToModify)) {
			return EditResult.Invalid;
		}

		const node = this.view.getSnapshotNode(change.nodeToModify);
		const { payload } = change;
		let payloadToSet: Payload | undefined;
		if (payload === null) {
			payloadToSet = undefined;
		} else {
			if (typeof payload.base64 !== 'string') {
				return EditResult.Malformed;
			}
			payloadToSet = { base64: payload.base64 };
		}
		const newNode: SnapshotNode = { ...node, payload: payloadToSet };
		this._view = this.view.replaceNode(change.nodeToModify, newNode);
		return EditResult.Applied;
	}

	private createSnapshotNodeForTree(
		node: TreeNode<EditNode>,
		map: Map<NodeId, SnapshotNode>,
		onInvalidDetachedId: () => void
	): NodeId {
		const traits = new Map<TraitLabel, readonly NodeId[]>();
		// eslint-disable-next-line no-restricted-syntax
		for (const key in node.traits) {
			if (Object.prototype.hasOwnProperty.call(node.traits, key)) {
				const element = node.traits[key];
				traits.set(key as TraitLabel, [...this.createSnapshotNodesForTree(element, map, onInvalidDetachedId)]);
			}
		}

		const newNode: SnapshotNode = {
			identifier: node.identifier,
			payload: node.payload,
			definition: node.definition,
			traits,
		};

		map.set(newNode.identifier, newNode);
		return newNode.identifier;
	}

	private *createSnapshotNodesForTree(
		sequence: Iterable<EditNode>,
		map: Map<NodeId, SnapshotNode>,
		onInvalidDetachedId: () => void
	): Iterable<NodeId> {
		function isDetachedSequenceId(node: EditNode): node is DetachedSequenceId {
			return typeof node !== 'object';
		}

		for (const node of sequence) {
			if (isDetachedSequenceId(node)) {
				// Retrieve the detached sequence from the void.
				const detachedNodeIds = this.detached.get(node);
				if (detachedNodeIds === undefined) {
					onInvalidDetachedId();
					break;
				}
				// Since we have retrieved the sequence, remove it from the void to prevent a second tree from multiparenting it later
				this.detached.delete(node);
				yield* detachedNodeIds;
			} else {
				yield this.createSnapshotNodeForTree(node, map, onInvalidDetachedId);
			}
		}
	}
}
