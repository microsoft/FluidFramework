/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChangeAtomId, ChangesetLocalId, RevisionTag } from "../../core/index.js";
import type { NodeId } from "../index.js";

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

/**
 */
export interface CellId extends ChangeAtomId {}

/**
 * Mark which targets a range of existing cells instead of creating new cells.
 */
export interface HasMarkFields {
	/**
	 * Describes the detach which last emptied the target cells,
	 * or the attach which allocated the cells if the cells have never been filled.
	 * Undefined if the target cells are not empty in this mark's input context.
	 */
	cellId?: CellId;

	changes?: NodeId;

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

export interface DetachFields {
	/**
	 * When set, the detach should use the `CellId` specified in this object to characterize the cell being emptied.
	 *
	 * This is used in two situations:
	 * - to restore the prior ID of a cell in a rollback changeset
	 * - to represent the impact of a detach composed with a rename
	 */
	readonly idOverride?: CellId;
}

/**
 * Removes nodes from their cells.
 * Always brings about the desired outcome: the targeted nodes are removed from their cells.
 * Note that this may not require any changes if targeted nodes are already removed when this mark is applied.
 *
 * Rebasing this mark never causes it to target different set of nodes.
 * Rebasing this mark can cause it to clear a different set of cells.
 */
export interface Remove extends HasRevisionTag, DetachFields {
	type: "Remove";
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
export interface MoveOut extends HasMoveFields, DetachFields {
	type: "MoveOut";
}

export type Attach = Insert | MoveIn;

export type Detach = Remove | MoveOut;

/**
 * Fills then empties cells.
 *
 * Only ever targets empty cells.
 *
 * As a matter of normalization, we only use an AttachAndDetach to represent MoveIn ○ Remove.
 *
 * We do NOT use AttachAndDetach to represent the following compositions:
 * - Insert/Revive ○ Remove (represented by a Remove)
 * - Insert/Revive ○ MoveOut (represented by a MoveOut)
 * - MoveIn ○ MoveOut (represented by a Rename)
 */
export interface AttachAndDetach {
	type: "AttachAndDetach";
	attach: Attach;
	detach: Detach;
}

/**
 * Represents the renaming of an empty cell.
 *
 * Only ever targets empty cells.
 *
 * Occurs when a MoveIn is composed with a MoveOut.
 * TODO: Use Rename when an Insert/Revive is composed with a Remove.
 */
export interface Rename {
	type: "Rename";
	readonly idOverride: CellId;
}

export type MarkEffect = NoopMark | Attach | Detach | AttachAndDetach | Rename;

export type CellMark<TMark> = TMark & HasMarkFields;

export type Mark = CellMark<MarkEffect>;

export type MarkList = Mark[];

export type Changeset = MarkList;
