/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Serializable } from '@fluidframework/datastore-definitions';
import type { EditId, Definition, StableNodeId, TraitLabel } from '../../Identifiers';

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
 * @public
 */
export enum Side {
	Before = 0,
	After = 1,
}

/**
 * A collection of changes to the tree that are applied atomically along with a unique identifier for the edit.
 * If any individual change fails to apply, the entire Edit will fail to apply.
 * @public
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
 * @public
 */
export interface EditWithoutId<TChange> extends EditBase<TChange> {
	/**
	 * Used to explicitly state that EditWithoutId cannot contain an id and prevents type Edit from being assigned to type EditWithoutId.
	 */
	readonly id?: never;
}

/**
 * The information included in an edit.
 * @public
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
 *
 * @public
 */
export type Payload = Serializable;

/**
 * Json compatible map as object.
 * Keys are TraitLabels,
 * Values are the content of the trait specified by the key.
 * @public
 */
export interface TraitMap<TChild> {
	readonly [key: string]: TreeNodeSequence<TChild>;
}

/**
 * A sequence of Nodes that make up a trait under a Node
 * @public
 */
export type TreeNodeSequence<TChild> = readonly TChild[];

/**
 * An object which may have traits with children of the given type underneath it
 * @public
 */
export interface HasTraits<TChild> {
	readonly traits: TraitMap<TChild>;
}

/**
 * The fields required by a node in a tree
 * @public
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
 * @public
 */
export interface TreeNode<TChild, TId> extends NodeData<TId>, HasTraits<TChild> {}

/**
 * Specifies the location of a trait (a labeled sequence of nodes) within the tree.
 * @public
 */
export interface TraitLocationInternal_0_0_2 {
	readonly parent: StableNodeId;
	readonly label: TraitLabel;
}

/**
 * JSON-compatible Node type. Objects of this type will be persisted in internal change objects (under Edits) in the SharedTree history.
 * @public
 */
export type ChangeNode_0_0_2 = TreeNode<ChangeNode_0_0_2, StableNodeId>;

/**
 * The status code of an attempt to apply the changes in an Edit.
 * @public
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
	/** Signals that SharedTree contents should be updated to match a new summary write version. */
	Update,
}

/**
 * SharedTreeOp containing a version stamp marking the write format of the tree which submitted it.
 */
export interface VersionedOp {
	/** The supported SharedTree write version, see {@link SharedTreeSummaryWriteFormat}. */
	readonly version: SharedTreeSummaryWriteFormat;
}

/**
 * Requirements for SharedTree ops.
 */
export type SharedTreeOp<TChange = unknown> =
	| SharedTreeEditOp<TChange>
	| SharedTreeHandleOp
	| SharedTreeNoOp
	| SharedTreeUpdateOp;

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
export interface SharedTreeEditOp<TChange> extends VersionedOp {
	readonly type: SharedTreeOpType.Edit;
	/** The collection of changes to apply. */
	readonly edit: Edit<TChange>;
	/** The list of interned strings to retrieve the original strings of interned edits. */
	readonly internedStrings?: readonly string[];
}

/**
 * A SharedTree op that includes edit handle information.
 * The handle corresponds to an edit chunk in the edit log.
 */
export interface SharedTreeHandleOp extends VersionedOp {
	readonly type: SharedTreeOpType.Handle;
	/** The serialized handle to an uploaded edit chunk. */
	readonly editHandle: string;
	/** The index of the first edit in the chunk that corresponds to the handle. */
	readonly startRevision: number;
}

/**
 * Format versions that SharedTree supports writing.
 * @public
 */
export enum SharedTreeSummaryWriteFormat {
	/** Stores all edits in their raw format. */
	Format_0_0_2 = '0.0.2',
	/** Supports history virtualization and makes currentView optional. */
	Format_0_1_1 = '0.1.1',
}
