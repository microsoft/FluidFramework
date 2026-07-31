/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RevisionTag } from "../rebase/index.js";
import type { FieldKey } from "../schema-stored/index.js";

import type { TreeChunk } from "./chunk.js";

/**
 * This format describes changes that must be applied to a forest in order to update it.
 * Instances of this format are generated based on incoming changesets and consumed by a view layer (e.g., Forest) to
 * update itself.
 *
 * Because this format is only meant for updating document state, it does not fully represent user intentions.
 * For example, if some concurrent edits A and B insert content at the same location, then a Delta that represents
 * represents the state update for edit A would not include information that allows B's insertion to be ordered
 * relative to A's insertion. This format is therefore not fit to be rebased in the face of concurrent changes.
 * Instead this format is used to describe the end product of rebasing user intentions over concurrent edits.
 *
 * This format is self-contained in the following ways:
 *
 * 1. It uses integer indices (offsets, technically) to describe the locations of necessary changes.
 * As such, it does not rely on document nodes being accessible/locatable by ID.
 *
 * 2. This format does not require historical information in order to apply the changes it describes.
 * For example, if a user undoes the deletion of a subtree, then the Delta generated for the undo edit will contain all
 * information necessary to restore that subtree.
 *
 * This format can be generated from any Changeset without having access to the current document state.
 *
 * This format is meant to serve as the lowest common denominator to represent state changes resulting from any kind
 * of operation on any kind of field.
 * This means all such operations must be expressible in terms of this format.
 *
 * Within the above design constrains, this format is designed with the following goals in mind:
 *
 * 1. Make it easy to walk both a document tree and the delta tree to apply the changes described in the delta
 * with a minimum amount of backtracking over the contents of the tree.
 * This a boon for both code simplicity and performance.
 *
 * 2. Make the format terse.
 *
 * 3. Make the format uniform.
 *
 * These goals are reflected in the following design choices (this is very much optional reading for users of this
 * format):
 *
 * 1. All marks that apply to field elements are represented in a single linear structure where marks that affect later
 * elements of the document field appear after marks that affect earlier elements of the document field.
 *
 * If the marks were not ordered in this fashion then a consumer would need to backtrack within the document field.
 *
 * If the marks were represented in multiple such linear structures then it would be necessary to either:
 * - backtrack when iterating over one structure fully, then the next
 * - maintain a pointer within each such linear structure and advance them in lock-step (like in a k-way merge-sort but
 * more fiddly because of the offsets).
 *
 * 2. Nested changes are not inlined within `ProtoNode`s.
 *
 * Inlining them would force the consuming code to detect such changes within the `ProtoNode` and handle them
 * within the context of the content creation.
 * This would be cumbersome because either the code that is responsible for consuming the `ProtoNode` would need to
 * be aware of and have the context to handle such changes, or some caller of that code would need to find and extract such
 * change information ahead to calling that code.
 */

/**
 * A change made to a document.
 * Immutable, therefore safe to retain for async processing.
 */
export interface Root<TTrees = ProtoNodes> {
	/**
	 * Changes to apply to the root fields.
	 */
	readonly fields?: FieldMap;
	/**
	 * New detached nodes to be constructed.
	 * The ordering has no significance.
	 *
	 * Build instructions for a root that is undergoing a rename should be listed under the starting name.
	 * For example, if one wishes to build a tree which is being renamed from ID A to ID B,
	 * then the build should be listed under ID A.
	 */
	readonly build?: readonly DetachedNodeBuild<TTrees>[];
	/**
	 * New detached nodes to be destroyed.
	 * The ordering has no significance.
	 *
	 * Destruction instructions for a root that is undergoing a rename should be listed under the final name.
	 * For example, if one wishes to destroy a tree which is being renamed from ID A to ID B,
	 * then the destruction should be listed under ID B.
	 */
	readonly destroy?: readonly DetachedNodeDestruction[];
	/**
	 * Refreshers for detached nodes that may need to be recreated.
	 * The ordering has no significance.
	 */
	readonly refreshers?: readonly DetachedNodeBuild<TTrees>[];
	/**
	 * Changes to apply to detached nodes.
	 * The ordering has no significance.
	 *
	 * Nested changes for a root that is undergoing a rename should be listed under the starting name.
	 * For example, if one wishes to change a tree which is being renamed from ID A to ID B,
	 * then the changes should be listed under ID A.
	 */
	readonly global?: readonly DetachedNodeChanges[];
	/**
	 * Detached roots whose associated ID needs to be updated.
	 * The ordering has no significance.
	 * Note that the renames may need to be performed in a specific order to avoid collisions.
	 * This ordering problem is left to the consumer of this format.
	 */
	readonly rename?: readonly DetachedNodeRename[];
}

/**
 * The default representation for a chunk (sub-sequence) of inserted content.
 */
export type ProtoNodes = TreeChunk;

/**
 * A change to a contiguous range of a field,
 * including nested changes described by {@link Mark.fields}.
 *
 * @remarks
 * See {@link FieldChanges} for how these marks are applied to a field.
 *
 * The presence of {@link Mark.attach} and {@link Mark.detach} determines the kind of change:
 *
 * - Retain (neither `attach` nor `detach` are set): retains `count` existing nodes.
 * When `count` is `1`, `fields` may describe nested changes to the retained node.
 * - Detach (`detach` only): removes `count` existing nodes.
 * When `count` is `1`, `fields` may describe nested changes to the detached node.
 * - Attach (`attach` only): inserts `count` new nodes.
 * `fields` must be undefined.
 * - Replace (both `attach` and `detach`): replaces `count` existing nodes with `count` attached
 * nodes.
 * When `count` is `1`, `fields` may describe nested changes to the detached node.
 */
export interface Mark {
	/**
	 * The number of existing nodes affected, attached nodes added, or both, according to the
	 * combination of {@link Mark.attach} and {@link Mark.detach}.
	 * Must be `1` when {@link Mark.fields} is populated.
	 * @remarks
	 * The size of the attached content is never inferred from what is attached: it must be exactly `count`.
	 * This means that a single mark can represent replacing a run of `count` nodes with `count` new nodes,
	 * but cannot replace a run of one length with a run of another length.
	 * Such edits require multiple marks.
	 *
	 * Must be a positive integer.
	 * Marks with a count of `0` are no-ops and should be omitted from {@link FieldChanges}.
	 */
	readonly count: number;

	/**
	 * Nested changes to pre-existing content.
	 * @remarks
	 * If {@link Mark.detach} is set, these changes apply to the node being detached.
	 * Otherwise, they apply to the retained node.
	 *
	 * May only be set when this mark applies to exactly one pre-existing node.
	 * Therefore, `fields` must be undefined if:
	 * - {@link Mark.attach} is set and {@link Mark.detach} is not: in this case there are no pre-existing nodes.
	 * - {@link Mark.count} is not 1: in this case there is not exactly one node to modify.
	 */
	readonly fields?: FieldMap;

	/**
	 * When set, indicates that some pre-existing content is being detached and sent to the given detached field.
	 */
	readonly detach?: DetachedNodeId;

	/**
	 * When set, indicates that some content is being attached from the given detached field.
	 */
	readonly attach?: DetachedNodeId;
}

/**
 * A globally unique ID for a node in a detached field.
 */
export interface DetachedNodeId {
	/** Revision in which the ID was allocated, if applicable. */
	readonly major?: RevisionTag;
	/** Identifier within the scope of {@link DetachedNodeId.major}. */
	readonly minor: number;
}

export type FieldMap = ReadonlyMap<FieldKey, FieldChanges>;

/**
 * Changes made to a detached node.
 */
export interface DetachedNodeChanges {
	/** ID of the detached node to modify. */
	readonly id: DetachedNodeId;
	/** Changes to the node's fields. */
	readonly fields: FieldMap;
}

/**
 * The creation of detached nodes.
 *
 * Tree creation is idempotent: if a tree with the same ID already exists,
 * then this build is ignored in favor of the existing tree.
 */
export interface DetachedNodeBuild<TTrees = ProtoNodes> {
	/** ID assigned to the first node in {@link DetachedNodeBuild.trees}. */
	readonly id: DetachedNodeId;
	/** Nodes to create, assigned consecutive IDs by incrementing {@link DetachedNodeId.minor}. */
	readonly trees: TTrees;
}

/**
 * The destruction of detached nodes.
 */
export interface DetachedNodeDestruction {
	/** ID of the first detached node to destroy. */
	readonly id: DetachedNodeId;
	/** Number of consecutively identified nodes to destroy. */
	readonly count: number;
}

/**
 * A detached node being assigned a new `DetachedNodeId`.
 */
export interface DetachedNodeRename {
	/** Number of consecutively identified nodes to rename. */
	readonly count: number;
	/** Current ID of the first node. */
	readonly oldId: DetachedNodeId;
	/** New ID for the first node. */
	readonly newId: DetachedNodeId;
}

export interface FieldChanges {
	/**
	 * A list of changes to the nodes in the field.
	 * @remarks
	 * This includes changes to the field's nodes and nested changes to those nodes' fields.
	 *
	 * The index at which each mark applies is implicit. Marks are applied in order, advancing the
	 * index according to the kind of {@link Mark} and its {@link Mark.count}.
	 *
	 * Because this describes changes rather than content, untouched nodes after the final mark are
	 * implicitly retained. This is equivalent to a trailing retain mark with the relevant count.
	 */
	readonly marks: readonly Mark[];
}
