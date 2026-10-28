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
	type CustomMetadataTree,
} from "../core/index.js";
import { allowsRepoSuperset, defaultSchemaPolicy } from "../feature-libraries/index.js";
import {
	checkSchemaCompatibility,
	type ImplicitFieldSchema,
	type TreeSchema,
	type TreeViewConfiguration,
	type ReadSchema,
	type UnsafeUnknownSchema,
	TreeViewConfigurationAlpha,
} from "../simple-tree/index.js";

import type { CheckoutBase, TreeCheckout } from "./treeCheckout.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import { type SchematizingSimpleTreeView, ViewSlot } from "./schematizingTreeView.js";
import {
	rebaseDeferredChanges,
	DeferredSchemaForkRebaser,
	removeSchemaPreparation,
} from "./deferredSchemaRebase.js";
import type { BranchReconciliation } from "../shared-tree-core/index.js";
import {
	getCommitOutcome,
	hasSchemaChange,
	isSchemaOnlyChange,
} from "./sharedTreeChangeFamily.js";

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

interface PublicationRequest {
	readonly revision: RevisionTag;
	readonly customMetadata: CustomMetadataTree | undefined;
	readonly viewId: number | undefined;
}

interface PendingSchemaPreparation {
	readonly base: GraphCommit<SharedTreeChange>;
	readonly head: GraphCommit<SharedTreeChange>;
	readonly schema: TreeStoredSchema;
	readonly viewSchema: TreeSchema;
	readonly generation: number;
	readonly requests: readonly PublicationRequest[];
	readonly viewId: number | undefined;
	readonly cancelled: boolean;
}

type PublicationMember = {
	state: ViewPublicationState;
	readonly requests: readonly PublicationRequest[];
} & (
	| {
			readonly kind: "schema";
			readonly schema: TreeStoredSchema;
			readonly viewSchema: TreeSchema;
			readonly generation: number;
	  }
	| { readonly kind: "application" }
);

interface PendingViewPublication {
	readonly originalBase: GraphCommit<SharedTreeChange>;
	authoringSchema: TreeStoredSchema;
	viewSchema: TreeSchema;
	generation: number;
	readonly schemaRevisions: Set<RevisionTag>;
	readonly retained: TreeCheckout["mainBranch"];
	readonly members: Map<RevisionTag, PublicationMember>;
	originalHead: GraphCommit<SharedTreeChange>;
	attempt: "initial" | "retry";
}

interface SchemaTransactionFrame {
	readonly before: GraphCommit<SharedTreeChange>;
	request?: { readonly viewSchema: TreeSchema; readonly viewId: number };
}

function requestForCommit(
	commit: GraphCommit<SharedTreeChange>,
	viewId: number | undefined,
): PublicationRequest {
	return { revision: commit.revision, customMetadata: commit.customMetadata, viewId };
}

function schemaMetadata(
	requests: readonly PublicationRequest[],
): CustomMetadataTree | undefined {
	const children = requests.flatMap((request) =>
		request.customMetadata === undefined ? [] : [request.customMetadata],
	);
	return children.length === 0
		? undefined
		: children.length === 1
			? children[0]
			: { metadata: undefined, children };
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
	private pendingUpgrade: PendingSchemaPreparation | undefined;
	private receivedSchemaGeneration = 0;
	private synchronizedSchemaGeneration = 0;
	private viewSchema: TreeSchema | undefined;
	private reconcileView: ((action: () => void) => void) | undefined;
	private releaseView: (() => void) | undefined;
	private publication: PendingViewPublication | undefined;
	private readonly schemaForkRebaser: DeferredSchemaForkRebaser;
	private readonly cancellations: GraphCommit<SharedTreeChange>[] = [];
	private readonly schemaTransactions: SchemaTransactionFrame[] = [];
	private completedSchemaTransaction: SchemaTransactionFrame | undefined;
	private mixedSchemaTransaction: SchemaTransactionFrame | undefined;
	private nextViewId = 0;
	private activeViewId: number | undefined;

	public constructor(private readonly base: CheckoutBase) {
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
			this.checkout.transaction.events.on("started", () => {
				this.schemaTransactions.push({ before: this.checkout.mainBranch.getHead() });
			}),
			this.checkout.transaction.events.on("committing", () => {
				const frame = this.schemaTransactions.pop();
				assert(frame !== undefined, "A committing transaction must have a schema frame.");
				if (frame.request !== undefined) {
					const parent = this.schemaTransactions.at(-1);
					if (parent === undefined) {
						this.completedSchemaTransaction = frame;
					} else {
						parent.request = frame.request;
					}
				}
			}),
			this.checkout.transaction.events.on("aborting", () => {
				assert(
					this.schemaTransactions.pop() !== undefined,
					"An aborting transaction must have a schema frame.",
				);
			}),
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

	public viewWith<TRoot extends ImplicitFieldSchema | UnsafeUnknownSchema>(
		config: TreeViewConfiguration<ReadSchema<TRoot>>,
	): SchematizingSimpleTreeView<TRoot> {
		if (this.disposed) {
			throw new UsageError("Cannot create a view from a disposed view-branch controller.");
		}
		if (this.base.forest.anchors.slots.has(ViewSlot)) {
			throw new UsageError("Cannot create a second tree view from the same checkout");
		}
		const viewSchema =
			config instanceof TreeViewConfigurationAlpha
				? config
				: new TreeViewConfigurationAlpha(config);
		const viewId = ++this.nextViewId;
		const view = this.checkout.viewWithInternal(
			config,
			false,
			viewSchema.schemaUpgradeMode === "deferred"
				? (schema) => this.upgradeLocally(schema, viewSchema, viewId)
				: undefined,
			() => {
				this.reconcileView = undefined;
				this.releaseView?.();
				this.releaseView = undefined;
				this.activeViewId = undefined;
				if (this.pendingUpgrade?.viewId === viewId) {
					this.pendingUpgrade = { ...this.pendingUpgrade, cancelled: true };
				}
				this.synchronize();
			},
		);
		this.viewSchema = viewSchema;
		this.activeViewId = viewId;
		this.reconcileView = (action) => view.reconcileSchema(action);
		this.base.forest.anchors.slots.set(ViewSlot, view);
		this.releaseView = () => {
			if (this.base.forest.anchors.slots.get(ViewSlot) === view) {
				this.base.forest.anchors.slots.delete(ViewSlot);
			}
		};
		return view;
	}

	private upgradeLocally(
		schema: TreeStoredSchema,
		viewSchema: TreeSchema,
		viewId: number,
	): void {
		const before = this.checkout.mainBranch.getHead();
		this.synchronizing = true;
		try {
			this.checkout.updateSchema(schema);
			const frame = this.schemaTransactions.at(-1);
			if (frame === undefined) {
				this.prepareUpgrade(schema, before, viewSchema, viewId);
			} else {
				// The native transaction owns this schema change until its outermost commit.
				// An abort must not turn it into persistent, out-of-transaction preparation.
				frame.request = { viewSchema, viewId };
			}
		} finally {
			this.synchronizing = false;
		}
		if (this.pendingUpgrade?.cancelled === true) {
			this.synchronize();
		}
	}

	private prepareUpgrade(
		schema: TreeStoredSchema,
		before: GraphCommit<SharedTreeChange>,
		viewSchema: TreeSchema,
		viewId: number,
	): void {
		const requested = this.checkout.mainBranch.getHead();
		assert(
			isSchemaOnlyChange(requested.change),
			"Private preparation must contain only schema.",
		);
		const previous = this.pendingUpgrade;
		const requests = [
			...(previous?.cancelled === false ? previous.requests : []),
			requestForCommit(requested, viewId),
		];
		const base = previous?.base ?? before;
		if (previous !== undefined || requested.change.changes.length !== 1) {
			this.reconcile(() => {
				removeSchemaPreparation(this.checkout, base, requested);
				this.applyPreparation(schema, requests);
			});
			if (previous?.cancelled === true) {
				for (const request of previous.requests) {
					this.checkout.discardCancelledCommit(request.revision);
				}
			}
		}
		this.pendingUpgrade = {
			base,
			head: this.checkout.mainBranch.getHead(),
			schema,
			viewSchema,
			generation: this.synchronizedSchemaGeneration,
			requests,
			viewId,
			cancelled: viewId !== this.activeViewId,
		};
		this.schemaForkRebaser.rememberSchema(this.pendingUpgrade.head);
		if (previous !== undefined) {
			this.discardPreparationEvent(previous);
		}
		this.synchronizedHead = this.checkout.mainBranch.getHead();
	}

	private applyPreparation(
		schema: TreeStoredSchema,
		requests: readonly PublicationRequest[],
		checkout: CheckoutBase = this.checkout,
	): void {
		assert(
			allowsRepoSuperset(defaultSchemaPolicy, checkout.storedSchema, schema),
			"Schema preparation must be an expansion of its authoring base.",
		);
		checkout.mainBranch.apply(
			{
				revision: checkout.mintRevision(),
				change: {
					changes: [
						{
							type: "schema",
							innerChange: {
								schema: { old: checkout.storedSchema.clone(), new: schema },
								isInverse: false,
							},
						},
					],
				},
			},
			CommitKind.Default,
			schemaMetadata(requests),
		);
		this.schemaForkRebaser.rememberSchema(checkout.mainBranch.getHead());
	}

	private discardPreparationEvent(pending: PendingSchemaPreparation): void {
		if (!pending.requests.some((request) => request.revision === pending.head.revision)) {
			this.checkout.discardInternalCommitOutcome(pending.head.revision);
		}
	}

	private processSchemaTransaction(): void {
		const frame = this.completedSchemaTransaction;
		this.completedSchemaTransaction = undefined;
		if (frame?.request === undefined) {
			return;
		}
		const head = this.checkout.mainBranch.getHead();
		assert(head !== frame.before, "A committed upgrade transaction must retain its change.");
		if (isSchemaOnlyChange(head.change)) {
			this.prepareUpgrade(
				this.checkout.storedSchema.clone(),
				frame.before,
				frame.request.viewSchema,
				frame.request.viewId,
			);
		} else {
			// Preserve application-authored mixed transactions, including their native undo
			// restrictions. Do not split their schema changes out of the transaction.
			this.mixedSchemaTransaction = frame;
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
		const pending = this.pendingUpgrade;
		const mixed = this.mixedSchemaTransaction;
		this.mixedSchemaTransaction = undefined;
		if (this.publication === undefined && (pending !== undefined || mixed !== undefined)) {
			const originalBase = pending?.base ?? mixed?.before;
			const viewSchema = mixed?.request?.viewSchema ?? pending?.viewSchema ?? this.viewSchema;
			assert(
				originalBase !== undefined && viewSchema !== undefined,
				"Publication needs its authoring context.",
			);
			this.publication = {
				originalBase,
				authoringSchema: this.checkout.storedSchema.clone(),
				viewSchema,
				generation: pending?.generation ?? this.synchronizedSchemaGeneration,
				schemaRevisions: new Set(),
				originalHead: originalBase,
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
		assert(
			findAncestor([head, commits], (commit) => commit === publication.originalHead) !==
				undefined,
			"Publication must extend the previously tracked view state.",
		);
		for (const commit of commits) {
			const state: ViewPublicationState = {
				type: "pending",
				revision: commit.revision,
				attempt: publication.attempt,
			};
			if (commit === pending?.head) {
				publication.schemaRevisions.add(commit.revision);
				publication.members.set(commit.revision, {
					kind: "schema",
					schema: pending.schema,
					viewSchema: pending.viewSchema,
					generation: pending.generation,
					requests: pending.requests,
					state,
				});
			} else {
				publication.members.set(commit.revision, {
					kind: "application",
					requests: [requestForCommit(commit, this.activeViewId)],
					state,
				});
			}
		}
		publication.originalHead = head;
		publication.authoringSchema = this.checkout.storedSchema.clone();
		publication.viewSchema =
			mixed?.request?.viewSchema ??
			pending?.viewSchema ??
			this.viewSchema ??
			publication.viewSchema;
		publication.generation = pending?.generation ?? this.synchronizedSchemaGeneration;
		// Once an application change commits, its preparation belongs to this publication.
		// A later upgrade request gets a separate pending record and cannot be cleared by its ack.
		this.pendingUpgrade = undefined;
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
		this.reconcileTo(this.base);
		this.publication = undefined;
		try {
			for (const [revision, member] of publication.members) {
				this.settleRequests(member.requests, CommitOutcome.FullyApplied);
				if (!member.requests.some((request) => request.revision === revision)) {
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
		const decision = this.selectSchema(
			publication.viewSchema,
			publication.authoringSchema,
			publication.generation,
			this.base,
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
			schemaRevisions: publication.schemaRevisions,
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
		try {
			if (decision.type === "upgrade") {
				const requests = [...previousMembers.values()].flatMap((member) =>
					member.kind === "schema" && member.state.type !== "accepted" ? member.requests : [],
				);
				this.applyPreparation(decision.schema, requests, candidate);
				const revision = candidate.mainBranch.getHead().revision;
				publication.schemaRevisions.add(revision);
				publication.members.set(revision, {
					kind: "schema",
					schema: decision.schema,
					viewSchema: publication.viewSchema,
					generation: this.receivedSchemaGeneration,
					requests,
					state: { type: "pending", revision, attempt: "retry" },
				});
			}
			for (const { originalRevision, commit } of prepared.commits) {
				candidate.mainBranch.apply(commit, CommitKind.Default, commit.customMetadata);
				const original = previousMembers.get(originalRevision);
				assert(
					original?.kind === "application",
					"A retry must correspond to retained application work.",
				);
				publication.members.set(commit.revision, {
					...original,
					state: { type: "pending", revision: commit.revision, attempt: "retry" },
				});
			}
			// Adopt the reconstructed attempt before submission so synchronous acknowledgements
			// have a live target. Reconciliation does not rerun application callbacks.
			this.reconcileTo(candidate, prepared.reconciliation);
			this.schemaForkRebaser.rememberRevisions(
				publication.originalHead,
				prepared.reconciliation.revisionReplacers,
			);
			publication.originalHead = candidate.mainBranch.getHead();
			publication.authoringSchema = candidate.storedSchema.clone();
			publication.generation = this.receivedSchemaGeneration;
			this.base.merge(candidate, false);
			for (const [revision, member] of previousMembers) {
				if (
					member.state.type === "accepted" ||
					(member.kind === "schema" && decision.type === "adopt")
				) {
					this.settleRequests(member.requests, CommitOutcome.FullyApplied);
				}
				if (!member.requests.some((request) => request.revision === revision)) {
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

	private selectSchema(
		viewSchema: TreeSchema,
		target: TreeStoredSchema,
		generation: number,
		base: CheckoutBase,
	): ViewSchemaDecision {
		// Viewability of an unchanged old schema does not cancel requested staged upgrades.
		return generation !== this.receivedSchemaGeneration ||
			allowsRepoSuperset(defaultSchemaPolicy, target, base.storedSchema)
			? decideViewSchema(viewSchema, base.storedSchema, target)
			: allowsRepoSuperset(defaultSchemaPolicy, base.storedSchema, target)
				? { type: "upgrade", schema: target }
				: { type: "incompatible" };
	}

	private settleRequests(
		requests: readonly PublicationRequest[],
		outcome: CommitOutcome | "cancelled",
	): void {
		for (const request of requests) {
			if (outcome === "cancelled") {
				this.checkout.discardCancelledCommit(request.revision);
			} else if (this.base.receivesSequencedOutcomes && request.viewId === this.activeViewId) {
				this.checkout.reportCommitOutcome(request.revision, outcome);
			} else {
				this.checkout.discardInternalCommitOutcome(request.revision);
			}
		}
	}

	/**
	 * Reconciles committed work while keeping newer untriggered schema requests private.
	 * Only the schema-only suffix is removed; the adapter owns any transformation of data.
	 */
	private reconcileTo(
		target: CheckoutBase,
		reconciliation?: BranchReconciliation<SharedTreeChange>,
	): void {
		const pending = this.pendingUpgrade;
		let outcome: CommitOutcome | "cancelled" | undefined;
		this.reconcile(() => {
			if (pending !== undefined) {
				removeSchemaPreparation(this.checkout, pending.base, pending.head);
			}
			this.pendingUpgrade = undefined;
			this.checkout.synchronizeFrom(target, reconciliation);
			if (pending !== undefined) {
				if (pending.cancelled) {
					outcome = "cancelled";
				} else {
					const decision = this.selectSchema(
						pending.viewSchema,
						pending.schema,
						pending.generation,
						target,
					);
					if (decision.type === "upgrade") {
						const base = this.checkout.mainBranch.getHead();
						this.applyPreparation(decision.schema, pending.requests);
						this.pendingUpgrade = {
							...pending,
							base,
							head: this.checkout.mainBranch.getHead(),
							schema: decision.schema,
							generation: this.receivedSchemaGeneration,
						};
					} else {
						outcome =
							decision.type === "adopt"
								? CommitOutcome.FullyApplied
								: CommitOutcome.FullyDropped;
					}
				}
				this.discardPreparationEvent(pending);
			}
		});
		this.synchronizedHead = this.checkout.mainBranch.getHead();
		this.synchronizedSchemaGeneration = this.receivedSchemaGeneration;
		if (pending !== undefined && outcome !== undefined) {
			this.settleRequests(pending.requests, outcome);
		}
	}

	private applyCancellations(): void {
		for (const cancelled of this.cancellations.splice(0)) {
			const publication = this.publication;
			const member = publication?.members.get(cancelled.revision);
			const pending = this.pendingUpgrade;
			this.reconcile(() => {
				if (pending !== undefined) {
					removeSchemaPreparation(this.checkout, pending.base, pending.head);
					this.discardPreparationEvent(pending);
				}
				this.pendingUpgrade = undefined;
				const head = this.checkout.mainBranch.getHead();
				const commit = findAncestor(
					head,
					(candidate) => candidate.revision === cancelled.revision,
				);
				if (commit === undefined) {
					assert(member === undefined, "Tracked cancelled work must still be retained.");
					if (pending !== undefined) {
						this.restorePreparation(pending);
					}
					return;
				}
				assert(
					head === commit,
					"Runtime cancellation cannot silently discard later application work.",
				);
				assert(commit.parent !== undefined, "A cancelled commit must have a parent.");
				this.checkout.mainBranch.removeAfter(commit.parent);
				let preparation = pending;
				if (member?.kind === "schema") {
					// Cancellation retracts this submission, not an earlier explicit upgrade.
					// A later pending request may already include the cancelled schema capability.
					preparation =
						pending === undefined
							? {
									base: commit.parent,
									head: commit,
									schema: member.schema,
									viewSchema: member.viewSchema,
									generation: member.generation,
									requests: member.requests,
									viewId: member.requests[0]?.viewId,
									cancelled: !member.requests.some(
										(request) => request.viewId === this.activeViewId,
									),
								}
							: { ...pending, requests: [...member.requests, ...pending.requests] };
				} else if (member === undefined) {
					this.checkout.discardCancelledCommit(cancelled.revision);
				} else {
					this.settleRequests(member.requests, "cancelled");
				}
				publication?.members.delete(cancelled.revision);
				if (publication !== undefined) {
					publication.originalHead = this.checkout.mainBranch.getHead();
				}
				if (preparation !== undefined) {
					this.restorePreparation(preparation);
				}
			});
			if (publication?.members.size === 0) {
				this.publication = undefined;
				publication.retained.dispose();
			}
			this.synchronizedHead = this.checkout.mainBranch.getHead();
		}
	}

	private restorePreparation(pending: PendingSchemaPreparation): void {
		const base = this.checkout.mainBranch.getHead();
		this.applyPreparation(pending.schema, pending.requests);
		this.pendingUpgrade = { ...pending, base, head: this.checkout.mainBranch.getHead() };
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
					this.processSchemaTransaction();
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
					if (
						this.pendingUpgrade?.cancelled === true ||
						(this.pendingUpgrade?.base ?? this.checkout.mainBranch.getHead()) !==
							this.base.mainBranch.getHead()
					) {
						this.reconcileTo(this.base);
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
