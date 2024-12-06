/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import type {
	HasListeners,
	IEmitter,
	Listenable,
} from "@fluidframework/core-interfaces/internal";
import { createEmitter } from "@fluid-internal/client-utils";
import type {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import type { ISharedObject } from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { type ICodecOptions, noopValidator } from "../codec/index.js";
import {
	type IEditableForest,
	type JsonableTree,
	RevisionTagCodec,
	type TaggedChange,
	type TreeStoredSchema,
	TreeStoredSchemaRepository,
	type TreeStoredSchemaSubscription,
	makeDetachedFieldIndex,
	moveToDetachedField,
} from "../core/index.js";

import {
	DetachedFieldIndexSummarizer,
	ForestSummarizer,
	SchemaSummarizer,
	TreeCompressionStrategy,
	buildChunkedForest,
	buildForest,
	defaultSchemaPolicy,
	jsonableTreeFromFieldCursor,
	makeFieldBatchCodec,
	makeMitigatedChangeFamily,
	makeTreeChunker,
} from "../feature-libraries/index.js";
import {
	DefaultResubmitMachine,
	type ExplicitCoreCodecVersions,
	SharedTreeCore,
} from "../shared-tree-core/index.js";
import type {
	ITree,
	ImplicitFieldSchema,
	ReadSchema,
	TreeView,
	TreeViewAlpha,
	TreeViewConfiguration,
	UnsafeUnknownSchema,
} from "../simple-tree/index.js";

import { SchematizingSimpleTreeView } from "./schematizingTreeView.js";
import { SharedTreeReadonlyChangeEnricher } from "./sharedTreeChangeEnricher.js";
import { SharedTreeChangeFamily } from "./sharedTreeChangeFamily.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";
import {
	type CheckoutEvents,
	type TreeCheckout,
	type BranchableTree,
	createTreeCheckout,
} from "./treeCheckout.js";
import { breakingClass, throwIfBroken } from "../util/index.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";

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
	 * All {@link TreeStatus.InDocument} content.
	 */
	readonly tree: JsonableTree[];
	/**
	 * All {@link TreeStatus.Removed} content.
	 */
	readonly removed: [string | number | undefined, number, JsonableTree][];
}

/**
 * {@link ITree} extended with some non-public APIs.
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
	[
		1,
		{ forest: 1, schema: 1, detachedFieldIndex: 1, editManager: 1, message: 1, fieldBatch: 1 },
	],
	[
		2,
		{ forest: 1, schema: 1, detachedFieldIndex: 1, editManager: 2, message: 2, fieldBatch: 1 },
	],
	[
		3,
		{ forest: 1, schema: 1, detachedFieldIndex: 1, editManager: 3, message: 3, fieldBatch: 1 },
	],
	[
		4,
		{ forest: 1, schema: 1, detachedFieldIndex: 1, editManager: 4, message: 4, fieldBatch: 1 },
	],
]);

function getCodecVersions(formatVersion: number): ExplicitCodecVersions {
	const versions = formatVersionToTopLevelCodecVersions.get(formatVersion);
	assert(versions !== undefined, 0x90e /* Unknown format version */);
	return versions;
}

/**
 * Build and return a forest of the requested type.
 */
export function buildConfiguredForest(
	type: ForestType,
	schema: TreeStoredSchemaSubscription,
	idCompressor: IIdCompressor,
): IEditableForest {
	switch (type) {
		case ForestType.Optimized:
			return buildChunkedForest(
				makeTreeChunker(schema, defaultSchemaPolicy),
				undefined,
				idCompressor,
			);
		case ForestType.Reference:
			return buildForest();
		case ForestType.Expensive:
			return buildForest(undefined, true);
		default:
			unreachableCase(type);
	}
}

/**
 * Shared tree, configured with a good set of indexes and field kinds which will maintain compatibility over time.
 *
 * TODO: detail compatibility requirements.
 */
@breakingClass
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
		const forest = buildConfiguredForest(options.forest, schema, runtime.idCompressor);
		const revisionTagCodec = new RevisionTagCodec(runtime.idCompressor);
		const removedRoots = makeDetachedFieldIndex(
			"repair",
			revisionTagCodec,
			runtime.idCompressor,
			options,
		);
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
			originatorId: runtime.idCompressor.localSessionId,
			idCompressor: runtime.idCompressor,
		};
		const forestSummarizer = new ForestSummarizer(
			forest,
			revisionTagCodec,
			fieldBatchCodec,
			encoderContext,
			options,
			runtime.idCompressor,
		);
		const removedRootsSummarizer = new DetachedFieldIndexSummarizer(removedRoots);
		const innerChangeFamily = new SharedTreeChangeFamily(
			revisionTagCodec,
			fieldBatchCodec,
			options,
			options.treeEncodeType,
			runtime.idCompressor,
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
				(change: TaggedChange<SharedTreeChange>) =>
					changeFamily.rebaser.invert(change, true, this.mintRevisionTag()),
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
				logger: this.logger,
				breaker: this.breaker,
			},
		);

		this.checkout.transaction.events.on("started", () => {
			if (this.isAttached()) {
				// It is currently forbidden to attach during a transaction, so transaction state changes can be ignored until after attaching.
				this.commitEnricher.startTransaction();
			}
		});
		this.checkout.transaction.events.on("aborting", () => {
			if (this.isAttached()) {
				// It is currently forbidden to attach during a transaction, so transaction state changes can be ignored until after attaching.
				this.commitEnricher.abortTransaction();
			}
		});
		this.checkout.transaction.events.on("committing", () => {
			if (this.isAttached()) {
				// It is currently forbidden to attach during a transaction, so transaction state changes can be ignored until after attaching.
				this.commitEnricher.commitTransaction();
			}
		});
		this.checkout.events.on("beforeBatch", (newCommits) => {
			if (this.isAttached()) {
				if (this.checkout.transaction.isInProgress()) {
					this.commitEnricher.addTransactionCommits(newCommits);
				}
			}
		});
	}

	@throwIfBroken
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

	// For the new TreeViewAlpha API
	public viewWith<TRoot extends ImplicitFieldSchema | UnsafeUnknownSchema>(
		config: TreeViewConfiguration<ReadSchema<TRoot>>,
	): SchematizingSimpleTreeView<TRoot> & TreeView<ReadSchema<TRoot>>;

	// For the old TreeView API
	public viewWith<TRoot extends ImplicitFieldSchema>(
		config: TreeViewConfiguration<TRoot>,
	): SchematizingSimpleTreeView<TRoot> & TreeView<TRoot>;

	public viewWith<TRoot extends ImplicitFieldSchema | UnsafeUnknownSchema>(
		config: TreeViewConfiguration<ReadSchema<TRoot>>,
	): SchematizingSimpleTreeView<TRoot> & TreeView<ReadSchema<TRoot>> {
		return this.checkout.viewWith(config) as SchematizingSimpleTreeView<TRoot> &
			TreeView<ReadSchema<TRoot>>;
	}

	protected override async loadCore(services: IChannelStorageService): Promise<void> {
		await super.loadCore(services);
		this.checkout.setTipRevisionForLoadedData(this.trunkHeadRevision);
		this._events.emit("afterBatch", []);
	}

	protected override didAttach(): void {
		if (this.checkout.transaction.isInProgress()) {
			// Attaching during a transaction is not currently supported.
			// At least part of of the system is known to not handle this case correctly - commit enrichment - and there may be others.
			throw new UsageError(
				"Cannot attach while a transaction is in progress. Commit or abort the transaction before attaching.",
			);
		}
		super.didAttach();
	}

	protected override applyStashedOp(
		...args: Parameters<
			SharedTreeCore<SharedTreeEditBuilder, SharedTreeChange>["applyStashedOp"]
		>
	): void {
		assert(
			!this.checkout.transaction.isInProgress(),
			0x674 /* Unexpected transaction is open while applying stashed ops */,
		);
		super.applyStashedOp(...args);
	}
}

/**
 * Get a {@link BranchableTree} from a {@link ITree}.
 * @remarks The branch can be used for "version control"-style coordination of edits on the tree.
 * @privateRemarks This function will be removed if/when the branching API becomes public,
 * but it (or something like it) is necessary in the meantime to prevent the alpha types from being exposed as public.
 * @alpha
 * @deprecated This API is superseded by {@link TreeBranch}, which should be used instead.
 */
export function getBranch(tree: ITree): BranchableTree;
/**
 * Get a {@link BranchableTree} from a {@link TreeView}.
 * @remarks The branch can be used for "version control"-style coordination of edits on the tree.
 * Branches are currently an unstable "alpha" API and are subject to change in the future.
 * @privateRemarks This function will be removed if/when the branching API becomes public,
 * but it (or something like it) is necessary in the meantime to prevent the alpha types from being exposed as public.
 * @alpha
 * @deprecated This API is superseded by {@link TreeBranch}, which should be used instead.
 */
export function getBranch<T extends ImplicitFieldSchema | UnsafeUnknownSchema>(
	view: TreeViewAlpha<T>,
): BranchableTree;
export function getBranch<T extends ImplicitFieldSchema | UnsafeUnknownSchema>(
	treeOrView: ITree | TreeViewAlpha<T>,
): BranchableTree {
	assert(
		treeOrView instanceof SharedTree || treeOrView instanceof SchematizingSimpleTreeView,
		0xa48 /* Unsupported implementation */,
	);
	const checkout: TreeCheckout = treeOrView.checkout;
	// This cast is safe so long as TreeCheckout supports all the operations on the branch interface.
	return checkout as unknown as BranchableTree;
}

/**
 * Format versions supported by SharedTree.
 *
 * Each version documents a required minimum version of the \@fluidframework/tree package.
 * @alpha
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

	/**
	 * Requires \@fluidframework/tree \>= 2.0.0.
	 */
	v3: 3,
} as const;

/**
 * Format versions supported by SharedTree.
 *
 * Each version documents a required minimum version of the \@fluidframework/tree package.
 * @alpha
 * @privateRemarks
 * See packages/dds/tree/docs/main/compatibility.md for information on how to add support for a new format.
 *
 * TODO: Before this gets promoted past Alpha,
 * a separate abstraction more suited for use in the public API should be adopted rather than reusing the same types used internally.
 * Such an abstraction should probably be in the form of a Fluid-Framework wide compatibility enum.
 */
export type SharedTreeFormatVersion = typeof SharedTreeFormatVersion;

/**
 * Configuration options for SharedTree.
 * @alpha
 */
export type SharedTreeOptions = Partial<ICodecOptions> &
	Partial<SharedTreeFormatOptions> &
	ForestOptions;

/**
 * Configuration options for SharedTree's internal tree storage.
 * @alpha
 */
export interface ForestOptions {
	/**
	 * The {@link ForestType} indicating which forest type should be created for the SharedTree.
	 */
	readonly forest?: ForestType;
}

/**
 * Options for configuring the persisted format SharedTree uses.
 * @alpha
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
	/**
	 * The "ObjectForest" forest type with expensive asserts for debugging.
	 */
	Expensive = 2,
}

export const defaultSharedTreeOptions: Required<SharedTreeOptions> = {
	jsonValidator: noopValidator,
	forest: ForestType.Reference,
	treeEncodeType: TreeCompressionStrategy.Compressed,
	formatVersion: SharedTreeFormatVersion.v3,
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
