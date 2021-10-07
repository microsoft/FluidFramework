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
import { assertNotUndefined, assert } from '../Common';
import { Side } from '../TreeView';
import { EditBase, BuildNode, NodeData, Payload, TraitLocation, TreeNodeSequence } from '../generic';

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
 * The information included in an edit.
 * @public
 */
export type DefaultEditBase = EditBase<Change>;

/**
 * The type of a Change
 * @public
 */
export enum ChangeType {
	Insert,
	Detach,
	Build,
	SetValue,
	Constraint,
}

/**
 * A change that composes an Edit.
 *
 * `Change` objects can be conveniently constructed with the helper methods exported on a constant of the same name.
 * @example
 * Change.insert(sourceId, destination)
 * @public
 */
export type Change = Insert | Detach | Build | SetValue | Constraint;

/**
 * Constructs a sequence of nodes, associates it with the supplied ID, and stores it for use in later changes.
 * Does not modify the document.
 *
 * Valid if (transitively) all DetachedSequenceId are used according to their rules (use here counts as a destination),
 * and all Nodes' identifiers are previously unused.
 *
 * TODO: Design Decision:
 * If allowing 'moving from nowhere' to restore nodes: all new Nodes must have never before used identifiers.
 * Otherwise could just forbid identifiers currently reachable?
 * Could also allow introducing a node with a particular identifier to mean replacing that node with the new one
 * (could include optional constraint to require/prevent this).
 *
 * @public
 */
export interface Build {
	readonly destination: DetachedSequenceId;
	readonly source: TreeNodeSequence<BuildNode>;
	readonly type: typeof ChangeType.Build;
}

/**
 * Inserts a sequence of nodes at the specified destination.
 * The source can be constructed either by a Build (used to insert new nodes) or a Detach (amounts to a "move" operation).
 * @public
 */
export interface Insert {
	readonly destination: StablePlace;
	readonly source: DetachedSequenceId;
	readonly type: typeof ChangeType.Insert;
}

/**
 * Removes a sequence of nodes from the tree.
 * If a destination is specified, the detached sequence is associated with that ID and held for possible reuse
 * by later changes in this same Edit (such as by an Insert).
 * A Detach without a destination is a deletion of the specified sequence, as is a Detach with a destination that is not used later.
 * @public
 */
export interface Detach {
	readonly destination?: DetachedSequenceId;
	readonly source: StableRange;
	readonly type: typeof ChangeType.Detach;
}

/**
 * Modifies the payload of a node.
 * @public
 */
export interface SetValue {
	readonly nodeToModify: NodeId;
	/**
	 * Sets or clears the payload.
	 * To improve ease of forwards compatibility, an explicit `null` value is used to represent the clearing of a payload.
	 * SetValue may use `undefined` in future API versions to mean "don't change the payload" (which is useful if e.g. other
	 * fields are added to SetValue that can be changed without altering the payload)
	 */
	readonly payload: Payload | null;
	readonly type: typeof ChangeType.SetValue;
}

/**
 * A set of constraints on the validity of an Edit.
 * A Constraint is used to detect when an Edit, due to other concurrent edits, may have unintended effects or merge in
 * non-semantic ways. It is processed in order like any other Change in an Edit. It can cause an edit to fail if the
 * various constraints are not met at the time of evaluation (ex: the parentNode has changed due to concurrent editing).
 * Does not modify the document.
 * @public
 */
export interface Constraint {
	/**
	 * Selects a sequence of nodes which will be checked against the constraints specified by the optional fields.
	 * If `toConstrain` is invalid, it will be treated like a constraint being unmet.
	 * Depending on `effect` this may or may not make the Edit invalid.
	 *
	 * When a constraint is not met, the effects is specified by `effect`.
	 */
	readonly toConstrain: StableRange;

	/**
	 * Require that the identities of all the nodes in toConstrain hash to this value.
	 * Hash is order dependent.
	 * TODO: implement and specify exact hash function.
	 *
	 * This is an efficient (O(1) space) way to constrain a sequence of nodes to have specific identities.
	 */
	readonly identityHash?: UuidString;

	/**
	 * Require that the number of nodes in toConstrain is this value.
	 */
	readonly length?: number;

	/**
	 * Require that the contents of all of the nodes in toConstrain hash to this value.
	 * Hash is an order dependant deep hash, which includes all subtree content recursively.
	 * TODO: implement and specify exact hash function.
	 *
	 * This is an efficient (O(1) space) way to constrain a sequence of nodes have exact values (transitively).
	 */
	readonly contentHash?: UuidString;

	/**
	 * Require that parent under which toConstrain is located has this identifier.
	 */
	readonly parentNode?: NodeId;

	/**
	 * Require that the trait under which toConstrain is located has this label.
	 */
	readonly label?: TraitLabel;

	/**
	 * What to do if a constraint is not met.
	 */
	readonly effect: ConstraintEffect;

	/**
	 * Marker for which kind of Change this is.
	 */
	readonly type: typeof ChangeType.Constraint;
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

// Note: Documentation of this constant is merged with documentation of the `Change` interface.
/**
 * @public
 */
export const Change = {
	build: (source: TreeNodeSequence<BuildNode>, destination: DetachedSequenceId): Build => ({
		destination,
		source,
		type: ChangeType.Build,
	}),

	insert: (source: DetachedSequenceId, destination: StablePlace): Insert => ({
		destination,
		source,
		type: ChangeType.Insert,
	}),

	detach: (source: StableRange, destination?: DetachedSequenceId): Detach => ({
		destination,
		source,
		type: ChangeType.Detach,
	}),

	setPayload: (nodeToModify: NodeId, payload: Payload): SetValue => ({
		nodeToModify,
		payload,
		type: ChangeType.SetValue,
	}),

	clearPayload: (nodeToModify: NodeId): SetValue => ({
		nodeToModify,
		// Rationale: 'undefined' is reserved for future use (see 'SetValue' interface above.)
		// eslint-disable-next-line no-null/no-null
		payload: null,
		type: ChangeType.SetValue,
	}),

	constraint: (
		toConstrain: StableRange,
		effect: ConstraintEffect,
		identityHash?: UuidString,
		length?: number,
		contentHash?: UuidString,
		parentNode?: NodeId,
		label?: TraitLabel
	): Constraint => ({
		toConstrain,
		effect,
		identityHash,
		length,
		contentHash,
		parentNode,
		label,
		type: ChangeType.Constraint,
	}),
};

/**
 * Helper for creating a `Delete` edit.
 * @public
 */
export const Delete = {
	/**
	 * @returns a Change that deletes the supplied part of the tree.
	 */
	create: (stableRange: StableRange): Change => Change.detach(stableRange),
};

/**
 * Helper for creating an `Insert` edit.
 * @public
 */
export const Insert = {
	/**
	 * @returns a Change that inserts 'nodes' into the specified location in the tree.
	 */
	create: (nodes: TreeNodeSequence<BuildNode>, destination: StablePlace): Change[] => {
		const build = Change.build(nodes, 0 as DetachedSequenceId);
		return [build, Change.insert(build.destination, destination)];
	},
};

/**
 * Helper for creating a `Move` edit.
 * @public
 */
export const Move = {
	/**
	 * @returns a Change that moves the specified content to a new location in the tree.
	 */
	create: (source: StableRange, destination: StablePlace): Change[] => {
		const detach = Change.detach(source, 0 as DetachedSequenceId);
		return [detach, Change.insert(assertNotUndefined(detach.destination), destination)];
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
	readonly referenceTrait?: TraitLocation;
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
	atStartOf: (trait: TraitLocation): StablePlace => ({ side: Side.After, referenceTrait: trait }),
	/**
	 * @returns The location at the end of `trait`.
	 */
	atEndOf: (trait: TraitLocation): StablePlace => ({ side: Side.Before, referenceTrait: trait }),
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
	all: (trait: TraitLocation): StableRange => ({
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
