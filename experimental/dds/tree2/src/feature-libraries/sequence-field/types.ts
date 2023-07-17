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

	readonly placePayload: T;
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

	readonly cellPayload: T;
}

export interface IdentifiedChange {
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

/**
 * Represents the intent to allocated a new range of cells.
 */
export interface Alloc<TNodeChange, TTree> extends IdentifiedChange {
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
export interface Fill<TTree> extends IdentifiedChange {
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
export interface Clear extends IdentifiedChange {
	readonly type: "Clear";
	/**
	 * Whether the clear is part of a move. If so, a matching `Fill` will be present in the destination cell.
	 */
	readonly isMove?: true;
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

/**
 * A change that is anchored to a cell.
 * The change only affects the cell it is tied to.
 */
export type CellShallowChange<TTree> = Fill<TTree> | Clear;

/**
 * A change that is anchored to a node.
 * The change may affect the subtree rooted at the node or affect the cell that the node is located in.
 */
export type Change<TNodeChange, TTree> = Fill<TTree> | Modify<TNodeChange> | Clear;

export type NodeBoundChange<TNodeChange, TTree> = Change<TNodeChange, TTree>;

/**
 * A list of changes that are anchored to one or more contiguous cells.
 * The changes are ordered chronologically from oldest to newest.
 * The changes may collectively fill or clear the cells any number of times.
 */
export type CellBoundChanges<TTree> = readonly CellShallowChange<TTree>[];

/**
 * A list of changes that are anchored to one or more contiguous nodes.
 * The changes are ordered chronologically from oldest to newest.
 */
export type NodeBoundChanges<TNodeChange, TTree> = readonly NodeBoundChange<TNodeChange, TTree>[];

export interface PlaceMark<TNodeChange, TTree> extends PlaceAnchor<Alloc<TNodeChange, TTree>> {
	readonly type: "Place";
	/**
	 * The revision this mark is part of.
	 * Only set for marks in fields which are a composition of multiple revisions.
	 */
	readonly revision?: RevisionTag;
}

export type ReadonlyChangeAtomMap<T> = ReadonlyMap<
	RevisionTag | undefined,
	ReadonlyMap<ChangesetLocalId | undefined, T>
>;

export interface CellChanges<TNodeChange, TTree> {
	readonly cellBound: CellBoundChanges<TTree>;

	/**
	 * Changes to any of the following:
	 * - The node that exists in the cell in the input context of this changeset.
	 * - A node that will be created in the cell as part of this changeset.
	 * - A node that last existed in the cell and was concurrently deleted.
	 */
	readonly nodeBound: ReadonlyChangeAtomMap<Modify<TNodeChange>>;
}

export interface CellsMark<TNodeChange, TTree>
	extends CellsAnchor<CellChanges<TNodeChange, TTree>> {
	readonly type: "Cells";

	/**
	 * The revision this mark is part of.
	 * Only set for marks in fields which are a composition of multiple revisions.
	 */
	readonly revision?: RevisionTag;
}

export type Mark<TNodeChange, TTree> =
	| PlaceMark<TNodeChange, TTree>
	| CellsMark<TNodeChange, TTree>;

export type MarkList<TNodeChange, TTree> = readonly Mark<TNodeChange, TTree>[];

export type Changeset<TNodeChange = NodeChangeset, TTree = ProtoNode> = MarkList<
	TNodeChange,
	TTree
>;
