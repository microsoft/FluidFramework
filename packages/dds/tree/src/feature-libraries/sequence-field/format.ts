/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { JsonableTree } from "../../tree";
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
    | Tomb
    | Modify<TNodeChange>
    | Detach
    | Reattach
    | ModifyReattach<TNodeChange>
    | ModifyDetach<TNodeChange>;

export interface Tomb {
    type: "Tomb";
    change: ChangesetTag;
    count: number;
}

export interface Modify<TNodeChange = NodeChangeType> {
    type: "Modify";
    tomb?: ChangesetTag;
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
     * Omit if `Tiebreak.Right` for terseness.
     */
    tiebreak?: Tiebreak;
}

export interface GapEffectPolicy {
    /**
     * When `true`, if a concurrent insertion that is sequenced before the range operation falls
     * within the bounds of the range, then the inserted content will *not* be included in the
     * range and therefore will *not* be affected by the operation performed on the range.
     *
     * Defaults to false.
     */
    excludePriorInsertions?: true;
    /**
     * When `true`, if a concurrent insertion that is sequenced after the range operation falls
     * within the bounds of the range, then the inserted content will be included in the range and
     * therefore will be affected by the operation performed on the range, unless that insertion
     * stipulates that it is not commutative with respect to the range operation.
     *
     * Defaults to false.
     */
    includePosteriorInsertions?: true;
}

export interface Insert extends HasOpId, HasPlaceFields {
    type: "Insert";
    content: ProtoNode[];
}

export interface ModifyInsert<TNodeChange = NodeChangeType> extends HasOpId, HasPlaceFields {
    type: "MInsert";
    content: ProtoNode;
    changes: TNodeChange;
}

export interface MoveIn extends HasOpId, HasPlaceFields {
    type: "MoveIn";
    /**
     * The actual number of nodes being moved-in. This count excludes nodes that were concurrently deleted.
     */
    count: NodeCount;
}

export interface ModifyMoveIn<TNodeChange = NodeChangeType> extends HasOpId, HasPlaceFields {
    type: "MMoveIn";
    changes: TNodeChange;
}

export type Attach<TNodeChange = NodeChangeType> =
    | Insert
    | ModifyInsert<TNodeChange>
    | MoveIn
    | ModifyMoveIn<TNodeChange>;

export type NodeMark = Detach | Reattach;

export interface Detach extends HasOpId {
    tomb?: ChangesetTag;
    type: "Delete" | "MoveOut";
    count: NodeCount;
}

export interface ModifyDetach<TNodeChange = NodeChangeType> extends HasOpId {
    type: "MDelete" | "MMoveOut";
    tomb?: ChangesetTag;
    changes: TNodeChange;
}

export interface Reattach extends HasOpId {
    type: "Revive" | "Return";
    tomb: ChangesetTag;
    count: NodeCount;
}
export interface ModifyReattach<TNodeChange = NodeChangeType> extends HasOpId {
    type: "MRevive" | "MReturn";
    tomb: ChangesetTag;
    changes: TNodeChange;
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
    change: ChangesetTag;
}

export interface PriorOp {
    change: ChangesetTag;
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
export type ChangesetTag = number | string;
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
