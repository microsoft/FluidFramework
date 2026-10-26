/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { GraphCommit, TreeStoredSchema } from "../core/index.js";
import { assert } from "@fluidframework/core-utils/internal";

import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { TreeCheckout } from "./treeCheckout.js";

/**
 * Retained input for reconciling a view branch before full schema/data rebase support.
 * @remarks
 * The owner must pin these histories and their repair data for the duration of the operation.
 * Read-only references alone do not protect a commit from history trimming.
 */
export interface DeferredSchemaRebaseInput {
	readonly originalBase: GraphCommit<SharedTreeChange>;
	readonly currentBase: GraphCommit<SharedTreeChange>;
	readonly localHead: GraphCommit<SharedTreeChange>;
	readonly targetSchema: TreeStoredSchema;
}

/**
 * A prepared reconciliation or an explicit refusal to risk the retained work.
 * @remarks
 * A successful result is not a submitted or accepted operation.
 * Revision replacement, publication, retry accounting, and notification belong to the controller.
 */
export type DeferredSchemaRebaseResult =
	| { readonly type: "prepared"; readonly change: SharedTreeChange }
	| {
			readonly type: "unsafe";
			readonly reason: "schemaConflict" | "constraintViolation" | "unrelatedHistory";
	  };

/**
 * Temporary boundary for the current schema/data rebase limitations.
 * @remarks
 * Implementations may operate on separately owned scratch branches, but must not mutate live input
 * checkouts, submit ops, emit application events, or alter the logical publication's retry allowance.
 * Replace the implementation with standard rebase when all required cases are supported.
 */
export type DeferredSchemaRebase = (
	input: DeferredSchemaRebaseInput,
) => DeferredSchemaRebaseResult;

/**
 * Refreshes known schema-only private history under the current rebase limitation.
 * @remarks
 * Unlike reconstruction of application work, this executor deliberately mutates the private checkout.
 * The owner must suppress intermediate schema notifications and must provide the last schema-only head.
 * No user edits may have been added after that head.
 * Remove this workaround when standard schema/data rebase preserves the private upgrade.
 */
export function refreshSchemaOnlyView(
	checkout: TreeCheckout,
	base: TreeCheckout,
	schemaOnlyHead: GraphCommit<SharedTreeChange>,
	target: TreeStoredSchema | undefined,
): void {
	assert(
		checkout.mainBranch.getHead() === schemaOnlyHead,
		"Schema-only refresh must not discard application changes.",
	);
	checkout.synchronizeFrom(base);
	checkout.mainBranch.removeAfter(base.mainBranch.getHead());
	if (target !== undefined) {
		checkout.updateSchema(target);
	}
}
