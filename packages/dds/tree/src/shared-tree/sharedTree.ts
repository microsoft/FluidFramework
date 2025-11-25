/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType, IFluidLoadable } from "@fluidframework/core-interfaces/internal";
import { assert, fail } from "@fluidframework/core-utils/internal";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import type { IIdCompressor, StableId } from "@fluidframework/id-compressor";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import type {
	IChannelView,
	IFluidSerializer,
	SharedKernel,
} from "@fluidframework/shared-object-base/internal";
import {
	UsageError,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import {
	type CodecTree,
	type CodecWriteOptions,
	DependentFormatVersion,
	FluidClientVersion,
	FormatValidatorNoOp,
	type ICodecOptions,
} from "../codec/index.js";
import {
	type FieldKey,
	type GraphCommit,
	type IEditableForest,
	type JsonableTree,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	RevisionTagCodec,
	type TreeFieldStoredSchema,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	TreeStoredSchemaRepository,
	type TreeStoredSchemaSubscription,
	type TreeTypeSet,
	getCodecTreeForDetachedFieldIndexFormat,
	makeDetachedFieldIndex,
	moveToDetachedField,
} from "../core/index.js";
import {
	DetachedFieldIndexSummarizer,
	FieldKinds,
	ForestSummarizer,
	SchemaSummarizer,
	TreeCompressionStrategy,
	buildChunkedForest,
	buildForest,
	defaultIncrementalEncodingPolicy,
	defaultSchemaPolicy,
	getCodecTreeForFieldBatchFormat,
	getCodecTreeForForestFormat,
	getCodecTreeForSchemaFormat,
	jsonableTreeFromFieldCursor,
	makeFieldBatchCodec,
	makeMitigatedChangeFamily,
	makeSchemaCodec,
	makeTreeChunker,
	type IncrementalEncodingPolicy,
	type TreeCompressionStrategyPrivate,
} from "../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { FormatV1 } from "../feature-libraries/schema-index/index.js";
import {
	type BranchId,
	clientVersionToEditManagerFormatVersion,
	clientVersionToMessageFormatVersion,
	type ClonableSchemaAndPolicy,
	getCodecTreeForEditManagerFormatWithChange,
	getCodecTreeForMessageFormatWithChange,
	type SharedTreCoreOptionsInternal,
	MessageFormatVersion,
	SharedTreeCore,
	EditManagerFormatVersion,
} from "../shared-tree-core/index.js";
import {
	type ITree,
	type ImplicitFieldSchema,
	NodeKind,
	type ReadSchema,
	type SimpleFieldSchema,
	type SimpleTreeSchema,
	type TreeView,
	type TreeViewAlpha,
	type TreeViewConfiguration,
	type UnsafeUnknownSchema,
	type VerboseTree,
	tryStoredSchemaAsArray,
	type SimpleNodeSchema,
	FieldKind,
	type ITreeAlpha,
	type SimpleObjectFieldSchema,
	type SimpleAllowedTypeAttributes,
} from "../simple-tree/index.js";

import { SchematizingSimpleTreeView } from "./schematizingTreeView.js";
import { SharedTreeReadonlyChangeEnricher } from "./sharedTreeChangeEnricher.js";
import { SharedTreeChangeFamily } from "./sharedTreeChangeFamily.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";
import { type TreeCheckout, type BranchableTree, createTreeCheckout } from "./treeCheckout.js";
import {
	brand,
	type Breakable,
	breakingClass,
	type JsonCompatible,
	throwIfBroken,
} from "../util/index.js";
import {
	getCodecTreeForChangeFormat,
	type SharedTreeChangeFormatVersion,
} from "./sharedTreeChangeCodecs.js";

/**
 * Copy of data from an {@link ITreePrivate} at some point in time.
 * @remarks
 * This is unrelated to Fluids concept of "snapshots".
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
export interface ITreeInternal extends IChannelView, ITreeAlpha {}

/**
 * {@link ITreeInternal} extended with some non-exported APIs.
 * @remarks
 * This allows access to the tree content using the internal data model used at the storage and "flex" layers,
 * and should only be needed for testing and debugging this package's internals.
 */
export interface ITreePrivate extends ITreeInternal {
	/**
	 * Provides a copy of the current content of the tree.
	 * This can be useful for inspecting the tree when no suitable view schema is available.
	 * This is only intended for use in testing and exceptional code paths: it is not performant.
	 *
	 * This does not include everything that is included in a tree summary, since information about how to merge future edits is omitted.
	 */
	contentSnapshot(): SharedTreeContentSnapshot;

	/**
	 * Access to internals for testing.
	 */
	readonly kernel: SharedTreeKernel;
}

/**
 * The type SharedTree's kernel's view must implement so what when its merged with the underling SharedObject's API it fully implements the required tree API surface ({@link ITreePrivate }).
 */
export type SharedTreeKernelView = Omit<ITreePrivate, keyof (IChannelView & IFluidLoadable)>;

/**
 * SharedTreeCore, configured with a good set of indexes and field kinds which will maintain compatibility over time.
 *
 * TODO: detail compatibility requirements.
 */
@breakingClass
export class SharedTreeKernel
	extends SharedTreeCore<SharedTreeEditBuilder, SharedTreeChange>
	implements SharedKernel
{
	public readonly checkout: TreeCheckout;
	public get storedSchema(): TreeStoredSchemaRepository {
		return this.checkout.storedSchema;
	}

	private readonly checkouts: Map<BranchId, TreeCheckout> = new Map();

	/**
	 * The app-facing API for SharedTree implemented by this Kernel.
	 * @remarks
	 * This is the API grafted onto the ISharedObject which apps can access.
	 * It includes both the APIs used for internal testing, and public facing APIs (both stable and unstable).
	 * Different users will have access to different subsets of this API, see {@link ITree}, {@link ITreeAlpha} and {@link ITreeInternal} which this {@link ITreePrivate} extends.
	 */
	public readonly view: SharedTreeKernelView;

	public constructor(
		breaker: Breakable,
		sharedObject: IChannelView & IFluidLoadable,
		serializer: IFluidSerializer,
		submitLocalMessage: (content: unknown, localOpMetadata?: unknown) => void,
		lastSequenceNumber: () => number | undefined,
		initialSequenceNumber: number,
		private readonly logger: ITelemetryLoggerExt | undefined,
		idCompressor: IIdCompressor,
		optionsParam: SharedTreeOptionsInternal,
	) {
		const options: Required<SharedTreeOptionsInternal> = {
			...defaultSharedTreeOptions,
			...optionsParam,
		};
		if (options.minVersionForCollab < FluidClientVersion.v2_0) {
			throw new UsageError("SharedTree requires minVersionForCollab of at least 2.0.0");
		}
		const schema = new TreeStoredSchemaRepository();
		const forest = buildConfiguredForest(
			breaker,
			options.forest,
			schema,
			idCompressor,
			options.shouldEncodeIncrementally,
		);
		const revisionTagCodec = new RevisionTagCodec(idCompressor);
		const removedRoots = makeDetachedFieldIndex(
			"repair",
			revisionTagCodec,
			idCompressor,
			options,
		);
		const schemaCodec = makeSchemaCodec(options);
		const schemaSummarizer = new SchemaSummarizer(
			schema,
			{
				getCurrentSeq: lastSequenceNumber,
			},
			schemaCodec,
		);
		const fieldBatchCodec = makeFieldBatchCodec(options);

		const encoderContext = {
			schema: {
				schema,
				policy: defaultSchemaPolicy,
			},
			encodeType: options.treeEncodeType,
			originatorId: idCompressor.localSessionId,
			idCompressor,
		};
		const forestSummarizer = new ForestSummarizer(
			forest,
			revisionTagCodec,
			fieldBatchCodec,
			encoderContext,
			options,
			idCompressor,
			initialSequenceNumber,
			options.shouldEncodeIncrementally,
		);
		const removedRootsSummarizer = new DetachedFieldIndexSummarizer(removedRoots);
		const innerChangeFamily = new SharedTreeChangeFamily(
			revisionTagCodec,
			fieldBatchCodec,
			options,
			options.treeEncodeType,
			idCompressor,
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
			breaker,
			sharedObject,
			serializer,
			submitLocalMessage,
			logger,
			[schemaSummarizer, forestSummarizer, removedRootsSummarizer],
			changeFamily,
			options,
			changeFormatVersionForEditManager,
			changeFormatVersionForMessage,
			idCompressor,
			schema,
			defaultSchemaPolicy,
			undefined,
			changeEnricher,
		);

		this.checkout = createTreeCheckout(idCompressor, this.mintRevisionTag, revisionTagCodec, {
			branch: this.getLocalBranch(),
			changeFamily,
			schema,
			forest,
			fieldBatchCodec,
			removedRoots,
			chunkCompressionStrategy: options.treeEncodeType,
			logger,
			breaker: this.breaker,
			disposeForksAfterTransaction: options.disposeForksAfterTransaction,
		});

		this.registerCheckout("main", this.checkout);

		this.view = {
			contentSnapshot: () => this.contentSnapshot(),
			exportSimpleSchema: () => this.exportSimpleSchema(),
			exportVerbose: () => this.exportVerbose(),
			viewWith: this.viewWith.bind(this),
			viewSharedBranchWith: this.viewBranchWith.bind(this),
			createSharedBranch: this.createSharedBranch.bind(this),
			getSharedBranchIds: this.getSharedBranchIds.bind(this),
			kernel: this,
		};
	}

	private registerCheckout(branchId: BranchId, checkout: TreeCheckout): void {
		this.checkouts.set(branchId, checkout);
		const enricher = this.getCommitEnricher(branchId);
		checkout.transaction.events.on("started", () => {
			if (this.sharedObject.isAttached()) {
				// It is currently forbidden to attach during a transaction, so transaction state changes can be ignored until after attaching.
				enricher.startTransaction();
			}
		});

		checkout.transaction.events.on("aborting", () => {
			if (this.sharedObject.isAttached()) {
				// It is currently forbidden to attach during a transaction, so transaction state changes can be ignored until after attaching.
				enricher.abortTransaction();
			}
		});
		checkout.transaction.events.on("committing", () => {
			if (this.sharedObject.isAttached()) {
				// It is currently forbidden to attach during a transaction, so transaction state changes can be ignored until after attaching.
				enricher.commitTransaction();
			}
		});
		checkout.events.on("beforeBatch", (event) => {
			if (event.type === "append" && this.sharedObject.isAttached()) {
				if (checkout.transaction.isInProgress()) {
					enricher.addTransactionCommits(event.newCommits);
				}
			}
		});
	}

	public exportVerbose(): VerboseTree | undefined {
		return this.checkout.exportVerbose();
	}

	public exportSimpleSchema(): SimpleTreeSchema {
		return exportSimpleSchema(this.storedSchema);
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

	public viewBranchWith<TRoot extends ImplicitFieldSchema>(
		branchId: string,
		config: TreeViewConfiguration<TRoot>,
	): TreeView<TRoot>;

	public viewBranchWith<TRoot extends ImplicitFieldSchema | UnsafeUnknownSchema>(
		branchId: string,
		config: TreeViewConfiguration<ReadSchema<TRoot>>,
	): SchematizingSimpleTreeView<TRoot> & TreeView<ReadSchema<TRoot>> {
		const compressedId = this.idCompressor.tryRecompress(branchId as StableId);
		if (compressedId === undefined) {
			throw new UsageError(`No branch found with id: ${branchId}`);
		}
		return this.getCheckout(compressedId).viewWith(
			config,
		) as SchematizingSimpleTreeView<TRoot> & TreeView<ReadSchema<TRoot>>;
	}

	private getCheckout(branchId: BranchId): TreeCheckout {
		return this.checkouts.get(branchId) ?? this.checkoutBranch(branchId);
	}

	private checkoutBranch(branchId: BranchId): TreeCheckout {
		const checkout = this.checkout.branch();
		checkout.switchBranch(this.getSharedBranch(branchId));
		const enricher = new SharedTreeReadonlyChangeEnricher(
			checkout.forest,
			checkout.storedSchema,
			checkout.removedRoots,
		);

		this.registerSharedBranchForEditing(branchId, enricher);
		this.registerCheckout(branchId, checkout);
		return checkout;
	}

	public override async loadCore(services: IChannelStorageService): Promise<void> {
		await super.loadCore(services);
		this.checkout.load();
	}

	public override didAttach(): void {
		for (const checkout of this.checkouts.values()) {
			if (checkout.transaction.isInProgress()) {
				// Attaching during a transaction is not currently supported.
				// At least part of of the system is known to not handle this case correctly - commit enrichment - and there may be others.
				throw new UsageError(
					"Cannot attach while a transaction is in progress. Commit or abort the transaction before attaching.",
				);
			}
		}
		super.didAttach();
	}

	public override applyStashedOp(
		...args: Parameters<
			SharedTreeCore<SharedTreeEditBuilder, SharedTreeChange>["applyStashedOp"]
		>
	): void {
		for (const checkout of this.checkouts.values()) {
			assert(
				!checkout.transaction.isInProgress(),
				0x674 /* Unexpected transaction is open while applying stashed ops */,
			);
		}
		super.applyStashedOp(...args);
	}

	protected override submitCommit(
		branchId: BranchId,
		commit: GraphCommit<SharedTreeChange>,
		schemaAndPolicy: ClonableSchemaAndPolicy,
		isResubmit: boolean,
	): void {
		const checkout = this.getCheckout(branchId);
		assert(
			!checkout.transaction.isInProgress(),
			0xaa6 /* Cannot submit a commit while a transaction is in progress */,
		);
		if (isResubmit) {
			return super.submitCommit(branchId, commit, schemaAndPolicy, isResubmit);
		}

		// Refrain from submitting new commits until they are validated by the checkout.
		// This is not a strict requirement for correctness in our system, but in the event that there is a bug when applying commits to the checkout
		// that causes a crash (e.g. in the forest), this will at least prevent this client from sending the problematic commit to any other clients.
		checkout.onCommitValid(commit, () =>
			super.submitCommit(branchId, commit, schemaAndPolicy, isResubmit),
		);
	}

	public onDisconnect(): void {}
}

export function exportSimpleSchema(storedSchema: TreeStoredSchema): SimpleTreeSchema {
	return {
		root: exportSimpleFieldSchemaStored(storedSchema.rootFieldSchema),
		definitions: new Map(
			[...storedSchema.nodeSchema].map(([key, schema]) => {
				return [key, exportSimpleNodeSchemaStored(schema)];
			}),
		),
	};
}

/**
 * A way to parse schema in the persisted format from {@link extractPersistedSchema}.
 * @remarks
 * This behaves identically to {@link ITreeAlpha.exportSimpleSchema},
 * except that it gets the schema from the caller instead of from an existing tree.
 *
 * This can be useful for inspecting the contents of persisted schema,
 * such as those generated by {@link extractPersistedSchema} for use in testing.
 * Since that data format is otherwise unspecified,
 * this provides a way to inspect its contents with documented semantics.
 * @alpha
 */
export function persistedToSimpleSchema(
	persisted: JsonCompatible,
	options: ICodecOptions,
): SimpleTreeSchema {
	// Any version can be passed down to makeSchemaCodec here.
	// We only use the decode part, which always dispatches to the correct codec based on the version in the data, not the version passed to `makeSchemaCodec`.
	const schemaCodec = makeSchemaCodec({
		...options,
		minVersionForCollab: FluidClientVersion.v2_0,
	});
	const stored = schemaCodec.decode(persisted as FormatV1);
	return exportSimpleSchema(stored);
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
	if (treeOrView instanceof SchematizingSimpleTreeView) {
		return treeOrView.checkout as unknown as BranchableTree;
	}
	const kernel = (treeOrView as ITree as ITreePrivate).kernel;
	assert(kernel instanceof SharedTreeKernel, 0xb56 /* Invalid ITree */);
	// This cast is safe so long as TreeCheckout supports all the operations on the branch interface.
	return kernel.checkout as unknown as BranchableTree;
}

/**
 * Defines for each EditManagerFormatVersion the SharedTreeChangeFormatVersion to use.
 * This is an arbitrary mapping that is injected in the EditManger codec.
 * Once an entry is defined and used in production, it cannot be changed.
 * This is because the format for SharedTree changes are not explicitly versioned.
 */
export const changeFormatVersionForEditManager = DependentFormatVersion.fromPairs([
	[
		brand<EditManagerFormatVersion>(EditManagerFormatVersion.v3),
		brand<SharedTreeChangeFormatVersion>(3),
	],
	[
		brand<EditManagerFormatVersion>(EditManagerFormatVersion.v4),
		brand<SharedTreeChangeFormatVersion>(4),
	],
	[
		brand<EditManagerFormatVersion>(EditManagerFormatVersion.v5),
		brand<SharedTreeChangeFormatVersion>(4),
	],
]);

/**
 * Defines for each MessageFormatVersion the SharedTreeChangeFormatVersion to use.
 * This is an arbitrary mapping that is injected in the message codec.
 * Once an entry is defined and used in production, it cannot be changed.
 * This is because the format for SharedTree changes are not explicitly versioned.
 */
export const changeFormatVersionForMessage = DependentFormatVersion.fromPairs([
	[
		brand<MessageFormatVersion>(MessageFormatVersion.v3),
		brand<SharedTreeChangeFormatVersion>(3),
	],
	[
		brand<MessageFormatVersion>(MessageFormatVersion.v4),
		brand<SharedTreeChangeFormatVersion>(4),
	],
	[
		brand<MessageFormatVersion>(MessageFormatVersion.v5),
		brand<SharedTreeChangeFormatVersion>(4),
	],
]);

function getCodecTreeForEditManagerFormat(clientVersion: MinimumVersionForCollab): CodecTree {
	const change = changeFormatVersionForEditManager.lookup(
		clientVersionToEditManagerFormatVersion(clientVersion),
	);
	const changeCodecTree = getCodecTreeForChangeFormat(change, clientVersion);
	return getCodecTreeForEditManagerFormatWithChange(clientVersion, changeCodecTree);
}

function getCodecTreeForMessageFormat(clientVersion: MinimumVersionForCollab): CodecTree {
	const change = changeFormatVersionForMessage.lookup(
		clientVersionToMessageFormatVersion(clientVersion),
	);
	const changeCodecTree = getCodecTreeForChangeFormat(change, clientVersion);
	return getCodecTreeForMessageFormatWithChange(clientVersion, changeCodecTree);
}

export function getCodecTreeForSharedTreeFormat(
	clientVersion: MinimumVersionForCollab,
): CodecTree {
	const children: CodecTree[] = [];
	children.push(getCodecTreeForForestFormat(clientVersion));
	children.push(getCodecTreeForSchemaFormat(clientVersion));
	children.push(getCodecTreeForDetachedFieldIndexFormat(clientVersion));
	children.push(getCodecTreeForEditManagerFormat(clientVersion));
	children.push(getCodecTreeForMessageFormat(clientVersion));
	children.push(getCodecTreeForFieldBatchFormat(clientVersion));
	return {
		name: "SharedTree",
		version: undefined, // SharedTree does not have a version of its own.
		children,
	};
}

/**
 * Configuration options for SharedTree.
 * @beta @input
 */
export type SharedTreeOptionsBeta = ForestOptions;

/**
 * Configuration options for SharedTree.
 * @alpha @input
 */
export interface SharedTreeOptions
	extends Partial<CodecWriteOptions>,
		Partial<SharedTreeFormatOptions>,
		SharedTreeOptionsBeta {
	/**
	 * Experimental feature flag to enable shared branches.
	 * This feature is not yet complete and should not be used in production.
	 * Defaults to false.
	 */
	readonly enableSharedBranches?: boolean;
}

export interface SharedTreeOptionsInternal
	extends Partial<SharedTreCoreOptionsInternal>,
		Partial<ForestOptions>,
		Partial<SharedTreeFormatOptionsInternal> {
	disposeForksAfterTransaction?: boolean;
	/**
	 * Returns whether a node / field should be incrementally encoded.
	 * @remarks
	 * See {@link IncrementalEncodingPolicy}.
	 */
	shouldEncodeIncrementally?: IncrementalEncodingPolicy;
}

/**
 * Configuration options for SharedTree's internal tree storage.
 * @beta @input
 */
export interface ForestOptions {
	/**
	 * The {@link ForestType} indicating which forest type should be created for the SharedTree.
	 */
	readonly forest?: ForestType;
}

/**
 * Options for configuring the persisted format SharedTree uses.
 * @alpha @input
 */
export interface SharedTreeFormatOptions {
	/**
	 * See {@link TreeCompressionStrategy}.
	 * default: TreeCompressionStrategy.Compressed
	 */
	treeEncodeType: TreeCompressionStrategy;
}

export interface SharedTreeFormatOptionsInternal
	extends Omit<SharedTreeFormatOptions, "treeEncodeType"> {
	treeEncodeType: TreeCompressionStrategyPrivate;
}

/**
 * Used to distinguish between different forest types.
 * @remarks
 * The "Forest" is the internal data structure used to store all the trees (the main tree and any removed ones) for a given view or branch.
 * ForestTypes should all have the same behavior, but may differ in performance and debuggability.
 *
 * Current options are {@link ForestTypeReference}, {@link ForestTypeOptimized} and {@link ForestTypeExpensiveDebug}.
 * @privateRemarks
 * Implement using {@link toForestType}.
 * Consume using {@link buildConfiguredForest}.
 * @sealed @beta
 */
export interface ForestType extends ErasedType<"ForestType"> {}

/**
 * Reference implementation of forest.
 * @remarks
 * A simple implementation with minimal complexity and moderate debuggability, validation and performance.
 * @privateRemarks
 * The "ObjectForest" forest type.
 * @beta
 */
export const ForestTypeReference = toForestType(
	(breaker: Breakable, schema: TreeStoredSchemaSubscription, idCompressor: IIdCompressor) =>
		buildForest(breaker, schema),
);

/**
 * Optimized implementation of forest.
 * @remarks
 * A complex optimized forest implementation, which has minimal validation and debuggability to optimize for performance.
 * Uses an internal representation optimized for size designed to scale to larger datasets with reduced overhead.
 * @privateRemarks
 * The "ChunkedForest" forest type.
 * @beta
 */
export const ForestTypeOptimized = toForestType(
	(
		breaker: Breakable,
		schema: TreeStoredSchemaSubscription,
		idCompressor: IIdCompressor,
		shouldEncodeIncrementally: IncrementalEncodingPolicy,
	) =>
		buildChunkedForest(
			makeTreeChunker(schema, defaultSchemaPolicy, shouldEncodeIncrementally),
			undefined,
			idCompressor,
		),
);

/**
 * Slow implementation of forest intended only for debugging.
 * @remarks
 * Includes validation with scales poorly.
 * May be asymptotically slower than {@link ForestTypeReference}, and may perform very badly with larger data sizes.
 * @privateRemarks
 * The "ObjectForest" forest type with expensive asserts for debugging.
 * @beta
 */
export const ForestTypeExpensiveDebug = toForestType(
	(breaker: Breakable, schema: TreeStoredSchemaSubscription) =>
		buildForest(breaker, schema, undefined, true),
);

type ForestFactory = (
	breaker: Breakable,
	schema: TreeStoredSchemaSubscription,
	idCompressor: IIdCompressor,
	shouldEncodeIncrementally: IncrementalEncodingPolicy,
) => IEditableForest;

function toForestType(factory: ForestFactory): ForestType {
	return factory as unknown as ForestType;
}

/**
 * Build and return a forest of the requested type.
 */
export function buildConfiguredForest(
	breaker: Breakable,
	factory: ForestType,
	schema: TreeStoredSchemaSubscription,
	idCompressor: IIdCompressor,
	shouldEncodeIncrementally: IncrementalEncodingPolicy,
): IEditableForest {
	return (factory as unknown as ForestFactory)(
		breaker,
		schema,
		idCompressor,
		shouldEncodeIncrementally,
	);
}

export const defaultSharedTreeOptions: Required<SharedTreeOptionsInternal> = {
	jsonValidator: FormatValidatorNoOp,
	minVersionForCollab: FluidClientVersion.v2_0,
	forest: ForestTypeReference,
	treeEncodeType: TreeCompressionStrategy.Compressed,
	disposeForksAfterTransaction: true,
	shouldEncodeIncrementally: defaultIncrementalEncodingPolicy,
	editManagerFormatSelector: clientVersionToEditManagerFormatVersion,
	messageFormatSelector: clientVersionToMessageFormatVersion,
};

/**
 * Build the allowed types for a Stored Schema.
 *
 * @remarks Staged upgrades do not apply to stored schemas, so we omit the {@link SimpleAllowedTypeAttributes.isStaged | staging flag } when building {@link SimpleAllowedTypeAttributes}.
 * @param types - The types to create allowed types for.
 * @returns The allowed types.
 */
function buildSimpleAllowedTypeAttributesForStoredSchema(
	types: TreeTypeSet,
): ReadonlyMap<string, SimpleAllowedTypeAttributes> {
	const allowedTypesInfo = new Map<string, SimpleAllowedTypeAttributes>();
	for (const type of types) {
		// Stored schemas do not have staged upgrades
		allowedTypesInfo.set(type, { isStaged: undefined });
	}
	return allowedTypesInfo;
}

function exportSimpleFieldSchemaStored(schema: TreeFieldStoredSchema): SimpleFieldSchema {
	let kind: FieldKind;
	switch (schema.kind) {
		case FieldKinds.identifier.identifier:
			kind = FieldKind.Identifier;
			break;
		case FieldKinds.optional.identifier:
			kind = FieldKind.Optional;
			break;
		case FieldKinds.required.identifier:
			kind = FieldKind.Required;
			break;
		case FieldKinds.forbidden.identifier:
			kind = FieldKind.Optional;
			assert(schema.types.size === 0, 0xa94 /* invalid forbidden field */);
			break;
		default:
			fail(0xaca /* invalid field kind */);
	}
	return {
		kind,
		simpleAllowedTypes: buildSimpleAllowedTypeAttributesForStoredSchema(schema.types),
		metadata: {},
		persistedMetadata: schema.persistedMetadata,
	};
}

/**
 * Export a {@link SimpleNodeSchema} from a {@link TreeNodeStoredSchema}.
 * @privateRemarks
 * TODO: Persist node metadata once schema FormatV2 is supported.
 * Note on SimpleNodeSchema construction: In the persisted format `persistedMetadata` is just called `metadata` whereas the `metadata`
 * field on SimpleNodeSchema is not persisted.
 */
function exportSimpleNodeSchemaStored(schema: TreeNodeStoredSchema): SimpleNodeSchema {
	const arrayTypes = tryStoredSchemaAsArray(schema);
	if (arrayTypes !== undefined) {
		return {
			kind: NodeKind.Array,
			simpleAllowedTypes: buildSimpleAllowedTypeAttributesForStoredSchema(arrayTypes),
			metadata: {},
			persistedMetadata: schema.metadata,
		};
	}
	if (schema instanceof ObjectNodeStoredSchema) {
		const fields = new Map<FieldKey, SimpleObjectFieldSchema>();
		for (const [storedKey, field] of schema.objectNodeFields) {
			fields.set(storedKey, { ...exportSimpleFieldSchemaStored(field), storedKey });
		}
		return {
			kind: NodeKind.Object,
			fields,
			allowUnknownOptionalFields: undefined,
			metadata: {},
			persistedMetadata: schema.metadata,
		};
	}
	if (schema instanceof MapNodeStoredSchema) {
		assert(
			schema.mapFields.kind === FieldKinds.optional.identifier,
			0xa95 /* Invalid map schema */,
		);
		return {
			kind: NodeKind.Map,
			simpleAllowedTypes: buildSimpleAllowedTypeAttributesForStoredSchema(
				schema.mapFields.types,
			),
			metadata: {},
			persistedMetadata: schema.metadata,
		};
	}
	if (schema instanceof LeafNodeStoredSchema) {
		return {
			kind: NodeKind.Leaf,
			leafKind: schema.leafValue,
			metadata: {},
			persistedMetadata: schema.metadata,
		};
	}
	fail(0xacb /* invalid schema kind */);
}
