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
import { pkgVersion } from "./packageVersion.js";
import { SharedTree as SharedTreeImpl, SharedTreeOptions } from "./shared-tree/index.js";
import { ITree } from "./simple-tree/index.js";

/**
 * A channel factory that creates an {@link ITree}.
 * @internal
 */
export class TreeFactory implements IChannelFactory<ITree> {
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
 * @remarks
 * This implements {@link @fluidframework/fluid-static#SharedObjectClass}.
 * @privateRemarks
 * Due to the dependency structure and the placement of that interface SharedObjectClass,
 * this interface implementation can not be recorded in the type here.
 * @public
 */
export const SharedTree = {
	/**
	 * Gets the factory this factory is a wrapper for.
	 */
	getFactory(): IChannelFactory<ITree> {
		return new TreeFactory({});
	},
};
