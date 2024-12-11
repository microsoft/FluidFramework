/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RevisionTag } from "../rebase/index.js";
import type { FieldKey } from "../schema-stored/index.js";

import type { ITreeCursorSynchronous } from "./cursor.js";

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
 * Represents the change made to a document.
 * Immutable, therefore safe to retain for async processing.
 */
export interface Root<TTree = ProtoNode> {
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
	readonly build?: readonly DetachedNodeBuild<TTree>[];

	readonly renames?: readonly DetachedNodeRename[];

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
	readonly refreshers?: readonly DetachedNodeBuild<TTree>[];
}

/**
 * The default representation for inserted content.
 *
 * TODO:
 * Ownership and lifetime of data referenced by this cursor is unclear,
 * so it is a poor abstraction for this use-case which needs to hold onto the data in a non-exclusive (readonly) way.
 * Cursors can be one supported way to input data, but aren't a good storage format.
 */
export type ProtoNode = ITreeCursorSynchronous;

/**
 * The default representation a chunk (sub-sequence) of inserted content.
 *
 * TODO:
 * See issue TODO with ProtoNode.
 * Additionally, Cursors support sequences, so if using cursors, there are better ways to handle this than an array of cursors,
 * like using a cursor over all the content (starting in fields mode).
 * Long term something like TreeChunk should probably be used here.
 */
export type ProtoNodes = readonly ProtoNode[];

/**
 * Represents a change being made to a part of the document tree.
 */
export interface Mark {
	/**
	 * The number of nodes affected.
	 * When `isAttachMark(mark)` is true, this is the number of new nodes being attached.
	 * When `isAttachMark(mark)` is false, this the number of existing nodes affected.
	 * Must be 1 when `fields` is populated.
	 */
	readonly count: number;

	/**
	 * Modifications to the pre-existing content.
	 * Must be undefined when `attach` is set but `detach` is not.
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
	readonly major?: RevisionTag;
	readonly minor: number;
}

/**
 */
export type FieldMap = ReadonlyMap<FieldKey, FieldChanges>;

/**
 * Represents changes made to a detached node
 */
export interface DetachedNodeChanges {
	readonly id: DetachedNodeId;
	readonly fields: FieldMap;
}

/**
 * Represents the creation of detached nodes.
 *
 * Tree creation is idempotent: if a tree with the same ID already exists,
 * then this build is ignored in favor of the existing tree.
 */
export interface DetachedNodeBuild<TTree = ProtoNode> {
	readonly id: DetachedNodeId;
	readonly trees: readonly TTree[];
}

/**
 * Represents the destruction of detached nodes
 */
export interface DetachedNodeDestruction {
	readonly id: DetachedNodeId;
	readonly count: number;
}

/**
 * Represents a detached node being assigned a new `DetachedNodeId`.
 */
export interface DetachedNodeRename {
	readonly count: number;
	readonly oldId: DetachedNodeId;
	readonly newId: DetachedNodeId;
}

/**
 * Represents the changes to perform on a given field.
 */
export interface FieldChanges {
	/**
	 * Represents a list of changes to the nodes in the field.
	 * The index of each mark within the range of nodes, before
	 * applying any of the changes, is not represented explicitly.
	 * It corresponds to the sum of `mark.count` values for all previous marks for which `isAttachMark(mark)` is false.
	 */
	readonly local?: readonly Mark[];
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
	 * Detached whose associated ID needs to be updated.
	 * The ordering has no significance.
	 * Note that the renames may need to be performed in a specific order to avoid collisions.
	 * This ordering problem is left to the consumer of this format.
	 */
	readonly rename?: readonly DetachedNodeRename[];
}
