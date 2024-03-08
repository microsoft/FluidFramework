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
import { ISharedObjectKind } from "@fluidframework/shared-object-base";
import { SharedTree as SharedTreeImpl, SharedTreeOptions } from "./shared-tree/index.js";
import { ITree } from "./simple-tree/index.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * A channel factory that creates an {@link ITree}.
 */
export class TreeFactory implements IChannelFactory<ITree> {
	public static readonly type = "https://graph.microsoft.com/types/tree";
	public static readonly attributes: IChannelAttributes = {
		type: this.type,
		snapshotFormatVersion: "0.0.0",
		packageVersion: pkgVersion,
	};

	public readonly type = TreeFactory.type;
	public readonly attributes: IChannelAttributes = TreeFactory.attributes;

	public constructor(private readonly options: SharedTreeOptions) {}

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
 * SharedTree is a hierarchical data structure for collaboratively editing strongly typed JSON-like trees
 * of objects, arrays, and other data types.
 * @privateRemarks
 * Due to the dependency structure and the placement of that interface SharedObjectClass,
 * this interface implementation can not be recorded in the type here.
 * @public
 */
export const SharedTree: ISharedObjectKind<ITree> = {
	getFactory(): IChannelFactory<ITree> {
		return new TreeFactory({});
	},

	create(runtime: IFluidDataStoreRuntime, id?: string): ITree {
		return runtime.createChannel(id, TreeFactory.type) as ITree;
	},
};
