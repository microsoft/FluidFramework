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

/**
 * Identifies an empty cell.
 */
export interface DetachEvent {
	/**
	 * The intention of edit which last emptied the cell.
	 */
	revision: RevisionTag;

	/**
	 * The absolute position of the node in this cell in the input context of the revision which emptied it.
	 */
	index: number;
}

export interface PlaceAnchor<T> {
	/**
	 * Omit if `Tiebreak.Right` for terseness.
	 */
	readonly tiebreak?: Tiebreak;

	/**
	 * Record of relevant information about changes this anchor has been rebased over.
	 * Events are stored in the order in which they were rebased over.
	 */
	readonly lineage?: LineageEvent[];

	readonly payload: T;
}

export interface NodesAnchor<T> {
	readonly count: NodeCount;
	/**
	 * Describes the detach which last emptied target cells.
	 * Undefined if the target cells are not empty in this anchor's input context.
	 */
	readonly detachEvent?: DetachEvent;

	/**
	 * Lineage of detaches adjacent to the cells since `detachEvent`.
	 * Should be empty if the cells are full in this mark's input context.
	 */
	readonly lineage?: LineageEvent[];

	readonly payload: T;
}

export interface ShallowCellChange {
	/**
	 * The first ID in a block associated with the nodes being inserted.
	 * The node `content[i]` is associated with `id + i`.
	 */
	readonly id: ChangesetLocalId;

	/**
	 * The revision this mark is part of.
	 * Only set for marks in fields which are a composition of multiple revisions.
	 */
	readonly revision?: RevisionTag;
}

/**
 * Represents the intent to allocated a new range of cells.
 */
export interface Alloc<TNodeChange, TTree> extends ShallowCellChange {
	readonly count: NodeCount;
	/**
	 * Additional changes to be applied to the cells.
	 */
	readonly changes: CellChanges<TNodeChange, TTree>;
}

/**
 * Represents the intent to populate the contents of a range of cells.
 * Is considered muted if the cells are already full.
 */
export interface Fill<TTree> extends ShallowCellChange {
	readonly type: "Fill";
	readonly content: ChangeAtomId | readonly TTree[];
	/**
	 * When true, the corresponding `Clear` is muted, therefore muting this change also.
	 */
	readonly isSrcMuted?: true;
}

/**
 * Represents the intent to clear the contents from a range of cells.
 * Is considered muted if the cells are already empty.
 */
export interface Clear extends ShallowCellChange {
	readonly type: "Clear";
	/**
	 * Whether the clear is part of a move. If so, a matching `Fill` will be present in the destination cell.
	 */
	readonly isMove?: true;
	/**
	 * Whether the effect of clearing the cells is tied to the nodes or to the cells.
	 * If true, then rebasing over a move of the nodes will transfer the clear effect to the destination cells.
	 * This is used to support "replace" merge semantics.
	 */
	readonly followNodes?: true;
}

/**
 * Represents the intent to modify the contents of a single node in a cell.
 * Is considered muted if the cell is empty.
 * Only valid under an `Alloc` or `NodesMark` of size 1.
 */
export interface Modify<TNodeChange> {
	readonly type: "Modify";
	readonly changes: TNodeChange;
}

export type CellChange<TNodeChange, TTree> = Fill<TTree> | Modify<TNodeChange> | Clear;

/**
 * A list of changes to a contiguous range of one or more cells.
 * The changes are ordered chronologically from oldest to newest.
 * Note that the changes may collectively fill or clear the cells any number of times.
 */
export type CellChanges<TNodeChange, TTree> = readonly CellChange<TNodeChange, TTree>[];

export interface PlaceMark<TNodeChange, TTree> extends PlaceAnchor<Alloc<TNodeChange, TTree>> {
	readonly type: "Place";
}

export interface NodesMark<TNodeChange, TTree>
	extends NodesAnchor<CellChanges<TNodeChange, TTree> | undefined> {
	readonly type: "Nodes";
}

export type Mark<TNodeChange, TTree> =
	| PlaceMark<TNodeChange, TTree>
	| NodesMark<TNodeChange, TTree>;

export type MarkList<TNodeChange, TTree> = readonly Mark<TNodeChange, TTree>[];

export type Changeset<TNodeChange = NodeChangeset, TTree = ProtoNode> = MarkList<
	TNodeChange,
	TTree
>;
