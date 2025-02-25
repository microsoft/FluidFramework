/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import type { SharedObjectKind } from "@fluidframework/shared-object-base";
import {
	type ISharedObjectKind,
	createSharedObjectKind,
} from "@fluidframework/shared-object-base/internal";

import {
	SharedTree as SharedTreeImpl,
	type SharedTreeOptions,
	type SharedTreeOptionsInternal,
} from "./shared-tree/index.js";
import type { ITree } from "./simple-tree/index.js";

import { pkgVersion } from "./packageVersion.js";

/**
 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory."type"}
 * @alpha
 * @legacy
 */
export const SharedTreeFactoryType = "https://graph.microsoft.com/types/tree";

/**
 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.attributes}
 * @alpha
 * @legacy
 */
export const SharedTreeAttributes: IChannelAttributes = {
	type: SharedTreeFactoryType,
	snapshotFormatVersion: "0.0.0",
	packageVersion: pkgVersion,
};

/**
 * A channel factory that creates an {@link ITree}.
 */
export class TreeFactory implements IChannelFactory<ITree> {
	public static Type: string = SharedTreeFactoryType;
	public readonly type: string = SharedTreeFactoryType;

	public readonly attributes: IChannelAttributes = SharedTreeAttributes;

	public constructor(private readonly options: SharedTreeOptionsInternal) {}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<SharedTreeImpl> {
		const tree = new SharedTreeImpl(id, runtime, channelAttributes, this.options);
		await tree.load(services);
		return tree;
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): SharedTreeImpl {
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
