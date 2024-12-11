/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type {
	HasListeners,
	IEmitter,
	Listenable,
} from "@fluidframework/core-interfaces/internal";
import { createEmitter } from "@fluid-internal/client-utils";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import {
	UsageError,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";
import { noopValidator } from "../codec/index.js";
import {
	type Anchor,
	type AnchorLocator,
	type AnchorNode,
	AnchorSet,
	type AnchorSetRootEvents,
	type ChangeFamily,
	CommitKind,
	type CommitMetadata,
	type DeltaVisitor,
	type DetachedFieldIndex,
	type IEditableForest,
	type IForestSubscription,
	type JsonableTree,
	RevertibleStatus,
	type RevisionTag,
	type RevisionTagCodec,
	type TreeStoredSchema,
	TreeStoredSchemaRepository,
	type TreeStoredSchemaSubscription,
	combineVisitors,
	makeDetachedFieldIndex,
	rebaseChange,
	rootFieldKey,
	tagChange,
	visitDelta,
	type RevertibleAlphaFactory,
	type RevertibleAlpha,
	type GraphCommit,
} from "../core/index.js";
import {
	type FieldBatchCodec,
	type TreeCompressionStrategy,
	buildForest,
	createNodeKeyManager,
	intoDelta,
	jsonableTreeFromCursor,
	makeFieldBatchCodec,
} from "../feature-libraries/index.js";
import {
	SquashingTransactionStack,
	SharedTreeBranch,
	TransactionResult,
	onForkTransitive,
	type SharedTreeBranchChange,
	type Transactor,
} from "../shared-tree-core/index.js";
import { Breakable, disposeSymbol, fail, getLast, hasSome } from "../util/index.js";

import { SharedTreeChangeFamily, hasSchemaChange } from "./sharedTreeChangeFamily.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { ISharedTreeEditor, SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";
import type { IDisposable } from "@fluidframework/core-interfaces";
import type {
	ImplicitFieldSchema,
	ReadSchema,
	TreeView,
	TreeViewConfiguration,
	UnsafeUnknownSchema,
	ViewableTree,
	TreeBranch,
} from "../simple-tree/index.js";
import { getCheckout, SchematizingSimpleTreeView } from "./schematizingTreeView.js";

/**
 * Events for {@link ITreeCheckout}.
 */
export interface CheckoutEvents {
	/**
	 * The view is currently in a consistent state, but a batch of changes is about to be processed.
	 * @remarks After this event fires, it is safe to access the FlexTree, Forest and AnchorSet again until {@link CheckoutEvents.afterBatch} fires.
	 * @param appendedCommits - Any commits that were appended to the checkout's branch in order to produce the changes in this batch.
	 * May be empty if the changes were produced by e.g. a rebase or the initial loading of the document.
	 */
	beforeBatch(appendedCommits: readonly GraphCommit<SharedTreeChange>[]): void;

	/**
	 * A batch of changes has finished processing and the view is in a consistent state.
	 * @remarks It is once again safe to access the FlexTree, Forest and AnchorSet.
	 * @param appendedCommits - Any commits that were appended to the checkout's branch in order to produce the changes in this batch.
	 * May be empty if the changes were produced by e.g. a rebase or the initial loading of the document.
	 * @remarks
	 * This is mainly useful for knowing when to do followup work scheduled during events from Anchors.
	 */
	afterBatch(appendedCommits: readonly GraphCommit<SharedTreeChange>[]): void;

	/**
	 * Fired when a change is made to the branch. Includes data about the change that is made which listeners
	 * can use to filter on changes they care about e.g. local vs remote changes.
	 *
	 * @param data - information about the change
	 * @param getRevertible - a function provided that allows users to get a revertible for the change. If not provided,
	 * this change is not revertible.
	 */
	changed(data: CommitMetadata, getRevertible?: RevertibleAlphaFactory): void;

	/**
	 * Fired when a new branch is created from this checkout.
	 */
	fork(branch: ITreeCheckout): void;

	/**
	 * Fired when the checkout is disposed.
	 */
	dispose(): void;
}

/**
 * A "version control"-style branch of a SharedTree.
 * @remarks Branches may be used to coordinate edits to a SharedTree, e.g. via merge and rebase operations.
 * Changes applied to a branch of a branch only apply to that branch and are isolated from other branches.
 * Changes may be synchronized across branches via merge and rebase operations provided on the branch object.
 * @alpha @sealed
 */
export interface BranchableTree extends ViewableTree {
	/**
	 * Spawn a new branch which is based off of the current state of this branch.
	 * Any mutations of the new branch will not apply to this branch until the new branch is merged back into this branch via `merge()`.
	 */
	branch(): TreeBranchFork;

	/**
	 * Apply all the new changes on the given branch to this branch.
	 * @param view - a branch which was created by a call to `branch()`.
	 * It is automatically disposed after the merge completes.
	 * @remarks All ongoing transactions (if any) in `branch` will be committed before the merge.
	 * A "changed" event and a corresponding {@link Revertible} will be emitted on this branch for each new change merged from 'branch'.
	 */
	merge(branch: TreeBranchFork): void;

	/**
	 * Apply all the new changes on the given branch to this branch.
	 * @param branch - a branch which was created by a call to `branch()`.
	 * @param disposeMerged - whether or not to dispose `branch` after the merge completes.
	 * @remarks All ongoing transactions (if any) in `branch` will be committed before the merge.
	 */
	merge(branch: TreeBranchFork, disposeMerged: boolean): void;

	/**
	 * Rebase the given branch onto this branch.
	 * @param branch - a branch which was created by a call to `branch()`. It is modified by this operation.
	 */
	rebase(branch: TreeBranchFork): void;
}

/**
 * A {@link BranchableTree | branch} of a SharedTree that has merged from another branch.
 * @remarks This branch should be disposed when it is no longer needed in order to free resources.
 * @alpha @sealed
 */
export interface TreeBranchFork extends BranchableTree, IDisposable {
	/**
	 * Rebase the changes that have been applied to this branch over all the new changes in the given branch.
	 * @param branch - Either the root branch or a branch that was created by a call to `branch()`. It is not modified by this operation.
	 */
	rebaseOnto(branch: BranchableTree): void;
}

/**
 * Provides a means for interacting with a SharedTree.
 * This includes reading data from the tree and running transactions to mutate the tree.
 * @remarks This interface should not have any implementations other than those provided by the SharedTree package libraries.
 * @privateRemarks
 * API for interacting with a {@link SharedTreeBranch}.
 * Implementations of this interface must implement the {@link branchKey} property.
 */
export interface ITreeCheckout extends AnchorLocator, ViewableTree {
	/**
	 * Read and Write access for schema stored in the document.
	 *
	 * These APIs are temporary and will be replaced with different abstractions (View Schema based) in a different place later.
	 *
	 * TODO:
	 * Editing of this should be moved into transactions with the rest of tree editing to they can be intermixed.
	 * This will be done after the relations between views, branches and Indexes are figured out.
	 *
	 * TODO:
	 * Public APIs for dealing with schema should be in terms of View Schema, and schema update policies.
	 * The actual stored schema should be hidden (or ar least not be the most prominent way to interact with schema).
	 *
	 * TODO:
	 * Something should ensure the document contents are always in schema.
	 */
	readonly storedSchema: TreeStoredSchemaSubscription;
	/**
	 * Current contents.
	 * Updated by edits (local and remote).
	 * Use `editor` to create a local edit.
	 */
	readonly forest: IForestSubscription;

	/**
	 * Used to edit the state of the tree. Edits will be immediately applied locally to the tree.
	 * If there is no transaction currently ongoing, then the edits will be submitted to Fluid immediately as well.
	 */
	readonly editor: ISharedTreeEditor;

	/**
	 * A collection of functions for managing transactions.
	 */
	readonly transaction: Transactor;

	branch(): ITreeCheckoutFork;

	merge(checkout: ITreeCheckoutFork): void;

	merge(checkout: ITreeCheckoutFork, disposeMerged: boolean): void;

	rebase(checkout: ITreeCheckoutFork): void;

	/**
	 * Replaces all schema with the provided schema.
	 * Can over-write preexisting schema, and removes unmentioned schema.
	 */
	updateSchema(newSchema: TreeStoredSchema): void;

	/**
	 * Events about this view.
	 */
	readonly events: Listenable<CheckoutEvents>;

	/**
	 * Events about the root of the tree in this view.
	 */
	readonly rootEvents: Listenable<AnchorSetRootEvents>;

	/**
	 * Returns a JsonableTree for each tree that was removed from (and not restored to) the document.
	 * This list is guaranteed to contain all nodes that are recoverable through undo/redo on this checkout.
	 * The list may also contain additional nodes.
	 *
	 * This is only intended for use in testing and exceptional code paths: it is not performant.
	 */
	getRemovedRoots(): [string | number | undefined, number, JsonableTree][];
}

/**
 * Creates a {@link TreeCheckout}.
 * @param args - an object containing optional components that will be used to build the view.
 * Any components not provided will be created by default.
 * @remarks This does not create a {@link SharedTree}, but rather a view with the minimal state
 * and functionality required to implement {@link ITreeCheckout}.
 */
export function createTreeCheckout(
	idCompressor: IIdCompressor,
	mintRevisionTag: () => RevisionTag,
	revisionTagCodec: RevisionTagCodec,
	args?: {
		branch?: SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>;
		changeFamily?: ChangeFamily<SharedTreeEditBuilder, SharedTreeChange>;
		schema?: TreeStoredSchemaRepository;
		forest?: IEditableForest;
		fieldBatchCodec?: FieldBatchCodec;
		events?: Listenable<CheckoutEvents> &
			IEmitter<CheckoutEvents> &
			HasListeners<CheckoutEvents>;
		removedRoots?: DetachedFieldIndex;
		chunkCompressionStrategy?: TreeCompressionStrategy;
		logger?: ITelemetryLoggerExt;
		breaker?: Breakable;
		disposeForksAfterTransaction?: boolean;
	},
): TreeCheckout {
	const forest = args?.forest ?? buildForest();
	const schema = args?.schema ?? new TreeStoredSchemaRepository();
	const defaultCodecOptions = { jsonValidator: noopValidator };
	const defaultFieldBatchVersion = 1;
	const changeFamily =
		args?.changeFamily ??
		new SharedTreeChangeFamily(
			revisionTagCodec,
			args?.fieldBatchCodec ??
				makeFieldBatchCodec(defaultCodecOptions, defaultFieldBatchVersion),
			{ jsonValidator: noopValidator },
			args?.chunkCompressionStrategy,
			idCompressor,
		);
	const branch =
		args?.branch ??
		new SharedTreeBranch(
			{
				change: changeFamily.rebaser.compose([]),
				revision: "root",
			},
			changeFamily,
			() => idCompressor.generateCompressedId(),
		);
	const events = args?.events ?? createEmitter();

	return new TreeCheckout(
		branch,
		false,
		changeFamily,
		schema,
		forest,
		events,
		mintRevisionTag,
		revisionTagCodec,
		idCompressor,
		args?.removedRoots,
		args?.logger,
		args?.breaker,
		args?.disposeForksAfterTransaction,
	);
}

/**
 * Branch (like in a version control system) of SharedTree.
 *
 * {@link ITreeCheckout} that has forked off of the main trunk/branch.
 */
export interface ITreeCheckoutFork extends ITreeCheckout {
	rebaseOnto(view: ITreeCheckout): void;
}

/**
 * Metrics derived from a revert operation.
 *
 * @see {@link TreeCheckout.revertRevertible}.
 */
export interface RevertMetrics {
	/**
	 * The age of the revertible commit relative to the head of the branch to which the reversion will be applied.
	 */
	readonly age: number;

	// TODO: add other stats as needed for telemetry, etc.
}

/**
 * An implementation of {@link ITreeCheckoutFork}.
 */
export class TreeCheckout implements ITreeCheckoutFork {
	public disposed = false;

	private readonly views = new Set<TreeView<ImplicitFieldSchema>>();

	/**
	 * Set of revertibles maintained for automatic disposal
	 */
	private readonly revertibles = new Set<RevertibleAlpha>();

	/**
	 * Each branch's head commit corresponds to a revertible commit.
	 * Maintaining a whole branch ensures the commit graph is not pruned in a way that would prevent the commit from
	 * being reverted.
	 */
	private readonly revertibleCommitBranches = new Map<
		RevisionTag,
		SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>
	>();

	/**
	 * The name of the telemetry event logged for calls to {@link TreeCheckout.revertRevertible}.
	 * @privateRemarks Exposed for testing purposes.
	 */
	public static readonly revertTelemetryEventName = "RevertRevertible";

	public constructor(
		branch: SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>,
		/** True if and only if this checkout is for a forked branch and not the "main branch" of the tree. */
		public readonly isBranch: boolean,
		private readonly changeFamily: ChangeFamily<SharedTreeEditBuilder, SharedTreeChange>,
		public readonly storedSchema: TreeStoredSchemaRepository,
		public readonly forest: IEditableForest,
		public readonly events: Listenable<CheckoutEvents> &
			IEmitter<CheckoutEvents> &
			HasListeners<CheckoutEvents>,
		private readonly mintRevisionTag: () => RevisionTag,
		private readonly revisionTagCodec: RevisionTagCodec,
		private readonly idCompressor: IIdCompressor,
		private removedRoots: DetachedFieldIndex = makeDetachedFieldIndex(
			"repair",
			revisionTagCodec,
			idCompressor,
		),
		/** Optional logger for telemetry. */
		private readonly logger?: ITelemetryLoggerExt,
		private readonly breaker: Breakable = new Breakable("TreeCheckout"),
		private readonly disposeForksAfterTransaction?: boolean,
	) {
		this.#transaction = new SquashingTransactionStack(
			branch,
			(commits) => {
				const revision = this.mintRevisionTag();
				for (const transactionStep of commits) {
					this.removedRoots.updateMajor(transactionStep.revision, revision);
				}

				const squashedChange = this.changeFamily.rebaser.compose(commits);
				const change = this.changeFamily.rebaser.changeRevision(squashedChange, revision);
				return tagChange(change, revision);
			},
			() => {
				// Keep track of all the forks created during the transaction so that we can dispose them when the transaction ends.
				// This is a policy decision that we think is useful for the user, but it is not necessary for correctness.
				const forks = new Set<TreeCheckout>();
				const onDisposeUnSubscribes: (() => void)[] = [];
				const onForkUnSubscribe = onForkTransitive(this, (fork) => {
					forks.add(fork);
					onDisposeUnSubscribes.push(fork.events.on("dispose", () => forks.delete(fork)));
				});
				// When each transaction is started, take a snapshot of the current state of removed roots
				const removedRootsSnapshot = this.removedRoots.clone();
				return (result) => {
					if (result === TransactionResult.Abort) {
						this.removedRoots = removedRootsSnapshot;
					}
					if (this.disposeForksAfterTransaction !== false) {
						forks.forEach((fork) => fork.dispose());
					}
					onDisposeUnSubscribes.forEach((unsubscribe) => unsubscribe());
					onForkUnSubscribe();
				};
			},
		);

		branch.events.on("afterChange", (event) => {
			// The following logic allows revertibles to be generated for the change.
			// Currently only appends (including merges and transaction commits) are supported.
			if (event.type === "append") {
				// TODO:#20949: When the SharedTree is detached, these commits will already have been garbage collected.
				//       Figure out a way to generate revertibles before the commits are garbage collected.
				for (const commit of event.newCommits) {
					const kind = event.type === "append" ? event.kind : CommitKind.Default;
					const { change, revision } = commit;

					const getRevertible = hasSchemaChange(change)
						? undefined
						: (onRevertibleDisposed?: (revertible: RevertibleAlpha) => void) => {
								if (!withinEventContext) {
									throw new UsageError(
										"Cannot get a revertible outside of the context of a changed event.",
									);
								}
								if (this.revertibleCommitBranches.get(revision) !== undefined) {
									throw new UsageError(
										"Cannot generate the same revertible more than once. Note that this can happen when multiple changed event listeners are registered.",
									);
								}
								const revertible = this.createRevertible(
									revision,
									kind,
									this,
									onRevertibleDisposed,
								);
								this.revertibleCommitBranches.set(
									revision,
									this.#transaction.activeBranch.fork(commit),
								);
								this.revertibles.add(revertible);
								return revertible;
							};

					let withinEventContext = true;
					this.events.emit("changed", { isLocal: true, kind }, getRevertible);
					withinEventContext = false;
				}
			} else if (this.isRemoteChangeEvent(event)) {
				// TODO: figure out how to plumb through commit kind info for remote changes
				this.events.emit("changed", { isLocal: false, kind: CommitKind.Default });
			}
		});

		this.#transaction.activeBranchEvents.on("beforeChange", this.onBeforeChange);
		this.#transaction.activeBranchEvents.on("ancestryTrimmed", this.onAncestryTrimmed);
	}

	private readonly onBeforeChange = (
		event: SharedTreeBranchChange<SharedTreeChange>,
	): void => {
		// We subscribe to `beforeChange` rather than `afterChange` here because it's possible that the change is invalid WRT our forest.
		// For example, a bug in the editor might produce a malformed change object and thus applying the change to the forest will throw an error.
		// In such a case we will crash here, preventing the change from being added to the commit graph, and preventing `afterChange` from firing.
		// One important consequence of this is that we will not submit the op containing the invalid change, since op submissions happens in response to `afterChange`.
		if (event.change !== undefined) {
			this.events.emit("beforeBatch", event.type === "append" ? event.newCommits : []);

			let revision: RevisionTag | undefined;
			if (event.type === "rebase") {
				assert(hasSome(event.newCommits), "Expected new commit for non no-op change event");
				revision = getLast(event.newCommits).revision;
			} else {
				revision = event.change.revision;
			}

			// Conflicts due to schema will be empty and thus are not applied.
			for (const change of event.change.change.changes) {
				if (change.type === "data") {
					const delta = intoDelta(tagChange(change.innerChange, revision));
					this.withCombinedVisitor((visitor) => {
						visitDelta(delta, visitor, this.removedRoots, revision);
					});
				} else if (change.type === "schema") {
					// Schema changes from a current to a new schema are expected to be backwards compatible.
					// This guarantees that all data in the forest (which is valid before the schema change)
					// is also valid under the new schema.
					// Note however, that such schema changes may in some cases be rolled back:
					// Case 1: A transaction with a schema change may be aborted.
					// The transaction may have made some data changes that would render some trees invalid
					// under the old schema, but these changes will also be rolled back, thereby putting the forest
					// back in the state before the transaction, which is valid under the original (reinstated) schema.
					// Case 2: A branch with a schema change may be rebased such that the schema change (because
					// of a constraint) is no longer applied.
					// Such a branch may contain data changes that would render some trees invalid under the
					// original schema. These data changes may not necessarily be rolled back.
					// They will however be rebased over the rollback of the schema change. This rebasing will
					// ensure that these data changes are muted if they would render some trees invalid under the
					// original (reinstated) schema.
					this.storedSchema.apply(change.innerChange.schema.new);
				} else {
					fail("Unknown Shared Tree change type.");
				}
			}
			this.events.emit("afterBatch", event.type === "append" ? event.newCommits : []);
		}
	};

	private readonly onAncestryTrimmed = (revisions: RevisionTag[]): void => {
		// When the branch is trimmed, we can garbage collect any repair data whose latest relevant revision is one of the
		// trimmed revisions.
		this.withCombinedVisitor((visitor) => {
			revisions.forEach((revision) => {
				// get all the roots last created or used by the revision
				const roots = this.removedRoots.getRootsLastTouchedByRevision(revision);

				// get the detached field for the root and delete it from the removed roots
				for (const root of roots) {
					visitor.destroy(this.removedRoots.toFieldKey(root), 1);
				}

				this.removedRoots.deleteRootsLastTouchedByRevision(revision);
			});
		});
	};

	private withCombinedVisitor(fn: (visitor: DeltaVisitor) => void): void {
		const anchorVisitor = this.forest.anchors.acquireVisitor();
		const combinedVisitor = combineVisitors(
			[this.forest.acquireVisitor(), anchorVisitor],
			[anchorVisitor],
		);
		fn(combinedVisitor);
		combinedVisitor.free();
	}

	private checkNotDisposed(usageError?: string): void {
		if (this.disposed) {
			if (usageError !== undefined) {
				throw new UsageError(usageError);
			}
			assert(false, 0x911 /* Invalid operation on a disposed TreeCheckout */);
		}
	}

	/**
	 * Creates a {@link RevertibleAlpha} object that can undo a specific change in the tree's history.
	 * Revision must exist in the given {@link TreeCheckout}'s branch.
	 *
	 * @param revision - The revision tag identifying the change to be made revertible.
	 * @param kind - The {@link CommitKind} that produced this revertible (e.g., Default, Undo, Redo).
	 * @param checkout - The {@link TreeCheckout} instance this revertible belongs to.
	 * @param onRevertibleDisposed - Callback function that will be called when the revertible is disposed.
	 * @returns - {@link RevertibleAlpha}
	 */
	private createRevertible(
		revision: RevisionTag,
		kind: CommitKind,
		checkout: TreeCheckout,
		onRevertibleDisposed: ((revertible: RevertibleAlpha) => void) | undefined,
	): RevertibleAlpha {
		const commitBranches = checkout.revertibleCommitBranches;

		const revertible: RevertibleAlpha = {
			get status(): RevertibleStatus {
				const revertibleCommit = commitBranches.get(revision);
				return revertibleCommit === undefined
					? RevertibleStatus.Disposed
					: RevertibleStatus.Valid;
			},
			revert: (release: boolean = true) => {
				if (revertible.status === RevertibleStatus.Disposed) {
					throw new UsageError("Unable to revert a revertible that has been disposed.");
				}

				const revertMetrics = checkout.revertRevertible(revision, kind);
				checkout.logger?.sendTelemetryEvent({
					eventName: TreeCheckout.revertTelemetryEventName,
					...revertMetrics,
				});

				if (release) {
					revertible.dispose();
				}
			},
			clone: (forkedBranch: TreeBranch) => {
				if (forkedBranch === undefined) {
					return this.createRevertible(revision, kind, checkout, onRevertibleDisposed);
				}

				// TODO:#23442: When a revertible is cloned for a forked branch, optimize to create a fork of a revertible branch once per revision NOT once per revision per checkout.
				const forkedCheckout = getCheckout(forkedBranch);
				const revertibleBranch = this.revertibleCommitBranches.get(revision);
				assert(
					revertibleBranch !== undefined,
					0xa82 /* change to revert does not exist on the given forked branch */,
				);
				forkedCheckout.revertibleCommitBranches.set(revision, revertibleBranch.fork());

				return this.createRevertible(revision, kind, forkedCheckout, onRevertibleDisposed);
			},
			dispose: () => {
				if (revertible.status === RevertibleStatus.Disposed) {
					throw new UsageError(
						"Unable to dispose a revertible that has already been disposed.",
					);
				}
				checkout.disposeRevertible(revertible, revision);
				onRevertibleDisposed?.(revertible);
			},
		};

		return revertible;
	}

	// For the new TreeViewAlpha API
	public viewWith<TRoot extends ImplicitFieldSchema | UnsafeUnknownSchema>(
		config: TreeViewConfiguration<ReadSchema<TRoot>>,
	): SchematizingSimpleTreeView<TRoot>;

	// For the old TreeView API
	public viewWith<TRoot extends ImplicitFieldSchema>(
		config: TreeViewConfiguration<TRoot>,
	): TreeView<TRoot>;

	public viewWith<TRoot extends ImplicitFieldSchema | UnsafeUnknownSchema>(
		config: TreeViewConfiguration<ReadSchema<TRoot>>,
	): SchematizingSimpleTreeView<TRoot> {
		const view = new SchematizingSimpleTreeView(
			this,
			config,
			createNodeKeyManager(this.idCompressor),
			this.breaker,
			() => {
				this.views.delete(view);
			},
		);
		this.views.add(view);
		return view;
	}

	public get rootEvents(): Listenable<AnchorSetRootEvents> {
		return this.forest.anchors.events;
	}

	public get editor(): ISharedTreeEditor {
		this.checkNotDisposed();
		return this.#transaction.activeBranchEditor;
	}

	public locate(anchor: Anchor): AnchorNode | undefined {
		this.checkNotDisposed();
		return this.forest.anchors.locate(anchor);
	}

	public get transaction(): Transactor {
		return this.#transaction;
	}
	/**
	 * The {@link Transactor} for this checkout.
	 * @remarks In the context of a checkout, transactions allow edits to be batched into atomic units.
	 * Edits made during a transaction will update the local state of the tree immediately, but will be squashed into a single edit when the transaction is committed.
	 * If the transaction is aborted, the local state will be reset to what it was before the transaction began.
	 * Transactions may nest, meaning that a transaction may be started while a transaction is already ongoing.
	 *
	 * To avoid updating observers of the view state with intermediate results during a transaction,
	 * use {@link ITreeCheckout#branch} and {@link ISharedTreeFork#merge}.
	 */
	readonly #transaction: SquashingTransactionStack<SharedTreeEditBuilder, SharedTreeChange>;

	public branch(): TreeCheckout {
		this.checkNotDisposed(
			"The parent branch has already been disposed and can no longer create new branches.",
		);
		const anchors = new AnchorSet();
		const branch = this.#transaction.activeBranch.fork();
		const storedSchema = this.storedSchema.clone();
		const forest = this.forest.clone(storedSchema, anchors);
		const checkout = new TreeCheckout(
			branch,
			true,
			this.changeFamily,
			storedSchema,
			forest,
			createEmitter(),
			this.mintRevisionTag,
			this.revisionTagCodec,
			this.idCompressor,
			this.removedRoots.clone(),
			this.logger,
			this.breaker,
		);
		this.events.emit("fork", checkout);
		return checkout;
	}

	public rebase(checkout: TreeCheckout): void {
		this.checkNotDisposed(
			"The target of the branch rebase has been disposed and cannot be rebased.",
		);
		checkout.checkNotDisposed(
			"The source of the branch rebase has been disposed and cannot be rebased.",
		);
		assert(
			!checkout.transaction.isInProgress(),
			0x9af /* A view cannot be rebased while it has a pending transaction */,
		);
		assert(
			checkout.isBranch,
			0xa5d /* The main branch cannot be rebased onto another branch. */,
		);

		checkout.#transaction.activeBranch.rebaseOnto(this.#transaction.activeBranch);
	}

	public rebaseOnto(checkout: ITreeCheckout): void {
		this.checkNotDisposed(
			"The target of the branch rebase has been disposed and cannot be rebased.",
		);
		checkout.rebase(this);
	}

	public merge(checkout: TreeCheckout): void;
	public merge(checkout: TreeCheckout, disposeMerged: boolean): void;
	public merge(checkout: TreeCheckout, disposeMerged = true): void {
		this.checkNotDisposed(
			"The target of the branch merge has been disposed and cannot be merged.",
		);
		checkout.checkNotDisposed(
			"The source of the branch merge has been disposed and cannot be merged.",
		);
		assert(
			!this.transaction.isInProgress(),
			0x9b0 /* Views cannot be merged into a view while it has a pending transaction */,
		);
		while (checkout.transaction.isInProgress()) {
			checkout.transaction.commit();
		}
		this.#transaction.activeBranch.merge(checkout.#transaction.activeBranch);
		if (disposeMerged && checkout.isBranch) {
			// Dispose the merged checkout unless it is the main branch.
			checkout[disposeSymbol]();
		}
	}

	public updateSchema(newSchema: TreeStoredSchema): void {
		this.checkNotDisposed();
		this.editor.schema.setStoredSchema(this.storedSchema.clone(), newSchema);
	}

	public dispose(): void {
		this[disposeSymbol]();
	}

	public [disposeSymbol](): void {
		this.checkNotDisposed(
			"The branch has already been disposed and cannot be disposed again.",
		);
		this.disposed = true;
		this.#transaction.branch.dispose();
		this.#transaction.dispose();
		this.purgeRevertibles();
		for (const view of this.views) {
			view.dispose();
		}
		this.events.emit("dispose");
	}

	public getRemovedRoots(): [string | number | undefined, number, JsonableTree][] {
		this.assertNoUntrackedRoots();
		const trees: [string | number | undefined, number, JsonableTree][] = [];
		const cursor = this.forest.allocateCursor("getRemovedRoots");
		for (const { id, root } of this.removedRoots.entries()) {
			const parentField = this.removedRoots.toFieldKey(root);
			this.forest.moveCursorToPath({ parent: undefined, parentField, parentIndex: 0 }, cursor);
			const tree = jsonableTreeFromCursor(cursor);
			// This method is used for tree consistency comparison.
			const { major, minor } = id;
			const finalizedMajor = major !== undefined ? this.revisionTagCodec.encode(major) : major;
			trees.push([finalizedMajor, minor, tree]);
		}
		cursor.free();
		return trees;
	}

	/**
	 * This sets the tip revision as the latest relevant revision for any removed roots that are loaded from a summary.
	 * This needs to be called right after loading {@link this.removedRoots} from a summary to allow loaded data to be garbage collected.
	 */
	public setTipRevisionForLoadedData(revision: RevisionTag): void {
		this.removedRoots.setRevisionsForLoadedData(revision);
	}

	private purgeRevertibles(): void {
		for (const revertible of this.revertibles) {
			revertible.dispose();
		}
	}

	private disposeRevertible(revertible: RevertibleAlpha, revision: RevisionTag): void {
		this.revertibleCommitBranches.get(revision)?.dispose();
		this.revertibleCommitBranches.delete(revision);
		this.revertibles.delete(revertible);
	}

	private revertRevertible(revision: RevisionTag, kind: CommitKind): RevertMetrics {
		if (this.transaction.isInProgress()) {
			throw new UsageError("Undo is not yet supported during transactions.");
		}

		const revertibleBranch = this.revertibleCommitBranches.get(revision);
		assert(revertibleBranch !== undefined, 0x7cc /* expected to find a revertible commit */);
		const commitToRevert = revertibleBranch.getHead();
		const revisionForInvert = this.mintRevisionTag();

		let change = tagChange(
			this.changeFamily.rebaser.invert(commitToRevert, false, revisionForInvert),
			revisionForInvert,
		);

		const headCommit = this.#transaction.activeBranch.getHead();
		// Rebase the inverted change onto any commits that occurred after the undoable commits.
		if (commitToRevert !== headCommit) {
			change = tagChange(
				rebaseChange(
					this.changeFamily.rebaser,
					change,
					commitToRevert,
					headCommit,
					this.mintRevisionTag,
				).change,
				revisionForInvert,
			);
		}

		this.#transaction.activeBranch.apply(
			change,
			kind === CommitKind.Default || kind === CommitKind.Redo
				? CommitKind.Undo
				: CommitKind.Redo,
		);

		// Derive some stats about the reversion to return to the caller.
		let revertAge = 0;
		let currentCommit = headCommit;
		while (commitToRevert.revision !== currentCommit.revision) {
			revertAge++;

			const parentCommit = currentCommit.parent;
			assert(parentCommit !== undefined, 0x9a9 /* expected to find a parent commit */);
			currentCommit = parentCommit;
		}

		return { age: revertAge };
	}

	private assertNoUntrackedRoots(): void {
		const cursor = this.forest.getCursorAboveDetachedFields();
		const rootFields = new Set([rootFieldKey]);
		for (const { root } of this.removedRoots.entries()) {
			rootFields.add(this.removedRoots.toFieldKey(root));
		}

		if (!cursor.firstField()) {
			return;
		}

		do {
			const field = cursor.getFieldKey();
			assert(
				rootFields.has(field),
				0xa22 /* Forest has a root field which is unknown to the detached field index */,
			);

			rootFields.delete(field);
		} while (cursor.nextField());
	}

	/**
	 * `true` iff the given branch change event is due to a remote change
	 */
	private isRemoteChangeEvent(event: SharedTreeBranchChange<SharedTreeChange>): boolean {
		return (
			// Remote changes are only ever applied to the main branch
			!this.isBranch &&
			// Remote changes are applied to the main branch by rebasing it onto the trunk.
			// No other rebases are allowed on the main branch, so we can use this to detect remote changes.
			event.type === "rebase"
		);
	}
}
