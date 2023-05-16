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
	InMemoryStoredSchemaRepository,
	Anchor,
	AnchorSet,
	AnchorNode,
	IEditableForest,
	AnchorSetRootEvents,
	symbolFromKey,
	GlobalFieldKey,
} from "../core";
import { SharedTreeBranch, SharedTreeCore } from "../shared-tree-core";
import {
	defaultSchemaPolicy,
	EditableTreeContext,
	ForestSummarizer,
	SchemaSummarizer as SchemaSummarizer,
	defaultChangeFamily,
	DefaultEditBuilder,
	UnwrappedEditableField,
	getEditableTreeContext,
	SchemaEditor,
	DefaultChangeset,
	buildForest,
	ContextuallyTypedNodeData,
	IdentifierIndex,
	ForestRepairDataStoreProvider,
	repairDataStoreFromForest,
	GlobalFieldSchema,
} from "../feature-libraries";
import { IEmitter, ISubscribable, createEmitter } from "../events";
import { brand, JsonCompatibleReadOnly } from "../util";
import { SchematizeConfiguration, schematizeView } from "./schematizedTree";
import {
	ISharedTreeView,
	SharedTreeView,
	ViewEvents,
	branchKey,
	hasBranch,
} from "./sharedTreeView";

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
			new ForestRepairDataStoreProvider(forest, schema),
			id,
			runtime,
			attributes,
			telemetryContextPrefix,
		);

		this.events = createEmitter<ViewEvents>();
		this.forest = forest;
		this.storedSchema = new SchemaEditor(schema, (op) => this.submitLocalMessage(op));

		this.transaction = {
			start: () => this.startTransaction(repairDataStoreFromForest(this.forest)),
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

	public schematize<TRoot extends GlobalFieldSchema>(
		config: SchematizeConfiguration<TRoot>,
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

	private get [branchKey](): SharedTreeBranch<DefaultEditBuilder, DefaultChangeset> {
		return this.getLocalBranch();
	}

	public fork(): SharedTreeView {
		const anchors = new AnchorSet();
		const schema = this.storedSchema.inner.clone();
		const forest = this.forest.clone(schema, anchors);
		const branch = this.forkBranch(new ForestRepairDataStoreProvider(forest, schema), anchors);
		const context = getEditableTreeContext(forest, branch.editor);
		return new SharedTreeView(
			branch,
			schema,
			forest,
			context,
			this.identifiedNodes.clone(context),
		);
	}

	public merge(fork: SharedTreeView): void {
		assert(hasBranch(fork), "Expected SharedTreeView to expose branch via internal branch key");
		this.mergeBranch(fork[branchKey]);
	}

	public override getLocalBranch(): SharedTreeBranch<DefaultEditBuilder, DefaultChangeset> {
		return super.getLocalBranch();
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

	protected override reSubmitCore(
		content: JsonCompatibleReadOnly,
		localOpMetadata: unknown,
	): void {
		if (!this.storedSchema.tryResubmitOp(content)) {
			super.reSubmitCore(content, localOpMetadata);
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
