/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
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
} from "../core";
import { HasListeners, IEmitter, ISubscribable, createEmitter } from "../events";
import {
	UnwrappedEditableField,
	EditableTreeContext,
	IDefaultEditBuilder,
	StableNodeKey,
	EditableTree,
	GlobalFieldSchema,
	DefaultChangeset,
	NodeKeyIndex,
	buildForest,
	DefaultChangeFamily,
	defaultSchemaPolicy,
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
} from "../feature-libraries";
import { SharedTreeBranch } from "../shared-tree-core";
import { TransactionResult, brand } from "../util";
import { noopValidator } from "../codec";
import { SchematizeConfiguration, schematizeView } from "./schematizedTree";

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
	 * Gets or sets the root field of the tree.
	 *
	 * See {@link EditableTreeContext.unwrappedRoot} on how its setter works.
	 *
	 * Currently this editable tree's fields do not update on edits,
	 * so holding onto this root object across edits will only work if its an unwrapped node.
	 * TODO: Fix this issue.
	 *
	 * Currently any access to this view of the tree may allocate cursors and thus require
	 * `context.prepareForEdit()` before editing can occur.
	 */
	// TODO: either rename this or `EditableTreeContext.unwrappedRoot` to avoid name confusion.
	get root(): UnwrappedEditableField;
	set root(data: NewFieldContent);

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
	 * It is invalid to call it while a transaction is open (this will be supported in the future).
	 */
	undo(): void;

	/**
	 * Redoes the last completed undo made by the client.
	 * It is invalid to call it while a transaction is open (this will be supported in the future).
	 */
	redo(): void;

	/**
	 * A collection of functions for managing transactions.
	 * Transactions allow edits to be batched into atomic units.
	 * Edits made during a transaction will update the local state of the tree immediately, but will be squashed into a single edit when the transaction is committed.
	 * If the transaction is aborted, the local state will be reset to what it was before the transaction began.
	 * Transactions may nest, meaning that a transaction may be started while a transaction is already ongoing.
	 *
	 * To avoid updating observers of the view state with intermediate results during a transaction,
	 * use {@link ISharedTreeView#fork} and {@link ISharedTreeFork#merge}.
	 */
	readonly transaction: {
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
	};

	/**
	 * Spawn a new view which is based off of the current state of this view.
	 * Any mutations of the new view will not apply to this view until the new view is merged back into this view via `merge()`.
	 */
	fork(): SharedTreeView;

	/**
	 * Apply all the new changes on the given view to this view.
	 * @param view - a view which was created by a call to `fork()`. It is not modified by this operation.
	 */
	merge(view: SharedTreeView): void;

	/**
	 * Rebase the given view onto this view.
	 * @param view - a view which was created by a call to `fork()`. It is modified by this operation.
	 */
	rebase(view: SharedTreeView): void;

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
	 * Takes in a tree and returns a view of it that conforms to the view schema.
	 * The returned view referees to and can edit the provided one: it is not a fork of it.
	 * Updates the stored schema in the tree to match the provided one if requested by config and compatible.
	 *
	 * If the tree is uninitialized (has no nodes or schema at all),
	 * it is initialized to the config's initial tree and the provided schema are stored.
	 * This is done even if `AllowedUpdateType.None`.
	 *
	 * @remarks
	 * Doing initialization here, regardless of `AllowedUpdateType`, allows a small API that is hard to use incorrectly.
	 * Other approach tend to have leave easy to make mistakes.
	 * For example, having a separate initialization function means apps can forget to call it, making an app that can only open existing document,
	 * or call it unconditionally leaving an app that can only create new documents.
	 * It also would require the schema to be passed into to separate places and could cause issues if they didn't match.
	 * Since the initialization function couldn't return a typed tree, the type checking wouldn't help catch that.
	 * Also, if an app manages to create a document, but the initialization fails to get persisted, an app that only calls the initialization function
	 * on the create code-path (for example how a schematized factory might do it),
	 * would leave the document in an unusable state which could not be repaired when it is reopened (by the same or other clients).
	 * Additionally, once out of schema content adapters are properly supported (with lazy document updates),
	 * this initialization could become just another out of schema content adapter: at tha point it clearly belong here in schematize.
	 *
	 * TODO:
	 * - Implement schema-aware API for return type.
	 * - Support adapters for handling out of schema data.
	 */
	schematize<TRoot extends GlobalFieldSchema>(
		config: SchematizeConfiguration<TRoot>,
	): ISharedTreeView;
}

/**
 * Used as a static property to access the creation function for a {@link SharedTreeView}.
 */
export const create = Symbol("Create SharedTreeView");

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
	schema?: InMemoryStoredSchemaRepository;
	forest?: IEditableForest;
	repairProvider?: ForestRepairDataStoreProvider<DefaultChangeset>;
	nodeKeyManager?: NodeKeyManager;
	nodeKeyIndex?: NodeKeyIndex;
	events?: ISubscribable<ViewEvents> & IEmitter<ViewEvents> & HasListeners<ViewEvents>;
}): ISharedTreeView {
	const schema = args?.schema ?? new InMemoryStoredSchemaRepository(defaultSchemaPolicy);
	const forest = args?.forest ?? buildForest(schema, new AnchorSet());
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
			forest.anchors,
		);
	const nodeKeyManager = args?.nodeKeyManager ?? createNodeKeyManager();
	const context = getEditableTreeContext(
		forest,
		branch.editor,
		nodeKeyManager,
		brand(nodeKeyFieldKey),
	);
	const nodeKeyIndex = args?.nodeKeyIndex ?? new NodeKeyIndex(brand(nodeKeyFieldKey));
	const events = args?.events ?? createEmitter();
	return SharedTreeView[create](
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
 * An implementation of {@link ISharedTreeView}.
 * @alpha
 */
export class SharedTreeView implements ISharedTreeView {
	private constructor(
		private readonly branch: SharedTreeBranch<DefaultEditBuilder, DefaultChangeset>,
		private readonly changeFamily: DefaultChangeFamily,
		private readonly _storedSchema: InMemoryStoredSchemaRepository,
		private readonly _forest: IEditableForest,
		public readonly context: EditableTreeContext,
		private readonly _nodeKeyManager: NodeKeyManager,
		private readonly _nodeKeyIndex: NodeKeyIndex,
		private readonly _events: ISubscribable<ViewEvents> &
			IEmitter<ViewEvents> &
			HasListeners<ViewEvents>,
	) {
		branch.on("change", ({ change }) => {
			if (change !== undefined) {
				const delta = this.changeFamily.intoDelta(change);
				this._forest.applyDelta(delta);
				this._nodeKeyIndex.scanKeys(this.context);
				this._events.emit("afterBatch");
			}
		});
	}

	// SharedTreeView is a public type, but its instantiation is internal
	private static [create](
		branch: SharedTreeBranch<DefaultEditBuilder, DefaultChangeset>,
		changeFamily: DefaultChangeFamily,
		storedSchema: InMemoryStoredSchemaRepository,
		forest: IEditableForest,
		context: EditableTreeContext,
		_nodeKeyManager: NodeKeyManager,
		nodeKeyIndex: NodeKeyIndex,
		events: ISubscribable<ViewEvents> & IEmitter<ViewEvents> & HasListeners<ViewEvents>,
	): SharedTreeView {
		return new SharedTreeView(
			branch,
			changeFamily,
			storedSchema,
			forest,
			context,
			_nodeKeyManager,
			nodeKeyIndex,
			events,
		);
	}

	public get events(): ISubscribable<ViewEvents> {
		return this._events;
	}

	public get storedSchema(): StoredSchemaRepository {
		return this._storedSchema;
	}

	public get forest(): IForestSubscription {
		return this._forest;
	}

	public get rootEvents(): ISubscribable<AnchorSetRootEvents> {
		return this._forest.anchors;
	}

	public get editor(): IDefaultEditBuilder {
		return this.branch.editor;
	}

	public readonly transaction: ISharedTreeView["transaction"] = {
		start: () => {
			this.branch.startTransaction(
				new ForestRepairDataStore(this.forest, (change) =>
					this.changeFamily.intoDelta(change),
				),
			);
			this.branch.editor.enterTransaction();
		},
		commit: () => {
			this.branch.commitTransaction();
			this.branch.editor.exitTransaction();
			return TransactionResult.Commit;
		},
		abort: () => {
			this.branch.abortTransaction();
			this.branch.editor.exitTransaction();
			return TransactionResult.Abort;
		},
		inProgress: () => this.branch.isTransacting(),
	};

	public readonly nodeKey: ISharedTreeView["nodeKey"] = {
		generate: () => this._nodeKeyManager.generateLocalNodeKey(),
		stabilize: (key) => this._nodeKeyManager.stabilizeNodeKey(key),
		localize: (key) => this._nodeKeyManager.localizeNodeKey(key),
		map: this._nodeKeyIndex,
	};

	public undo() {
		this.branch.undo();
	}

	public redo() {
		this.branch.redo();
	}

	public schematize<TRoot extends GlobalFieldSchema>(
		config: SchematizeConfiguration<TRoot>,
	): ISharedTreeView {
		return schematizeView(this, config);
	}

	public locate(anchor: Anchor): AnchorNode | undefined {
		return this._forest.anchors.locate(anchor);
	}

	public fork(): SharedTreeView {
		const anchors = new AnchorSet();
		const storedSchema = this._storedSchema.clone();
		const forest = this._forest.clone(storedSchema, anchors);
		const repairDataStoreProvider = new ForestRepairDataStoreProvider(
			forest,
			storedSchema,
			(change: ModularChangeset) => this.changeFamily.intoDelta(change),
		);
		const branch = this.branch.fork(repairDataStoreProvider, anchors);
		const context = getEditableTreeContext(
			forest,
			branch.editor,
			this._nodeKeyManager,
			this._nodeKeyIndex.fieldKey,
		);
		return new SharedTreeView(
			branch,
			this.changeFamily,
			storedSchema,
			forest,
			context,
			this._nodeKeyManager,
			this._nodeKeyIndex.clone(context),
			createEmitter(),
		);
	}

	/**
	 * Rebase the changes that have been applied to this view over all the new changes in the given view.
	 * @param view - Either the root view or a view that was created by a call to `fork()`. It is not modified by this operation.
	 */
	public rebaseOnto(view: ISharedTreeView): void {
		view.rebase(this);
	}

	public merge(fork: SharedTreeView): void {
		this.branch.merge(fork.branch);
	}

	public rebase(fork: SharedTreeView): void {
		fork.branch.rebaseOnto(this.branch);
	}

	public get root(): UnwrappedEditableField {
		return this.context.unwrappedRoot;
	}

	public set root(data: NewFieldContent) {
		this.context.unwrappedRoot = data;
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
