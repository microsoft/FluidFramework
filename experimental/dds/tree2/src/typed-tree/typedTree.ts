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
import { FieldSchema, TypedField } from "../feature-libraries";
import {
	SharedTree,
	SharedTreeOptions,
	InitializeAndSchematizeConfiguration,
} from "../shared-tree";

/**
 * @alpha
 */
export interface TypedTreeOptions<TRoot extends FieldSchema = FieldSchema>
	extends SharedTreeOptions,
		InitializeAndSchematizeConfiguration<TRoot> {}

/**
 * A channel factory that creates a {@link TreeField}.
 * @alpha
 */
export class TypedTreeFactory<TRoot extends FieldSchema = FieldSchema> implements IChannelFactory {
	public type: string = "SharedTree";

	public attributes: IChannelAttributes = {
		type: this.type,
		snapshotFormatVersion: "0.0.0",
		packageVersion: "0.0.0",
	};

	public constructor(private readonly options: TypedTreeOptions<TRoot>) {}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<IChannel & { readonly root: TypedField<TRoot> }> {
		const tree = new SharedTree(id, runtime, channelAttributes, this.options, "SharedTree");
		await tree.load(services);
		const view = tree.schematize(this.options);
		const root = view.editableTree2(this.options.schema);
		return new ChannelWrapper(tree, root);
	}

	public create(
		runtime: IFluidDataStoreRuntime,
		id: string,
	): IChannel & { readonly root: TypedField<TRoot> } {
		const tree = new SharedTree(id, runtime, this.attributes, this.options, "SharedTree");
		tree.initializeLocal();
		const view = tree.schematize(this.options);
		const root = view.editableTree2(this.options.schema);
		return new ChannelWrapper(tree, root);
	}
}

/**
 * IChannel wrapper that exposes a "root".
 *
 * @remarks
 * This is handy when an implementing IChannelFactory, and want to return a type thats derived from another IChannel implementation.
 */
export class ChannelWrapper<T> implements IChannel {
	public constructor(private readonly inner: IChannel, public readonly root: T) {}

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
