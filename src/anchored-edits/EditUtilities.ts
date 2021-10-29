/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// All types imported into this file inherit the requirements documented below.
// These imports are ok because they consist only of type aliases for primitive types,
// and thus have no impact on serialization as long as the primitive type they are an alias for does not change.
// This does mean that the various UuidString types must remain strings, and must never change the format unless the process for changing
// persisted types (as documented below) is followed.
import { DetachedSequenceId, NodeId, TraitLabel, UuidString } from '../Identifiers';
import { BuildNode, Payload, TreeNodeSequence } from '../generic';
import { ConstraintEffect, Build, Change, Detach, Insert, Move, SetValue, Constraint } from '../default-edits';
import { NodeAnchor, PlaceAnchor, RangeAnchor } from './PersistedTypes';

/**
 * A change that composes an Edit.
 *
 * `Change` objects can be conveniently constructed with the helper methods exported on a constant of the same name.
 * @example
 * Change.insert(sourceId, destination)
 * @public
 */
export type AnchoredChange = AnchoredInsert | AnchoredDetach | Build | AnchoredSetValue | AnchoredConstraint;

/**
 * Inserts a sequence of nodes at the specified destination.
 * The source can be constructed either by a Build (used to insert new nodes) or a Detach (amounts to a "move" operation).
 * @public
 */
export interface AnchoredInsert extends Insert {
	readonly destination: PlaceAnchor;
}

/**
 * Removes a sequence of nodes from the tree.
 * If a destination is specified, the detached sequence is associated with that ID and held for possible reuse
 * by later changes in this same Edit (such as by an Insert).
 * A Detach without a destination is a deletion of the specified sequence, as is a Detach with a destination that is not used later.
 * @public
 */
export interface AnchoredDetach extends Detach {
	readonly source: RangeAnchor;
}

/**
 * Modifies the payload of a node.
 * @public
 */
export interface AnchoredSetValue extends SetValue {
	readonly nodeToModify: NodeAnchor;
}

/**
 * A set of constraints on the validity of an Edit.
 * A Constraint is used to detect when an Edit, due to other concurrent edits, may have unintended effects or merge in
 * non-semantic ways. It is processed in order like any other Change in an Edit. It can cause an edit to fail if the
 * various constraints are not met at the time of evaluation (ex: the parentNode has changed due to concurrent editing).
 * Does not modify the document.
 * @public
 */
export interface AnchoredConstraint extends Constraint {
	/**
	 * Selects a sequence of nodes which will be checked against the constraints specified by the optional fields.
	 * If `toConstrain` is invalid, it will be treated like a constraint being unmet.
	 * Depending on `effect` this may or may not make the Edit invalid.
	 *
	 * When a constraint is not met, the effects is specified by `effect`.
	 */
	readonly toConstrain: RangeAnchor;
}

// Note: Documentation of this constant is merged with documentation of the `AnchoredChange` interface.
/**
 * @public
 */
export const AnchoredChange = {
	build: Change.build,
	insert: Change.insert as (source: DetachedSequenceId, destination: PlaceAnchor) => AnchoredInsert,
	detach: Change.detach as (source: RangeAnchor, destination?: DetachedSequenceId) => AnchoredDetach,
	setPayload: Change.setPayload as (nodeToModify: NodeAnchor, payload: Payload) => AnchoredSetValue,
	clearPayload: Change.clearPayload as (nodeToModify: NodeAnchor) => AnchoredSetValue,
	constraint: Change.constraint as (
		toConstrain: RangeAnchor,
		effect: ConstraintEffect,
		identityHash?: UuidString,
		length?: number,
		contentHash?: UuidString,
		parentNode?: NodeId,
		label?: TraitLabel
	) => AnchoredConstraint,
};

/**
 * Helper for creating a `Delete` edit.
 * @public
 */
export const AnchoredDelete = {
	/**
	 * @returns an AnchoredChange that deletes the supplied part of the tree.
	 */
	create: (rangeAnchor: RangeAnchor): AnchoredChange => AnchoredChange.detach(rangeAnchor),
};

/**
 * Helper for creating an `Insert` edit.
 * @public
 */
export const AnchoredInsert = {
	/**
	 * @returns an AnchoredChange that inserts 'nodes' into the specified location in the tree.
	 */
	create: Insert.create as (nodes: TreeNodeSequence<BuildNode>, destination: PlaceAnchor) => AnchoredChange[],
};

/**
 * Helper for creating a `Move` edit.
 * @public
 */
export const AnchoredMove = {
	/**
	 * @returns an AnchoredChange that moves the specified content to a new location in the tree.
	 */
	create: Move.create as (source: RangeAnchor, destination: PlaceAnchor) => AnchoredChange[],
};
