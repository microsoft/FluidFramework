/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IChannelStorageService,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ISharedObject } from "@fluidframework/shared-object-base";
import {
	IForestSubscription,
	StoredSchemaRepository,
	InMemoryStoredSchemaRepository,
	Anchor,
	AnchorLocator,
	AnchorSet,
	AnchorNode,
	IEditableForest,
	AnchorSetRootEvents,
	symbolFromKey,
	GlobalFieldKey,
	GraphCommit,
} from "../core";
import { SharedTreeBranch, SharedTreeCore } from "../shared-tree-core";
import {
	defaultSchemaPolicy,
	EditableTreeContext,
	ForestSummarizer,
	SchemaSummarizer as SchemaSummarizer,
	DefaultChangeFamily,
	defaultChangeFamily,
	DefaultEditBuilder,
	UnwrappedEditableField,
	getEditableTreeContext,
	SchemaEditor,
	DefaultChangeset,
	buildForest,
	ContextuallyTypedNodeData,
	IDefaultEditBuilder,
	ForestRepairDataStore,
	IdentifierIndex,
	EditableTree,
	Identifier,
	SchemaAware,
	ModularChangeset,
} from "../feature-libraries";
import { IEmitter, ISubscribable, createEmitter } from "../events";
import { brand, fail, TransactionResult } from "../util";
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

	set root(data: ContextuallyTypedNodeData | undefined);

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
	 * An collection of functions for managing transactions.
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
	fork(): ISharedTreeFork;

	/**
	 * Apply all the new changes on the given view to this view.
	 * @param view - a view which was created by a call to `fork()`. It is not modified by this operation.
	 */
	merge(view: ISharedTreeFork): void;

	/**
	 * Events about this view.
	 */
	readonly events: ISubscribable<ViewEvents>;

	/**
	 * Events about the root of the tree in this view.
	 */
	readonly rootEvents: ISubscribable<AnchorSetRootEvents>;

	/**
	 * A map of nodes that have been recorded by the identifier index.
	 */
	readonly identifiedNodes: ReadonlyMap<Identifier, EditableTree>;

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
	schematize<TSchema extends SchemaAware.TypedSchemaData>(
		config: SchematizeConfiguration<TSchema>,
	): ISharedTreeView;
}

/**
 * An `ISharedTreeView` which has been forked from a pre-existing view.
 * @alpha
 */
export interface ISharedTreeFork extends ISharedTreeView {
	/**
	 * Rebase the changes that have been applied to this view over all the new changes in the given view.
	 * @param view - Either the root view or a view that was created by a call to `fork()`. It is not modified by this operation.
	 */
	rebaseOnto(view: ISharedTreeView): void;
}

/**
 * Collaboratively editable tree distributed data-structure,
 * powered by {@link @fluidframework/shared-object-base#ISharedObject}.
 *
 * See [the README](../../README.md) for details.
 * @alpha
 */
export interface ISharedTree extends ISharedObject, ISharedTreeView {}

/**
 * The key for the special identifier field, which allows nodes to be given identifiers that can be used
 * to find the nodes via the identifier index
 * @alpha
 */
export const identifierKey: GlobalFieldKey = brand("identifier");

/**
 * The global field key symbol that corresponds to {@link identifierKey}
 * @alpha
 */
export const identifierKeySymbol = symbolFromKey(identifierKey);

/**
 * Shared tree, configured with a good set of indexes and field kinds which will maintain compatibility over time.
 * TODO: node identifier index.
 *
 * TODO: detail compatibility requirements.
 */
export class SharedTree
	extends SharedTreeCore<DefaultEditBuilder, DefaultChangeset>
	implements ISharedTree
{
	public readonly context: EditableTreeContext;
	public readonly forest: IEditableForest;
	public readonly storedSchema: SchemaEditor<InMemoryStoredSchemaRepository>;
	public readonly identifiedNodes: IdentifierIndex<typeof identifierKey>;
	public readonly transaction: ISharedTreeView["transaction"];

	public readonly events: ISubscribable<ViewEvents> & IEmitter<ViewEvents>;
	public get rootEvents(): ISubscribable<AnchorSetRootEvents> {
		return this.forest.anchors;
	}

	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		telemetryContextPrefix: string,
	) {
		const anchors = new AnchorSet();
		const schema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy);
		const forest = buildForest(schema, anchors);
		const schemaSummarizer = new SchemaSummarizer(runtime, schema);
		const forestSummarizer = new ForestSummarizer(runtime, forest);
		super(
			[schemaSummarizer, forestSummarizer],
			defaultChangeFamily,
			anchors,
			id,
			runtime,
			attributes,
			telemetryContextPrefix,
		);

		this.events = createEmitter<ViewEvents>();
		this.forest = forest;
		this.storedSchema = new SchemaEditor(schema, (op) => this.submitLocalMessage(op));

		this.transaction = {
			start: () => this.startTransaction(new ForestRepairDataStore(() => this.forest)),
			commit: () => this.commitTransaction(),
			abort: () => this.abortTransaction(),
			inProgress: () => this.isTransacting(),
		};

		this.context = getEditableTreeContext(forest, this.editor);
		this.identifiedNodes = new IdentifierIndex(identifierKey);
		this.changeEvents.on("newLocalState", (changeDelta) => {
			this.forest.applyDelta(changeDelta);
			this.finishBatch();
		});
	}

	public schematize<TSchema extends SchemaAware.TypedSchemaData>(
		config: SchematizeConfiguration<TSchema>,
	): ISharedTreeView {
		return schematizeView(this, config);
	}

	public locate(anchor: Anchor): AnchorNode | undefined {
		return this.forest.anchors.locate(anchor);
	}

	public get root(): UnwrappedEditableField {
		return this.context.unwrappedRoot;
	}

	public set root(data: ContextuallyTypedNodeData | undefined) {
		this.context.unwrappedRoot = data;
	}

	public fork(): ISharedTreeFork {
		const anchors = new AnchorSet();
		const branch = this.createBranch(anchors);
		const schema = this.storedSchema.inner.clone();
		const forest = this.forest.clone(schema, anchors);
		const context = getEditableTreeContext(forest, branch.editor);
		return new SharedTreeFork(
			branch,
			defaultChangeFamily,
			schema,
			forest,
			context,
			this.identifiedNodes.clone(context),
		);
	}

	public merge(view: ISharedTreeFork): void {
		this.mergeBranch(getForkBranch(view));
	}

	public override getLocalBranchHead(): GraphCommit<ModularChangeset> {
		return super.getLocalBranchHead();
	}

	/**
	 * TODO: Shared tree needs a pattern for handling non-changeset operations.
	 * Whatever pattern is adopted should probably also handle multiple versions of changeset operations.
	 * A single top level enum listing all ops (including their different versions),
	 * with at least fine grained enough detail to direct them to the correct subsystem would be a good approach.
	 * The current use-case (with an op applying to a specific index) is a temporary hack,
	 * and its not clear how it would fit into such a system if implemented in shared-tree-core:
	 * maybe op dispatch is part of the shared-tree level?
	 */
	protected override processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		if (!this.storedSchema.tryHandleOp(message)) {
			super.processCore(message, local, localOpMetadata);
		}
	}

	protected override async loadCore(services: IChannelStorageService): Promise<void> {
		await super.loadCore(services);
		this.finishBatch();
	}

	/** Finish a batch (see {@link ViewEvents}) */
	private finishBatch(): void {
		this.identifiedNodes.scanIdentifiers(this.context);
		this.events.emit("afterBatch");
	}
}

/**
 * A channel factory that creates {@link ISharedTree}s.
 * @alpha
 */
export class SharedTreeFactory implements IChannelFactory {
	public type: string = "SharedTree";

	public attributes: IChannelAttributes = {
		type: this.type,
		snapshotFormatVersion: "0.0.0",
		packageVersion: "0.0.0",
	};

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<ISharedTree> {
		const tree = new SharedTree(id, runtime, channelAttributes, "SharedTree");
		await tree.load(services);
		return tree;
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): ISharedTree {
		const tree = new SharedTree(id, runtime, this.attributes, "SharedTree");
		tree.initializeLocal();
		return tree;
	}
}

export class SharedTreeFork implements ISharedTreeFork {
	public readonly events = createEmitter<ViewEvents>();

	public constructor(
		public readonly branch: SharedTreeBranch<DefaultEditBuilder, DefaultChangeset>,
		public readonly changeFamily: DefaultChangeFamily,
		public readonly storedSchema: InMemoryStoredSchemaRepository,
		public readonly forest: IEditableForest,
		public readonly context: EditableTreeContext,
		public readonly identifiedNodes: IdentifierIndex<typeof identifierKey>,
	) {
		branch.on("change", (change) => {
			const delta = this.changeFamily.intoDelta(change);
			this.forest.applyDelta(delta);
			this.identifiedNodes.scanIdentifiers(this.context);
			this.events.emit("afterBatch");
		});
	}

	public get rootEvents(): ISubscribable<AnchorSetRootEvents> {
		return this.forest.anchors;
	}

	public get editor() {
		return this.branch.editor;
	}

	public readonly transaction: ISharedTreeView["transaction"] = {
		start: () => this.branch.startTransaction(new ForestRepairDataStore(() => this.forest)),
		commit: () => this.branch.commitTransaction(),
		abort: () => this.branch.abortTransaction(),
		inProgress: () => this.branch.isTransacting(),
	};

	public schematize<TSchema extends SchemaAware.TypedSchemaData>(
		config: SchematizeConfiguration<TSchema>,
	): ISharedTreeView {
		return schematizeView(this, config);
	}

	public locate(anchor: Anchor): AnchorNode | undefined {
		return this.forest.anchors.locate(anchor);
	}

	public fork(): ISharedTreeFork {
		const anchors = new AnchorSet();
		const branch = this.branch.fork(anchors);
		const storedSchema = this.storedSchema.clone();
		const forest = this.forest.clone(storedSchema, anchors);
		const context = getEditableTreeContext(forest, branch.editor);
		return new SharedTreeFork(
			branch,
			this.changeFamily,
			storedSchema,
			forest,
			context,
			this.identifiedNodes.clone(context),
		);
	}

	public rebaseOnto(view: ISharedTreeView): void {
		this.branch.rebaseOnto(getHeadCommit(view));
	}

	public merge(view: ISharedTreeFork): void {
		this.branch.merge(getForkBranch(view));
	}

	public get root(): UnwrappedEditableField {
		return this.context.unwrappedRoot;
	}

	public set root(data: ContextuallyTypedNodeData | undefined) {
		this.context.unwrappedRoot = data;
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

// #region Extraction functions
// The following two functions assume the underlying classes/implementations of `ISharedTreeView` and `ISharedTreeFork`.
// While `instanceof` checks are in general bad practice or code smell, these are justifiable because:
// 1. `SharedTree` and `SharedTreeFork` are private and meant to be the only implementations of `ISharedTreeView` and `ISharedTreeFork`.
// 2. The `ISharedTreeView` and `ISharedTreeFork` interfaces are not meant to specify input contracts, but exist solely to reduce the API provided by the underlying classes.
//    It is never expected that a user would create their own object or class which satisfies `ISharedTreeView` or `ISharedTreeFork`.
function getHeadCommit(view: ISharedTreeView): GraphCommit<DefaultChangeset> {
	if (view instanceof SharedTree) {
		return view.getLocalBranchHead();
	} else if (view instanceof SharedTreeFork) {
		return view.branch.getHead();
	}

	fail("Unsupported ISharedTreeView implementation");
}

function getForkBranch(
	fork: ISharedTreeFork,
): SharedTreeBranch<DefaultEditBuilder, DefaultChangeset> {
	assert(fork instanceof SharedTreeFork, "Unsupported ISharedTreeFork implementation");
	return fork.branch;
}
// #endregion Extraction functions
