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
// TODO: To avoid this import making a cycle, this file should be moved up to the top level (src) before its exported and used.
import { SharedTree, SharedTreeOptions } from "../shared-tree";
import { fail } from "../util";
import { ITree } from "./tree";

/**
 * Configuration to specialize a Tree DDS for a particular use.
 * @alpha
 */
export interface TreeOptions extends SharedTreeOptions {
	/**
	 * Name appended to {@link @fluidframework/datastore-definitions#IChannelFactory."type"} to identify this factory configuration.
	 * @privateRemarks
	 * TODO: evaluate if this design is a good idea, or if "subtype" should be removed.
	 * TODO: evaluate if schematize should be separated from DDS construction.
	 */
	readonly subtype: string;
}

/**
 * A channel factory that creates an {@link ITree}.
 * @alpha
 */
export class TreeFactory implements IChannelFactory {
	public readonly type: string;
	public readonly attributes: IChannelAttributes;

	public constructor(private readonly options: TreeOptions) {
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
	): Promise<ITree> {
		const tree = new SharedTree(id, runtime, channelAttributes, this.options, "SharedTree");
		await tree.load(services);
		// TODO: make SharedTree actually implement the new ITree interface and return it here and below.
		fail("TODO");
		// return tree;
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): ITree {
		const tree = new SharedTree(id, runtime, this.attributes, this.options, "SharedTree");
		tree.initializeLocal();
		fail("TODO");
		// return tree;
	}
}
