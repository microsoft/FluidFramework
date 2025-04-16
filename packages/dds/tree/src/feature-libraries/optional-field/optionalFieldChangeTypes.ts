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
	 * When the field is empty in the input context, this ID is dormant in the sense that it would be used if the changeset were applied as is.
	 * However, it can become active if the changeset is rebased over a change that attaches a node in the field.
	 */
	readonly dst: ChangeAtomId;

	/**
	 * The ID for the node to attach in this field, or undefined if no node should be attached.
	 *
	 * Note that this ID may refer to the node detached by this changeset (in cases where there is such a node).
	 * When this is the case, the node is being pinned in the field.
	 * This can be thought of as detaching the node and associating it with the ID in `dst` then attaching that node back into the field.
	 * While a pin has no effect on the document state if applied as-is, its merge semantics are different from an empty changeset.
	 * This is because rebasing a pin over a change that detaches the node from the field will result in changeset that re-attaches the node to the field.
	 * In other words, a pin guarantees that the node will be in the field after the changeset is rebased and applied, whereas an empty changeset does not.
	 *
	 * When looking at an optional changeset, one may notice that `src` and `dst` are structurally equal, and safely conclude that the changeset is a pin.
	 * However, it's possible for a changeset to be a pin even when `src` and `dst` are structurally different.
	 * This is because the detached node may be renamed (at the ModularChangeset level) before being re-attached.
	 */
	readonly src?: ChangeAtomId;
}
