/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { GraphCommit, TreeStoredSchema } from "../core/index.js";

import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";

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
