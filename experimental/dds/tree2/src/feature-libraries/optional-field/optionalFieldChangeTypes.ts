/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeAtomId } from "../../core";
import { NodeChangeset } from "../modular-schema";

/**
 * Uniquely identifies a register within the scope of this changeset.
 * The sentinel value "self" is used for the active register, which is a universally shared register
 * (as in, any changeset referring to "self" refers to the register containing the active value of the field).
 *
 * See the model description in {@link OptionalChangeset} for more details.
 */
export type RegisterId = ChangeAtomId | "self";

/**
 * Changes to an optional field.
 *
 * The model used is that optional field consists of a collection of "registers" with one designated as the "active" register.
 * In a given change input or output context, registers may hold 0 or 1 nodes.
 * Each register is identified using a {@link RegisterId}.
 * The active register holds the current value of the field, and other registers hold detached roots.
 */
export interface OptionalChangeset {
	/**
	 * Each entry signifies the intent to move a node from `src` to `dst`.
	 *
	 * These entries should not be interpreted as "applied one after the other", but rather as "applied simultaneously".
	 * As such, changesets should not contain duplicated src or dst entries (lest they populate the same register twice,
	 * or try to move a node to two different places).
	 *
	 * The third entry specifies whether the "intent" of the move is to target a specific source register ("cellTargeting") OR to
	 * target the node that currently happens to occupy some source register ("nodeTargeting").
	 * This is relevant when considering how changes should be rebased.
	 *
	 * Rebasing logic should only generate moves whose `src` is an occupied register.
	 */
	moves: (readonly [src: RegisterId, dst: RegisterId, kind: "nodeTargeting" | "cellTargeting"])[];

	/**
	 * Nested changes to nodes that occupy registers.
	 *
	 * Nodes are identified by the register they occupy in the *input* context of the changeset.
	 */
	childChanges: [register: RegisterId, childChange: NodeChangeset][];

	/**
	 * Set iff:
	 * 1. This change intends to populate a register (call it `foo`)
	 * 2. That register is currently unoccupied
	 *
	 * In such cases, this changeset should not include a move with source `foo`, since `foo` is empty.
	 * However, if this changeset is then rebased over a change which populates `foo`, the rebased changeset must now empty `foo`.
	 * This reserved id is used as the destination of that emptying move.
	 */
	reservedDetachId?: RegisterId;
}
