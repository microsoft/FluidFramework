/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	CommitOutcome,
	type GraphCommit,
	type RevisionTag,
	type TreeStoredSchema,
} from "../core/index.js";
import { allowsRepoSuperset, defaultSchemaPolicy } from "../feature-libraries/index.js";
import {
	checkSchemaCompatibility,
	type ImplicitFieldSchema,
	type TreeSchema,
	type TreeViewConfiguration,
	TreeViewConfigurationAlpha,
} from "../simple-tree/index.js";

import type { TreeCheckout } from "./treeCheckout.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import { type SchematizingSimpleTreeView, ViewSlot } from "./schematizingTreeView.js";
import { refreshSchemaOnlyView } from "./deferredSchemaRebase.js";

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

/**
 * Owns a persistent authoring checkout backed by a borrowed base checkout.
 * @remarks Disposing the controller releases the private checkout, not the base.
 */
export class ViewBranch {
	public readonly checkout: TreeCheckout;
	private synchronizedHead: GraphCommit<SharedTreeChange>;
	private readonly unsubscribe: (() => void)[];
	private synchronizing = false;
	private disposed = false;
	private pendingSchema: TreeStoredSchema | undefined;
	private viewSchema: TreeSchema | undefined;
	private reconcileView: ((action: () => void) => void) | undefined;
	private releaseView: (() => void) | undefined;

	public constructor(private readonly base: TreeCheckout) {
		this.checkout = base.fork();
		this.synchronizedHead = this.checkout.mainBranch.getHead();
		this.unsubscribe = [
			base.events.on("afterOperation", () => this.synchronize()),
			this.checkout.events.on("afterOperation", () => this.synchronize()),
			this.checkout.events.on("dispose", () => this.dispose()),
			base.mainBranch.events.on("commitSequenced", (commit) =>
				this.checkout.mainBranch.commitWasSequenced(commit),
			),
		];
	}

	public viewWith<TRoot extends ImplicitFieldSchema>(
		config: TreeViewConfiguration<TRoot>,
	): SchematizingSimpleTreeView<TRoot> {
		if (this.base.forest.anchors.slots.has(ViewSlot)) {
			throw new UsageError("Cannot create a second tree view from the same checkout");
		}
		const view = this.checkout.viewWithInternal(config, undefined, (schema) =>
			this.upgradeLocally(schema),
		);
		this.viewSchema =
			config instanceof TreeViewConfigurationAlpha
				? config
				: new TreeViewConfigurationAlpha(config);
		this.reconcileView = (action) => view.reconcileSchema(action);
		this.base.forest.anchors.slots.set(ViewSlot, view);
		this.releaseView = () => {
			if (this.base.forest.anchors.slots.get(ViewSlot) === view) {
				this.base.forest.anchors.slots.delete(ViewSlot);
			}
		};
		return view;
	}

	private upgradeLocally(schema: TreeStoredSchema): void {
		this.synchronizing = true;
		try {
			this.checkout.updateSchema(schema);
			this.pendingSchema = schema;
			this.synchronizedHead = this.checkout.mainBranch.getHead();
		} finally {
			this.synchronizing = false;
		}
	}

	private synchronize(): void {
		if (
			this.disposed ||
			this.synchronizing ||
			!this.base.canSynchronize ||
			!this.checkout.canSynchronize
		) {
			return;
		}
		this.synchronizing = true;
		try {
			// Submission can fail after its schema member was sent. Both the borrowed base
			// and the application-facing checkout must stop rather than continue divergent.
			this.checkout.breaker.run(() =>
				this.base.breaker.run(() => {
					const publishing = this.checkout.mainBranch.getHead() !== this.synchronizedHead;
					if (publishing) {
						this.base.merge(this.checkout, false);
					}
					const reconcile = (): void => {
						if (this.pendingSchema === undefined) {
							this.checkout.synchronizeFrom(this.base);
						} else {
							assert(
								this.viewSchema !== undefined,
								"A pending upgrade requires a view schema.",
							);
							const decision = decideViewSchema(
								this.viewSchema,
								this.base.storedSchema,
								this.pendingSchema,
							);
							if (publishing) {
								// The base now contains the same commits. Do not use the schema-only
								// refresh, which is allowed to discard only internal preparation.
								if (decision.type !== "adopt") {
									throw new Error("The schema publication could not be applied to its base.");
								}
								this.pendingSchema = undefined;
								this.checkout.synchronizeFrom(this.base);
							} else if (decision.type === "incompatible") {
								this.checkout.synchronizeFrom(this.base);
								this.pendingSchema = undefined;
							} else {
								const target = decision.type === "upgrade" ? decision.schema : undefined;
								refreshSchemaOnlyView(this.checkout, this.base, this.synchronizedHead, target);
								this.pendingSchema = target;
							}
						}
					};
					if (this.reconcileView === undefined) {
						reconcile();
					} else {
						this.reconcileView(reconcile);
					}
					this.synchronizedHead = this.checkout.mainBranch.getHead();
				}),
			);
		} finally {
			this.synchronizing = false;
		}
	}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.releaseView?.();
		for (const off of this.unsubscribe) {
			off();
		}
		if (!this.checkout.disposed) {
			this.checkout.dispose();
		}
	}
}
