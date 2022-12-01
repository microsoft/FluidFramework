/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { JsonableTree, RevisionTag } from "../../core";
import { NodeChangeset } from "../modular-schema";

export type NodeChangeType = NodeChangeset;
export type Changeset<TNodeChange = NodeChangeType> = MarkList<TNodeChange>;

export type MarkList<TNodeChange = NodeChangeType, TMark = Mark<TNodeChange>> = TMark[];

export type Mark<TNodeChange = NodeChangeType> = SizedMark<TNodeChange> | Attach<TNodeChange>;

export type ObjectMark<TNodeChange = NodeChangeType> =
    | SizedObjectMark<TNodeChange>
    | Attach<TNodeChange>;

export type SizedMark<TNodeChange = NodeChangeType> = Skip | SizedObjectMark<TNodeChange>;

export type SizedObjectMark<TNodeChange = NodeChangeType> =
    | Modify<TNodeChange>
    | Detach
    | ModifyDetach<TNodeChange>;

export interface Modify<TNodeChange = NodeChangeType>
    extends HasChanges<TNodeChange>,
        HasRevisionTag {
    type: "Modify";
    tomb?: RevisionTag;
}

export interface HasChanges<TNodeChange> {
    changes: TNodeChange;
}

export interface HasPlaceFields {
    /**
     * Describes which kinds of concurrent slice operations should affect the target place.
     *
     * The tuple allows this choice to be different for concurrent slices that are sequenced
     * either before (`heed[0]`) or after (`heed[1]`). For example, multiple concurrent updates
     * of a sequence with last-write-wins semantics would use a slice-delete over the whole
     * sequence, and an insert with the `heed` value `[Effects.None, Effects.All]`.
     *
     * When the value for prior and ulterior concurrent slices is the same, that value can be
     * used directly instead of the corresponding tuple.
     *
     * Omit if `Effects.All` for terseness.
     */
    heed?: Effects | [Effects, Effects];

    /**
     * Record of relevant information about changes this mark has been rebased over.
     * Events are stored in the order in which they were rebased over.
     */
    lineage?: LineageEvent[];
}

export interface HasTiebreakPolicy extends HasPlaceFields {
    /**
     * Omit if `Tiebreak.Right` for terseness.
     */
    tiebreak?: Tiebreak;
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

export interface Insert extends HasOpId, HasTiebreakPolicy, HasRevisionTag {
    type: "Insert";
    content: ProtoNode[];
}

export interface ModifyInsert<TNodeChange = NodeChangeType>
    extends HasOpId,
        HasTiebreakPolicy,
        HasRevisionTag,
        HasChanges<TNodeChange> {
    type: "MInsert";
    content: ProtoNode;
}

export interface MoveIn extends HasOpId, HasPlaceFields, HasRevisionTag {
    type: "MoveIn";
    /**
     * The actual number of nodes being moved-in. This count excludes nodes that were concurrently deleted.
     */
    count: NodeCount;
}

export interface ModifyMoveIn<TNodeChange = NodeChangeType>
    extends HasOpId,
        HasPlaceFields,
        HasRevisionTag,
        HasChanges<TNodeChange> {
    type: "MMoveIn";
}

export type Attach<TNodeChange = NodeChangeType> =
    | Insert
    | ModifyInsert<TNodeChange>
    | MoveIn
    | ModifyMoveIn<TNodeChange>
    | Reattach
    | ModifyReattach<TNodeChange>;

export type ModifyingMark<TNodeChange = NodeChangeType> =
    | Modify<TNodeChange>
    | ModifyInsert<TNodeChange>
    | ModifyDetach<TNodeChange>
    | ModifyMoveIn<TNodeChange>
    | ModifyReattach<TNodeChange>;

export type NodeMark = Detach;

export interface Detach extends HasOpId, HasRevisionTag {
    tomb?: RevisionTag;
    type: "Delete" | "MoveOut";
    count: NodeCount;
}

export interface ModifyDetach<TNodeChange = NodeChangeType>
    extends HasOpId,
        HasRevisionTag,
        HasChanges<TNodeChange> {
    type: "MDelete" | "MMoveOut";
    tomb?: RevisionTag;
}

export interface HasReattachFields extends HasOpId, HasPlaceFields {
    /**
     * The tag of the change that detached the data being reattached.
     *
     * Undefined when the reattach is the product of a tag-less change being inverted.
     * It is invalid to try convert such a reattach mark to a delta.
     */
    detachedBy: RevisionTag | undefined;
    /**
     * The original field index of the detached node(s).
     * "Original" here means before the change that detached them was applied.
     */
    detachIndex: number;
}

export interface Reattach extends HasReattachFields, HasRevisionTag {
    type: "Revive" | "Return";
    count: NodeCount;
}
export interface ModifyReattach<TNodeChange = NodeChangeType>
    extends HasReattachFields,
        HasRevisionTag,
        HasChanges<TNodeChange> {
    type: "MRevive" | "MReturn";
}

/**
 * Represents a consecutive run of detached nodes.
 *
 * Note that in some situations a tombstone is created for the purpose of representing a gap
 * even though no node has been detached.
 * This can happen when a slice-move applied to a gap but not the nodes on both sides of the
 * gap, or when a slice-move is applied to the gap that represents the start (or end) of a
 * field.
 */
export interface Tombstones {
    count: NodeCount;
    change: RevisionTag;
}

export interface PriorOp {
    change: RevisionTag;
    id: OpId;
}

export interface HasLength {
    /**
     * Omit if 1.
     */
    length?: number;
}

export interface TreeForestPath {
    [label: string]: TreeRootPath;
}

export type TreeRootPath = number | { [label: number]: TreeForestPath };

export enum RangeType {
    Set = "Set",
    Slice = "Slice",
}

export interface HasRevisionTag {
    /**
     * The revision this mark is part of.
     * Only set for marks in fields which are a composition of multiple revisions.
     */
    revision?: RevisionTag;
}

/**
 * A monotonically increasing positive integer assigned to each change within the changeset.
 * OpIds are scoped to a single changeset, so referring to OpIds across changesets requires
 * qualifying them by change tag.
 *
 * The uniqueness of IDs is leveraged to uniquely identify the matching move-out for a move-in/return and vice-versa.
 */
export type OpId = number;

export interface HasOpId {
    /**
     * The sequential ID assigned to a change within a transaction.
     */
    id: OpId;
}

/**
 * The contents of a node to be created
 */
export type ProtoNode = JsonableTree;

export type NodeCount = number;
export type GapCount = number;
export type Skip = number;
export type ClientId = number;
export enum Tiebreak {
    Left,
    Right,
}
export enum Effects {
    All = "All",
    Move = "Move",
    Delete = "Delete",
    None = "None",
}
