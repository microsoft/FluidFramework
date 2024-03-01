/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
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
import { SharedTree as SharedTreeImpl, SharedTreeOptions } from "./shared-tree/index.js";
import {
	ITree,
	ImplicitFieldSchema,
	TreeConfiguration,
	TreeFieldFromImplicitField,
	TreeView,
} from "./simple-tree/index.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * A channel factory that creates an {@link ITree}.
 * @internal
 */
export class TreeFactory implements IChannelFactory {
	public readonly type: string;
	public readonly attributes: IChannelAttributes;

	public constructor(private readonly options: SharedTreeOptions) {
		this.type = "https://graph.microsoft.com/types/tree";

		this.attributes = {
			type: this.type,
			snapshotFormatVersion: "0.0.0",
			packageVersion: pkgVersion,
		};
	}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<ITree> {
		const tree = new SharedTreeImpl(id, runtime, channelAttributes, this.options, "SharedTree");
		await tree.load(services);
		return tree;
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): ITree {
		const tree = new SharedTreeImpl(id, runtime, this.attributes, this.options, "SharedTree");
		tree.initializeLocal();
		return tree;
	}
}

/**
 * SharedTree is a hierarchical data structure for collaboratively editing JSON-like trees
 * of objects, arrays, and other data types.
 *
 * @public
 */
export class SharedTree implements ITree {
	// The IFluidContainer ContainerSchema currently requires a constructable class that
	// implements the union of IChannel and the interface to be returned to the user.
	//
	// Temporarily, we provide one until the following work items is addressed:
	// TODO: https://dev.azure.com/fluidframework/internal/_workitems/edit/6458

	public static getFactory(): IChannelFactory {
		return new TreeFactory({});
	}

	public schematize<TRoot extends ImplicitFieldSchema>(
		config: TreeConfiguration<TRoot>,
	): TreeView<TreeFieldFromImplicitField<TRoot>> {
		return this.useFactory();
	}

	private useFactory(): never {
		throw new Error("Use factory to create instance.");
	}

	public get id(): string {
		return this.useFactory();
	}

	public get attributes(): IChannelAttributes {
		return this.useFactory();
	}

	public get handle(): IFluidHandle {
		return this.useFactory();
	}

	public get IFluidLoadable(): IFluidLoadable {
		return this.useFactory();
	}

	public getAttachSummary(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
	): ISummaryTreeWithStats {
		return this.useFactory();
	}

	public async summarize(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined,
	): Promise<ISummaryTreeWithStats> {
		return this.useFactory();
	}

	public isAttached(): boolean {
		return this.useFactory();
	}

	public connect(services: IChannelServices): void {
		return this.useFactory();
	}

	public getGCData(fullGC?: boolean | undefined): IGarbageCollectionData {
		return this.useFactory();
	}
}
