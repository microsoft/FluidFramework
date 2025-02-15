/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import type { SharedObjectKind } from "@fluidframework/shared-object-base";
import {
	type ISharedObjectKind,
	makeSharedObjectKind,
	type KernelArgs,
	type SharedKernelFactory,
	type SharedObjectOptions,
	type FactoryOut,
} from "@fluidframework/shared-object-base/internal";

import {
	// eslint-disable-next-line import/no-deprecated
	SharedTree as SharedTreeImpl,
	type ITreeInternal,
	type ITreePrivate,
	type SharedTreeOptions,
	type SharedTreeOptionsInternal,
} from "./shared-tree/index.js";
import type { ITree } from "./simple-tree/index.js";

import { pkgVersion } from "./packageVersion.js";
import { SharedTreeKernel } from "./shared-tree/index.js";
import { Breakable } from "./util/index.js";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

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
 * @remarks
 * Exposes {@link ITreePrivate} to allow access to internals in tests without a cast.
 */
function treeKernelFactoryPrivate(
	options: SharedTreeOptionsInternal,
): SharedKernelFactory<ITreePrivate> {
	function treeFromKernelArgs(args: KernelArgs): SharedTreeKernel {
		if (args.idCompressor === undefined) {
			throw new UsageError("IdCompressor must be enabled to use SharedTree");
		}
		return new SharedTreeKernel(
			new Breakable("Shared Tree"),
			args.sharedObject,
			args.serializer,
			args.submitLocalMessage,
			args.lastSequenceNumber,
			args.logger,
			args.idCompressor,
			options,
		);
	}

	return {
		create: (args: KernelArgs): FactoryOut<ITreePrivate> => {
			if (args.idCompressor === undefined) {
				throw new UsageError("IdCompressor must be enabled to use SharedTree");
			}
			const k = treeFromKernelArgs(args);
			return { kernel: k, view: k.view };
		},

		async loadCore(
			args: KernelArgs,
			storage: IChannelStorageService,
		): Promise<FactoryOut<ITreePrivate>> {
			const k = treeFromKernelArgs(args);
			await k.loadCore(storage);
			return { kernel: k, view: k.view };
		},
	};
}

/**
 * Creates a factory for shared tree kernels with the given options.
 * @internal
 */
export const treeKernelFactory: (
	options: SharedTreeOptions,
) => SharedKernelFactory<ITreeInternal> = treeKernelFactoryPrivate;

/**
 * A channel factory that creates an {@link ITree}.
 * @deprecated Use the public APIs instead if a SHaredObject is needed, or construct the internal types directly if not.
 */
/* eslint-disable import/no-deprecated */
export class TreeFactory implements IChannelFactory<SharedTreeImpl> {
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
/* eslint-enable import/no-deprecated */

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
