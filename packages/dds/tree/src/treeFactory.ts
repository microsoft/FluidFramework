/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";

import type { SharedObjectKind } from "@fluidframework/shared-object-base";
import {
	type ISharedObject,
	type ISharedObjectKind,
	makeSharedObjectKind,
	type KernelArgs,
	type SharedKernelFactory,
	type SharedObjectOptions,
	type FactoryOut,
} from "@fluidframework/shared-object-base/internal";

import {
	SharedTreeKernel,
	type ITreePrivate,
	type SharedTreeOptions,
	type SharedTreeOptionsInternal,
	type SharedTreeKernelView,
} from "./shared-tree/index.js";
import type { ITree } from "./simple-tree/index.js";

import { Breakable } from "./util/index.js";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { SharedTreeFactoryType, SharedTreeAttributes } from "./sharedTreeAttributes.js";
import { FluidClientVersion } from "./codec/index.js";

/**
 * {@link ITreePrivate} extended with ISharedObject.
 * @remarks
 * This is used when integration testing this package with the Fluid runtime as it exposes the APIs the runtime consumes to manipulate the tree.
 */
export interface ISharedTree extends ISharedObject, ITreePrivate {}

/**
 * Creates a factory for shared tree kernels with the given options.
 * @remarks
 * Exposes {@link ITreePrivate} to allow access to internals in tests without a cast.
 * Code exposing this beyond this package will need to update to a more public type.
 */
function treeKernelFactory(
	options: SharedTreeOptionsInternal,
): SharedKernelFactory<SharedTreeKernelView> {
	function treeFromKernelArgs(args: KernelArgs): SharedTreeKernel {
		if (args.idCompressor === undefined) {
			throw new UsageError("IdCompressor must be enabled to use SharedTree");
		}
		const adjustedOptions = { ...options };
		// TODO: get default from runtime once something like runtime.minimumSupportedVersion exists.
		// Using default of 2.0 since that is the oldest version that supports SharedTree.
		adjustedOptions.minimumSupportedVersion ??= FluidClientVersion.v2_0;
		return new SharedTreeKernel(
			new Breakable("SharedTree"),
			args.sharedObject,
			args.serializer,
			args.submitLocalMessage,
			args.lastSequenceNumber,
			args.logger,
			args.idCompressor,
			adjustedOptions,
		);
	}

	return {
		create: (args: KernelArgs): FactoryOut<SharedTreeKernelView> => {
			const k = treeFromKernelArgs(args);
			return { kernel: k, view: k.view };
		},

		async loadCore(
			args: KernelArgs,
			storage: IChannelStorageService,
		): Promise<FactoryOut<SharedTreeKernelView>> {
			const k = treeFromKernelArgs(args);
			await k.loadCore(storage);
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
	const sharedObjectOptions: SharedObjectOptions<ITree> = {
		type: SharedTreeFactoryType,
		attributes: SharedTreeAttributes,
		telemetryContextPrefix: "fluid_sharedTree_",
		factory: treeKernelFactory(options),
	};

	return makeSharedObjectKind<ITree>(sharedObjectOptions);
}
