/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { JsonableTree, RevisionTag } from "../../core";
import { ChangeAtomId, ChangesetLocalId, NodeChangeset } from "../modular-schema";

// TODO:AB#4259 Decouple types used for sequence-field's in-memory representation from their encoded variants.
// Currently, types in this file are largely used for both.
// See for example `Revive` whose type uses ITreeCursorSynchronous,
// but the schema for the serialized type uses ProtoNode (which is the result of serializing that cursor).

/**
 * The contents of a node to be created
 */
export type ProtoNode = JsonableTree;

export type NodeCount = number;

export enum Tiebreak {
	Left,
	Right,
}

/**
 * Represents a position within a contiguous range of nodes detached by a single changeset.
 * Note that `LineageEvent`s with the same revision are not necessarily referring to the same detach.
 * `LineageEvent`s for a given revision can only be meaningfully compared if it is known that they must refer to the
 * same detach.
 */
export interface LineageEvent {
	readonly revision: RevisionTag;

	/**
	 * The position of this mark within a range of nodes which were detached in this revision.
	 */
	readonly offset: number;
}

export interface CellsAnchor<T> {
	readonly count: NodeCount;
	/**
	 * Describes the detach which last emptied target cells.
	 * Undefined if the target cells are not empty in this anchor's input context.
	 */
	readonly detachEvent?: ChangeAtomId;

	/**
	 * Lineage of detaches adjacent to the cells since `detachEvent`.
	 * Should be empty if the cells are full in this mark's input context.
	 */
	readonly lineage?: LineageEvent[];

	readonly payload: T;
}

export interface TaggedCellOp {
	/**
	 * The first ID in a block associated with the nodes being inserted.
	 * The node `content[i]` is associated with `id + i`.
	 */
	readonly id: ChangesetLocalId;

	/**
	 * The revision this mark is part of.
	 * Only set for changes in marks which are a composition of multiple revisions.
	 */
	readonly revision?: RevisionTag;
}

export interface ShallowCellOp extends TaggedCellOp {
	/**
	 * Whether the effect of a cell change is tied to the cells (true) or to the nodes (undefined).
	 * If undefined, then rebasing over a move of the nodes will transfer the clear effect to the destination cells.
	 */
	readonly targetCell?: true;
}

/**
 * Represents the intent to populate the contents of a range of cells.
 * Will overwrite any existing contents.
 */
export interface Fill<TTree> extends ShallowCellOp {
	readonly type: "Fill";
	/**
	 * When undefined, the cells are filled with content from a move.
	 */
	readonly src?: ChangeAtomId | readonly TTree[];
}

/**
 * Represents the intent to clear the contents from a range of cells.
 * No-op if the cells are already empty.
 */
export interface Clear extends ShallowCellOp {
	readonly type: "Clear";
	/**
	 * When undefined, the nodes in the cells are removed.
	 */
	readonly dst?: ChangesetLocalId;
}

// export interface Replace<TTree> {
// 	readonly targetCell?: true;
// 	readonly src: "Nothing" | "Move" | readonly TTree[];
// 	readonly dst: "Removed" | ChangesetLocalId;
// 	readonly id: ChangesetLocalId;
// 	readonly revision?: RevisionTag;
// }

/**
 * Represents the intent to modify the contents of a single node in a cell.
 * Is considered muted if the target node is in the removed state at the time the modification would apply.
 * Only valid under a `CellsMark` of size 1.
 */
export interface Modify<TNodeChange> {
	readonly type: "Modify";
	readonly changes: TNodeChange;

	/**
	 * Describes the "Clear" operation which last deleted the node that is being modified.
	 * Undefined if the node had not been deleted at the time of the modify.
	 * This is needed because multiple nodes may successively exist in a given cell.
	 */
	readonly detachEvent?: ChangeAtomId;

	/**
	 * Included for uniformity with `Fill` and `Clear`.
	 * `true` may be supported in the future to represent structural changes.
	 */
	readonly targetCell?: never;
}

export type CellChange<TNodeChange, TTree> = Fill<TTree> | Modify<TNodeChange> | Clear;

/**
 * A list of changes to a contiguous range of one or more cells.
 * The changes are ordered chronologically from oldest to newest.
 * Note that the changes may collectively fill or clear the cells any number of times.
 */
export type CellChanges<TNodeChange, TTree> = readonly CellChange<TNodeChange, TTree>[];

export interface CellsMark<TNodeChange, TTree>
	extends CellsAnchor<CellChanges<TNodeChange, TTree> | undefined> {}

export type Mark<TNodeChange, TTree> = CellsMark<TNodeChange, TTree>;

export type MarkList<TNodeChange, TTree> = readonly Mark<TNodeChange, TTree>[];

export type Changeset<TNodeChange = NodeChangeset, TTree = ProtoNode> = MarkList<
	TNodeChange,
	TTree
>;
