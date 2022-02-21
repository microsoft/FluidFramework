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
import { assert, assertNotUndefined } from '../Common';
import { NodeData, Payload, PlaceholderTree, Side, StableTraitLocation, TreeNodeSequence } from '../generic';

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
 * {@inheritdoc ChangeType}
 * @public
 */
export enum ChangeTypeInternal {
	Insert,
	Detach,
	Build,
	SetValue,
	Constraint,
}

/**
 * {@inheritdoc (Change:type)}
 * @public
 */
export type ChangeInternal = InsertInternal | DetachInternal | BuildInternal | SetValueInternal | ConstraintInternal;

/**
 * {@inheritdoc BuildNode}
 * @public
 */
export type BuildNodeInternal = PlaceholderTree<DetachedSequenceId>;

/**
 * {@inheritdoc Build}
 * @public
 */
export interface BuildInternal {
	/** {@inheritdoc Build.destination } */
	readonly destination: DetachedSequenceId;
	/** {@inheritdoc Build.source } */
	readonly source: TreeNodeSequence<BuildNodeInternal>;
	/** {@inheritdoc Build."type" } */
	readonly type: typeof ChangeTypeInternal.Build;
}

/**
 * {@inheritdoc (Insert:interface)}
 * @public
 */
export interface InsertInternal {
	/** {@inheritdoc (Insert:interface).destination } */
	readonly destination: StablePlace;
	/** {@inheritdoc (Insert:interface).source } */
	readonly source: DetachedSequenceId;
	/** {@inheritdoc (Insert:interface)."type" } */
	readonly type: typeof ChangeTypeInternal.Insert;
}

/**
 * {@inheritdoc Detach}
 * @public
 */
export interface DetachInternal {
	/** {@inheritdoc Detach.destination } */
	readonly destination?: DetachedSequenceId;
	/** {@inheritdoc Detach.source } */
	readonly source: StableRange;
	/** {@inheritdoc Detach."type" } */
	readonly type: typeof ChangeTypeInternal.Detach;
}

/**
 * {@inheritdoc SetValue}
 * @public
 */
export interface SetValueInternal {
	/** {@inheritdoc SetValue.nodeToModify } */
	readonly nodeToModify: NodeId;
	/** {@inheritdoc SetValue.payload } */
	readonly payload: Payload | null;
	/** {@inheritdoc SetValue."type" } */
	readonly type: typeof ChangeTypeInternal.SetValue;
}

/**
 * What to do when a Constraint is violated.
 * @public
 */
export enum ConstraintEffect {
	/**
	 * Discard Edit.
	 */
	InvalidAndDiscard,

	/**
	 * Discard Edit, but record metadata that application may want to try and recover this change by recreating it.
	 * Should this be the default policy for when another (non Constraint) change is invalid?
	 */
	InvalidRetry,

	/**
	 * Apply the change, but flag it for possible reconsideration by the app
	 * (applying it is better than not, but perhaps the high level logic could produce something better).
	 */
	ValidRetry,
}

/**
 * {@inheritdoc Constraint}
 * @public
 */
export interface ConstraintInternal {
	/** {@inheritdoc Constraint.toConstrain } */
	readonly toConstrain: StableRange;
	/** {@inheritdoc Constraint.identityHash } */
	readonly identityHash?: UuidString;
	/** {@inheritdoc Constraint.length } */
	readonly length?: number;
	/** {@inheritdoc Constraint.contentHash } */
	readonly contentHash?: UuidString;
	/** {@inheritdoc Constraint.parentNode } */
	readonly parentNode?: NodeId;
	/** {@inheritdoc Constraint.label } */
	readonly label?: TraitLabel;
	/** {@inheritdoc Constraint.effect } */
	readonly effect: ConstraintEffect;
	/** {@inheritdoc Constraint."type" } */
	readonly type: typeof ChangeTypeInternal.Constraint;
}

// Note: Documentation of this constant is merged with documentation of the `ChangeInternal` interface.
/**
 * @public
 */
export const ChangeInternal = {
	build: (source: TreeNodeSequence<BuildNodeInternal>, destination: DetachedSequenceId): BuildInternal => ({
		destination,
		source,
		type: ChangeTypeInternal.Build,
	}),

	insert: (source: DetachedSequenceId, destination: StablePlace): InsertInternal => ({
		destination,
		source,
		type: ChangeTypeInternal.Insert,
	}),

	detach: (source: StableRange, destination?: DetachedSequenceId): DetachInternal => ({
		destination,
		source,
		type: ChangeTypeInternal.Detach,
	}),

	setPayload: (nodeToModify: NodeData | NodeId, payload: Payload): SetValueInternal => ({
		nodeToModify: getNodeId(nodeToModify),
		payload,
		type: ChangeTypeInternal.SetValue,
	}),

	clearPayload: (nodeToModify: NodeData | NodeId): SetValueInternal => ({
		nodeToModify: getNodeId(nodeToModify),
		// Rationale: 'undefined' is reserved for future use (see 'SetValue' interface above.)
		// eslint-disable-next-line no-null/no-null
		payload: null,
		type: ChangeTypeInternal.SetValue,
	}),

	constraint: (
		toConstrain: StableRange,
		effect: ConstraintEffect,
		identityHash?: UuidString,
		length?: number,
		contentHash?: UuidString,
		parentNode?: NodeId,
		label?: TraitLabel
	): ConstraintInternal => ({
		toConstrain,
		effect,
		identityHash,
		length,
		contentHash,
		parentNode,
		label,
		type: ChangeTypeInternal.Constraint,
	}),
};

/**
 * {@inheritdoc Delete }
 * @public
 */
export const DeleteInternal = {
	/** {@inheritdoc Delete.create } */
	create: (stableRange: StableRange): ChangeInternal => ChangeInternal.detach(stableRange),
};

/**
 * {@inheritdoc (Insert:variable) }
 * @public
 */
export const InsertInternal = {
	/** {@inheritdoc (Insert:variable).create } */
	create: (nodes: TreeNodeSequence<BuildNodeInternal>, destination: StablePlace): ChangeInternal[] => {
		const build = ChangeInternal.build(nodes, 0 as DetachedSequenceId);
		return [build, ChangeInternal.insert(build.destination, destination)];
	},
};

/**
 * {@inheritdoc Move }
 * @public
 */
export const MoveInternal = {
	/** {@inheritdoc Move.create } */
	create: (source: StableRange, destination: StablePlace): ChangeInternal[] => {
		const detach = ChangeInternal.detach(source, 0 as DetachedSequenceId);
		return [detach, ChangeInternal.insert(assertNotUndefined(detach.destination), destination)];
	},
};

/**
 * A location in a trait.
 * This is NOT the location of a node, but a location where a node could be inserted:
 * it is next to a sibling or at one end of the trait.
 *
 * To be well formed, either `sibling` or `trait` must be defined, but not both.
 *
 * Any given insertion location can be described by two `StablePlace` objects, one with `Side.After` and one with `Side.Before`.
 * For example, in a trait containing two strings "foo" and "bar", there are 6 different `StablePlace`s corresponding to 3 locations in the
 * trait a new node could be inserted: at the start, before "foo", after "foo", before "bar", after "bar", and at the end.
 * Neither of the two ways to specify the same location are considered to be after each other.
 *
 * The anchor (`referenceSibling` or `referenceTrait`) used for a particular `StablePlace` can have an impact in collaborative scenarios.
 *
 * `StablePlace` objects can be conveniently constructed with the helper methods exported on a constant of the same name.
 * @example
 * StablePlace.before(node)
 * StablePlace.atStartOf(trait)
 * @public
 */
export interface StablePlace {
	/**
	 * Where this StablePlace is relative to the sibling (if specified), or an end of the trait (if no sibling specified).
	 * If 'After' and there is no sibling, this StablePlace is after the front of the trait.
	 * If 'Before' and there is no sibling, this StablePlace is before the back of the trait.
	 */
	readonly side: Side;

	/**
	 * The sibling to which this 'StablePlace' is anchored (by 'side').
	 * If specified, referenceTrait must be unspecified.
	 */
	readonly referenceSibling?: NodeId;

	/**
	 * The trait to which this 'StablePlace' is anchored (by 'side').
	 * If specified, referenceSibling must be unspecified.
	 */
	readonly referenceTrait?: StableTraitLocation;
}

/**
 * Specifies the range of nodes from `start` to `end` within a trait.
 * Valid iff start and end are valid and are within the same trait and the start does not occur after the end in the trait.
 *
 * See {@link (StablePlace:interface)} for what it means for a place to be "after" another place.
 *
 * `StableRange` objects can be conveniently constructed with the helper methods exported on a constant of the same name.
 * @example
 * StableRange.from(StablePlace.before(startNode)).to(StablePlace.after(endNode))
 * @public
 */
export interface StableRange {
	readonly start: StablePlace;
	readonly end: StablePlace;
}

/**
 * The remainder of this file consists of ergonomic factory methods for persisted types, or common combinations thereof (e.g. "Move" as a
 * combination of a "Detach" change and an "Insert" change).
 *
 * None of these helpers are persisted in documents, and therefore changes to their semantics need only follow standard semantic versioning
 * practices.
 */

// Note: Documentation of this constant is merged with documentation of the `StablePlace` interface.
/**
 * @public
 */
export const StablePlace = {
	/**
	 * @returns The location directly before `node`.
	 */
	before: (node: NodeData | NodeId): StablePlace => ({
		side: Side.Before,
		referenceSibling: getNodeId(node),
	}),
	/**
	 * @returns The location directly after `node`.
	 */
	after: (node: NodeData | NodeId): StablePlace => ({ side: Side.After, referenceSibling: getNodeId(node) }),
	/**
	 * @returns The location at the start of `trait`.
	 */
	atStartOf: (trait: StableTraitLocation): StablePlace => ({ side: Side.After, referenceTrait: trait }),
	/**
	 * @returns The location at the end of `trait`.
	 */
	atEndOf: (trait: StableTraitLocation): StablePlace => ({ side: Side.Before, referenceTrait: trait }),
};

// Note: Documentation of this constant is merged with documentation of the `StableRange` interface.
/**
 * @public
 */
export const StableRange = {
	/**
	 * Factory for producing a `StableRange` from a start `StablePlace` to an end `StablePlace`.
	 * @example
	 * StableRange.from(StablePlace.before(startNode)).to(StablePlace.after(endNode))
	 */
	from: (start: StablePlace): { to: (end: StablePlace) => StableRange } => ({
		to: (end: StablePlace): StableRange => {
			if (start.referenceTrait && end.referenceTrait) {
				const message = 'StableRange must be constructed with endpoints from the same trait';
				assert(start.referenceTrait.parent === end.referenceTrait.parent, message);
				assert(start.referenceTrait.label === end.referenceTrait.label, message);
			}
			return { start, end };
		},
	}),
	/**
	 * @returns a `StableRange` which contains only the provided `node`.
	 * Both the start and end `StablePlace` objects used to anchor this `StableRange` are in terms of the passed in node.
	 */
	only: (node: NodeData | NodeId): StableRange => ({ start: StablePlace.before(node), end: StablePlace.after(node) }),
	/**
	 * @returns a `StableRange` which contains everything in the trait.
	 * This is anchored using the provided `trait`, and is independent of the actual contents of the trait:
	 * it does not use sibling anchoring.
	 */
	all: (trait: StableTraitLocation): StableRange => ({
		start: StablePlace.atStartOf(trait),
		end: StablePlace.atEndOf(trait),
	}),
};

/**
 * @returns True iff the given `node` is of type NodeData.
 * @internal
 */
export function isNodeData(node: NodeData | NodeId): node is NodeData {
	return (node as NodeData).definition !== undefined && (node as NodeData).identifier !== undefined;
}

/**
 * @returns The NodeId for a given node or its id.
 * @internal
 */
export function getNodeId(node: NodeData | NodeId): NodeId {
	if (isNodeData(node)) {
		return node.identifier;
	} else {
		return node;
	}
}
