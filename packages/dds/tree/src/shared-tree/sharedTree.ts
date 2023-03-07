/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ISharedObject } from "@fluidframework/shared-object-base";
import {
	TransactionResult,
	IForestSubscription,
	StoredSchemaRepository,
	InMemoryStoredSchemaRepository,
	TransactionCheckout,
	Anchor,
	AnchorLocator,
	AnchorSet,
	AnchorNode,
	IEditableForest,
	SharedTreeBranch,
} from "../core";
import { SharedTreeCore } from "../shared-tree-core";
import {
	defaultSchemaPolicy,
	EditableTreeContext,
	ForestIndex,
	SchemaIndex,
	DefaultChangeFamily,
	defaultChangeFamily,
	DefaultEditBuilder,
	UnwrappedEditableField,
	getEditableTreeContext,
	SchemaEditor,
	DefaultChangeset,
	EditManagerIndex,
	buildForest,
	ContextuallyTypedNodeData,
	ModularChangeset,
	IDefaultEditBuilder,
	ForestRepairDataStore,
} from "../feature-libraries";

/**
 * Provides a means for interacting with a SharedTree.
 * This includes reading data from the tree and running transactions to mutate the tree.
 * @alpha
 */
export interface ISharedTreeCheckout extends AnchorLocator {
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
	 * Context for controlling the EditableTree nodes produced from {@link ISharedTreeCheckout.root}.
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
	 * This will be done after the relations between branches and Indexes are figured out.
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
	 * Use `runTransaction` to create a local edit. TODO
	 */
	readonly forest: IForestSubscription;

	readonly editor: IDefaultEditBuilder;

	readonly transaction: {
		start: () => void;
		commit: () => void;
		abort: () => void;
		inProgress: () => void;
	};

	/**
	 * Run `transaction` to edit this forest.
	 * While `transaction` is running, its intermediate states will be visible on the IForestSubscription.
	 *
	 * TODO: support nesting (perhaps via "commands"),
	 * and do this in a way where there is control over which transaction's intermediate versions are displayed.
	 */
	runTransaction(
		transaction: (
			forest: IForestSubscription,
			editor: IDefaultEditBuilder,
		) => TransactionResult,
	): TransactionResult;

	/**
	 * Spawn a new checkout which is based off of the current state of this checkout.
	 * Any mutations of the new checkout will not apply to this checkout until the new checkout is merged back in.
	 */
	fork(): ISharedTreeCheckoutFork;
}

/**
 * An `ISharedTreeCheckout` which has been forked from a pre-existing checkout.
 * @alpha
 */
export interface ISharedTreeCheckoutFork extends ISharedTreeCheckout {
	/**
	 * Rebase the changes that have been applied to this checkout over all the changes in the base checkout that have
	 * occurred since this checkout last pulled (or was forked).
	 */
	pull(): void;

	/**
	 * Apply all the changes on this checkout to the base checkout from which it was forked. If the base checkout has new
	 * changes since this checkout last pulled (or was forked), then this checkout's changes will be rebased over those first.
	 * After the merge completes, this checkout may no longer be forked or mutated.
	 */
	merge(): void;

	/**
	 * Whether or not this checkout has been merged into its base checkout via `merge()`.
	 * If it has, then it may no longer be forked or mutated.
	 */
	isMerged(): boolean;
}

/**
 * Collaboratively editable tree distributed data-structure,
 * powered by {@link @fluidframework/shared-object-base#ISharedObject}.
 *
 * See [the README](../../README.md) for details.
 * @alpha
 */
export interface ISharedTree extends ISharedObject, ISharedTreeCheckout {}

/**
 * Shared tree, configured with a good set of indexes and field kinds which will maintain compatibility over time.
 * TODO: node identifier index.
 *
 * TODO: detail compatibility requirements.
 */
class SharedTree
	extends SharedTreeCore<
		DefaultChangeset,
		DefaultEditBuilder,
		DefaultChangeFamily,
		[SchemaIndex, ForestIndex, EditManagerIndex<ModularChangeset, DefaultChangeFamily>]
	>
	implements ISharedTree
{
	public readonly context: EditableTreeContext;
	public readonly forest: IEditableForest;
	public readonly storedSchema: SchemaEditor<InMemoryStoredSchemaRepository>;

	public readonly transaction: ISharedTreeCheckout["transaction"];

	/**
	 * Rather than implementing TransactionCheckout, have a member that implements it.
	 * This allows keeping the `IEditableForest` private.
	 */
	private readonly transactionCheckout: TransactionCheckout<DefaultEditBuilder, DefaultChangeset>;

	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		telemetryContextPrefix: string,
	) {
		const anchors = new AnchorSet();
		const schema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy);
		const forest = buildForest(schema, anchors);
		super(
			(events, editManager) => [
				new SchemaIndex(runtime, events, schema),
				new ForestIndex(runtime, events, forest),
				new EditManagerIndex(runtime, editManager),
			],
			defaultChangeFamily,
			anchors,
			id,
			runtime,
			attributes,
			telemetryContextPrefix,
		);

		this.forest = forest;
		this.storedSchema = new SchemaEditor(schema, (op) => this.submitLocalMessage(op));

		this.transaction = {
			start: () => this.startTransaction(new ForestRepairDataStore(() => this.forest)),
			commit: () => this.commitTransaction(),
			abort: () => this.abortTransaction(),
			inProgress: () => this.isTransacting(),
		};

		this.transactionCheckout = {
			forest,
			changeFamily: this.changeFamily,
			submitEdit: (edit) => this.applyChange(edit),
		};

		this.context = getEditableTreeContext(forest, this.transactionCheckout);
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

	public runTransaction(
		transaction: (
			forest: IForestSubscription,
			editor: IDefaultEditBuilder,
		) => TransactionResult,
	): TransactionResult {
		return runTransaction(this, transaction);
	}

	public fork(): ISharedTreeCheckoutFork {
		return new SharedTreeCheckout(
			this.createBranch(),
			this.changeFamily,
			this.storedSchema.inner.clone(),
			this.forest.clone(this.storedSchema, new AnchorSet()),
		);
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
	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		if (!this.storedSchema.tryHandleOp(message)) {
			super.processCore(message, local, localOpMetadata);
		}
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

class SharedTreeCheckout implements ISharedTreeCheckoutFork {
	public readonly context: EditableTreeContext;
	public readonly submitEdit: TransactionCheckout<
		IDefaultEditBuilder,
		DefaultChangeset
	>["submitEdit"];

	public constructor(
		private readonly branch: SharedTreeBranch<DefaultEditBuilder, DefaultChangeset>,
		public readonly changeFamily: DefaultChangeFamily,
		public readonly storedSchema: InMemoryStoredSchemaRepository,
		public readonly forest: IEditableForest,
	) {
		this.context = getEditableTreeContext(forest, this);
		branch.on("onChange", (change) => {
			const delta = this.changeFamily.intoDelta(change);
			this.forest.applyDelta(delta);
			this.forest.anchors.applyDelta(delta);
		});
		this.submitEdit = (edit) => branch.applyChange(edit);
	}

	public get editor() {
		return this.branch.editor;
	}

	public readonly transaction = {
		start: () => this.branch.startTransaction(new ForestRepairDataStore(() => this.forest)),
		commit: () => this.branch.commitTransaction(),
		abort: () => this.branch.abortTransaction(),
		inProgress: () => this.branch.isTransacting(),
	};

	public locate(anchor: Anchor): AnchorNode | undefined {
		return this.forest.anchors.locate(anchor);
	}

	public pull(): void {
		this.branch.pull();
	}

	public fork(): ISharedTreeCheckoutFork {
		const storedSchema = this.storedSchema.clone();
		return new SharedTreeCheckout(
			this.branch.fork(),
			this.changeFamily,
			storedSchema,
			this.forest.clone(storedSchema, new AnchorSet()),
		);
	}

	public merge(): void {
		this.branch.merge();
	}

	public isMerged(): boolean {
		return this.branch.isMerged();
	}

	public get root(): UnwrappedEditableField {
		return this.context.unwrappedRoot;
	}

	public set root(data: ContextuallyTypedNodeData | undefined) {
		this.context.unwrappedRoot = data;
	}

	public runTransaction(
		transaction: (
			forest: IForestSubscription,
			editor: IDefaultEditBuilder,
		) => TransactionResult,
	): TransactionResult {
		return runTransaction(this, transaction);
	}
}

function runTransaction(
	checkout: ISharedTreeCheckout,
	transaction: (forest: IForestSubscription, editor: IDefaultEditBuilder) => TransactionResult,
) {
	checkout.transaction.start();
	const result = transaction(checkout.forest, checkout.editor);
	if (result === TransactionResult.Apply) {
		checkout.transaction.commit();
	} else {
		checkout.transaction.abort();
	}
	return result;
}
