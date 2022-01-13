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
import { Side } from '../TreeView';
import { BuildNode, NodeData, Payload, StableTraitLocation, TreeNodeSequence } from '../generic';
import {
	SetValueInternal,
	DetachInternal,
	ConstraintInternal,
	InsertInternal,
	BuildInternal,
	ChangeInternal,
	ConstraintEffect,
	StablePlace,
	StableRange,
	getNodeId,
	MoveInternal,
} from '../default-edits';

/**
 * Types for Edits in Fluid Ops and Fluid summaries.
 *
 * Types describing locations in the tree are stable in the presence of other concurrent edits.
 *
 * All types are compatible with Fluid Serializable.
 *
 * These types can only be modified in ways that are both backwards and forwards compatible since they
 * are used in edits, and thus are persisted (using Fluid serialization).
 *
 * This means these types cannot be changed in any way that impacts their Fluid serialization
 * except through a very careful process:
 *
 * 1. The planned change must support all old data, and maintain the exact semantics of it.
 * This means that the change is pretty much limited to adding optional fields,
 * or making required fields optional.
 * 2. Support for the new format must be deployed to all users (This means all applications using SharedTree must do this),
 * and this deployment must be confirmed to be stable and will not be rolled back.
 * 3. Usage of the new format may start.
 *
 * Support for the old format can NEVER be removed: it must be maintained indefinably or old documents will break.
 * Because this process puts requirements on applications using shared tree,
 * step 3 should only ever be done in a Major version update,
 * and must be explicitly called out in the release notes
 * stating which versions of SharedTree are supported for documents modified by the new version.
 */

/**
 * {@inheritdoc (AnchoredChange:type)}
 * @public
 */
export type AnchoredChangeInternal =
	| AnchoredInsertInternal
	| AnchoredDetachInternal
	| BuildInternal
	| AnchoredSetValueInternal
	| AnchoredConstraintInternal;

/**
 * {@inheritdoc (AnchoredInsert:interface)}
 * @public
 */
export interface AnchoredInsertInternal extends InsertInternal {
	/** {@inheritdoc AnchoredInsert.destination } */
	readonly destination: PlaceAnchor;
}

/**
 * {@inheritdoc AnchoredDetach}
 * @public
 */
export interface AnchoredDetachInternal extends DetachInternal {
	/** {@inheritdoc AnchoredDetach.source } */
	readonly source: RangeAnchor;
}

/**
 * {@inheritdoc SetValueInternal}
 * @public
 */
export interface AnchoredSetValueInternal extends SetValueInternal {
	/** {@inheritdoc AnchoredInsert.nodeToModify } */
	readonly nodeToModify: NodeAnchor;
}

/**
 * {@inheritdoc AnchoredConstraint}
 * @public
 */
export interface AnchoredConstraintInternal extends ConstraintInternal {
	/** {@inheritdoc AnchoredConstraint.toConstrain } */
	readonly toConstrain: RangeAnchor;
}

// Note: Documentation of this constant is merged with documentation of the `AnchoredChange` interface.
/**
 * @public
 */
export const AnchoredChangeInternal = {
	build: ChangeInternal.build,
	insert: ChangeInternal.insert as (source: DetachedSequenceId, destination: PlaceAnchor) => AnchoredInsertInternal,
	detach: ChangeInternal.detach as (source: RangeAnchor, destination?: DetachedSequenceId) => AnchoredDetachInternal,
	setPayload: ChangeInternal.setPayload as (nodeToModify: NodeAnchor, payload: Payload) => AnchoredSetValueInternal,
	clearPayload: ChangeInternal.clearPayload as (nodeToModify: NodeAnchor) => AnchoredSetValueInternal,
	constraint: ChangeInternal.constraint as (
		toConstrain: RangeAnchor,
		effect: ConstraintEffect,
		identityHash?: UuidString,
		length?: number,
		contentHash?: UuidString,
		parentNode?: NodeId,
		label?: TraitLabel
	) => AnchoredConstraintInternal,
};

/**
 * {@inheritdoc AnchoredDelete }
 * @public
 */
export const AnchoredDeleteInternal = {
	/** {@inheritdoc AnchoredDelete.create } */
	create: (rangeAnchor: RangeAnchor): AnchoredChangeInternal => AnchoredChangeInternal.detach(rangeAnchor),
};

/**
 * {@inheritdoc (AnchoredInsert:variable) }
 * @public
 */
export const AnchoredInsertInternal = {
	/** {@inheritdoc AnchoredInsert.create } */
	create: InsertInternal.create as (
		nodes: TreeNodeSequence<BuildNode>,
		destination: PlaceAnchor
	) => AnchoredChangeInternal[],
};

/**
 * {@inheritdoc AnchoredMove }
 * @public
 */
export const AnchoredMoveInternal = {
	/** {@inheritdoc AnchoredMove.create } */
	create: MoveInternal.create as (source: RangeAnchor, destination: PlaceAnchor) => AnchoredChangeInternal[],
};

/**
 * Indicates one of the predefined alternatives for the semantics of a place in a tree.
 */
export enum PlaceAnchorSemanticsChoice {
	/**
	 * The resulting `PlaceAnchor` is valid iff the referenced sibling or parent node with the given ID exists in the tree view on which the
	 * change is applied.
	 */
	BoundToNode = 0,
	/**
	 * The resulting `PlaceAnchor` is interpreted as relative to the siblings in the trait (or the parent in the case of start and end).
	 * If the sibling referenced in the `PlaceAnchor` is moved, the anchor moves with it.
	 * If the sibling referenced in the `PlaceAnchor` is deleted, the anchor is interpreted as relative to the next remaining sibling.
	 * If no siblings remain on the side of interest (before the referenced sibling for "After" places and after the referenced sibling
	 *   for "Before" places) then the anchor is interpreted relative to the containing parent/trait (the start of the trait for "After"
	 *   places and the end of the trait for "Before" places).
	 * If no siblings and no parent remains, the anchor is invalid.
	 */
	RelativeToNode = 1,
	// Future work:
	// RelativeToRank = 2,
}

/**
 * A location in a trait with associated merge semantics.
 * See also `StablePlace`.
 * `PlaceAnchor`. objects can be conveniently constructed with the helper methods exported on a constant of the same name.
 * @example
 * PlaceAnchor.before(node)
 * PlaceAnchor.atStartOf(trait)
 * @public
 */
export interface PlaceAnchor extends StablePlace {
	/**
	 * The choice of semantics for the place.
	 * No value is equivalent to PlaceAnchorSemanticsChoice.BoundToNode.
	 */
	readonly semantics?: PlaceAnchorSemanticsChoice;
}

export type RelativePlaceAnchor = PlaceAnchor & { semantic: PlaceAnchorSemanticsChoice.RelativeToNode };

/**
 * Specifies the range of nodes from `start` to `end` within a trait.
 * See also `StableRange`.
 * Valid iff start and end are valid and are within the same trait and the start does not occur after the end in the trait.
 *
 * `RangeAnchor`s are currently resolved by resolving their constituent places and checking the validity of the resulting range.
 * This may lead to the range becoming invalid (i.e., cannot be resolved) despite there being reasonable ways to salvage it.
 * For example the range [After(B), Before(D)] in the trait [A, B, C, D] would be made invalid by a change that moves B after D.
 * A reasonable resolution would be to resolve the range to [After(A), Before(D)]. The current implementation will instead treat
 * the range as invalid.
 * Future improvements may offer more a resilient resolution strategy for ranges.
 *
 * `RangeAnchor` objects can be conveniently constructed with the helper methods exported on a constant of the same name.
 * @example
 * RangeAnchor.from(PlaceAnchor.before(startNode)).to(PlaceAnchor.after(endNode))
 * @public
 */
export interface RangeAnchor extends StableRange {
	readonly start: PlaceAnchor;
	readonly end: PlaceAnchor;
}

export type NodeAnchor = NodeId;

/**
 * The remainder of this file consists of ergonomic factory methods for persisted types, or common combinations thereof (e.g. "Move" as a
 * combination of a "Detach" change and an "Insert" change).
 *
 * None of these helpers are persisted in documents, and therefore changes to their semantics need only follow standard semantic versioning
 * practices.
 */

// Note: Documentation of this constant is merged with documentation of the `PlaceAnchor` interface.
/**
 * @public
 */
export const PlaceAnchor = {
	/**
	 * @returns The location directly before `node`.
	 */
	before: (
		node: NodeData | NodeId,
		semantics: PlaceAnchorSemanticsChoice = PlaceAnchorSemanticsChoice.RelativeToNode
	): PlaceAnchor => ({
		side: Side.Before,
		referenceSibling: getNodeId(node),
		semantics,
	}),
	/**
	 * @returns The location directly after `node`.
	 */
	after: (
		node: NodeData | NodeId,
		semantics: PlaceAnchorSemanticsChoice = PlaceAnchorSemanticsChoice.RelativeToNode
	): PlaceAnchor => ({ side: Side.After, referenceSibling: getNodeId(node), semantics }),
	/**
	 * @returns The location at the start of `trait`.
	 */
	atStartOf: (
		trait: StableTraitLocation,
		semantics: PlaceAnchorSemanticsChoice = PlaceAnchorSemanticsChoice.RelativeToNode
	): PlaceAnchor => ({ side: Side.After, referenceTrait: trait, semantics }),
	/**
	 * @returns The location at the end of `trait`.
	 */
	atEndOf: (
		trait: StableTraitLocation,
		semantics: PlaceAnchorSemanticsChoice = PlaceAnchorSemanticsChoice.RelativeToNode
	): PlaceAnchor => ({ side: Side.Before, referenceTrait: trait, semantics }),
};

// Note: Documentation of this constant is merged with documentation of the `RangeAnchor` interface.
/**
 * @public
 */
export const RangeAnchor = {
	/**
	 * Factory for producing a `RangeAnchor` from a start `StablePlace` to an end `StablePlace`.
	 * @example
	 * RangeAnchor.from(StablePlace.before(startNode)).to(StablePlace.after(endNode))
	 */
	from: StableRange.from as (start: PlaceAnchor) => { to: (end: PlaceAnchor) => RangeAnchor },
	/**
	 * @returns a `RangeAnchor` which contains only the provided `node`.
	 * Both the start and end `PlaceAnchor` objects used to anchor this `RangeAnchor` are in terms of the passed in node.
	 */
	only: (
		node: NodeData | NodeAnchor,
		semantics: PlaceAnchorSemanticsChoice = PlaceAnchorSemanticsChoice.RelativeToNode
	): RangeAnchor => ({ start: PlaceAnchor.before(node, semantics), end: PlaceAnchor.after(node, semantics) }),
	/**
	 * @returns a `RangeAnchor` which contains everything in the trait.
	 * This is anchored using the provided `trait`, and is independent of the actual contents of the trait:
	 * it does not use sibling anchoring.
	 */
	all: StableRange.all as (trait: StableTraitLocation) => RangeAnchor,
};
