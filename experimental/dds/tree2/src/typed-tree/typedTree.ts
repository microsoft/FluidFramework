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
export interface TypedTreeOptions<TRoot extends FieldSchema = FieldSchema>
	extends SharedTreeOptions,
		InitializeAndSchematizeConfiguration<TRoot> {
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
export type TypedTreeChannel<TRoot extends FieldSchema = FieldSchema> = IChannel & {
	readonly root: TypedField<TRoot>;
};

/**
 * A channel factory that creates a {@link TreeField}.
 * @alpha
 */
export class TypedTreeFactory<TRoot extends FieldSchema = FieldSchema> implements IChannelFactory {
	public readonly type: string;
	public readonly attributes: IChannelAttributes;

	public constructor(private readonly options: TypedTreeOptions<TRoot>) {
		/**
		 * TODO:
		 * Either allow particular factory configurations to customize this string (for example `https://graph.microsoft.com/types/tree/${configurationName}`),
		 * and/or schematize as a separate step, after the tree is loaded/created.
		 */
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
	): Promise<TypedTreeChannel<TRoot>> {
		const tree = new SharedTree(id, runtime, channelAttributes, this.options, "SharedTree");
		await tree.load(services);
		return this.prepareChannel(runtime, tree);
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): TypedTreeChannel<TRoot> {
		const tree = new SharedTree(id, runtime, this.attributes, this.options, "SharedTree");
		tree.initializeLocal();
		// TODO: Once various issues with schema editing are fixed separate initialize from schematize, do initialize here
		return this.prepareChannel(runtime, tree);
	}

	private prepareChannel(
		runtime: IFluidDataStoreRuntime,
		tree: SharedTree,
	): TypedTreeChannel<TRoot> {
		const nodeKeyManager = createNodeKeyManager(runtime.idCompressor);
		const view = tree.schematize(this.options);
		const root = view.editableTree2(
			this.options.schema,
			nodeKeyManager,
			brand(nodeKeyFieldKey),
		);
		return new ChannelWrapperWithRoot(tree, root);
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
 * IChannel wrapper that exposes a "root".
 */
class ChannelWrapperWithRoot<T> extends ChannelWrapper {
	public constructor(
		inner: IChannel,
		public readonly root: T,
	) {
		super(inner);
	}
}
