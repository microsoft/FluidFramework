/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { GraphCommit } from "../../../core/index.js";
import {
	SchematizingSimpleTreeView,
	type SharedTreeChange,
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
) {
	assert(
		view instanceof SchematizingSimpleTreeView,
		"Expected view to be a SchematizingSimpleTreeView",
	);
	return view.checkout;
}

/**
 * Gets the internal branch for a sandbox view.
 */
export function getBranch<TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema>(
	view: TreeViewAlpha<TSchema>,
) {
	return getCheckout(view).mainBranch;
}

/**
 * Gets the sequenced trunk head for a collaborative sandbox view.
 */
export function getTrunkHead<TSchema extends ImplicitFieldSchema>(
	view: TreeViewAlpha<TSchema>,
): GraphCommit<SharedTreeChange> {
	return getCheckout(view).getTrunkHead();
}

/**
 * Serializes an existing commit with its revision.
 */
export function serializeCommit<TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema>(
	view: TreeViewAlpha<TSchema>,
	commit: GraphCommit<SharedTreeChange>,
): JsonCompatibleReadOnly {
	return getCheckout(view).serializeCommit(commit);
}

/**
 * Replaces the commits after `base` with the supplied serialized commits.
 */
export function applyBranchUpdate<TSchema extends ImplicitFieldSchema>(
	view: TreeViewAlpha<TSchema>,
	base: GraphCommit<SharedTreeChange>,
	commits: readonly JsonCompatibleReadOnly[],
): void {
	const branch = getBranch(view);
	branch.removeAfter(base);
	for (const commit of commits) {
		view.applyChange(commit);
	}
}
