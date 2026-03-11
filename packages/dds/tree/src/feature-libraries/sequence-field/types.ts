/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChangeAtomId, ChangesetLocalId, RevisionTag } from "../../core/index.js";
import type { NodeId } from "../modular-schema/index.js";

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
	 */
	revision?: RevisionTag;
}

/**
 * Moves detached roots into cells.
 *
 * Rebasing this mark never causes it to attach a different set of nodes.
 * Rebasing this mark never causes it to attach nodes in different cells
 * (though the way those cells are identified may change).
 */
export interface Attach extends HasMoveId, HasRevisionTag {
	readonly type: "Attach";

	// XXX: Use this ID as main ID when serializing
	/**
	 * See {@link Detach.detachCellId}.
	 * This field should only be used if the attach is a pin.
	 */
	readonly detachCellId?: ChangeAtomId;
}

/**
 * Removes nodes from their cells.
 * Always brings about the desired outcome: the targeted nodes are removed from their cells.
 * Note that this may not require any changes if targeted nodes are already removed when this mark is applied.
 *
 * Rebasing this mark never causes it to target different set of nodes.
 * Rebasing this mark can cause it to clear a different set of cells.
 */
export interface Detach extends HasRevisionTag {
	readonly type: "Detach";
	readonly id: ChangesetLocalId;

	/**
	 * The ID the cell should be set to when this detach is applied.
	 * If not set, this the same as the detach ID.
	 * Note that this does not affect the ID associated with the detached node.
	 * This is ignored when `cellRename` is set.
	 *
	 * This applies to the cell where the node is being detached from,
	 * or the last cell the node occupied if it is already detached.
	 *
	 * This field is used to represent the composition of a pin and a detach.
	 * The composition will be the second detach but with the pin's detachId as detachCellId.
	 */
	readonly detachCellId?: ChangeAtomId;

	/**
	 * When set, this represents a rename of this cell to be applied after the detach.
	 * Note that this does not affect the ID associated with the detached node.
	 *
	 * This is used in two situations:
	 * - to restore the prior ID of a cell in a rollback changeset
	 * - to represent the impact of a detach composed with a rename
	 */
	readonly cellRename?: CellId;
}

/**
 * Represents the renaming of an empty cell.
 *
 * Only ever targets empty cells.
 *
 * Occurs when an Attach is composed with a Detach.
 * TODO: Use Rename when an Insert/Revive is composed with a Remove.
 */
export interface Rename {
	readonly type: "Rename";
	readonly idOverride: CellId;
}

export interface Pin extends CellMark<Attach> {
	cellId: undefined;
}

export type MarkEffect = NoopMark | Attach | Detach | Rename;

export type CellMark<TMark> = TMark & HasMarkFields;

export type Mark = CellMark<MarkEffect>;

export type MarkList = Mark[];

export type Changeset = MarkList;
