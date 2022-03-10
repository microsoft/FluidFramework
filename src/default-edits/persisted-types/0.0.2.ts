/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// All types imported into this file inherit the requirements documented below.
// These imports are ok because they consist only of type aliases for primitive types,
// and thus have no impact on serialization as long as the primitive type they are an alias for does not change.
// This does mean that the various UuidString types must remain strings, and must never change the format unless the process for changing
// persisted types (as documented below) is followed.
import type { DetachedSequenceId, StableNodeId, TraitLabel, UuidString } from '../../Identifiers';
import { assert, assertNotUndefined } from '../../Common';
import {
	getNodeId,
	NodeData,
	Payload,
	Side,
	TraitLocationInternal_0_0_2,
	TreeNode,
	TreeNodeSequence,
} from '../../generic';

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
	CompressedBuild,
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
export type BuildNodeInternal = TreeNode<BuildNodeInternal, StableNodeId> | DetachedSequenceId;

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
	readonly destination: StablePlaceInternal_0_0_2;
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
	readonly source: StableRangeInternal_0_0_2;
	/** {@inheritdoc Detach."type" } */
	readonly type: typeof ChangeTypeInternal.Detach;
}

/**
 * {@inheritdoc SetValue}
 * @public
 */
export interface SetValueInternal {
	/** {@inheritdoc SetValue.nodeToModify } */
	readonly nodeToModify: StableNodeId;
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
	readonly toConstrain: StableRangeInternal_0_0_2;
	/** {@inheritdoc Constraint.identityHash } */
	readonly identityHash?: UuidString;
	/** {@inheritdoc Constraint.length } */
	readonly length?: number;
	/** {@inheritdoc Constraint.contentHash } */
	readonly contentHash?: UuidString;
	/** {@inheritdoc Constraint.parentNode } */
	readonly parentNode?: StableNodeId;
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

	insert: (source: DetachedSequenceId, destination: StablePlaceInternal_0_0_2): InsertInternal => ({
		destination,
		source,
		type: ChangeTypeInternal.Insert,
	}),

	detach: (source: StableRangeInternal_0_0_2, destination?: DetachedSequenceId): DetachInternal => ({
		destination,
		source,
		type: ChangeTypeInternal.Detach,
	}),

	setPayload: (nodeToModify: NodeData<StableNodeId> | StableNodeId, payload: Payload): SetValueInternal => ({
		nodeToModify: getNodeId(nodeToModify),
		payload,
		type: ChangeTypeInternal.SetValue,
	}),

	clearPayload: (nodeToModify: NodeData<StableNodeId> | StableNodeId): SetValueInternal => ({
		nodeToModify: getNodeId(nodeToModify),
		// Rationale: 'undefined' is reserved for future use (see 'SetValue' interface above.)
		// eslint-disable-next-line no-null/no-null
		payload: null,
		type: ChangeTypeInternal.SetValue,
	}),

	constraint: (
		toConstrain: StableRangeInternal_0_0_2,
		effect: ConstraintEffect,
		identityHash?: UuidString,
		length?: number,
		contentHash?: UuidString,
		parentNode?: StableNodeId,
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
	create: (stableRange: StableRangeInternal_0_0_2): ChangeInternal => ChangeInternal.detach(stableRange),
};

/**
 * {@inheritdoc (Insert:variable) }
 * @public
 */
export const InsertInternal = {
	/** {@inheritdoc (Insert:variable).create } */
	create: (nodes: TreeNodeSequence<BuildNodeInternal>, destination: StablePlaceInternal_0_0_2): ChangeInternal[] => {
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
	create: (source: StableRangeInternal_0_0_2, destination: StablePlaceInternal_0_0_2): ChangeInternal[] => {
		const detach = ChangeInternal.detach(source, 0 as DetachedSequenceId);
		return [detach, ChangeInternal.insert(assertNotUndefined(detach.destination), destination)];
	},
};

/**
 * {@inheritdoc (StablePlace:interface) }
 * @public
 */
export interface StablePlaceInternal_0_0_2 {
	/**
	 * {@inheritdoc (StablePlace:interface).side }
	 */
	readonly side: Side;

	/**
	 * {@inheritdoc (StablePlace:interface).referenceSibling }
	 */
	readonly referenceSibling?: StableNodeId;

	/**
	 * {@inheritdoc (StablePlace:interface).referenceTrait }
	 */
	readonly referenceTrait?: TraitLocationInternal_0_0_2;
}

/**
 * {@inheritdoc (StableRange:interface) }
 * @public
 */
export interface StableRangeInternal_0_0_2 {
	/** {@inheritdoc (StableRange:interface).start } */
	readonly start: StablePlaceInternal_0_0_2;
	/** {@inheritdoc (StableRange:interface).end } */
	readonly end: StablePlaceInternal_0_0_2;
}

/**
 * The remainder of this file consists of factory methods duplicated with those for StableRange/StablePlace and are maintained while
 * the new persisted version of SharedTree ops/summaries is rolled out.
 */

/**
 * @public
 */
export const StablePlaceInternal_0_0_2 = {
	/**
	 * @returns The location directly before `node`.
	 */
	before: (node: NodeData<StableNodeId> | StableNodeId): StablePlaceInternal_0_0_2 => ({
		side: Side.Before,
		referenceSibling: getNodeId(node),
	}),
	/**
	 * @returns The location directly after `node`.
	 */
	after: (node: NodeData<StableNodeId> | StableNodeId): StablePlaceInternal_0_0_2 => ({
		side: Side.After,
		referenceSibling: getNodeId(node),
	}),
	/**
	 * @returns The location at the start of `trait`.
	 */
	atStartOf: (trait: TraitLocationInternal_0_0_2): StablePlaceInternal_0_0_2 => ({
		side: Side.After,
		referenceTrait: trait,
	}),
	/**
	 * @returns The location at the end of `trait`.
	 */
	atEndOf: (trait: TraitLocationInternal_0_0_2): StablePlaceInternal_0_0_2 => ({
		side: Side.Before,
		referenceTrait: trait,
	}),
};

/**
 * @public
 */
export const StableRangeInternal_0_0_2 = {
	/**
	 * Factory for producing a `StableRange` from a start `StablePlace` to an end `StablePlace`.
	 * @example
	 * StableRange.from(StablePlace.before(startNode)).to(StablePlace.after(endNode))
	 */
	from: (
		start: StablePlaceInternal_0_0_2
	): { to: (end: StablePlaceInternal_0_0_2) => StableRangeInternal_0_0_2 } => ({
		to: (end: StablePlaceInternal_0_0_2): StableRangeInternal_0_0_2 => {
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
	only: (node: NodeData<StableNodeId> | StableNodeId): StableRangeInternal_0_0_2 => ({
		start: StablePlaceInternal_0_0_2.before(node),
		end: StablePlaceInternal_0_0_2.after(node),
	}),
	/**
	 * @returns a `StableRange` which contains everything in the trait.
	 * This is anchored using the provided `trait`, and is independent of the actual contents of the trait:
	 * it does not use sibling anchoring.
	 */
	all: (trait: TraitLocationInternal_0_0_2): StableRangeInternal_0_0_2 => ({
		start: StablePlaceInternal_0_0_2.atStartOf(trait),
		end: StablePlaceInternal_0_0_2.atEndOf(trait),
	}),
};
