/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SharedObjectKind } from "@fluidframework/shared-object-base";
import {
	type ISharedObjectKind,
	makeSharedObjectKind,
	type KernelArgs,
	type SharedKernelFactory,
	type SharedObjectOptions,
} from "@fluidframework/shared-object-base/internal";

import {
	SharedTree as SharedTreeImpl,
	type ISharedTree,
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
 * Creates a factory for shared tree kernels with the given options.
 * @internal
 */
export function treeKernelFactory(
	options: SharedTreeOptionsInternal,
): SharedKernelFactory<ISharedTree> {
	return {
		create: (args: KernelArgs) => {
			const k = new SharedTreeImpl(args, options);
			return { kernel: k, view: k.view };
		},
	};
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
	return makeSharedObjectKind<ITree>(configuredSharedTreeOptions(options));
}

export function configuredSharedTreeOptions(
	options: SharedTreeOptions,
): SharedObjectOptions<ITree> {
	return {
		type: SharedTreeFactoryType,
		attributes: SharedTreeAttributes,
		telemetryContextPrefix: "fluid_sharedTree_",
		factory: treeKernelFactory(options),
	};
}
