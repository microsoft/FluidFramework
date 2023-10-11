/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import {
	ITelemetryContext,
	ISummaryTreeWithStats,
	IExperimentalIncrementalSummaryContext,
	IGarbageCollectionData,
} from "@fluidframework/runtime-definitions";
import {
	FieldSchema,
	TypedField,
	createNodeKeyManager,
	nodeKeyFieldKey,
} from "../feature-libraries";
import {
	SharedTree,
	SharedTreeOptions,
	InitializeAndSchematizeConfiguration,
} from "../shared-tree";
import { brand } from "../util";

/**
 * Configuration to specialize a Tree DDS for a particular use.
 * @alpha
 */
export interface TypedTreeOptions extends SharedTreeOptions {
	/**
	 * Name appended to {@link @fluidframework/datastore-definitions#IChannelFactory."type"} to identify this factory configuration.
	 * @privateRemarks
	 * TODO: evaluate if this design is a good idea, or if "subtype" should be removed.
	 * TODO: evaluate if schematize should be separated from DDS construction.
	 */
	readonly subtype: string;
}

/**
 * Channel for a Tree DDS.
 * @alpha
 */
export type TypedTreeChannel = IChannel & {
	schematize<TRoot extends FieldSchema>(
		config: InitializeAndSchematizeConfiguration<TRoot>,
	): TypedField<TRoot>;
};

/**
 * A channel factory that creates a {@link TreeField}.
 * @alpha
 */
export class TypedTreeFactory implements IChannelFactory {
	public readonly type: string;
	public readonly attributes: IChannelAttributes;

	public constructor(private readonly options: TypedTreeOptions) {
		this.type = `https://graph.microsoft.com/types/tree/${options.subtype}`;

		this.attributes = {
			type: this.type,
			snapshotFormatVersion: "0.0.0",
			packageVersion: "0.0.0",
		};
	}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<TypedTreeChannel> {
		const tree = new SharedTree(id, runtime, channelAttributes, this.options, "SharedTree");
		await tree.load(services);
		return new ChannelWrapperWithSchematize(runtime, tree);
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): TypedTreeChannel {
		const tree = new SharedTree(id, runtime, this.attributes, this.options, "SharedTree");
		tree.initializeLocal();
		return new ChannelWrapperWithSchematize(runtime, tree);
	}
}

/**
 * IChannel wrapper.
 * Subclass to add specific functionality.
 *
 * @remarks
 * This is handy when an implementing IChannelFactory and it's desirable to return a type that's derived from another IChannel implementation.
 */
class ChannelWrapper implements IChannel {
	public constructor(private readonly inner: IChannel) {}

	public get id(): string {
		return this.inner.id;
	}

	public get attributes(): IChannelAttributes {
		return this.inner.attributes;
	}

	public getAttachSummary(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
	): ISummaryTreeWithStats {
		return this.inner.getAttachSummary(fullTree, trackState, telemetryContext);
	}

	public async summarize(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined,
	): Promise<ISummaryTreeWithStats> {
		return this.inner.summarize(
			fullTree,
			trackState,
			telemetryContext,
			incrementalSummaryContext,
		);
	}

	public isAttached(): boolean {
		return this.inner.isAttached();
	}

	public connect(services: IChannelServices): void {
		return this.inner.connect(services);
	}
	public getGCData(fullGC?: boolean | undefined): IGarbageCollectionData {
		return this.inner.getGCData(fullGC);
	}

	public get handle(): IFluidHandle {
		return this.inner.handle;
	}

	public get IFluidLoadable(): IFluidLoadable {
		return this.inner.IFluidLoadable;
	}
}

/**
 * IChannel wrapper that exposes "schematize".
 */
class ChannelWrapperWithSchematize extends ChannelWrapper implements TypedTreeChannel {
	public constructor(
		private readonly runtime: IFluidDataStoreRuntime,
		private readonly tree: SharedTree,
	) {
		super(tree);
	}
	public schematize<TRoot extends FieldSchema>(
		config: InitializeAndSchematizeConfiguration<TRoot>,
	): TypedField<TRoot> {
		const nodeKeyManager = createNodeKeyManager(this.runtime.idCompressor);
		const view = this.tree.schematize(config);
		const root = view.editableTree2(config.schema, nodeKeyManager, brand(nodeKeyFieldKey));
		return root;
	}
}
