/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeAtomId, ChangesetLocalId, RevisionTag } from "../../core";
import { NodeChangeset } from "../modular-schema";

export type CellCount = number;

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

export type NodeChangeType = NodeChangeset;

/**
 * Represents a position within a contiguous range of nodes detached by a single changeset.
 * Note that `LineageEvent`s with the same revision are not necessarily referring to the same detach.
 * `LineageEvent`s for a given revision can only be meaningfully compared if it is known that they must refer to the
 * same detach.
 * @alpha
 */
export interface LineageEvent {
	readonly revision: RevisionTag;
	readonly id: ChangesetLocalId;
	readonly count: number;

	/**
	 * The position of this mark within a range of nodes which were detached in this revision.
	 */
	readonly offset: number;
}

/**
 * @alpha
 */
export interface HasLineage {
	/**
	 * History of detaches adjacent to the cells described by this `ChangeAtomId`.
	 */
	lineage?: LineageEvent[];
}

export interface IdRange {
	id: ChangesetLocalId;
	count: CellCount;
}

/**
 * @alpha
 */
export interface CellId extends ChangeAtomId, HasLineage {
	/**
	 * List of all cell local IDs (including this one) which were adjacent and emptied in the same revision as this one.
	 * The IDs are ordered in sequence order, and are used for determining the relative position of cells.
	 * `CellId` objects may share an array, so this should not be mutated.
	 */
	adjacentCells?: IdRange[];
}

/**
 * Mark which targets a range of existing cells instead of creating new cells.
 */
export interface HasMarkFields<TNodeChange = never> {
	/**
	 * Describes the detach which last emptied the target cells,
	 * or the attach which allocated the cells if the cells have never been filled.
	 * Undefined if the target cells are not empty in this mark's input context.
	 */
	cellId?: CellId;

	changes?: TNodeChange;

	count: CellCount;
}

export const NoopMarkType = undefined;
export interface NoopMark {
	/**
	 * Declared for consistency with other marks.
	 * Left undefined for terseness.
	 */
	type?: typeof NoopMarkType;
}

export interface HasRevisionTag {
	/**
	 * The revision this mark is part of.
	 * Only set for marks in fields which are a composition of multiple revisions.
	 */
	revision?: RevisionTag;
}

/**
 * Moves detached roots into cells.
 * The specific content being moved in is determined by the IDs of the cells this mark targets.
 * Always brings about the desired outcome: the content is in the targeted cells.
 *
 * Rebasing this mark never causes it to insert/restore a different set of nodes.
 * Rebasing this mark never causes it to fill a different set of cells
 * (though the way those cells are identified may change).
 *
 * Carries a `MoveId` in case it is rebased over the content being moved out, in which case this mark
 * will transform into a pair of returns which will move the content back into this cell.
 */
export interface Insert extends HasMoveId, HasRevisionTag {
	type: "Insert";
}

export interface HasMoveFields extends HasMoveId, HasRevisionTag {
	/**
	 * Used when this mark represents the beginning or end of a chain of moves within a changeset.
	 * If this mark is the start of the chain, this is the ID of the end mark of the chain, and vice-versa if this is the end of the chain.
	 */
	finalEndpoint?: ChangeAtomId;
}

/**
 * Fills empty cells with content that is moved out from another cell.
 * Always brings about the desired outcome: the nodes being moved are in the target cells.
 * Note that this may not require any changes if these nodes are already in the target cells when this mark is applied.
 *
 * Rebasing this mark never causes it to move-in a different set of nodes.
 * Rebasing this mark never causes it to fill a different set of cells
 * (though the way those cells are identified may change).
 *
 * Only ever targets empty cells. It transforms into a idempotent Insert if the target cells are not empty.
 */
export interface MoveIn extends HasMoveFields {
	type: "MoveIn";
}

export interface RedetachFields {
	/**
	 * When set, the detach effect is reapplying a prior detach.
	 * The cell ID specified is used in two ways:
	 * - It indicates the location of the cell (including adjacent cell information) so that rebasing over this detach
	 * can contribute the correct lineage information to the rebased mark.
	 * - It specifies the revision and local ID that should be used to characterize the cell in the output context of
	 * detach.
	 */
	redetachId?: CellId;
}

/**
 * Removes nodes from their cells.
 * Always brings about the desired outcome: the targeted nodes are removed from their cells.
 * Note that this may not require any changes if targeted nodes are already removed when this mark is applied.
 *
 * Rebasing this mark never causes it to target different set of nodes.
 * Rebasing this mark can cause it to clear a different set of cells.
 */
export interface Delete extends HasRevisionTag, RedetachFields {
	type: "Delete";
	id: ChangesetLocalId;
}

/**
 * Removes nodes from their cells so they can be moved into other cells.
 * Always brings about the desired outcome: the targeted nodes are removed from their cells.
 * Note that this may not require any changes if targeted nodes are already removed when this mark is applied.
 *
 * Rebasing this mark never causes it to target different set of nodes.
 * Rebasing this mark can cause it to clear a different set of cells.
 */
export interface MoveOut extends HasMoveFields, RedetachFields {
	type: "MoveOut";
}

export type Attach = Insert | MoveIn;

export type Detach = Delete | MoveOut;

/**
 * Fills then empties cells.
 *
 * Only ever targets empty cells.
 *
 * As a matter of normalization, only use an AttachAndDetach mark when the attach is a new insert or a move
 * destination. In all other cases (the attach would be a revive), we rely on the implicit reviving semantics of the
 * detach and represent that detach on its own (i.e., not wrapped in an AttachAndDetach).
 */
export interface AttachAndDetach {
	type: "AttachAndDetach";
	attach: Attach;
	detach: Detach;
}

export type MarkEffect = NoopMark | Attach | Detach | AttachAndDetach;

export type CellMark<TMark, TNodeChange> = TMark & HasMarkFields<TNodeChange>;

export type Mark<TNodeChange = NodeChangeType> = CellMark<MarkEffect, TNodeChange>;

export type MarkList<TNodeChange = NodeChangeType> = Mark<TNodeChange>[];

export type Changeset<TNodeChange = NodeChangeType> = MarkList<TNodeChange>;
