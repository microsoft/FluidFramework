/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	EditId,
	Definition,
	NodeId,
	StableNodeId,
	TraitLabel,
	DetachedSequenceId,
	UuidString,
} from '../Identifiers';

/**
 * Defines a place relative to sibling.
 * The "outside" of a trait is the `undefined` sibling,
 * so After `undefined` is the beginning of the trait, and before `undefined` is the end.
 *
 * For this purpose, traits look like:
 *
 * `{undefined} - {Node 0} - {Node 1} - ... - {Node N} - {undefined}`
 *
 * Each `{value}` in the diagram is a possible sibling, which is either a Node or undefined.
 * Each `-` in the above diagram is a `Place`, and can be describe as being `After` a particular `{sibling}` or `Before` it.
 * This means that `After` `{undefined}` means the same `Place` as before the first node
 * and `Before` `{undefined}` means the `Place` after the last Node.
 *
 * Each place can be specified, (aka 'anchored') in two ways (relative to the sibling before or after):
 * the choice of which way to anchor a place only matters when the kept across an edit, and thus evaluated in multiple contexts where the
 * two place description may no longer evaluate to the same place.
 * @alpha
 */
export enum Side {
	Before = 0,
	After = 1,
}

/**
 * A collection of changes to the tree that are applied atomically along with a unique identifier for the edit.
 * If any individual change fails to apply, the entire Edit will fail to apply.
 * @alpha
 */
export interface Edit<TChange> extends EditBase<TChange> {
	/**
	 * Unique identifier for this edit. Must never be reused.
	 * Used for referencing and de-duplicating edits.
	 */
	readonly id: EditId;
}

/**
 * A collection of changes to the tree that are applied atomically. If any individual change fails to apply,
 * the entire Edit will fail to apply.
 * @internal
 */
export interface EditWithoutId<TChange> extends EditBase<TChange> {
	/**
	 * Used to explicitly state that EditWithoutId cannot contain an id and prevents type Edit from being assigned to type EditWithoutId.
	 */
	readonly id?: never;
}

/**
 * The information included in an edit.
 * @alpha
 */
export interface EditBase<TChange> {
	/**
	 * Actual changes to apply.
	 * Applied in order as part of a single transaction.
	 */
	readonly changes: readonly TChange[];

	/**
	 * For edits which are being re-issued due to a conflict, the number of times this edit has already been attempted.
	 * Undefined means 0.
	 */
	readonly pastAttemptCount?: number;

	// Add more metadata fields as needed in the future.
	// Include "high level"/"Domain Specific"/"Hierarchal" edits for application/domain use in implementing domain aware merge heuristics.
}

/**
 * Json compatible representation of a payload storing arbitrary Serializable data.
 *
 * Keys starting with "IFluid" are reserved for special use such as the JavaScript feature detection pattern and should not be used.
 *
 * See {@link comparePayloads} for equality semantics and related details (like what is allowed to be lost when serializing)
 *
 * TODO:#51984: Allow opting into heuristic blobbing in snapshots with a special IFluid key.
 * @alpha
 */
export type Payload = any;

/**
 * Json compatible map as object.
 * Keys are TraitLabels,
 * Values are the content of the trait specified by the key.
 * @alpha
 */
export interface TraitMap<TChild> {
	readonly [key: string]: TreeNodeSequence<TChild>;
}

/**
 * A sequence of Nodes that make up a trait under a Node
 * @alpha
 */
export type TreeNodeSequence<TChild> = readonly TChild[];

/**
 * An object which may have traits with children of the given type underneath it
 * @alpha
 */
export interface HasTraits<TChild> {
	readonly traits: TraitMap<TChild>;
}

/**
 * The fields required by a node in a tree
 * @alpha
 */
export interface NodeData<TId> {
	/**
	 * A payload of arbitrary serializable data
	 */
	readonly payload?: Payload;

	/**
	 * The meaning of this node.
	 * Provides contexts/semantics for this node and its content.
	 * Typically use to associate a node with metadata (including a schema) and source code (types, behaviors, etc).
	 */
	readonly definition: Definition;
	/**
	 * Identifier which can be used to refer to this Node.
	 */
	readonly identifier: TId;
}

/**
 * Satisfies `NodeData` and may contain children under traits (which may or may not be `TreeNodes`)
 * @alpha
 */
export interface TreeNode<TChild, TId> extends NodeData<TId>, HasTraits<TChild> {}

/**
 * A tree whose nodes are either TreeNodes or a placeholder
 * @internal
 */
export type PlaceholderTree<TPlaceholder = never> = TreeNode<PlaceholderTree<TPlaceholder>, NodeId> | TPlaceholder;

/**
 * Specifies the location of a trait (a labeled sequence of nodes) within the tree.
 * @alpha
 */
export interface TraitLocationInternal_0_0_2 {
	readonly parent: StableNodeId;
	readonly label: TraitLabel;
}

/**
 * JSON-compatible Node type. Objects of this type will be persisted in internal change objects (under Edits) in the SharedTree history.
 * @alpha
 */
export type ChangeNode_0_0_2 = TreeNode<ChangeNode_0_0_2, StableNodeId>;

/**
 * The status code of an attempt to apply the changes in an Edit.
 * @alpha
 */
export enum EditStatus {
	/**
	 * The edit contained one or more malformed changes (e.g. was missing required fields such as `id`),
	 * or contained a sequence of changes that could not possibly be applied sequentially without error
	 * (e.g. an edit which tries to insert the same detached node twice).
	 */
	Malformed,
	/**
	 * The edit contained a well-formed sequence of changes that couldn't be applied to the current view,
	 * generally because concurrent changes caused one or more merge conflicts.
	 */
	Invalid,
	/**
	 * The edit was applied to the current view successfully.
	 */
	Applied,
}

/**
 * Types of ops handled by SharedTree.
 */
export enum SharedTreeOpType {
	/** An op that includes edit information. */
	Edit,
	/** Includes a Fluid handle that corresponds to an edit chunk. */
	Handle,
	/** An op that does not affect the tree's state. */
	NoOp,
	/** Signals that SharedTree contents should be updated to match a new write format. */
	Update,
}

/**
 * SharedTreeOp containing a version stamp marking the write format of the tree which submitted it.
 */
export interface VersionedOp<Version extends WriteFormat = WriteFormat> {
	/** The supported SharedTree write version, see {@link WriteFormat}. */
	readonly version: Version;
}

/**
 * Requirements for SharedTree ops.
 */
export type SharedTreeOp_0_0_2 = SharedTreeEditOp_0_0_2 | SharedTreeNoOp | SharedTreeUpdateOp;

/**
 * Op which has no application semantics. This op can be useful for triggering other
 */
export interface SharedTreeNoOp extends VersionedOp {
	readonly type: SharedTreeOpType.NoOp;
}

/**
 * Op indicating this SharedTree should upgrade its write format to the specified version.
 * The `version` field of this op reflects the version which should be upgraded to, not
 * the current version.
 * See docs/Breaking-Change-Migration.md for more details on the semantics of this op.
 */
export interface SharedTreeUpdateOp extends VersionedOp {
	readonly type: SharedTreeOpType.Update;
}

/**
 * A SharedTree op that includes edit information, and optionally a list of interned strings.
 */
export interface SharedTreeEditOp_0_0_2 extends VersionedOp<WriteFormat.v0_0_2> {
	readonly type: SharedTreeOpType.Edit;
	/** The collection of changes to apply. */
	readonly edit: Edit<ChangeInternal_0_0_2>;
}

/**
 * Format versions that SharedTree supports writing. Changes to op or summary formats necessitate updates.
 * @alpha
 */
export enum WriteFormat {
	/** Stores all edits in their raw format. */
	v0_0_2 = '0.0.2',
	/** Supports history virtualization, tree compression, string interning, and makes currentView optional. */
	v0_1_1 = '0.1.1',
}

/**
 * The minimal information on a SharedTree summary. Contains the summary format version.
 * @alpha
 */
export interface SharedTreeSummaryBase {
	/**
	 * Field on summary under which version is stored.
	 */
	readonly version: WriteFormat;
}

/**
 * Legacy summary format currently still used for writing.
 * TODO:#49901: Remove export when this format is no longer written.
 * @internal
 */
export interface SharedTreeSummary_0_0_2 extends SharedTreeSummaryBase {
	readonly version: WriteFormat.v0_0_2;

	readonly currentTree: ChangeNode_0_0_2;
	/**
	 * A list of edits.
	 */
	readonly sequencedEdits: readonly Edit<ChangeInternal_0_0_2>[];
}

/**
 * {@inheritdoc ChangeType}
 * @alpha
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
export type ChangeInternal_0_0_2 =
	| InsertInternal_0_0_2
	| DetachInternal_0_0_2
	| BuildInternal_0_0_2
	| SetValueInternal_0_0_2
	| ConstraintInternal_0_0_2;

/**
 * {@inheritdoc BuildNode}
 * @alpha
 */
export type BuildNodeInternal_0_0_2 = TreeNode<BuildNodeInternal_0_0_2, StableNodeId> | DetachedSequenceId;

/**
 * {@inheritdoc Build}
 * @alpha
 */
export interface BuildInternal_0_0_2 {
	/** {@inheritdoc Build.destination } */
	readonly destination: DetachedSequenceId;
	/** {@inheritdoc Build.source } */
	readonly source: TreeNodeSequence<BuildNodeInternal_0_0_2>;
	/** {@inheritdoc Build."type" } */
	readonly type: typeof ChangeTypeInternal.Build;
}

/**
 * {@inheritdoc (Insert:interface)}
 * @alpha
 */
export interface InsertInternal_0_0_2 {
	/** {@inheritdoc (Insert:interface).destination } */
	readonly destination: StablePlaceInternal_0_0_2;
	/** {@inheritdoc (Insert:interface).source } */
	readonly source: DetachedSequenceId;
	/** {@inheritdoc (Insert:interface)."type" } */
	readonly type: typeof ChangeTypeInternal.Insert;
}

/**
 * {@inheritdoc Detach}
 * @alpha
 */
export interface DetachInternal_0_0_2 {
	/** {@inheritdoc Detach.destination } */
	readonly destination?: DetachedSequenceId;
	/** {@inheritdoc Detach.source } */
	readonly source: StableRangeInternal_0_0_2;
	/** {@inheritdoc Detach."type" } */
	readonly type: typeof ChangeTypeInternal.Detach;
}

/**
 * {@inheritdoc SetValue}
 * @alpha
 */
export interface SetValueInternal_0_0_2 {
	/** {@inheritdoc SetValue.nodeToModify } */
	readonly nodeToModify: StableNodeId;
	/** {@inheritdoc SetValue.payload } */
	// eslint-disable-next-line @rushstack/no-new-null
	readonly payload: Payload | null;
	/** {@inheritdoc SetValue."type" } */
	readonly type: typeof ChangeTypeInternal.SetValue;
}

/**
 * What to do when a Constraint is violated.
 * @alpha
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
 * @alpha
 */
export interface ConstraintInternal_0_0_2 {
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

/**
 * {@inheritdoc (StablePlace:interface) }
 * @alpha
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
 * @alpha
 */
export interface StableRangeInternal_0_0_2 {
	/** {@inheritdoc (StableRange:interface).start } */
	readonly start: StablePlaceInternal_0_0_2;
	/** {@inheritdoc (StableRange:interface).end } */
	readonly end: StablePlaceInternal_0_0_2;
}
