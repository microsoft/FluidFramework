/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { JsonableTree, RevisionTag } from "../../core";
import { ChangesetLocalId, NodeChangeset } from "../modular-schema";

export type NodeChangeType = NodeChangeset;
export type Changeset<TNodeChange = NodeChangeType> = MarkList<TNodeChange>;

export type MarkList<TNodeChange = NodeChangeType, TMark = Mark<TNodeChange>> = TMark[];

export type Mark<TNodeChange = NodeChangeType> =
	| InputSpanningMark<TNodeChange>
	| OutputSpanningMark<TNodeChange>;

export type ObjectMark<TNodeChange = NodeChangeType> = Exclude<Mark<TNodeChange>, Skip>;

/**
 * A mark that spans one or more cells.
 * The spanned cells may be populated (e.g., "Delete") or not (e.g., "Revive").
 */
export type CellSpanningMark<TNodeChange> = Exclude<Mark<TNodeChange>, NewAttach<TNodeChange>>;

/**
 * A mark that spans one or more nodes in the input context of its changeset.
 */
export type InputSpanningMark<TNodeChange> =
	| Skip
	| Detach<TNodeChange>
	| Modify<TNodeChange>
	| SkipLikeReattach<TNodeChange>;

/**
 * A mark that spans one or more nodes in the output context of its changeset.
 */
export type OutputSpanningMark<TNodeChange> =
	| Skip
	| NewAttach<TNodeChange>
	| Modify<TNodeChange>
	| Reattach<TNodeChange>;

/**
 * A Reattach whose target nodes are already reattached and have not been detached by some other change.
 * Such a Reattach has no effect when applied and is therefore akin to a Skip mark.
 */
export type SkipLikeReattach<TNodeChange> = Reattach<TNodeChange> &
	Conflicted & {
		lastDeletedBy?: never;
	};

/**
 * A Detach with a conflicted destination.
 * Such a Detach has no effect when applied and is therefore akin to a Skip mark.
 */
export type SkipLikeDetach<TNodeChange> = (MoveOut<TNodeChange> | ReturnFrom<TNodeChange>) & {
	isDstConflicted: true;
};

export interface Conflicted {
	/**
	 * The revision of the concurrent change that the mark conflicts with.
	 */
	conflictsWith: RevisionTag;
}

export type CanConflict = Partial<Conflicted>;

export interface Modify<TNodeChange = NodeChangeType> {
	type: "Modify";
	changes: TNodeChange;
}

export interface HasChanges<TNodeChange = NodeChangeType> {
	changes?: TNodeChange;
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

export interface Insert<TNodeChange = NodeChangeType>
	extends HasTiebreakPolicy,
		HasRevisionTag,
		HasChanges<TNodeChange> {
	type: "Insert";
	content: ProtoNode[];
}

export interface MoveIn extends HasMoveId, HasPlaceFields, HasRevisionTag, CanConflict {
	type: "MoveIn";
	/**
	 * The actual number of nodes being moved-in. This count excludes nodes that were concurrently deleted.
	 */
	count: NodeCount;
	/**
	 * When true, the corresponding MoveOut has a conflict.
	 * This is independent of whether this mark has a conflict.
	 */
	isSrcConflicted?: true;
}

/**
 * An attach mark that allocates new cells.
 */
export type NewAttach<TNodeChange = NodeChangeType> = Insert<TNodeChange> | MoveIn;

export type Attach<TNodeChange = NodeChangeType> = NewAttach<TNodeChange> | Reattach<TNodeChange>;

export type Detach<TNodeChange = NodeChangeType> =
	| Delete<TNodeChange>
	| MoveOut<TNodeChange>
	| ReturnFrom<TNodeChange>;

export type Reattach<TNodeChange = NodeChangeType> = Revive<TNodeChange> | ReturnTo;

export interface Delete<TNodeChange = NodeChangeType>
	extends HasRevisionTag,
		HasChanges<TNodeChange>,
		CanConflict {
	type: "Delete";
	count: NodeCount;
}

export interface MoveOut<TNodeChange = NodeChangeType>
	extends HasRevisionTag,
		HasMoveId,
		HasChanges<TNodeChange>,
		CanConflict {
	type: "MoveOut";
	count: NodeCount;
	/**
	 * When true, the corresponding MoveIn has a conflict.
	 * This is independent of whether this mark has a conflict.
	 */
	isDstConflicted?: true;
}

export interface HasReattachFields extends HasPlaceFields {
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

	/**
	 * When true, the intent for the target nodes is as follows:
	 * - In a "Revive" mark: the nodes should exist no matter how they were deleted.
	 * - In a "Return" mark: the nodes, if they exist, should be located here no matter how they were moved.
	 *
	 * When undefined, the mark is solely intended to revert a prior change, and will therefore only take effect
	 * if that change has taken effect.
	 */
	isIntention?: true;

	/**
	 * The changeset that last detached the nodes that this mark intends to revive.
	 * For this property to be set, the target nodes must have been reattached by another changeset,
	 * then detached by a changeset other than `Reattach.detachedBy`.
	 *
	 * This property should only be set or read when `Reattach.isIntention` is undefined.
	 * This property should be `undefined` when it would otherwise be equivalent to `Reattach.detachedBy`.
	 */
	lastDetachedBy?: RevisionTag;
}

export interface Revive<TNodeChange = NodeChangeType>
	extends HasReattachFields,
		HasRevisionTag,
		HasChanges<TNodeChange>,
		CanConflict {
	type: "Revive";
	count: NodeCount;
}

export interface ReturnTo extends HasReattachFields, HasRevisionTag, HasMoveId, CanConflict {
	type: "ReturnTo";
	count: NodeCount;
	/**
	 * When true, the corresponding ReturnFrom has a conflict.
	 * This is independent of whether this mark has a conflict.
	 */
	isSrcConflicted?: true;
}

export interface ReturnFrom<TNodeChange = NodeChangeType>
	extends HasRevisionTag,
		HasMoveId,
		HasChanges<TNodeChange>,
		CanConflict {
	type: "ReturnFrom";
	count: NodeCount;
	/**
	 * Needed for detecting the following:
	 * - The mark is being composed with its inverse
	 * - The mark should be no longer be conflicted
	 *
	 * Always kept consistent with `ReturnTo.detachedBy`.
	 */
	detachedBy: RevisionTag | undefined;

	/**
	 * Only populated when the mark is conflicted.
	 * Indicates the index of the detach in the input context of the change with revision `conflictsWith`.
	 */
	detachIndex?: number;

	/**
	 * When true, the corresponding ReturnTo has a conflict.
	 * This is independent of whether this mark has a conflict.
	 */
	isDstConflicted?: true;
}

export interface PriorOp {
	change: RevisionTag;
}

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
 * A monotonically increasing positive integer assigned to an individual mark within the changeset.
 * MoveIds are scoped to a single changeset, so referring to MoveIds across changesets requires
 * qualifying them by change tag.
 *
 * The uniqueness of IDs is leveraged to uniquely identify the matching move-out for a move-in/return and vice-versa.
 */
export type MoveId = ChangesetLocalId;

export interface HasMoveId {
	/**
	 * The sequential ID assigned to a change within a transaction.
	 */
	id: MoveId;
}

/**
 * The contents of a node to be created
 */
export type ProtoNode = JsonableTree;

export type NodeCount = number;
export type Skip = number;
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
