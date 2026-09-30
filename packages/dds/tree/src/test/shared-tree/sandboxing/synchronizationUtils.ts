/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { GraphCommit } from "../../../core/index.js";
import {
	SchematizingSimpleTreeView,
	type SharedTreeChange,
	type TreeCheckout,
} from "../../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Sandbox synchronization requires internal branch APIs.
import type { TreeViewAlpha } from "../../../simple-tree/api/index.js";
import type { ImplicitFieldSchema, UnsafeUnknownSchema } from "../../../simple-tree/index.js";
import type { JsonCompatibleReadOnly } from "../../../util/index.js";

/**
 * Gets the internal checkout for a sandbox view.
 */
export function getCheckout<TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema>(
	view: TreeViewAlpha<TSchema>,
): TreeCheckout {
	assert(
		view instanceof SchematizingSimpleTreeView,
		"Expected view to be a SchematizingSimpleTreeView",
	);
	return view.checkout;
}

/**
 * Gets a finalized-history boundary for a sandbox checkout.
 */
export function getFinalizedCommit(checkout: TreeCheckout): GraphCommit<SharedTreeChange> {
	return checkout.getFinalizedCommit();
}

/**
 * Serializes an existing commit with its revision.
 */
export function serializeCommit(
	checkout: TreeCheckout,
	commit: GraphCommit<SharedTreeChange>,
): JsonCompatibleReadOnly {
	return checkout.serializeCommit(commit);
}

/**
 * Replaces the commits after `base` with the supplied serialized commits.
 */
export function applyBranchUpdate(
	checkout: TreeCheckout,
	base: GraphCommit<SharedTreeChange>,
	commits: readonly JsonCompatibleReadOnly[],
): void {
	const branch = checkout.mainBranch;
	branch.removeAfter(base);
	for (const commit of commits) {
		checkout.applyChange(commit);
	}
}
