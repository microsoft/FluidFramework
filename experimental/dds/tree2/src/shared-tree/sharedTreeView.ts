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
	FieldKey,
	Revertible,
} from "../core";
import { HasListeners, IEmitter, ISubscribable, createEmitter } from "../events";
import {
	IDefaultEditBuilder,
	DefaultChangeset,
	buildForest,
	DefaultChangeFamily,
	DefaultEditBuilder,
	NodeKeyManager,
	TreeFieldSchema,
	TreeSchema,
	getTreeContext,
	TypedField,
	createNodeKeyManager,
	nodeKeyFieldKey as nodeKeyFieldKeyDefault,
	getProxyForField,
} from "../feature-libraries";
import { SharedTreeBranch, getChangeReplaceType } from "../shared-tree-core";
import { TransactionResult, brand } from "../util";
import { noopValidator } from "../codec";

/**
 * Events for {@link ISharedTreeView}.
 * @alpha
 */
export interface ViewEvents {
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
 * Implementations of this interface must implement the {@link branchKey} property.
 * TODO:
 * This interface is the one without a View schema.
 * For clarity it should be renamed to something like "BranchCheckout"
 * @alpha
 */
export interface ISharedTreeView extends AnchorLocator {
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
	fork(): ISharedTreeBranchView;

	/**
	 * Apply all the new changes on the given view to this view.
	 * @param view - a view which was created by a call to `fork()`.
	 * It is automatically disposed after the merge completes.
	 * @remarks All ongoing transactions (if any) in `view` will be committed before the merge.
	 */
	merge(view: ISharedTreeBranchView): void;

	/**
	 * Apply all the new changes on the given view to this view.
	 * @param view - a view which was created by a call to `fork()`.
	 * @param disposeView - whether or not to dispose `view` after the merge completes.
	 * @remarks All ongoing transactions (if any) in `view` will be committed before the merge.
	 */
	merge(view: ISharedTreeBranchView, disposeView: boolean): void;

	/**
	 * Rebase the given view onto this view.
	 * @param view - a view which was created by a call to `fork()`. It is modified by this operation.
	 */
	rebase(view: ISharedTreeBranchView): void;

	/**
	 * Events about this view.
	 */
	readonly events: ISubscribable<ViewEvents>;

	/**
	 * Events about the root of the tree in this view.
	 */
	readonly rootEvents: ISubscribable<AnchorSetRootEvents>;

	/**
	 * Get a typed view of the tree content using the editable-tree-2 API.
	 *
	 * Warning: This API is not fully tested yet and is still under development.
	 * It will eventually replace the current editable-tree API and become the main entry point for working with SharedTree.
	 * Access to this API is exposed here as a temporary measure to enable experimenting with the API while its being finished and evaluated.
	 *
	 * TODO:
	 * ISharedTreeView should already have the view schema, and thus nor require it to be passed in.
	 * As long as it is passed in here as a workaround, the caller must ensure that the stored schema is compatible.
	 * If the stored schema is edited and becomes incompatible (or was not originally compatible),
	 * using the returned tree is invalid and is likely to error or corrupt the document.
	 *
	 * @deprecated Use {@link ISharedTreeView2}.
	 */
	editableTree2<TRoot extends TreeFieldSchema>(viewSchema: TreeSchema<TRoot>): TypedField<TRoot>;
}

/**
 * Creates a {@link SharedTreeView}.
 * @param args - an object containing optional components that will be used to build the view.
 * Any components not provided will be created by default.
 * @remarks This does not create a {@link SharedTree}, but rather a view with the minimal state
 * and functionality required to implement {@link ISharedTreeView}.
 */
export function createSharedTreeView(args?: {
	branch?: SharedTreeBranch<DefaultEditBuilder, DefaultChangeset>;
	changeFamily?: DefaultChangeFamily;
	schema?: StoredSchemaRepository;
	forest?: IEditableForest;
	events?: ISubscribable<ViewEvents> & IEmitter<ViewEvents> & HasListeners<ViewEvents>;
	removedTrees?: DetachedFieldIndex;
}): SharedTreeView {
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

	return new SharedTreeView(
		transaction,
		branch,
		changeFamily,
		schema,
		forest,
		events,
		args?.removedTrees,
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
 * use {@link ISharedTreeView#fork} and {@link ISharedTreeFork#merge}.
 * @alpha
 */
export interface ITransaction {
	/**
	 * Start a new transaction.
	 * If a transaction is already in progress when this new transaction starts, then this transaction will be "nested" inside of it,
	 * i.e. the outer transaction will still be in progress after this new transaction is committed or aborted.
	 */
	start(): void;
	/**
	 * Close this transaction by squashing its edits and committing them as a single edit.
	 * If this is the root view and there are no ongoing transactions remaining, the squashed edit will be submitted to Fluid.
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
 * {@link ISharedTreeView} that has forked off of the main trunk/branch.
 * @alpha
 */
export interface ISharedTreeBranchView extends ISharedTreeView {
	/**
	 * Rebase the changes that have been applied to this view over all the new changes in the given view.
	 * @param view - Either the root view or a view that was created by a call to `fork()`. It is not modified by this operation.
	 */
	rebaseOnto(view: ISharedTreeView): void;
}

/**
 * An implementation of {@link ISharedTreeBranchView}.
 */
export class SharedTreeView implements ISharedTreeBranchView {
	public constructor(
		public readonly transaction: ITransaction,
		private readonly branch: SharedTreeBranch<DefaultEditBuilder, DefaultChangeset>,
		private readonly changeFamily: DefaultChangeFamily,
		public readonly storedSchema: StoredSchemaRepository,
		public readonly forest: IEditableForest,
		public readonly events: ISubscribable<ViewEvents> &
			IEmitter<ViewEvents> &
			HasListeners<ViewEvents>,
		private readonly removedTrees: DetachedFieldIndex = makeDetachedFieldIndex("repair"),
	) {
		branch.on("change", (event) => {
			if (event.change !== undefined) {
				const delta = this.changeFamily.intoDelta(event.change);
				const anchorVisitor = this.forest.anchors.acquireVisitor();
				const combinedVisitor = combineVisitors(
					[this.forest.acquireVisitor(), anchorVisitor],
					[anchorVisitor],
				);
				visitDelta(delta, combinedVisitor, this.removedTrees);
				combinedVisitor.free();
				this.events.emit("afterBatch");
			}
			if (event.type === "replace" && getChangeReplaceType(event) === "transactionCommit") {
				const transactionRevision = event.newCommits[0].revision;
				for (const transactionStep of event.removedCommits) {
					this.removedTrees.updateMajor(transactionStep.revision, transactionRevision);
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

	public editableTree2<TRoot extends TreeFieldSchema>(
		viewSchema: TreeSchema<TRoot>,
		nodeKeyManager?: NodeKeyManager,
		nodeKeyFieldKey?: FieldKey,
	): TypedField<TRoot> {
		const context = getTreeContext(
			viewSchema,
			this.forest,
			this.branch.editor,
			nodeKeyManager ?? createNodeKeyManager(),
			nodeKeyFieldKey ?? brand(nodeKeyFieldKeyDefault),
		);
		return context.root as TypedField<TRoot>;
	}

	public root2<TRoot extends TreeFieldSchema>(viewSchema: TreeSchema<TRoot>) {
		// TODO:
		// this allocates and leaks a new editable tree context (when used it will add content to the AnchorSet which refers back to the context).
		// Additionally its assumed there will be exactly one context per view and any TreeNodes cached on the AnchorSets will belong to that context.
		// Calling this more than once would violate that assumption, but currently does not error.
		// Therefore root2, like editableTree2 should really only be called once.
		// However, since getProxyForField returns an object that no longer reflects the root after the root is edited (unlike the root field in editableTree2)
		// users will need to call root2 again whenever that might have happened to get the new root.
		// This makes it impractical to use this efficiently and correctly at the same time.
		// This method is also undocumented which thus doesn't provide sufficient guidance to resolve this issue.
		const rootField = this.editableTree2(viewSchema);
		return getProxyForField(rootField);
	}

	public locate(anchor: Anchor): AnchorNode | undefined {
		return this.forest.anchors.locate(anchor);
	}

	public fork(): SharedTreeView {
		const anchors = new AnchorSet();
		// TODO: ensure editing this clone of the schema does the right thing.
		const storedSchema = new InMemoryStoredSchemaRepository(this.storedSchema);
		const forest = this.forest.clone(storedSchema, anchors);
		const branch = this.branch.fork();
		const transaction = new Transaction(branch);
		return new SharedTreeView(
			transaction,
			branch,
			this.changeFamily,
			storedSchema,
			forest,
			createEmitter(),
			this.removedTrees.clone(),
		);
	}

	public rebase(view: SharedTreeView): void {
		view.branch.rebaseOnto(this.branch);
	}

	public rebaseOnto(view: ISharedTreeView): void {
		view.rebase(this);
	}

	public merge(view: SharedTreeView): void;
	public merge(view: SharedTreeView, disposeView: boolean): void;
	public merge(view: SharedTreeView, disposeView = true): void {
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
	view: ISharedTreeView,
	transaction: (view: ISharedTreeView) => TransactionResult | void,
): TransactionResult {
	view.transaction.start();
	const result = transaction(view);
	return result === TransactionResult.Abort
		? view.transaction.abort()
		: view.transaction.commit();
}
