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
import { ISharedObject } from "@fluidframework/shared-object-base";
import { assert } from "@fluidframework/core-utils";
import { ICodecOptions, noopValidator } from "../codec/index.js";
import {
	TreeStoredSchemaRepository,
	JsonableTree,
	TreeStoredSchema,
	makeDetachedFieldIndex,
	moveToDetachedField,
	RevisionTagCodec,
} from "../core/index.js";
import { SharedTreeCore } from "../shared-tree-core/index.js";
import {
	defaultSchemaPolicy,
	ForestSummarizer,
	SchemaSummarizer,
	buildForest,
	FlexFieldSchema,
	buildChunkedForest,
	makeTreeChunker,
	DetachedFieldIndexSummarizer,
	createNodeKeyManager,
	nodeKeyFieldKey as defaultNodeKeyFieldKey,
	jsonableTreeFromFieldCursor,
	TreeCompressionStrategy,
	ViewSchema,
	makeMitigatedChangeFamily,
	makeFieldBatchCodec,
} from "../feature-libraries/index.js";
import { HasListeners, IEmitter, ISubscribable, createEmitter } from "../events/index.js";
import { brand } from "../util/index.js";
import {
	ITree,
	TreeConfiguration,
	ImplicitFieldSchema,
	TreeFieldFromImplicitField,
	TreeView,
} from "../simple-tree/index.js";
import { InitializeAndSchematizeConfiguration, ensureSchema } from "./schematizeTree.js";
import { TreeCheckout, CheckoutEvents, createTreeCheckout } from "./treeCheckout.js";
import { CheckoutFlexTreeView, FlexTreeView } from "./treeView.js";
import { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import { SharedTreeChangeFamily } from "./sharedTreeChangeFamily.js";
import { SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";
import { SchematizingSimpleTreeView, requireSchema } from "./schematizingTreeView.js";

/**
 * Copy of data from an {@link ISharedTree} at some point in time.
 * @remarks
 * This is unrelated to Fluids concept of "snapshots".
 * @internal
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
	/**
	 * All {@link TreeStatus#Removed} content.
	 */
	readonly removed: [string | number | undefined, number, JsonableTree][];
}

/**
 * Collaboratively editable tree distributed data-structure,
 * powered by {@link @fluidframework/shared-object-base#ISharedObject}.
 *
 * See [the README](../../README.md) for details.
 * @internal
 */
export interface ISharedTree extends ISharedObject, ITree {
	/**
	 * Provides a copy of the current content of the tree.
	 * This can be useful for inspecting the tree when no suitable view schema is available.
	 * This is only intended for use in testing and exceptional code paths: it is not performant.
	 *
	 * This does not include everything that is included in a tree summary, since information about how to merge future edits is omitted.
	 */
	contentSnapshot(): SharedTreeContentSnapshot;

	/**
	 * Like {@link ITree.schematize}, but uses the flex-tree schema system and exposes the tree as a flex-tree.
	 *
	 * Returned view is disposed when the stored schema becomes incompatible with the view schema.
	 * Undefined is returned if the stored data could not be made compatible with the view schema.
	 */
	schematizeFlexTree<TRoot extends FlexFieldSchema>(
		config: InitializeAndSchematizeConfiguration<TRoot>,
		onDispose: () => void,
	): FlexTreeView<TRoot> | undefined;
}

/**
 * Shared tree, configured with a good set of indexes and field kinds which will maintain compatibility over time.
 *
 * TODO: detail compatibility requirements.
 */
export class SharedTree
	extends SharedTreeCore<SharedTreeEditBuilder, SharedTreeChange>
	implements ISharedTree
{
	private readonly _events: ISubscribable<CheckoutEvents> &
		IEmitter<CheckoutEvents> &
		HasListeners<CheckoutEvents>;
	public readonly checkout: TreeCheckout;
	public get storedSchema(): TreeStoredSchemaRepository {
		return this.checkout.storedSchema;
	}

	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		optionsParam: SharedTreeOptions,
		telemetryContextPrefix: string,
	) {
		assert(
			runtime.idCompressor !== undefined,
			0x883 /* IdCompressor must be enabled to use SharedTree */,
		);

		const options = { ...defaultSharedTreeOptions, ...optionsParam };
		const schema = new TreeStoredSchemaRepository();
		const forest =
			options.forest === ForestType.Optimized
				? buildChunkedForest(makeTreeChunker(schema, defaultSchemaPolicy))
				: buildForest();
		const revisionTagCodec = new RevisionTagCodec(runtime.idCompressor);
		const removedRoots = makeDetachedFieldIndex("repair", revisionTagCodec, options);
		const schemaSummarizer = new SchemaSummarizer(runtime, schema, options, {
			getCurrentSeq: () => this.runtime.deltaManager.lastSequenceNumber,
		});
		const fieldBatchCodec = makeFieldBatchCodec(options);

		const encoderContext = {
			schema: {
				schema,
				policy: defaultSchemaPolicy,
			},
			encodeType: options.treeEncodeType,
		};
		const forestSummarizer = new ForestSummarizer(
			forest,
			revisionTagCodec,
			fieldBatchCodec,
			encoderContext,
			options,
		);
		const removedRootsSummarizer = new DetachedFieldIndexSummarizer(removedRoots);
		const innerChangeFamily = new SharedTreeChangeFamily(
			revisionTagCodec,
			fieldBatchCodec,
			options,
			options.treeEncodeType,
		);
		const changeFamily = makeMitigatedChangeFamily(
			innerChangeFamily,
			SharedTreeChangeFamily.emptyChange,
			(error: unknown) => {
				// TODO:6344 Add telemetry for these errors.
				// Rethrowing the error has a different effect depending on the context in which the
				// ChangeFamily was invoked:
				// - If the ChangeFamily was invoked as part of incoming op processing, rethrowing the error
				// will cause the runtime to disconnect the client, log a severe error, and not reconnect.
				// This will not cause the host application to crash because it is not on the stack at that time.
				// TODO: let the host application know that the client is now disconnected.
				// - If the ChangeFamily was invoked as part of dealing with a local change, rethrowing the
				// error will cause the host application to crash. This is not ideal, but is better than
				// letting the application either send an invalid change to the server or allowing the
				// application to continue working when its local branches contain edits that cannot be
				// reflected in its views.
				// The best course of action for a host application in such a state is to restart.
				// TODO: let the host application know about this situation and provide a way to
				// programmatically reload the SharedTree container.
				throw error;
			},
		);
		super(
			[schemaSummarizer, forestSummarizer, removedRootsSummarizer],
			changeFamily,
			options,
			id,
			runtime,
			attributes,
			telemetryContextPrefix,
			{ schema, policy: defaultSchemaPolicy },
		);
		this._events = createEmitter<CheckoutEvents>();
		const localBranch = this.getLocalBranch();
		this.checkout = createTreeCheckout(runtime.idCompressor, revisionTagCodec, {
			branch: localBranch,
			changeFamily,
			schema,
			forest,
			fieldBatchCodec,
			events: this._events,
			removedRoots,
			chunkCompressionStrategy: options.treeEncodeType,
		});
	}

	public contentSnapshot(): SharedTreeContentSnapshot {
		const cursor = this.checkout.forest.allocateCursor();
		try {
			moveToDetachedField(this.checkout.forest, cursor);
			return {
				schema: this.storedSchema.clone(),
				tree: jsonableTreeFromFieldCursor(cursor),
				removed: this.checkout.getRemovedRoots(),
			};
		} finally {
			cursor.free();
		}
	}

	public schematizeFlexTree<TRoot extends FlexFieldSchema>(
		config: InitializeAndSchematizeConfiguration<TRoot>,
		onDispose: () => void,
	): CheckoutFlexTreeView<TRoot> | undefined {
		const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, config.schema);
		if (!ensureSchema(viewSchema, config.allowedSchemaModifications, this.checkout, config)) {
			return undefined;
		}

		return requireSchema(
			this.checkout,
			viewSchema,
			onDispose,
			createNodeKeyManager(this.runtime.idCompressor),
			brand(defaultNodeKeyFieldKey),
		);
	}

	public schematize<TRoot extends ImplicitFieldSchema>(
		config: TreeConfiguration<TRoot>,
	): TreeView<TreeFieldFromImplicitField<TRoot>> {
		const view = new SchematizingSimpleTreeView(
			this.checkout,
			config,
			createNodeKeyManager(this.runtime.idCompressor),
			brand(defaultNodeKeyFieldKey),
		);
		// As a subjective API design choice, we initialize the tree here if it is not already initialized.
		if (view.error?.canInitialize === true) {
			view.upgradeSchema();
		}
		return view;
	}

	protected override async loadCore(services: IChannelStorageService): Promise<void> {
		await super.loadCore(services);
		this._events.emit("afterBatch");
	}
}

/**
 * @internal
 */
export interface SharedTreeOptions extends Partial<ICodecOptions> {
	/**
	 * The {@link ForestType} indicating which forest type should be created for the SharedTree.
	 */
	forest?: ForestType;
	treeEncodeType?: TreeCompressionStrategy;
}

/**
 * Used to distinguish between different forest types.
 * @internal
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
	treeEncodeType: TreeCompressionStrategy.Compressed,
};

/**
 * A channel factory that creates {@link ISharedTree}s.
 * @internal
 */
export class SharedTreeFactory implements IChannelFactory {
	public readonly type: string = "https://graph.microsoft.com/types/tree";

	public readonly attributes: IChannelAttributes = {
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
