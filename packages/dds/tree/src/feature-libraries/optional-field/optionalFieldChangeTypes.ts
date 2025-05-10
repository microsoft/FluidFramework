/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChangeAtomId } from "../../core/index.js";
import type { NodeId } from "../modular-schema/index.js";

/**
 * Changes to an optional field.
 *
 * The model used is that optional field consists of a single register.
 * In a given change input or output context, this register may hold 0 or 1 nodes.
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
	 * An ID to associate with the node (if any) which is detached by this edit.
	 *
	 * When the field is empty in the input context, this ID is dormant in the sense that it would not be used if the changeset were applied as is.
	 * However, it can become active if the changeset is rebased over a change that attaches a node in the field.
	 */
	readonly dst: ChangeAtomId;

	/**
	 * The ID for the node to attach in this field, or undefined if no node should be attached.
	 *
	 * Note that this ID may refer to the node detached by this changeset:
	 * The node in the field is detached and associated with ID `dst`,
	 * then that node is renamed from `dst` to `src` (at the ModularChangeset level),
	 * then that node is attached back into the field.
	 * When this is the case, we say that the node is being pinned in the field.
	 * While a pin has no effect on the document state if applied as-is, its merge semantics are different from an empty changeset.
	 * This is because rebasing a pin over a change that detaches the node from the field will result in a changeset that re-attaches the node to the field.
	 * In other words, a pin guarantees that the node will be in the field after the changeset is rebased and applied, whereas an empty changeset does not.
	 *
	 * `src` must be structurally different from `dst` even when the changeset is a pin.
	 * An optional field changeset that aims to attach a node must be able to affect two nodes,
	 * so unless we want to mint new IDs during rebasing, such a changeset must have two different IDs.
	 */
	readonly src?: ChangeAtomId;
}
