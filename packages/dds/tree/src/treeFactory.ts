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

import { pkgVersion } from "./packageVersion.js";
import { SharedTree as SharedTreeImpl, SharedTreeOptions } from "./shared-tree/index.js";
import { ITree } from "./simple-tree/index.js";

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
 * @public
 */
export const SharedTree: ISharedObjectKind<ITree> = configuredSharedTree({});

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
 * TODO:
 * Expose Ajv validator for better error message quality somehow.
 * Maybe as part of a test utils or dev-tool package?
 * @internal
 */
export function configuredSharedTree(options: SharedTreeOptions): ISharedObjectKind<ITree> {
	const factory = new TreeFactory(options);
	return {
		getFactory(): IChannelFactory<ITree> {
			return factory;
		},

		create(runtime: IFluidDataStoreRuntime, id?: string): ITree {
			return runtime.createChannel(id, TreeFactory.type) as ITree;
		},
	};
}
