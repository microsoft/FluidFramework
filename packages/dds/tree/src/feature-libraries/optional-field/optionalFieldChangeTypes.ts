/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChangeAtomId } from "../../core/index.js";
import type { NodeId } from "../modular-schema/index.js";

/**
 * Uniquely identifies a register within the scope of this changeset.
 * The sentinel value "self" is used for the active register, which is a universally shared register
 * (as in, any changeset referring to "self" refers to the register containing the active value of the field).
 *
 * See the model description in {@link OptionalChangeset} for more details.
 */
export type RegisterId = ChangeAtomId | "self";

export type Move = readonly [src: ChangeAtomId, dst: ChangeAtomId];

export type ChildChange = readonly [register: RegisterId, childChange: NodeId];

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
	 * An optional description of how to replace the current value of the field.
	 */
	readonly valueReplace?: Replace;
	readonly childChange?: NodeId;
}

export interface Replace {
	/**
	 * Whether the field is empty in the input context of this change.
	 */
	readonly isEmpty: boolean;

	/**
	 * The ID for the node to put in this field, or undefined if the field should be emptied.
	 * Will be "self" when the intention is to keep the current node in this field.
	 */
	readonly src?: RegisterId;

	/**
	 * An ID to associate with the node (if any) which is detached by this edit.
	 */
	readonly dst: ChangeAtomId;
}
