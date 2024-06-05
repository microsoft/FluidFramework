/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import { ISharedObject } from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { ICodecOptions, noopValidator } from "../codec/index.js";
import {
	JsonableTree,
	RevisionTagCodec,
	TreeStoredSchema,
	TreeStoredSchemaRepository,
	makeDetachedFieldIndex,
	moveToDetachedField,
} from "../core/index.js";
import { HasListeners, IEmitter, Listenable, createEmitter } from "../events/index.js";
import {
	DetachedFieldIndexSummarizer,
	FlexFieldSchema,
	ForestSummarizer,
	SchemaSummarizer,
	TreeCompressionStrategy,
	ViewSchema,
	buildChunkedForest,
	buildForest,
	createNodeKeyManager,
	defaultSchemaPolicy,
	jsonableTreeFromFieldCursor,
	makeFieldBatchCodec,
	makeMitigatedChangeFamily,
	makeTreeChunker,
} from "../feature-libraries/index.js";
import {
	DefaultResubmitMachine,
	ExplicitCoreCodecVersions,
	SharedTreeCore,
} from "../shared-tree-core/index.js";
import { ITree, ImplicitFieldSchema, TreeConfiguration, TreeView } from "../simple-tree/index.js";

import { InitializeAndSchematizeConfiguration, ensureSchema } from "./schematizeTree.js";
import { SchematizingSimpleTreeView, requireSchema } from "./schematizingTreeView.js";
import { SharedTreeReadonlyChangeEnricher } from "./sharedTreeChangeEnricher.js";
import { SharedTreeChangeFamily } from "./sharedTreeChangeFamily.js";
import { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import { SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";
import { CheckoutEvents, TreeCheckout, createTreeCheckout } from "./treeCheckout.js";
import { CheckoutFlexTreeView, FlexTreeView } from "./treeView.js";

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
 * Has an entry for each codec which writes an explicit version into its data.
 *
 * This is used to map the single API entrypoint controlling the format {@link SharedTreeOptions.formatVersion}
 * to a list of write versions that for each codec that should be used for that format.
 *
 * Note that all explicitly versioned codecs should be using the format version from the data to read encoded data.
 *
 * TODO: Plumb these write versions into forest, schema, detached field index codec creation.
 */
interface ExplicitCodecVersions extends ExplicitCoreCodecVersions {
	forest: number;
	schema: number;
	detachedFieldIndex: number;
	fieldBatch: number;
}

const formatVersionToTopLevelCodecVersions = new Map<number, ExplicitCodecVersions>([
	[1, { forest: 1, schema: 1, detachedFieldIndex: 1, editManager: 1, message: 1, fieldBatch: 1 }],
	[2, { forest: 1, schema: 1, detachedFieldIndex: 1, editManager: 2, message: 2, fieldBatch: 1 }],
]);

function getCodecVersions(formatVersion: number): ExplicitCodecVersions {
	const versions = formatVersionToTopLevelCodecVersions.get(formatVersion);
	assert(versions !== undefined, 0x90e /* Unknown format version */);
	return versions;
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
	private readonly _events: Listenable<CheckoutEvents> &
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
		telemetryContextPrefix: string = "fluid_sharedTree_",
	) {
		if (runtime.idCompressor === undefined) {
			throw new UsageError("IdCompressor must be enabled to use SharedTree");
		}

		const options = { ...defaultSharedTreeOptions, ...optionsParam };
		const codecVersions = getCodecVersions(options.formatVersion);
		const schema = new TreeStoredSchemaRepository();
		const forest =
			options.forest === ForestType.Optimized
				? buildChunkedForest(makeTreeChunker(schema, defaultSchemaPolicy))
				: buildForest();
		const revisionTagCodec = new RevisionTagCodec(runtime.idCompressor);
		const removedRoots = makeDetachedFieldIndex("repair", revisionTagCodec, options);
		const schemaSummarizer = new SchemaSummarizer(runtime, schema, options, {
			getCurrentSeq: () => this.deltaManager.lastSequenceNumber,
		});
		const fieldBatchCodec = makeFieldBatchCodec(options, codecVersions.fieldBatch);

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
		const changeEnricher = new SharedTreeReadonlyChangeEnricher(forest, schema, removedRoots);
		super(
			[schemaSummarizer, forestSummarizer, removedRootsSummarizer],
			changeFamily,
			options,
			codecVersions,
			id,
			runtime,
			attributes,
			telemetryContextPrefix,
			schema,
			defaultSchemaPolicy,
			new DefaultResubmitMachine(
				changeFamily.rebaser.invert.bind(changeFamily.rebaser),
				changeEnricher,
			),
			changeEnricher,
		);
		this._events = createEmitter<CheckoutEvents>();
		const localBranch = this.getLocalBranch();
		this.checkout = createTreeCheckout(
			runtime.idCompressor,
			this.mintRevisionTag,
			revisionTagCodec,
			{
				branch: localBranch,
				changeFamily,
				schema,
				forest,
				fieldBatchCodec,
				events: this._events,
				removedRoots,
				chunkCompressionStrategy: options.treeEncodeType,
			},
		);
	}

	public contentSnapshot(): SharedTreeContentSnapshot {
		const cursor = this.checkout.forest.allocateCursor("contentSnapshot");
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
		);
	}

	public schematize<TRoot extends ImplicitFieldSchema>(
		config: TreeConfiguration<TRoot>,
	): TreeView<TRoot> {
		const view = new SchematizingSimpleTreeView(
			this.checkout,
			config,
			createNodeKeyManager(this.runtime.idCompressor),
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
 * Format versions supported by SharedTree.
 *
 * Each version documents a required minimum version of the \@fluidframework/tree package.
 * @internal
 */
export const SharedTreeFormatVersion = {
	/**
	 * Requires \@fluidframework/tree \>= 2.0.0.
	 *
	 * @deprecated - FF does not currently plan on supporting this format long-term.
	 * Do not write production documents using this format, as they may not be loadable in the future.
	 */
	v1: 1,

	/**
	 * Requires \@fluidframework/tree \>= 2.0.0.
	 */
	v2: 2,
} as const;

/**
 * Format versions supported by SharedTree.
 *
 * Each version documents a required minimum version of the \@fluidframework/tree package.
 * @internal
 * @privateRemarks
 * See packages/dds/tree/docs/main/compatibility.md for information on how to add support for a new format.
 */
export type SharedTreeFormatVersion = typeof SharedTreeFormatVersion;

/**
 * @internal
 */
export type SharedTreeOptions = Partial<ICodecOptions> &
	Partial<SharedTreeFormatOptions> & {
		/**
		 * The {@link ForestType} indicating which forest type should be created for the SharedTree.
		 */
		forest?: ForestType;
	};

/**
 * Options for configuring the persisted format SharedTree uses.
 * @internal
 */
export interface SharedTreeFormatOptions {
	/**
	 * See {@link TreeCompressionStrategy}.
	 * default: TreeCompressionStrategy.Compressed
	 */
	treeEncodeType: TreeCompressionStrategy;
	/**
	 * The format version SharedTree should use to persist documents.
	 *
	 * This option has compatibility implications for applications using SharedTree.
	 * Each version documents a required minimum version of \@fluidframework/tree.
	 * If this minimum version fails to be met, the SharedTree may fail to load.
	 * To be safe, application authors should verify that they have saturated this version
	 * of \@fluidframework/tree in their ecosystem before changing the format version.
	 *
	 * This option defaults to SharedTreeFormatVersion.v2.
	 */
	formatVersion: SharedTreeFormatVersion[keyof SharedTreeFormatVersion];
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
	formatVersion: SharedTreeFormatVersion.v2,
};

/**
 * A channel factory that creates {@link ISharedTree}s.
 */
export class SharedTreeFactory implements IChannelFactory<ISharedTree> {
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
	): Promise<SharedTree> {
		const tree = new SharedTree(id, runtime, channelAttributes, this.options);
		await tree.load(services);
		return tree;
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): SharedTree {
		const tree = new SharedTree(id, runtime, this.attributes, this.options);
		tree.initializeLocal();
		return tree;
	}
}
