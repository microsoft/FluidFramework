/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from '@fluidframework/core-utils';
import { NodeId, TraitLabel, UuidString } from './Identifiers';
import { assertNotUndefined } from './Common';
import { ConstraintEffect, NodeData, Payload, Side, TreeNodeSequence } from './persisted-types';
import { TraitLocation } from './TreeView';
import { getNodeId } from './NodeIdUtilities';

/**
 * An object which may have traits with children of the given type underneath it
 * @alpha
 */
export interface HasVariadicTraits<TChild> {
	readonly traits?: {
		readonly [key: string]: TChild | TreeNodeSequence<TChild> | undefined;
	};
}

/**
 * The type of a Change
 * @alpha
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
 * @remarks
 *
 * `Change` objects can be conveniently constructed with the helper methods exported on a constant of the same name.
 *
 * @example
 *
 * ```typescript
 * Change.insert(sourceId, destination)
 * ```
 * @alpha
 */
export type Change = Insert | Detach | Build | SetValue | Constraint;

/**
 * Node or a detached sequence of nodes (referred to by a detached sequence ID) for use in a Build change.
 * See `BuildTreeNode` for more.
 * @alpha
 */
export type BuildNode = BuildTreeNode | number;

/**
 * Node for use in a Build change, which is composed of a definition describing what this nodes type, an identifier identifying this node
 * within the tree, and a payload containing an opaque serializable piece of data.
 * An identifier can be provided explicitly if the node must be referred to before the results of the `Change` containing this
 * BuildTreeNode can be observed. If `identifier` is not supplied, one will be generated for it in an especially efficient manner
 * that allows for compact storage and transmission and thus this property should be omitted if convenient.
 * See the SharedTree readme for more on the tree format.
 * @alpha
 */
export interface BuildTreeNode extends HasVariadicTraits<BuildNode> {
	definition: string;
	identifier?: NodeId;
	payload?: Payload;
}

/**
 * Constructs a sequence of nodes, associates it with the supplied ID, and stores it for use in later changes.
 * Does not modify the document.
 *
 * Valid if (transitively) all DetachedSequenceId are used according to their rules (use here counts as a destination),
 * and all Nodes' identifiers are previously unused.
 * @alpha
 */
export interface Build {
	readonly destination: number;
	readonly source: BuildNode | TreeNodeSequence<BuildNode>;
	readonly type: typeof ChangeType.Build;
}

/**
 * Inserts a sequence of nodes at the specified destination.
 * The source can be constructed either by a Build (used to insert new nodes) or a Detach (amounts to a "move" operation).
 * @alpha
 */
export interface Insert {
	readonly destination: StablePlace;
	readonly source: number;
	readonly type: typeof ChangeType.Insert;
}

/**
 * Removes a sequence of nodes from the tree.
 * If a destination is specified, the detached sequence is associated with that ID and held for possible reuse
 * by later changes in this same Edit (such as by an Insert).
 * A Detach without a destination is a deletion of the specified sequence, as is a Detach with a destination that is not used later.
 * @alpha
 */
export interface Detach {
	readonly destination?: number;
	readonly source: StableRange;
	readonly type: typeof ChangeType.Detach;
}

/**
 * Modifies the payload of a node.
 * @alpha
 */
export interface SetValue {
	readonly nodeToModify: NodeId;
	/**
	 * Sets or clears the payload.
	 * To improve ease of forwards compatibility, an explicit `null` value is used to represent the clearing of a payload.
	 * SetValue may use `undefined` in future API versions to mean "don't change the payload" (which is useful if e.g. other
	 * fields are added to SetValue that can be changed without altering the payload)
	 */
	// eslint-disable-next-line @rushstack/no-new-null
	readonly payload: Payload | null;
	readonly type: typeof ChangeType.SetValue;
}

/**
 * A set of constraints on the validity of an Edit.
 * A Constraint is used to detect when an Edit, due to other concurrent edits, may have unintended effects or merge in
 * non-semantic ways. It is processed in order like any other Change in an Edit. It can cause an edit to fail if the
 * various constraints are not met at the time of evaluation (ex: the parentNode has changed due to concurrent editing).
 * Does not modify the document.
 * @alpha
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

// Note: Documentation of this constant is merged with documentation of the `Change` interface.
/**
 * @alpha
 */
export const Change = {
	build: (source: BuildNode | TreeNodeSequence<BuildNode>, destination: number): Build => ({
		destination,
		source,
		type: ChangeType.Build,
	}),

	insert: (source: number, destination: StablePlace): Insert => ({
		destination,
		source,
		type: ChangeType.Insert,
	}),

	detach: (source: StableRange, destination?: number): Detach => ({
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

	/** Helpers for making high-level composite operations */

	/**
	 * @returns a change that deletes the supplied part of the tree.
	 */
	delete: (stableRange: StableRange): Change => Change.detach(stableRange),

	/**
	 * @returns changes that insert 'nodes' into the specified location in the tree.
	 */
	insertTree: (nodes: BuildNode | TreeNodeSequence<BuildNode>, destination: StablePlace): Change[] => {
		const build = Change.build(nodes, 0);
		return [build, Change.insert(build.destination, destination)];
	},

	/**
	 * @returns changes that moves the specified content to a new location in the tree.
	 */
	move: (source: StableRange, destination: StablePlace): Change[] => {
		const detach = Change.detach(source, 0);
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
 *
 * @example
 *
 * ```typescript
 * StablePlace.before(node)
 * StablePlace.atStartOf(trait)
 * ```
 * @alpha
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
 * @remarks
 *
 * `StableRange` objects can be conveniently constructed with the helper methods exported on a constant of the same name.
 *
 * @example
 *
 * ```typescript
 * StableRange.from(StablePlace.before(startNode)).to(StablePlace.after(endNode))
 * ```
 * @alpha
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
 * @alpha
 */
export const StablePlace = {
	/**
	 * @returns The location directly before `node`.
	 */
	before: (node: NodeData<NodeId> | NodeId): StablePlace => ({
		side: Side.Before,
		referenceSibling: getNodeId(node),
	}),
	/**
	 * @returns The location directly after `node`.
	 */
	after: (node: NodeData<NodeId> | NodeId): StablePlace => ({ side: Side.After, referenceSibling: getNodeId(node) }),
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
 * @alpha
 */
export const StableRange = {
	/**
	 * Factory for producing a `StableRange` from a start `StablePlace` to an end `StablePlace`.
	 *
	 * @example
	 *
	 * ```typescript
	 * StableRange.from(StablePlace.before(startNode)).to(StablePlace.after(endNode))
	 * ```
	 */
	from: (start: StablePlace): { to: (end: StablePlace) => StableRange } => ({
		to: (end: StablePlace): StableRange => {
			if (start.referenceTrait && end.referenceTrait) {
				assert(
					start.referenceTrait.parent === end.referenceTrait.parent,
					0x5fe /* StableRange must be constructed with endpoints from the same trait */
				);
				assert(
					start.referenceTrait.label === end.referenceTrait.label,
					0x5ff /* StableRange must be constructed with endpoints from the same trait */
				);
			}
			return { start, end };
		},
	}),
	/**
	 * @returns a `StableRange` which contains only the provided `node`.
	 * Both the start and end `StablePlace` objects used to anchor this `StableRange` are in terms of the passed in node.
	 */
	only: (node: NodeData<NodeId> | NodeId): StableRange => ({
		start: StablePlace.before(node),
		end: StablePlace.after(node),
	}),
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
