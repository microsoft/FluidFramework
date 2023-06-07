/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
	AnchorSetRootEvents,
	StoredSchemaRepository,
	IForestSubscription,
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
	DefaultChangeset,
	buildForest,
	ContextuallyTypedNodeData,
	ForestRepairDataStoreProvider,
	GlobalFieldSchema,
	EditableTree,
	SchemaEditor,
	NodeIdentifierIndex,
	NodeIdentifier,
	defaultIntoDelta,
} from "../feature-libraries";
import { IEmitter, ISubscribable, createEmitter } from "../events";
import { JsonCompatibleReadOnly } from "../util";
import { nodeIdentifierKey } from "../domains";
import { SchematizeConfiguration } from "./schematizedTree";
import {
	ISharedTreeView,
	SharedTreeView,
	ViewEvents,
	createSharedTreeView,
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
 * Shared tree, configured with a good set of indexes and field kinds which will maintain compatibility over time.
 * TODO: node identifier index.
 *
 * TODO: detail compatibility requirements.
 */
export class SharedTree
	extends SharedTreeCore<DefaultEditBuilder, DefaultChangeset>
	implements ISharedTree
{
	public readonly events: ISubscribable<ViewEvents> & IEmitter<ViewEvents>;
	private readonly view: ISharedTreeView;
	private readonly schema: SchemaEditor<InMemoryStoredSchemaRepository>;
	private readonly identifierIndex: NodeIdentifierIndex<typeof nodeIdentifierKey>;

	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		telemetryContextPrefix: string,
	) {
		const schema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy);
		const forest = buildForest(schema, new AnchorSet());
		const schemaSummarizer = new SchemaSummarizer(runtime, schema);
		const forestSummarizer = new ForestSummarizer(runtime, forest);
		const repairProvider = new ForestRepairDataStoreProvider(forest, schema, defaultIntoDelta);
		super(
			[schemaSummarizer, forestSummarizer],
			defaultChangeFamily,
			forest.anchors,
			repairProvider,
			id,
			runtime,
			attributes,
			telemetryContextPrefix,
		);
		this.schema = new SchemaEditor(schema, (op) => this.submitLocalMessage(op));
		this.identifierIndex = new NodeIdentifierIndex(nodeIdentifierKey);
		this.view = createSharedTreeView({
			branch: this.getLocalBranch(),
			schema,
			forest,
			repairProvider,
			identifierIndex: this.identifierIndex,
		});
		this.events = createEmitter<ViewEvents>();
		this.getLocalBranch().on("change", () => this.finishBatch());
	}

	public get rootEvents(): ISubscribable<AnchorSetRootEvents> {
		return this.view.rootEvents;
	}

	public get storedSchema(): StoredSchemaRepository {
		return this.schema;
	}

	public get forest(): IForestSubscription {
		return this.view.forest;
	}

	public get identifiedNodes(): ReadonlyMap<NodeIdentifier, EditableTree> {
		return this.view.identifiedNodes;
	}

	public get root(): UnwrappedEditableField {
		return this.view.root;
	}

	public set root(data: ContextuallyTypedNodeData | undefined) {
		this.view.root = data;
	}

	public get context(): EditableTreeContext {
		return this.view.context;
	}

	public locate(anchor: Anchor): AnchorNode | undefined {
		return this.view.locate(anchor);
	}

	public generateNodeIdentifier(): NodeIdentifier {
		return this.view.generateNodeIdentifier();
	}

	public schematize<TRoot extends GlobalFieldSchema>(
		config: SchematizeConfiguration<TRoot>,
	): ISharedTreeView {
		return this.view.schematize(config);
	}

	public get transaction(): SharedTreeView["transaction"] {
		return this.view.transaction;
	}

	public fork(): SharedTreeView {
		return this.view.fork();
	}

	public merge(fork: SharedTreeView): void {
		this.view.merge(fork);
	}

	public rebase(fork: SharedTreeView): void {
		fork.rebaseOnto(this.view);
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
		if (!this.schema.tryHandleOp(message)) {
			super.processCore(message, local, localOpMetadata);
		}
	}

	protected override reSubmitCore(
		content: JsonCompatibleReadOnly,
		localOpMetadata: unknown,
	): void {
		if (!this.schema.tryResubmitOp(content)) {
			super.reSubmitCore(content, localOpMetadata);
		}
	}

	protected override async loadCore(services: IChannelStorageService): Promise<void> {
		await super.loadCore(services);
		this.finishBatch();
	}

	/** Finish a batch (see {@link ViewEvents}) */
	private finishBatch(): void {
		this.identifierIndex.scanIdentifiers(this.context);
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
