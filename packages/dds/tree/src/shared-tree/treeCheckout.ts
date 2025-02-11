/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import type { Listenable } from "@fluidframework/core-interfaces/internal";
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
	isAncestor,
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
import {
	Breakable,
	disposeSymbol,
	fail,
	getOrCreate,
	type WithBreakable,
} from "../util/index.js";

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
	TreeChangeEvents,
} from "../simple-tree/index.js";
import { getCheckout, SchematizingSimpleTreeView } from "./schematizingTreeView.js";

/**
 * Events for {@link ITreeCheckout}.
 */
export interface CheckoutEvents {
	/**
	 * The view is currently in a consistent state, but a batch of changes is about to be processed.
	 * @remarks Once this event fires, it is not safe to access the FlexTree, Forest and AnchorSet again until the corresponding {@link CheckoutEvents.afterBatch} fires.
	 * Every call to `beforeBatch` will be followed by a corresponding call to `afterBatch` (before any more calls to `beforeBatch`).
	 * @param change - The {@link SharedTreeBranchChange | change} to the checkout's active branch that is about to be processed.
	 * May be empty if the changes were produced by e.g. a rebase or the initial loading of the document.
	 */
	beforeBatch(change: SharedTreeBranchChange<SharedTreeChange>): void;

	/**
	 * A batch of changes has finished processing and the view is in a consistent state.
	 * @remarks It is once again safe to access the FlexTree, Forest and AnchorSet.
	 *
	 * While every call to `beforeBatch` will be followed by a corresponding call to `afterBatch`, the converse is not true.
	 * This event may be fired without a preceding `beforeBatch` event if the checkout's branch and forest were directly updated via e.g. a summary load rather than via normal application of changes.
	 * @remarks
	 * This is mainly useful for knowing when to do followup work scheduled during events from Anchors.
	 */
	afterBatch(): void;

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
export interface ITreeCheckout extends AnchorLocator, ViewableTree, WithBreakable {
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

	return new TreeCheckout(
		branch,
		false,
		changeFamily,
		schema,
		forest,
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

	private readonly editLock: EditLock;

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

	readonly #events = createEmitter<CheckoutEvents>();
	public events: Listenable<CheckoutEvents> = this.#events;

	public constructor(
		branch: SharedTreeBranch<SharedTreeEditBuilder, SharedTreeChange>,
		/** True if and only if this checkout is for a forked branch and not the "main branch" of the tree. */
		public readonly isBranch: boolean,
		private readonly changeFamily: ChangeFamily<SharedTreeEditBuilder, SharedTreeChange>,
		public readonly storedSchema: TreeStoredSchemaRepository,
		public readonly forest: IEditableForest,
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
		public readonly breaker: Breakable = new Breakable("TreeCheckout"),
		private readonly disposeForksAfterTransaction = true,
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
				const disposeForks = this.disposeForksAfterTransaction
					? trackForksForDisposal(this)
					: undefined;
				// When each transaction is started, take a snapshot of the current state of removed roots
				const removedRootsSnapshot = this.removedRoots.clone();
				return (result) => {
					switch (result) {
						case TransactionResult.Abort:
							this.removedRoots = removedRootsSnapshot;
							break;
						case TransactionResult.Commit:
							if (!this.transaction.isInProgress()) {
								// The changes in a transaction squash commit have already applied to the checkout and are known to be valid, so we can validate the squash commit automatically.
								this.validateCommit(this.#transaction.branch.getHead());
							}
							break;
						default:
							unreachableCase(result);
					}
					disposeForks?.();
				};
			},
		);

		this.editLock = new EditLock(this.#transaction.activeBranchEditor);

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
					this.#events.emit("changed", { isLocal: true, kind }, getRevertible);
					withinEventContext = false;
				}
			} else if (this.isRemoteChangeEvent(event)) {
				// TODO: figure out how to plumb through commit kind info for remote changes
				this.#events.emit("changed", { isLocal: false, kind: CommitKind.Default });
			}
		});

		this.#transaction.activeBranchEvents.on("afterChange", this.onAfterChange);
		this.#transaction.activeBranchEvents.on("ancestryTrimmed", this.onAncestryTrimmed);
	}

	private readonly onAfterChange = (event: SharedTreeBranchChange<SharedTreeChange>): void => {
		this.editLock.lock();
		this.#events.emit("beforeBatch", event);
		if (event.change !== undefined) {
			const revision =
				event.type === "rebase"
					? this.#transaction.activeBranch.getHead().revision
					: event.change.revision;

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
		}
		this.#events.emit("afterBatch");
		this.editLock.unlock();
		if (event.type === "append") {
			event.newCommits.forEach((commit) => this.validateCommit(commit));
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
		this.breaker.use();
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
			clone: (targetBranch: TreeBranch) => {
				// TODO:#23442: When a revertible is cloned for a forked branch, optimize to create a fork of a revertible branch once per revision NOT once per revision per checkout.
				const targetCheckout = getCheckout(targetBranch);

				const revertibleBranch = this.revertibleCommitBranches.get(revision);
				if (revertibleBranch === undefined) {
					throw new UsageError("Unable to clone a revertible that has been disposed.");
				}

				const commitToRevert = revertibleBranch.getHead();
				const activeBranchHead = targetCheckout.#transaction.activeBranch.getHead();

				if (isAncestor(commitToRevert, activeBranchHead, true) === false) {
					throw new UsageError(
						"Cannot clone revertible for a commit that is not present on the given branch.",
					);
				}

				targetCheckout.revertibleCommitBranches.set(revision, revertibleBranch.fork());

				return this.createRevertible(revision, kind, targetCheckout, onRevertibleDisposed);
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
		return this.editLock.editor;
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
		this.editLock.checkUnlocked("Branching");
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
			this.mintRevisionTag,
			this.revisionTagCodec,
			this.idCompressor,
			this.removedRoots.clone(),
			this.logger,
			this.breaker,
			this.disposeForksAfterTransaction,
		);
		this.#events.emit("fork", checkout);
		return checkout;
	}

	public rebase(checkout: TreeCheckout): void {
		this.checkNotDisposed(
			"The target of the branch rebase has been disposed and cannot be rebased.",
		);
		checkout.checkNotDisposed(
			"The source of the branch rebase has been disposed and cannot be rebased.",
		);
		this.editLock.checkUnlocked("Rebasing");
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
		this.editLock.checkUnlocked("Merging");
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
		this.editLock.checkUnlocked("Disposing a view");
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
		this.#events.emit("dispose");
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
	 * This must be called on the root/main checkout after loading from a summary.
	 * @remarks This pattern is necessary because the EditManager skips the normal process of applying commits to branches when loading a summary.
	 * Instead, it simply {@link SharedTreeBranch#setHead | mutates} the branches directly which does not propagate the typical events throughout the rest of the system.
	 */
	public load(): void {
		// Set the tip revision as the latest relevant revision for any removed roots that are loaded from a summary - this allows them to be garbage collected later.
		// When a load happens, the head of the trunk and the head of the local/main branch must be the same (this is enforced by SharedTree).
		this.removedRoots.setRevisionsForLoadedData(this.#transaction.branch.getHead().revision);
		// The content of the checkout (e.g. the forest) has (maybe) changed, so fire an afterBatch event.
		this.#events.emit("afterBatch");
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

	// #region Commit Validation

	/** Used to maintain the contract of {@link onCommitValid}(). */
	#validatedCommits = new WeakMap<
		GraphCommit<SharedTreeChange>,
		((commit: GraphCommit<SharedTreeChange>) => void)[] | true
	>();

	/**
	 * Registers a function to be called when the given commit is validated.
	 * @remarks A commit is validated by the checkout after it has been applied to the checkout's state (e.g. it has an effect on the forest).
	 * If the commit applies successfully (i.e. it does not raise any unexpected errors), the commit is considered valid and the registered function is called.
	 * If the commit does not apply successfully (because it causes an unexpected error), the function is not called (and the checkout will left in an error state).
	 *
	 * If the commit has already been validated when this function is called, the function is called immediately and this function returns `true`.
	 * Otherwise, the function is registered to be called later and this function returns `false`.
	 */
	public onCommitValid(
		commit: GraphCommit<SharedTreeChange>,
		fn: (commit: GraphCommit<SharedTreeChange>) => void,
	): boolean {
		const validated = getOrCreate(this.#validatedCommits, commit, () => []);
		if (validated === true) {
			fn(commit);
			return true;
		}

		validated.push(fn);
		return false;
	}

	/** Mark the given commit as "validated" according to the contract of {@link onCommitValid}(). */
	private validateCommit(commit: GraphCommit<SharedTreeChange>): void {
		const validated = getOrCreate(this.#validatedCommits, commit, () => []);
		if (validated !== true) {
			validated.forEach((fn) => fn(commit));
			this.#validatedCommits.set(commit, true);
		}
	}

	// #endregion Commit Validation
}

/**
 * A helper class that assists {@link TreeCheckout} in preventing functionality from being used while the tree is in the middle of being edited.
 */
class EditLock {
	/**
	 * Edits the tree by calling the methods of the editor passed into the {@link EditLock} constructor.
	 * @remarks Edits will throw an error if the lock is currently locked.
	 */
	public editor: ISharedTreeEditor;
	private locked = false;

	/**
	 * @param editor - an editor which will be used to create a new editor that is monitored to determine if any changes are happening to the tree.
	 * Use {@link EditLock.editor} in place of the original editor to ensure that changes are monitored.
	 */
	public constructor(editor: ISharedTreeEditor) {
		const checkLock = (): void => this.checkUnlocked("Editing the tree");
		this.editor = {
			get schema() {
				return editor.schema;
			},
			valueField(...fieldArgs) {
				const valueField = editor.valueField(...fieldArgs);
				return {
					set(...editArgs) {
						checkLock();
						valueField.set(...editArgs);
					},
				};
			},
			optionalField(...fieldArgs) {
				const optionalField = editor.optionalField(...fieldArgs);
				return {
					set(...editArgs) {
						checkLock();
						optionalField.set(...editArgs);
					},
				};
			},
			sequenceField(...fieldArgs) {
				const sequenceField = editor.sequenceField(...fieldArgs);
				return {
					insert(...editArgs) {
						checkLock();
						sequenceField.insert(...editArgs);
					},
					remove(...editArgs) {
						checkLock();
						sequenceField.remove(...editArgs);
					},
				};
			},
			move(...moveArgs) {
				checkLock();
				editor.move(...moveArgs);
			},
			addNodeExistsConstraint(path) {
				editor.addNodeExistsConstraint(path);
			},
			addNodeExistsConstraintOnRevert(path) {
				editor.addNodeExistsConstraintOnRevert(path);
			},
		};
	}

	/**
	 * Prevent further changes from being made to {@link EditLock.editor} until {@link EditLock.unlock} is called.
	 * @remarks May only be called when the lock is not already locked.
	 */
	public lock(): void {
		if (this.locked) {
			debugger;
		}
		assert(!this.locked, 0xaa7 /* Checkout has already been locked */);
		this.locked = true;
	}

	/**
	 * Throws an error if the lock is currently locked.
	 * @param action - The current action being performed by the user.
	 * This must start with a capital letter, as it shows up as the first part of the error message and we want it to look nice.
	 */
	public checkUnlocked<T extends string>(action: T extends Capitalize<T> ? T : never): void {
		if (this.locked) {
			// These type assertions ensure that the event name strings used here match the actual event names
			const nodeChanged: keyof TreeChangeEvents = "nodeChanged";
			const treeChanged: keyof TreeChangeEvents = "treeChanged";
			throw new UsageError(
				`${action} is forbidden during a ${nodeChanged} or ${treeChanged} event`,
			);
		}
	}

	/**
	 * Allow changes to be made to {@link EditLock.editor} again.
	 * @remarks May only be called when the lock is currently locked.
	 */
	public unlock(): void {
		assert(this.locked, 0xaa8 /* Checkout has not been locked */);
		this.locked = false;
	}
}

/**
 * Keeps track of all new forks created until the returned function is invoked, which will dispose all of those for.
 * The returned function may only be called once.
 *
 * @param checkout - The tree checkout for which you want to monitor forks for disposal.
 * @returns a function which can be called to dispose all of the tracked forks.
 */
function trackForksForDisposal(checkout: TreeCheckout): () => void {
	const forks = new Set<TreeCheckout>();
	const onDisposeUnSubscribes: (() => void)[] = [];
	const onForkUnSubscribe = onForkTransitive(checkout, (fork) => {
		forks.add(fork);
		onDisposeUnSubscribes.push(fork.events.on("dispose", () => forks.delete(fork)));
	});
	let disposed = false;
	return () => {
		assert(!disposed, 0xaa9 /* Forks may only be disposed once */);
		forks.forEach((fork) => fork.dispose());
		onDisposeUnSubscribes.forEach((unsubscribe) => unsubscribe());
		onForkUnSubscribe();
		disposed = true;
	};
}
