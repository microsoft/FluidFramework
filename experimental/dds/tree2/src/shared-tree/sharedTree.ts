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
import { ICodecOptions, noopValidator } from "../codec";
import {
	InMemoryStoredSchemaRepository,
	JsonableTree,
	TreeStoredSchema,
	makeDetachedFieldIndex,
	moveToDetachedField,
} from "../core";
import { SharedTreeCore } from "../shared-tree-core";
import {
	defaultSchemaPolicy,
	ForestSummarizer,
	SchemaSummarizer as SchemaSummarizer,
	DefaultChangeFamily,
	DefaultEditBuilder,
	DefaultChangeset,
	buildForest,
	SchemaEditor,
	TreeFieldSchema,
	buildChunkedForest,
	makeTreeChunker,
	DetachedFieldIndexSummarizer,
	createNodeKeyManager,
	nodeKeyFieldKey,
	TypedField,
	jsonableTreeFromFieldCursor,
} from "../feature-libraries";
import { HasListeners, IEmitter, ISubscribable, createEmitter } from "../events";
import { JsonCompatibleReadOnly, brand } from "../util";
import { type TypedTreeChannel } from "./typedTree";
import { InitializeAndSchematizeConfiguration } from "./schematizedTree";
import {
	ISharedTreeView,
	SharedTreeView,
	ViewEvents,
	createSharedTreeView,
	schematizeView,
} from "./sharedTreeView";

/**
 * Copy of data from an {@link ISharedTree} at some point in time.
 * @remarks
 * This is unrelated to Fluids concept of "snapshots".
 * @alpha
 */
export interface SharedTreeContentSnapshot {
	/**
	 * The schema stored in the document.
	 *
	 * @remarks
	 * Edits to the schema can mutate the schema stored of the tree which took this snapshot (but this snapshot will remain the same)
	 * This is mainly useful for debugging cases where schematize reports an incompatible view schema.
	 */
	readonly schema: TreeStoredSchema;
	/**
	 * All {@link TreeStatus#InDocument} content.
	 */
	readonly tree: JsonableTree[];
}

/**
 * Collaboratively editable tree distributed data-structure,
 * powered by {@link @fluidframework/shared-object-base#ISharedObject}.
 *
 * See [the README](../../README.md) for details.
 * @alpha
 */
export interface ISharedTree extends ISharedObject, TypedTreeChannel {
	/**
	 * Get view without schematizing.
	 *
	 * @deprecated This API will be removed as part of making views use view schema.
	 */
	// TODO: migrate all usages of this to alternatives or avoid using ISharedTree.
	readonly view: ISharedTreeView;

	/**
	 * Provides a copy of the current content of the tree.
	 * This can be useful for inspecting the tree when no suitable view schema is available.
	 * This is only intended for use in testing and exceptional code paths: it is not performant.
	 *
	 * This does not include everything that is included in a tree summary, since information about how to merge future edits is omitted.
	 */
	contentSnapshot(): SharedTreeContentSnapshot;

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
	schematizeView<TRoot extends TreeFieldSchema>(
		config: InitializeAndSchematizeConfiguration<TRoot>,
	): ISharedTreeView;
}

/**
 * Shared tree, configured with a good set of indexes and field kinds which will maintain compatibility over time.
 *
 * TODO: detail compatibility requirements.
 */
export class SharedTree
	extends SharedTreeCore<DefaultEditBuilder, DefaultChangeset>
	implements ISharedTree
{
	private readonly _events: ISubscribable<ViewEvents> &
		IEmitter<ViewEvents> &
		HasListeners<ViewEvents>;
	public readonly view: SharedTreeView;
	public readonly storedSchema: SchemaEditor<InMemoryStoredSchemaRepository>;

	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		optionsParam: SharedTreeOptions,
		telemetryContextPrefix: string,
	) {
		const options = { ...defaultSharedTreeOptions, ...optionsParam };
		const schema = new InMemoryStoredSchemaRepository();
		const forest =
			options.forest === ForestType.Optimized
				? buildChunkedForest(makeTreeChunker(schema, defaultSchemaPolicy))
				: buildForest();
		const removedTrees = makeDetachedFieldIndex("repair");
		const schemaSummarizer = new SchemaSummarizer(runtime, schema, options);
		const forestSummarizer = new ForestSummarizer(forest);
		const removedTreesSummarizer = new DetachedFieldIndexSummarizer(removedTrees);
		const changeFamily = new DefaultChangeFamily(options);
		super(
			[schemaSummarizer, forestSummarizer, removedTreesSummarizer],
			changeFamily,
			options,
			id,
			runtime,
			attributes,
			telemetryContextPrefix,
		);
		this.storedSchema = new SchemaEditor(schema, (op) => this.submitLocalMessage(op), options);
		this._events = createEmitter<ViewEvents>();
		this.view = createSharedTreeView({
			branch: this.getLocalBranch(),
			// TODO:
			// This passes in a version of schema thats not wrapped with the editor.
			// This allows editing schema on the view without sending ops, which is incorrect behavior.
			schema,
			forest,
			events: this._events,
			removedTrees,
		});
	}

	public contentSnapshot(): SharedTreeContentSnapshot {
		const cursor = this.view.forest.allocateCursor();
		try {
			moveToDetachedField(this.view.forest, cursor);
			return {
				schema: new InMemoryStoredSchemaRepository(this.storedSchema),
				tree: jsonableTreeFromFieldCursor(cursor),
			};
		} finally {
			cursor.free();
		}
	}

	public schematizeView<TRoot extends TreeFieldSchema>(
		config: InitializeAndSchematizeConfiguration<TRoot>,
	): SharedTreeView {
		// TODO:
		// This should work, but schema editing on views doesn't send ops.
		// this.view.schematize(config);
		// For now, use this as a workaround:
		schematizeView(this.view, config, this.storedSchema);
		return this.view;
	}

	public schematize<TRoot extends TreeFieldSchema>(
		config: InitializeAndSchematizeConfiguration<TRoot>,
	): TypedField<TRoot> {
		const nodeKeyManager = createNodeKeyManager(this.runtime.idCompressor);
		const view = this.schematizeView(config);
		return view.editableTree2(config.schema, nodeKeyManager, brand(nodeKeyFieldKey));
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
		// TODO: Get rid of this `as any`. There should be a better way to narrow the type of message.contents.
		if (!this.storedSchema.tryHandleOp(message.contents as any)) {
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

	protected override applyStashedOp(content: JsonCompatibleReadOnly): undefined {
		if (!this.storedSchema.tryApplyStashedOp(content)) {
			return super.applyStashedOp(content);
		}
	}

	protected override async loadCore(services: IChannelStorageService): Promise<void> {
		await super.loadCore(services);
		this._events.emit("afterBatch");
	}
}

/**
 * @alpha
 */
export interface SharedTreeOptions extends Partial<ICodecOptions> {
	/**
	 * The {@link ForestType} indicating which forest type should be created for the SharedTree.
	 */
	forest?: ForestType;
}

/**
 * Used to distinguish between different forest types.
 * @alpha
 */
export enum ForestType {
	/**
	 * The "ObjectForest" forest type.
	 */
	Reference = 0,
	/**
	 * The "ChunkedForest" forest type.
	 */
	Optimized = 1,
}

export const defaultSharedTreeOptions: Required<SharedTreeOptions> = {
	jsonValidator: noopValidator,
	forest: ForestType.Reference,
};

/**
 * A channel factory that creates {@link ISharedTree}s.
 * @alpha
 */
export class SharedTreeFactory implements IChannelFactory {
	public type: string = "https://graph.microsoft.com/types/tree";

	public attributes: IChannelAttributes = {
		type: this.type,
		snapshotFormatVersion: "0.0.0",
		packageVersion: "0.0.0",
	};

	public constructor(private readonly options: SharedTreeOptions = {}) {}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<ISharedTree> {
		const tree = new SharedTree(id, runtime, channelAttributes, this.options, "SharedTree");
		await tree.load(services);
		return tree;
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): ISharedTree {
		const tree = new SharedTree(id, runtime, this.attributes, this.options, "SharedTree");
		tree.initializeLocal();
		return tree;
	}
}
