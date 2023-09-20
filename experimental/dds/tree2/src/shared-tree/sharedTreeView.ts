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
	UndoRedoManager,
	LocalCommitSource,
	schemaDataIsEmpty,
	applyDelta,
} from "../core";
import { HasListeners, IEmitter, ISubscribable, createEmitter } from "../events";
import {
	UnwrappedEditableField,
	EditableTreeContext,
	IDefaultEditBuilder,
	StableNodeKey,
	EditableTree,
	DefaultChangeset,
	NodeKeyIndex,
	buildForest,
	DefaultChangeFamily,
	getEditableTreeContext,
	ForestRepairDataStoreProvider,
	DefaultEditBuilder,
	NewFieldContent,
	NodeKeyManager,
	createNodeKeyManager,
	LocalNodeKey,
	ForestRepairDataStore,
	ModularChangeset,
	nodeKeyFieldKey,
	FieldSchema,
	TypedSchemaCollection,
	getTreeContext,
	TypedField,
} from "../feature-libraries";
import { SharedTreeBranch } from "../shared-tree-core";
import { TransactionResult, brand } from "../util";
import { noopValidator } from "../codec";
import {
	InitializeAndSchematizeConfiguration,
	initializeContent,
	schematize,
} from "./schematizedTree";

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
	 *
	 * @remarks
	 * This event is made available to allow consumers to manage reverting changes to different DDSes.
	 * The event along with the {@link LocalCommitSource} communicates a change has been made that can be undone or redone on
	 * the {@link ISharedTreeView}. However, the {@link ISharedTreeView} completely manages its own undo/redo
	 * stack which cannot be modified and no additional information about the change is provided.
	 *
	 * Revertible events are emitted when merging a view into this view but not when rebasing this view onto another view. This is because
	 * rebasing onto another view can cause the relative ordering of existing revertible commits to change.
	 *
	 * @privateRemarks
	 * It is possible to make this event work for rebasing onto another view but this event is currently only necessary for the
	 * local branch which cannot be rebased onto another branch.
	 */
	revertible(source: LocalCommitSource): void;
}

/**
 * Provides a means for interacting with a SharedTree.
 * This includes reading data from the tree and running transactions to mutate the tree.
 * @remarks This interface should not have any implementations other than those provided by the SharedTree package libraries.
 * @privateRemarks Implementations of this interface must implement the {@link branchKey} property.
 * @alpha
 */
export interface ISharedTreeView extends AnchorLocator {
	/**
	 * Gets the root field of the tree.
	 *
	 * See {@link EditableTreeContext.unwrappedRoot} on how its setter works.
	 *
	 * Currently this editable tree's fields do not update on edits,
	 * so holding onto this root object across edits will only work if it's an unwrapped node.
	 * TODO: Fix this issue.
	 *
	 * Currently any access to this view of the tree may allocate cursors and thus require
	 * `context.prepareForEdit()` before editing can occur.
	 */
	// TODO: either rename this or `EditableTreeContext.unwrappedRoot` to avoid name confusion.
	get root(): UnwrappedEditableField;

	/**
	 * Sets the content of the root field of the tree.
	 *
	 * See {@link EditableTreeContext.unwrappedRoot} on how this works.
	 */
	setContent(data: NewFieldContent): void;

	/**
	 * Context for controlling the EditableTree nodes produced from {@link ISharedTreeView.root}.
	 *
	 * TODO: Exposing access to this should be unneeded once editing APIs are finished.
	 */
	readonly context: EditableTreeContext;

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
	 * Undoes the last completed transaction made by the client.
	 *
	 * @remarks
	 * Calling this does nothing if there are no transactions in the
	 * undo stack.
	 *
	 * It is invalid to call it while a transaction is open (this will be supported in the future).
	 */
	undo(): void;

	/**
	 * Redoes the last completed undo made by the client.
	 *
	 * @remarks
	 * Calling this does nothing if there are no transactions in the
	 * redo stack. New local transactions will not clear the redo stack.
	 *
	 * It is invalid to call it while a transaction is open (this will be supported in the future).
	 */
	redo(): void;

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
	 * A collection of utilities for managing {@link StableNodeKey}s.
	 * A node key can be assigned to a node and allows that node to be easily retrieved from the tree at a later time. (see `nodeKey.map`).
	 * @remarks {@link LocalNodeKey}s are put on nodes via a special field (see {@link localNodeKeySymbol}.
	 * A node with a node key in its schema must always have a node key.
	 */
	readonly nodeKey: {
		/**
		 * Create a new {@link LocalNodeKey} which can be used as the key for a node in the tree.
		 */
		generate(): LocalNodeKey;
		/**
		 * Convert the given {@link LocalNodeKey} into a UUID that can be serialized.
		 * @param key - the key to convert
		 */
		stabilize(key: LocalNodeKey): StableNodeKey;
		/**
		 * Convert a {@link StableNodeKey} back into its {@link LocalNodeKey} form.
		 * @param key - the key to convert
		 */
		localize(key: StableNodeKey): LocalNodeKey;
		/**
		 * A map of all {@link LocalNodeKey}s in the document to their corresponding nodes.
		 */
		map: ReadonlyMap<LocalNodeKey, EditableTree>;
	};

	/**
	 * @deprecated {@link ISharedTree.schematize} which will replace this. View schema should be applied before creating an ISharedTreeView.
	 */
	schematize<TRoot extends FieldSchema>(
		config: InitializeAndSchematizeConfiguration<TRoot>,
	): ISharedTreeView;

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
	 */
	editableTree2<TRoot extends FieldSchema>(
		viewSchema: TypedSchemaCollection<TRoot>,
	): TypedField<TRoot>;
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
	repairProvider?: ForestRepairDataStoreProvider<DefaultChangeset>;
	nodeKeyManager?: NodeKeyManager;
	nodeKeyIndex?: NodeKeyIndex;
	events?: ISubscribable<ViewEvents> & IEmitter<ViewEvents> & HasListeners<ViewEvents>;
}): ISharedTreeView {
	const schema = args?.schema ?? new InMemoryStoredSchemaRepository();
	const forest = args?.forest ?? buildForest();
	const changeFamily =
		args?.changeFamily ?? new DefaultChangeFamily({ jsonValidator: noopValidator });
	const repairDataStoreProvider =
		args?.repairProvider ??
		new ForestRepairDataStoreProvider(forest, schema, (change) =>
			changeFamily.intoDelta(change),
		);
	const undoRedoManager = UndoRedoManager.create(changeFamily);
	const branch =
		args?.branch ??
		new SharedTreeBranch(
			{
				change: changeFamily.rebaser.compose([]),
				revision: assertIsRevisionTag("00000000-0000-4000-8000-000000000000"),
			},
			changeFamily,
			repairDataStoreProvider,
			undoRedoManager,
		);
	const nodeKeyManager = args?.nodeKeyManager ?? createNodeKeyManager();
	const context = getEditableTreeContext(
		forest,
		schema,
		branch.editor,
		nodeKeyManager,
		brand(nodeKeyFieldKey),
	);
	const nodeKeyIndex = args?.nodeKeyIndex ?? new NodeKeyIndex(brand(nodeKeyFieldKey));
	const events = args?.events ?? createEmitter();

	const transaction = new Transaction(branch, changeFamily, forest);

	return new SharedTreeView(
		transaction,
		branch,
		changeFamily,
		schema,
		forest,
		context,
		nodeKeyManager,
		nodeKeyIndex,
		events,
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
		private readonly changeFamily: DefaultChangeFamily,
		private readonly forest: IEditableForest,
	) {}

	public start(): void {
		this.branch.startTransaction(
			new ForestRepairDataStore(this.forest, (change) => this.changeFamily.intoDelta(change)),
		);
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
		public readonly context: EditableTreeContext,
		private readonly nodeKeyManager: NodeKeyManager,
		private readonly nodeKeyIndex: NodeKeyIndex,
		public readonly events: ISubscribable<ViewEvents> &
			IEmitter<ViewEvents> &
			HasListeners<ViewEvents>,
	) {
		branch.on("change", ({ change }) => {
			if (change !== undefined) {
				const delta = this.changeFamily.intoDelta(change);
				applyDelta(delta, this.forest.anchors);
				applyDelta(delta, this.forest);
				this.nodeKeyIndex.scanKeys(this.context);
				this.events.emit("afterBatch");
			}
		});
		branch.on("revertible", (type) => {
			this.events.emit("revertible", type);
		});
	}

	public get rootEvents(): ISubscribable<AnchorSetRootEvents> {
		return this.forest.anchors;
	}

	public get editor(): IDefaultEditBuilder {
		return this.branch.editor;
	}

	public readonly nodeKey: ISharedTreeView["nodeKey"] = {
		generate: () => this.nodeKeyManager.generateLocalNodeKey(),
		stabilize: (key) => this.nodeKeyManager.stabilizeNodeKey(key),
		localize: (key) => this.nodeKeyManager.localizeNodeKey(key),
		map: this.nodeKeyIndex,
	};

	public undo() {
		this.branch.undo();
	}

	public redo() {
		this.branch.redo();
	}

	public schematize<TRoot extends FieldSchema>(
		config: InitializeAndSchematizeConfiguration<TRoot>,
	): ISharedTreeView {
		schematizeView(this, config, this.storedSchema);
		return this;
	}

	public editableTree2<TRoot extends FieldSchema>(
		viewSchema: TypedSchemaCollection<TRoot>,
	): TypedField<TRoot> {
		const context = getTreeContext(
			viewSchema,
			this.forest,
			this.branch.editor,
			this.nodeKeyManager,
			this.nodeKeyIndex.fieldKey,
		);
		return context.root as TypedField<TRoot>;
	}

	public locate(anchor: Anchor): AnchorNode | undefined {
		return this.forest.anchors.locate(anchor);
	}

	public fork(): SharedTreeView {
		const anchors = new AnchorSet();
		// TODO: ensure editing this clone of the schema does the right thing.
		const storedSchema = new InMemoryStoredSchemaRepository(this.storedSchema);
		const forest = this.forest.clone(storedSchema, anchors);
		const repairDataStoreProvider = new ForestRepairDataStoreProvider(
			forest,
			storedSchema,
			(change: ModularChangeset) => this.changeFamily.intoDelta(change),
		);
		const branch = this.branch.fork(repairDataStoreProvider);
		const context = getEditableTreeContext(
			forest,
			storedSchema,
			branch.editor,
			this.nodeKeyManager,
			this.nodeKeyIndex.fieldKey,
		);
		const transaction = new Transaction(branch, this.changeFamily, forest);
		return new SharedTreeView(
			transaction,
			branch,
			this.changeFamily,
			storedSchema,
			forest,
			context,
			this.nodeKeyManager,
			this.nodeKeyIndex.clone(context),
			createEmitter(),
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

	public get root(): UnwrappedEditableField {
		return this.context.unwrappedRoot;
	}

	public setContent(data: NewFieldContent) {
		this.context.setContent(data);
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
 * @param view - view to edit.
 * @param config - config to apply.
 * @param storedSchema - provided separate from view since editing schema of view doesn't send ops properly.
 */
// TODO: once schematize is removed from ISharedTreeView, this should be moved/integrated into SharedTree.
export function schematizeView<TRoot extends FieldSchema>(
	view: ISharedTreeView,
	config: InitializeAndSchematizeConfiguration<TRoot>,
	storedSchema: StoredSchemaRepository,
): void {
	// TODO:
	// When this becomes a more proper out of schema adapter, editing should be made lazy.
	// This will improve support for readonly documents, cross version collaboration and attribution.

	// Check for empty.
	// TODO: Better detection of empty case
	if (view.forest.isEmpty && schemaDataIsEmpty(storedSchema)) {
		view.transaction.start();
		initializeContent(storedSchema, config.schema, () => view.setContent(config.initialTree));
		view.transaction.commit();
	}

	schematize(view.events, storedSchema, config);
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
