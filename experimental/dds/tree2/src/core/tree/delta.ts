/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey } from "../schema-stored";
import { ITreeCursorSynchronous } from "./cursor";

/**
 * This format describes changes that must be applied to a document tree in order to update it.
 * Instances of this format are generated based on incoming changesets and consumed by a view layer (e.g., Forest) to
 * update itself.
 *
 * Because this format is only meant for updating document state, it does not fully represent user intentions.
 * For example, if some edit A inserts content and some subsequent edit B deletes that content, then a Delta that
 * represents the state update for these two edits would not include the insertion and deletion.
 * For the same reason, this format is also not fit to be rebased in the face of concurrent changes.
 * Instead this format is used to describe the end product of rebasing user intentions over concurrent edits.
 *
 * This format is self-contained in the following ways:
 *
 * 1. It uses integer indices (offsets, technically) to describe necessary changes.
 * As such, it does not rely on document nodes being randomly accessible by ID.
 *
 * 2. This format does not require historical information in order to apply the changes it describes.
 * For example, if a user undoes the deletion of a subtree, then the Delta generated for the undo edit will contain all
 * information necessary to re-create the subtree from scratch.
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
 * element of the document field appear after marks that affect earlier elements of the document field.
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
 * @alpha
 */
export type Root<TTree = ProtoNode> = FieldsChanges<TTree>;

/**
 * The default representation for inserted content.
 *
 * TODO:
 * Ownership and lifetime of data referenced by this cursor is unclear,
 * so it is a poor abstraction for this use-case which needs to hold onto the data in a non-exclusive (readonly) way.
 * Cursors can be one supported way to input data, but aren't a good storage format.
 * @alpha
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
 * @alpha
 */
export type ProtoNodes = readonly ProtoNode[];

/**
 * Represents a change being made to a part of the tree.
 * @alpha
 */
export interface Mark<TTree = ProtoNode> {
	/**
	 * The number of nodes affected.
	 * Must be 1 when `fields` is populated.
	 */
	readonly count: number;
	/**
	 * Modifications to the pre-existing content.
	 */
	readonly fields?: FieldsChanges<TTree>;

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
 * Represents a list of changes to some range of nodes. The index of each mark within the range of nodes, before
 * applying any of the changes, is not represented explicitly.
 * It corresponds to the sum of `mark.count` values for all previous marks.
 * @alpha
 */
export type MarkList<TTree = ProtoNode> = readonly Mark<TTree>[];

/**
 * A globally unique ID for a node in a detached field.
 * @alpha
 */
export interface DetachedNodeId {
	major?: string | number;
	minor: number;
}

/**
 * @alpha
 */
export type FieldMap<T> = ReadonlyMap<FieldKey, T>;

/**
 * @alpha
 */
export type FieldsChanges<TTree = ProtoNode> = FieldMap<FieldChanges<TTree>>;

export interface DetachedNodeChanges<TTree = ProtoNode> {
	readonly id: DetachedNodeId;
	readonly fields: FieldsChanges<TTree>;
}

export interface DetachedNodeBuild<TTree = ProtoNode> {
	readonly id: DetachedNodeId;
	readonly trees: readonly TTree[];
}

export interface DetachedNodeRelocation {
	readonly id: DetachedNodeId;
	readonly count: number;
	readonly destination: DetachedNodeId;
}

// export interface DetachedNodeDestruction {
// 	readonly id: DetachedNodeId;
// 	readonly count: number;
// }

export interface FieldChanges<TTree = ProtoNode> {
	readonly attached?: MarkList<TTree>;
	readonly detached?: readonly DetachedNodeChanges<TTree>[];
	readonly build?: readonly DetachedNodeBuild<TTree>[];
	readonly relocate?: readonly DetachedNodeRelocation[];
	// readonly destroy?: readonly DetachedNodeDestruction[];
}

// const concurBuild: DetachedNodeId = { minor: 0 };
// const concurSet: DetachedNodeId = { minor: 1 };
// const local: DetachedNodeId = { minor: 2 };

// const moveId: DetachedNodeId = { minor: 0 };
// const delId: DetachedNodeId = { minor: 1 };

// const moveAndDelChange: FieldChanges = {
// 	attached: [{ count: 1, detach: moveId }],
// 	relocate: [{
// 		id: moveId,
// 		count: 1,
// 		destination: delId,
// 	}],
// };

// const optFieldChange: FieldChanges = {
// 	build: [{ id: concurBuild, tree: [] }],
// 	relocate: [
// 		{
// 			id: local,
// 			count: 1,
// 			destination: concurSet,
// 		},
// 		{
// 			id: concurBuild,
// 			count: 1,
// 			destination: local,
// 		},
// 	],
// };

// const delta: Root = new Map([
// 	["root", optFieldChange];
// ]);
