/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	CommitOutcome,
	CommitKind,
	findAncestor,
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
import {
	refreshSchemaOnlyView,
	rebaseDeferredChanges,
	DeferredSchemaForkRebaser,
} from "./deferredSchemaRebase.js";
import { getCommitOutcome, hasSchemaChange } from "./sharedTreeChangeFamily.js";

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
 * Waits for all members before deciding the outcome of an ordered publication.
 * A schema acknowledgement alone cannot establish the outcome of following data.
 */
export function getPublicationStatus(
	members: readonly ViewPublicationState[],
): ViewPublicationState["type"] {
	if (members.some((member) => member.type === "pending")) {
		return "pending";
	}
	if (members.some((member) => member.type === "failed")) {
		return "failed";
	}
	if (members.some((member) => member.type === "retryRequired")) {
		return "retryRequired";
	}
	return "accepted";
}

interface PendingViewPublication {
	readonly originalBase: GraphCommit<SharedTreeChange>;
	readonly authoringSchema: TreeStoredSchema;
	readonly schemaRevision: RevisionTag;
	readonly retained: TreeCheckout["mainBranch"];
	readonly members: Map<
		RevisionTag,
		{
			readonly logicalRevision: RevisionTag;
			state: ViewPublicationState;
		}
	>;
	originalHead: GraphCommit<SharedTreeChange>;
	attempt: "initial" | "retry";
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
	private pendingSchemaRevision: RevisionTag | undefined;
	private pendingSchemaGeneration: number | undefined;
	private receivedSchemaGeneration = 0;
	private viewSchema: TreeSchema | undefined;
	private reconcileView: ((action: () => void) => void) | undefined;
	private releaseView: (() => void) | undefined;
	private pendingBase: GraphCommit<SharedTreeChange> | undefined;
	private publication: PendingViewPublication | undefined;
	private readonly schemaForkRebaser: DeferredSchemaForkRebaser;
	private readonly cancellations: GraphCommit<SharedTreeChange>[] = [];

	public constructor(private readonly base: TreeCheckout) {
		this.checkout = base.forkForView();
		this.checkout.viewBase = base;
		this.schemaForkRebaser = this.checkout.schemaForkRebaser ??=
			new DeferredSchemaForkRebaser();
		this.schemaForkRebaser.observeBranch(this.checkout.mainBranch);
		this.synchronizedHead = this.checkout.mainBranch.getHead();
		this.checkout.commitSequenceHandler = (commit) => this.recordOutcome(commit);
		this.unsubscribe = [
			base.events.on("afterOperation", () => this.synchronize()),
			base.events.on("dispose", () => this.dispose()),
			this.checkout.events.on("afterOperation", () => this.synchronize()),
			this.checkout.events.on("dispose", () => this.dispose()),
			base.mainBranch.events.on("commitSequenced", (commit) => this.recordOutcome(commit)),
			base.mainBranch.events.on("beforeChange", (event) => {
				if (event.type === "rebase") {
					// Incoming data can roll back our own schema. Count new schema commits
					// on the target, not transient schema changes in that rollback.
					const replaced = new Set(event.removedCommits.map((commit) => commit.revision));
					if (
						event.newCommits.some(
							(commit) => !replaced.has(commit.revision) && hasSchemaChange(commit.change),
						)
					) {
						this.receivedSchemaGeneration++;
					}
				} else if (
					event.type === "append" &&
					!this.synchronizing &&
					event.newCommits.some((commit) => hasSchemaChange(commit.change))
				) {
					this.receivedSchemaGeneration++;
				}
			}),
			base.mainBranch.events.on("afterChange", (event) => {
				if (event.type === "remove") {
					// Runtime cancellation removes queued commits in reverse order. Rebase
					// rejection uses sequencing outcomes instead and must not enter this path.
					this.cancellations.push(...[...event.removedCommits].reverse());
					this.synchronize();
				}
			}),
			base.events.on("afterSequencedBatch", () => this.synchronize()),
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
			this.pendingBase = this.base.mainBranch.getHead();
			this.synchronizedHead = this.checkout.mainBranch.getHead();
			this.pendingSchemaRevision = this.synchronizedHead.revision;
			this.pendingSchemaGeneration = this.receivedSchemaGeneration;
		} finally {
			this.synchronizing = false;
		}
	}

	private recordOutcome(commit: GraphCommit<SharedTreeChange>): void {
		const member = this.publication?.members.get(commit.revision);
		if (member === undefined) {
			this.checkout.reportCommitOutcome(commit.revision, getCommitOutcome(commit.change));
		} else {
			member.state = settleViewPublication(
				member.state,
				commit.revision,
				getCommitOutcome(commit.change),
			);
		}
	}

	private trackPublication(): void {
		const head = this.checkout.mainBranch.getHead();
		if (this.publication === undefined && this.pendingSchema !== undefined) {
			assert(
				this.pendingBase !== undefined,
				"A pending upgrade must retain its original base.",
			);
			this.publication = {
				originalBase: this.pendingBase,
				authoringSchema: this.checkout.storedSchema.clone(),
				schemaRevision: this.synchronizedHead.revision,
				originalHead: head,
				retained: this.checkout.mainBranch.fork(),
				members: new Map(),
				attempt: "initial",
			};
		}
		const publication = this.publication;
		if (publication === undefined) {
			return;
		}
		const commits: GraphCommit<SharedTreeChange>[] = [];
		const from =
			publication.members.size === 0 ? publication.originalBase : this.synchronizedHead;
		assert(
			findAncestor([head, commits], (commit) => commit === from) !== undefined,
			"Publication must extend the previously tracked view state.",
		);
		for (const commit of commits) {
			publication.members.set(commit.revision, {
				logicalRevision:
					commit.revision === publication.schemaRevision
						? (this.pendingSchemaRevision ?? commit.revision)
						: commit.revision,
				state: { type: "pending", revision: commit.revision, attempt: publication.attempt },
			});
		}
		publication.originalHead = head;
	}

	private finishPublication(): boolean {
		const publication = this.publication;
		if (publication === undefined) {
			return true;
		}
		if (!this.base.receivesSequencedOutcomes) {
			// A private base finishes publication when the merge applies. It has no service
			// acknowledgement to await, and this must not fabricate a public settled event.
			for (const [revision, member] of publication.members) {
				if (member.state.type === "pending") {
					const commit = findAncestor(
						this.base.mainBranch.getHead(),
						(candidate) => candidate.revision === revision,
					);
					assert(commit !== undefined, "A local publication must be present on its base.");
					member.state = settleViewPublication(
						member.state,
						revision,
						getCommitOutcome(commit.change),
					);
				}
			}
		}
		const status = getPublicationStatus(
			[...publication.members.values()].map((member) => member.state),
		);
		if (status === "pending") {
			return false;
		}
		if (status === "failed") {
			throw new Error(
				"Deferred schema publication failed after retry or violated a constraint.",
			);
		}
		if (status === "retryRequired") {
			this.retryPublication(publication);
			// An equivalent remote schema and already accepted data can leave no retry members.
			// Finish that case now; there will be no new acknowledgement to wake the controller.
			return this.finishPublication();
		}
		this.reconcile(() => this.checkout.synchronizeFrom(this.base));
		this.synchronizedHead = this.checkout.mainBranch.getHead();
		this.pendingSchema = undefined;
		this.pendingSchemaRevision = undefined;
		this.pendingSchemaGeneration = undefined;
		this.pendingBase = undefined;
		this.publication = undefined;
		try {
			for (const [revision, member] of publication.members) {
				if (this.base.receivesSequencedOutcomes) {
					this.checkout.reportCommitOutcome(
						member.logicalRevision,
						CommitOutcome.FullyApplied,
					);
				}
				if (revision !== member.logicalRevision) {
					this.checkout.discardInternalCommitOutcome(revision);
				}
			}
		} finally {
			publication.retained.dispose();
		}
		return true;
	}

	private retryPublication(publication: PendingViewPublication): void {
		assert(publication.attempt === "initial", "Only one publication retry is permitted.");
		assert(this.viewSchema !== undefined, "Recovery requires the original view schema.");
		const decision = decideViewSchema(
			this.viewSchema,
			this.base.storedSchema,
			publication.authoringSchema,
		);
		if (decision.type === "incompatible") {
			throw new Error("Deferred schema recovery cannot preserve the view schema.");
		}
		const rejected = new Set(
			[...publication.members]
				.filter(([, member]) => member.state.type !== "accepted")
				.map(([revision]) => revision),
		);
		const prepared = rebaseDeferredChanges({
			originalBase: publication.originalBase,
			currentBase: this.base.mainBranch.getHead(),
			localHead: publication.originalHead,
			authoringSchema: publication.authoringSchema,
			targetSchema: decision.schema,
			schemaRevision: publication.schemaRevision,
			rejectedRevisions: rejected,
			changeFamily: this.base.mainBranch.changeFamily,
			mintRevision: () => this.base.mintRevision(),
		});
		if (prepared.type === "unsafe") {
			throw new Error(`Deferred schema recovery is unsafe: ${prepared.reason}.`);
		}
		const candidate = this.base.fork();
		const previousMembers = new Map(publication.members);
		publication.attempt = "retry";
		publication.members.clear();
		const trackRetry = (revision: RevisionTag, logicalRevision: RevisionTag): void => {
			publication.members.set(revision, {
				logicalRevision,
				state: { type: "pending", revision, attempt: "retry" },
			});
		};
		try {
			if (decision.type === "upgrade") {
				candidate.updateSchema(decision.schema);
				trackRetry(
					candidate.mainBranch.getHead().revision,
					previousMembers.get(publication.schemaRevision)?.logicalRevision ??
						publication.schemaRevision,
				);
			}
			for (const { originalRevision, commit } of prepared.commits) {
				candidate.mainBranch.apply(commit, CommitKind.Default, commit.customMetadata);
				trackRetry(
					commit.revision,
					previousMembers.get(originalRevision)?.logicalRevision ?? originalRevision,
				);
			}
			// Adopt the reconstructed attempt before submission so synchronous acknowledgements
			// have a live target. Reconciliation does not rerun application callbacks.
			this.reconcile(() => this.checkout.synchronizeFrom(candidate, prepared.reconciliation));
			this.synchronizedHead = this.checkout.mainBranch.getHead();
			this.schemaForkRebaser.rememberRevisions(
				publication.originalHead,
				prepared.reconciliation.revisionReplacers,
			);
			this.base.merge(candidate, false);
			for (const [revision, member] of previousMembers) {
				if (
					this.base.receivesSequencedOutcomes &&
					(member.state.type === "accepted" ||
						(revision === publication.schemaRevision && decision.type === "adopt"))
				) {
					this.checkout.reportCommitOutcome(
						member.logicalRevision,
						CommitOutcome.FullyApplied,
					);
				}
				if (revision !== member.logicalRevision) {
					this.checkout.discardInternalCommitOutcome(revision);
				}
			}
		} finally {
			candidate.dispose();
		}
	}

	private reconcile(action: () => void): void {
		if (this.reconcileView === undefined) {
			action();
		} else {
			this.reconcileView(action);
		}
	}

	private applyCancellations(): void {
		for (const cancelled of this.cancellations.splice(0)) {
			const publication = this.publication;
			const member = publication?.members.get(cancelled.revision);
			const head = this.checkout.mainBranch.getHead();
			const commit = findAncestor(
				head,
				(candidate) => candidate.revision === cancelled.revision,
			);
			if (commit === undefined) {
				// Schema-only refresh may already have reflected cancellation of earlier base work.
				assert(member === undefined, "Tracked cancelled work must still be retained.");
				continue;
			}
			assert(
				head === commit,
				"Runtime cancellation cannot silently discard later application work.",
			);
			if (member !== undefined && member.logicalRevision === this.pendingSchemaRevision) {
				// Cancel the submission, not the explicit local upgrade. A later application
				// edit can publish a fresh schema prefix after the runtime finishes rollback.
				publication?.retained.dispose();
				this.publication = undefined;
				this.pendingBase = this.base.mainBranch.getHead();
			} else {
				assert(commit.parent !== undefined, "A cancelled commit must have a parent.");
				this.checkout.mainBranch.removeAfter(commit.parent);
				this.checkout.discardCancelledCommit(member?.logicalRevision ?? cancelled.revision);
				publication?.members.delete(cancelled.revision);
				if (publication !== undefined) {
					publication.originalHead = this.checkout.mainBranch.getHead();
				}
			}
			this.synchronizedHead = this.checkout.mainBranch.getHead();
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
					this.applyCancellations();
					const publishing = this.checkout.mainBranch.getHead() !== this.synchronizedHead;
					if (publishing) {
						this.trackPublication();
						this.base.merge(this.checkout, false);
						this.synchronizedHead = this.checkout.mainBranch.getHead();
					}
					if (!this.finishPublication()) {
						return;
					}
					let schemaOutcome: { revision: RevisionTag; outcome: CommitOutcome } | undefined;
					const reconcile = (): void => {
						if (this.pendingSchema === undefined) {
							this.checkout.synchronizeFrom(this.base);
						} else {
							assert(
								this.viewSchema !== undefined,
								"A pending upgrade requires a view schema.",
							);
							// A staged view can already view the old schema. Data-only changes
							// must not use that fact to cancel an explicitly requested upgrade.
							const decision: ViewSchemaDecision =
								this.pendingSchemaGeneration !== this.receivedSchemaGeneration ||
								allowsRepoSuperset(
									defaultSchemaPolicy,
									this.pendingSchema,
									this.base.storedSchema,
								)
									? decideViewSchema(
											this.viewSchema,
											this.base.storedSchema,
											this.pendingSchema,
										)
									: { type: "upgrade", schema: this.pendingSchema };
							const schemaRevision = this.pendingSchemaRevision;
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
								const oldPreparation = this.synchronizedHead.revision;
								refreshSchemaOnlyView(this.checkout, this.base, this.synchronizedHead, target);
								if (oldPreparation !== schemaRevision) {
									this.checkout.discardInternalCommitOutcome(oldPreparation);
								}
								this.pendingSchema = target;
								this.pendingBase =
									target === undefined ? undefined : this.base.mainBranch.getHead();
								this.pendingSchemaGeneration =
									target === undefined ? undefined : this.receivedSchemaGeneration;
							}
							if (this.pendingSchema === undefined && schemaRevision !== undefined) {
								this.pendingSchemaRevision = undefined;
								this.pendingSchemaGeneration = undefined;
								this.pendingBase = undefined;
								schemaOutcome = {
									revision: schemaRevision,
									outcome:
										decision.type === "incompatible"
											? CommitOutcome.FullyDropped
											: CommitOutcome.FullyApplied,
								};
							}
						}
					};
					if (this.reconcileView === undefined) {
						reconcile();
					} else {
						this.reconcileView(reconcile);
					}
					this.synchronizedHead = this.checkout.mainBranch.getHead();
					if (schemaOutcome !== undefined && this.base.receivesSequencedOutcomes) {
						this.checkout.reportCommitOutcome(schemaOutcome.revision, schemaOutcome.outcome);
					}
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
		this.publication?.retained.dispose();
		this.checkout.commitSequenceHandler = undefined;
		this.releaseView?.();
		for (const off of this.unsubscribe) {
			off();
		}
		if (!this.checkout.disposed) {
			this.checkout.dispose();
		}
	}
}
