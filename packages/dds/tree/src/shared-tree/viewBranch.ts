/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import { CommitOutcome, type RevisionTag, type TreeStoredSchema } from "../core/index.js";
import { allowsRepoSuperset, defaultSchemaPolicy } from "../feature-libraries/index.js";
import { checkSchemaCompatibility, type TreeSchema } from "../simple-tree/index.js";

export type {
	DeferredSchemaRebase,
	DeferredSchemaRebaseInput,
	DeferredSchemaRebaseResult,
} from "./deferredSchemaRebase.js";

/**
 * A decision about reconciling a locally upgraded view with received schema.
 * Schema references are borrowed; callers must not mutate them while executing the decision.
 */
export type ViewSchemaDecision =
	| { readonly type: "adopt"; readonly schema: TreeStoredSchema }
	| { readonly type: "upgrade"; readonly schema: TreeStoredSchema }
	| { readonly type: "incompatible" };

/**
 * Selects a schema without changing either checkout.
 * @param viewSchema - The application's view schema.
 * @param receivedSchema - The actual schema of the base, not the private upgraded schema.
 * @param upgradeTarget - The target computed using the view's staged-upgrade policy.
 */
export function decideViewSchema(
	viewSchema: TreeSchema,
	receivedSchema: TreeStoredSchema,
	upgradeTarget: TreeStoredSchema,
): ViewSchemaDecision {
	if (checkSchemaCompatibility(viewSchema, receivedSchema).canView) {
		return { type: "adopt", schema: receivedSchema };
	}
	if (
		allowsRepoSuperset(defaultSchemaPolicy, receivedSchema, upgradeTarget) &&
		checkSchemaCompatibility(viewSchema, upgradeTarget).canView
	) {
		return { type: "upgrade", schema: upgradeTarget };
	}
	return { type: "incompatible" };
}

/**
 * State of one logical publication, including at most one recovery attempt.
 * @remarks
 * The revision identifies the current attempt, not the logical edit.
 * Retained user changes and their lifetime are owned by the controller.
 */
export type ViewPublicationState =
	| {
			readonly type: "pending";
			readonly revision: RevisionTag;
			readonly attempt: "initial" | "retry";
	  }
	| { readonly type: "retryRequired"; readonly revision: RevisionTag }
	| { readonly type: "accepted"; readonly revision: RevisionTag }
	| {
			readonly type: "failed";
			readonly revision: RevisionTag;
			readonly reason: "constraintViolation" | "retryRejected";
	  };

/**
 * Processes a definitive outcome without replaying application code or mutating state.
 * @param state - State of the logical publication.
 * @param revision - The attempt for which an outcome was received.
 * @param outcome - A sequenced result, or a confirmed synchronization rollback requiring a new attempt.
 * Transport resubmission and application-requested cancellation must not be passed as rollback.
 */
export function settleViewPublication(
	state: ViewPublicationState,
	revision: RevisionTag,
	outcome: CommitOutcome | "rollback",
): ViewPublicationState {
	if (state.type !== "pending" || state.revision !== revision) {
		return state;
	}

	switch (outcome) {
		case CommitOutcome.FullyApplied: {
			return { type: "accepted", revision };
		}
		case CommitOutcome.NewContentOnly: {
			return { type: "failed", revision, reason: "constraintViolation" };
		}
		case CommitOutcome.FullyDropped:
		case "rollback": {
			return state.attempt === "initial"
				? { type: "retryRequired", revision }
				: { type: "failed", revision, reason: "retryRejected" };
		}
		default: {
			return unreachableCase(outcome);
		}
	}
}

/**
 * Starts the single retry after its retained work has been reconstructed safely.
 * @param state - A publication that requires its first and only retry.
 * @param revision - A fresh revision allocated by the controller.
 */
export function retryViewPublication(
	state: Extract<ViewPublicationState, { readonly type: "retryRequired" }>,
	revision: RevisionTag,
): ViewPublicationState {
	assert(revision !== state.revision, "A retry must use a new publication revision.");
	return { type: "pending", revision, attempt: "retry" };
}
