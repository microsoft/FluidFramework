/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/core-utils";
import {
	AnchorLocator,
	StoredSchemaRepository,
	IForestSubscription,
	AnchorSetRootEvents,
	Anchor,
	AnchorNode,
	AnchorSet,
	IEditableForest,
	InMemoryStoredSchemaRepository,
	assertIsRevisionTag,
	combineVisitors,
	visitDelta,
	DetachedFieldIndex,
	makeDetachedFieldIndex,
	Revertible,
	ChangeFamily,
} from "../core";
import { HasListeners, IEmitter, ISubscribable, createEmitter } from "../events";
import {
	IDefaultEditBuilder,
	DefaultChangeset,
	buildForest,
	DefaultChangeFamily,
	DefaultEditBuilder,
	intoDelta,
} from "../feature-libraries";
import { SharedTreeBranch, getChangeReplaceType } from "../shared-tree-core";
import { TransactionResult } from "../util";
import { noopValidator } from "../codec";

/**
 * Events for {@link ITreeCheckout}.
 * @beta
 */
export interface CheckoutEvents {
	/**
	 * A batch of changes has finished processing and the view is in a consistent state.
	 * It is once again safe to access the EditableTree, Forest and AnchorSet.
	 *
	 * @remarks
	 * This is mainly useful for knowing when to do followup work scheduled during events from Anchors.
	 */
	afterBatch(): void;

	/**
	 * A revertible change has been made to this view.
	 * Applications which subscribe to this event are expected to revert or discard revertibles they acquire, if they so choose (failure to do so will leak memory).
	 * The provided revertible is inherently bound to the view that raised the event, calling `revert` won't apply to forked views.
	 *
	 * @remarks
	 * This event provides a {@link Revertible} object that can be used to revert the change.
	 */
	revertible(revertible: Revertible): void;
}

/**
 * Provides a means for interacting with a SharedTree.
 * This includes reading data from the tree and running transactions to mutate the tree.
 * @remarks This interface should not have any implementations other than those provided by the SharedTree package libraries.
 * @privateRemarks
 * API for interacting with a {@link SharedTreeBranch}.
 * Implementations of this interface must implement the {@link branchKey} property.
 * @alpha
 */
export interface ITreeCheckout extends AnchorLocator {
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
	readonly storedSchema: StoredSchemaRepository;
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
	readonly editor: IDefaultEditBuilder;

	/**
	 * A collection of functions for managing transactions.
	 */
	readonly transaction: ITransaction;

	/**
	 * Spawn a new view which is based off of the current state of this view.
	 * Any mutations of the new view will not apply to this view until the new view is merged back into this view via `merge()`.
	 */
	fork(): ITreeCheckoutFork;

	/**
	 * Apply all the new changes on the given view to this view.
	 * @param view - a view which was created by a call to `fork()`.
	 * It is automatically disposed after the merge completes.
	 * @remarks All ongoing transactions (if any) in `view` will be committed before the merge.
	 */
	merge(view: ITreeCheckoutFork): void;

	/**
	 * Apply all the new changes on the given view to this view.
	 * @param view - a view which was created by a call to `fork()`.
	 * @param disposeView - whether or not to dispose `view` after the merge completes.
	 * @remarks All ongoing transactions (if any) in `view` will be committed before the merge.
	 */
	merge(view: ITreeCheckoutFork, disposeView: boolean): void;

	/**
	 * Rebase the given view onto this view.
	 * @param view - a view which was created by a call to `fork()`. It is modified by this operation.
	 */
	rebase(view: ITreeCheckoutFork): void;

	/**
	 * Events about this view.
	 */
	readonly events: ISubscribable<CheckoutEvents>;

	/**
	 * Events about the root of the tree in this view.
	 */
	readonly rootEvents: ISubscribable<AnchorSetRootEvents>;
}

/**
 * Creates a {@link TreeCheckout}.
 * @param args - an object containing optional components that will be used to build the view.
 * Any components not provided will be created by default.
 * @remarks This does not create a {@link SharedTree}, but rather a view with the minimal state
 * and functionality required to implement {@link ITreeCheckout}.
 */
export function createTreeCheckout(args?: {
	branch?: SharedTreeBranch<DefaultEditBuilder, DefaultChangeset>;
	changeFamily?: ChangeFamily<DefaultEditBuilder, DefaultChangeset>;
	schema?: StoredSchemaRepository;
	forest?: IEditableForest;
	events?: ISubscribable<CheckoutEvents> &
		IEmitter<CheckoutEvents> &
		HasListeners<CheckoutEvents>;
	removedRoots?: DetachedFieldIndex;
}): TreeCheckout {
	const schema = args?.schema ?? new InMemoryStoredSchemaRepository();
	const forest = args?.forest ?? buildForest();
	const changeFamily =
		args?.changeFamily ?? new DefaultChangeFamily({ jsonValidator: noopValidator });
	const branch =
		args?.branch ??
		new SharedTreeBranch(
			{
				change: changeFamily.rebaser.compose([]),
				revision: assertIsRevisionTag("00000000-0000-4000-8000-000000000000"),
			},
			changeFamily,
		);
	const events = args?.events ?? createEmitter();

	const transaction = new Transaction(branch);

	return new TreeCheckout(
		transaction,
		branch,
		changeFamily,
		schema,
		forest,
		events,
		args?.removedRoots,
	);
}

/**
 * A collection of functions for managing transactions.
 * Transactions allow edits to be batched into atomic units.
 * Edits made during a transaction will update the local state of the tree immediately, but will be squashed into a single edit when the transaction is committed.
 * If the transaction is aborted, the local state will be reset to what it was before the transaction began.
 * Transactions may nest, meaning that a transaction may be started while a transaction is already ongoing.
 *
 * To avoid updating observers of the view state with intermediate results during a transaction,
 * use {@link ITreeCheckout#fork} and {@link ISharedTreeFork#merge}.
 * @alpha
 */
export interface ITransaction {
	/**
	 * Start a new transaction.
	 * If a transaction is already in progress when this new transaction starts, then this transaction will be "nested" inside of it,
	 * i.e. the outer transaction will still be in progress after this new transaction is committed or aborted.
	 *
	 * @remarks - Asynchronous transactions are not supported on the root checkout,
	 * since it is always kept up-to-date with the latest remote edits and the results of this rebasing (which might invalidate
	 * the transaction) is not visible to the application author.
	 * Instead,
	 *
	 * 1. fork the root checkout
	 * 2. run the transaction on the fork
	 * 3. merge the fork back into the root checkout
	 *
	 * @privateRemarks - There is currently no enforcement that asynchronous transactions don't happen on the root checkout.
	 * AB#6488 tracks adding some enforcement to make it more clear to application authors that this is not supported.
	 */
	start(): void;
	/**
	 * Close this transaction by squashing its edits and committing them as a single edit.
	 * If this is the root checkout and there are no ongoing transactions remaining, the squashed edit will be submitted to Fluid.
	 */
	commit(): TransactionResult.Commit;
	/**
	 * Close this transaction and revert the state of the tree to what it was before this transaction began.
	 */
	abort(): TransactionResult.Abort;
	/**
	 * True if there is at least one transaction currently in progress on this view, otherwise false.
	 */
	inProgress(): boolean;
}

class Transaction implements ITransaction {
	public constructor(
		private readonly branch: SharedTreeBranch<DefaultEditBuilder, DefaultChangeset>,
	) {}

	public start(): void {
		this.branch.startTransaction();
		this.branch.editor.enterTransaction();
	}
	public commit(): TransactionResult.Commit {
		this.branch.commitTransaction();
		this.branch.editor.exitTransaction();
		return TransactionResult.Commit;
	}
	public abort(): TransactionResult.Abort {
		this.branch.abortTransaction();
		this.branch.editor.exitTransaction();
		return TransactionResult.Abort;
	}
	public inProgress(): boolean {
		return this.branch.isTransacting();
	}
}

/**
 * Branch (like in a version control system) of SharedTree.
 *
 * {@link ITreeCheckout} that has forked off of the main trunk/branch.
 * @alpha
 */
export interface ITreeCheckoutFork extends ITreeCheckout {
	/**
	 * Rebase the changes that have been applied to this view over all the new changes in the given view.
	 * @param view - Either the root view or a view that was created by a call to `fork()`. It is not modified by this operation.
	 */
	rebaseOnto(view: ITreeCheckout): void;
}

/**
 * An implementation of {@link ITreeCheckoutFork}.
 */
export class TreeCheckout implements ITreeCheckoutFork {
	public constructor(
		public readonly transaction: ITransaction,
		private readonly branch: SharedTreeBranch<DefaultEditBuilder, DefaultChangeset>,
		private readonly changeFamily: ChangeFamily<DefaultEditBuilder, DefaultChangeset>,
		public readonly storedSchema: StoredSchemaRepository,
		public readonly forest: IEditableForest,
		public readonly events: ISubscribable<CheckoutEvents> &
			IEmitter<CheckoutEvents> &
			HasListeners<CheckoutEvents>,
		private readonly removedRoots: DetachedFieldIndex = makeDetachedFieldIndex("repair"),
	) {
		// We subscribe to `beforeChange` rather than `afterChange` here because it's possible that the change is invalid WRT our forest.
		// For example, a bug in the editor might produce a malformed change object and thus applying the change to the forest will throw an error.
		// In such a case we will crash here, preventing the change from being added to the commit graph, and preventing `afterChange` from firing.
		// One important consequence of this is that we will not submit the op containing the invalid change, since op submissions happens in response to `afterChange`.
		branch.on("beforeChange", (event) => {
			if (event.change !== undefined) {
				const delta = intoDelta(event.change);
				const anchorVisitor = this.forest.anchors.acquireVisitor();
				const combinedVisitor = combineVisitors(
					[this.forest.acquireVisitor(), anchorVisitor],
					[anchorVisitor],
				);
				visitDelta(delta, combinedVisitor, this.removedRoots);
				combinedVisitor.free();
				this.events.emit("afterBatch");
			}
			if (event.type === "replace" && getChangeReplaceType(event) === "transactionCommit") {
				const transactionRevision = event.newCommits[0].revision;
				for (const transactionStep of event.removedCommits) {
					this.removedRoots.updateMajor(transactionStep.revision, transactionRevision);
				}
			}
		});
		branch.on("revertible", (revertible) => {
			// if there are no listeners, discard the revertible to avoid memory leaks
			if (!this.events.hasListeners("revertible")) {
				revertible.discard();
			} else {
				this.events.emit("revertible", revertible);
			}
		});
	}

	public get rootEvents(): ISubscribable<AnchorSetRootEvents> {
		return this.forest.anchors;
	}

	public get editor(): IDefaultEditBuilder {
		return this.branch.editor;
	}

	public locate(anchor: Anchor): AnchorNode | undefined {
		return this.forest.anchors.locate(anchor);
	}

	public fork(): TreeCheckout {
		const anchors = new AnchorSet();
		// TODO: ensure editing this clone of the schema does the right thing.
		const storedSchema = new InMemoryStoredSchemaRepository(this.storedSchema);
		const forest = this.forest.clone(storedSchema, anchors);
		const branch = this.branch.fork();
		const transaction = new Transaction(branch);
		return new TreeCheckout(
			transaction,
			branch,
			this.changeFamily,
			storedSchema,
			forest,
			createEmitter(),
			this.removedRoots.clone(),
		);
	}

	public rebase(view: TreeCheckout): void {
		view.branch.rebaseOnto(this.branch);
	}

	public rebaseOnto(view: ITreeCheckout): void {
		view.rebase(this);
	}

	public merge(view: TreeCheckout): void;
	public merge(view: TreeCheckout, disposeView: boolean): void;
	public merge(view: TreeCheckout, disposeView = true): void {
		assert(
			!this.transaction.inProgress() || disposeView,
			0x710 /* A view that is merged into an in-progress transaction must be disposed */,
		);
		while (view.transaction.inProgress()) {
			view.transaction.commit();
		}
		this.branch.merge(view.branch);
		if (disposeView) {
			view.dispose();
		}
	}

	/**
	 * Dispose this view, freezing its state and allowing the SharedTree to release resources required by it.
	 * Attempts to further mutate or dispose this view will error.
	 */
	public dispose(): void {
		this.branch.dispose();
	}
}

/**
 * Run a synchronous transaction on the given shared tree view.
 * This is a convenience helper around the {@link SharedTreeFork#transaction} APIs.
 * @param view - the view on which to run the transaction
 * @param transaction - the transaction function. This will be executed immediately. It is passed `view` as an argument for convenience.
 * If this function returns an `Abort` result then the transaction will be aborted. Otherwise, it will be committed.
 * @returns whether or not the transaction was committed or aborted
 * @alpha
 */
export function runSynchronous(
	view: ITreeCheckout,
	transaction: (view: ITreeCheckout) => TransactionResult | void,
): TransactionResult {
	view.transaction.start();
	const result = transaction(view);
	return result === TransactionResult.Abort
		? view.transaction.abort()
		: view.transaction.commit();
}
