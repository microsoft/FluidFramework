/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import type {
	ITelemetryContext,
	IExperimentalIncrementalSummaryContext,
	ISummaryTreeWithStats,
	IRuntimeMessageCollection,
} from "@fluidframework/runtime-definitions/internal";

import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import type { SharedObjectKind } from "@fluidframework/shared-object-base";
import {
	type IFluidSerializer,
	type ISharedObject,
	type ISharedObjectKind,
	SharedObject,
	createSharedObjectKind,
} from "@fluidframework/shared-object-base/internal";

import type {
	SchematizingSimpleTreeView,
	SharedTreeContentSnapshot,
	SharedTreeOptions,
	SharedTreeOptionsInternal,
	SharedTreeEditBuilder,
	SharedTreeChange,
	ITreePrivate,
} from "./shared-tree/index.js";
import type {
	ImplicitFieldSchema,
	ITree,
	ReadSchema,
	SimpleTreeSchema,
	TreeView,
	TreeViewConfiguration,
	UnsafeUnknownSchema,
	VerboseTree,
} from "./simple-tree/index.js";
import { SharedTreeFactoryType, SharedTreeAttributes } from "./sharedTreeAttributes.js";
import { Breakable } from "./util/index.js";
import { SharedTreeKernel } from "./shared-tree/index.js";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { fail } from "@fluidframework/core-utils/internal";
import type { SharedTreeCore } from "./shared-tree-core/index.js";

/**
 * {@link ITreePrivate} extended with ISharedObject.
 * @remarks
 * This is used when integration testing this package with the Fluid runtime as it exposes the APIs the runtime consumes to manipulate the tree.
 */
export interface ISharedTree extends ISharedObject, ITreePrivate {}

/**
 * Shared object wrapping {@link SharedTreeKernel}.
 */
class SharedTreeImpl extends SharedObject implements ISharedTree {
	private readonly breaker: Breakable = new Breakable("Shared Tree");

	public readonly kernel: SharedTreeKernel;

	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		optionsParam: SharedTreeOptionsInternal,
		telemetryContextPrefix: string = "fluid_sharedTree_",
	) {
		super(id, runtime, attributes, telemetryContextPrefix);
		if (runtime.idCompressor === undefined) {
			throw new UsageError("IdCompressor must be enabled to use SharedTree");
		}
		this.kernel = new SharedTreeKernel(
			this.breaker,
			this,
			this.serializer,
			(content, localOpMetadata) => this.submitLocalMessage(content, localOpMetadata),
			() => this.deltaManager.lastSequenceNumber,
			this.logger,
			runtime.idCompressor,
			optionsParam,
		);
	}

	public summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
	): ISummaryTreeWithStats {
		return this.kernel.summarizeCore(serializer, telemetryContext, incrementalSummaryContext);
	}

	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		fail(0xb75 /* processCore should not be called on SharedTree */);
	}

	protected override processMessagesCore(messagesCollection: IRuntimeMessageCollection): void {
		this.kernel.processMessagesCore(messagesCollection);
	}

	protected onDisconnect(): void {
		this.kernel.onDisconnect();
	}

	public exportVerbose(): VerboseTree | undefined {
		return this.kernel.exportVerbose();
	}

	public exportSimpleSchema(): SimpleTreeSchema {
		return this.kernel.exportSimpleSchema();
	}

	public contentSnapshot(): SharedTreeContentSnapshot {
		return this.kernel.contentSnapshot();
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
		return this.kernel.viewWith(config);
	}

	protected override async loadCore(services: IChannelStorageService): Promise<void> {
		await this.kernel.loadCore(services);
	}

	protected override didAttach(): void {
		this.kernel.didAttach();
	}

	protected override applyStashedOp(
		...args: Parameters<
			SharedTreeCore<SharedTreeEditBuilder, SharedTreeChange>["applyStashedOp"]
		>
	): void {
		this.kernel.applyStashedOp(...args);
	}

	protected override reSubmitCore(
		...args: Parameters<
			SharedTreeCore<SharedTreeEditBuilder, SharedTreeChange>["reSubmitCore"]
		>
	): void {
		this.kernel.reSubmitCore(...args);
	}
}

/**
 * A channel factory that creates an {@link ITree}.
 */
class TreeFactory implements IChannelFactory<ISharedTree> {
	public static Type: string = SharedTreeFactoryType;
	public readonly type: string = SharedTreeFactoryType;

	public readonly attributes: IChannelAttributes = SharedTreeAttributes;

	public constructor(private readonly options: SharedTreeOptionsInternal) {}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<ISharedTree> {
		const tree = new SharedTreeImpl(id, runtime, channelAttributes, this.options);
		await tree.load(services);
		return tree;
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): ISharedTree {
		const tree = new SharedTreeImpl(id, runtime, this.attributes, this.options);
		tree.initializeLocal();
		return tree;
	}
}

/**
 * SharedTree is a hierarchical data structure for collaboratively editing strongly typed JSON-like trees
 * of objects, arrays, and other data types.
 * @legacy
 * @alpha
 */
export const SharedTree = configuredSharedTree({});

/**
 * {@link SharedTree} but allowing a non-default configuration.
 * @remarks
 * This is useful for debugging and testing to opt into extra validation or see if opting out of some optimizations fixes an issue.
 * @example
 * ```typescript
 * import {
 * 	ForestType,
 * 	TreeCompressionStrategy,
 * 	configuredSharedTree,
 * 	typeboxValidator,
 * 	// eslint-disable-next-line import/no-internal-modules
 * } from "@fluidframework/tree/internal";
 * const SharedTree = configuredSharedTree({
 * 	forest: ForestType.Reference,
 * 	jsonValidator: typeboxValidator,
 * 	treeEncodeType: TreeCompressionStrategy.Uncompressed,
 * });
 * ```
 * @privateRemarks
 * This should be legacy, but has to be internal due to limitations of API tagging preventing it from being both alpha and alpha+legacy.
 * TODO:
 * Expose Ajv validator for better error message quality somehow.
 * Maybe as part of a test utils or dev-tool package?
 * @internal
 */
export function configuredSharedTree(
	options: SharedTreeOptions,
): ISharedObjectKind<ITree> & SharedObjectKind<ITree> {
	class ConfiguredFactory extends TreeFactory {
		public constructor() {
			super(options);
		}
	}
	return createSharedObjectKind<ITree>(ConfiguredFactory);
}
