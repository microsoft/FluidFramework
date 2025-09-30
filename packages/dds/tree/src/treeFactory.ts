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
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	SharedTreeKernel,
	type ITreePrivate,
	type SharedTreeOptions,
	type SharedTreeOptionsBeta,
	type SharedTreeOptionsInternal,
	type SharedTreeKernelView,
} from "./shared-tree/index.js";
import { SharedTreeFactoryType, SharedTreeAttributes } from "./sharedTreeAttributes.js";
import type { ITree } from "./simple-tree/index.js";
import { Breakable } from "./util/index.js";
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
		// TODO: get default from runtime once something like runtime.oldestCompatibleClient exists.
		// Using default of 2.0 since that is the oldest version that supports SharedTree.
		adjustedOptions.oldestCompatibleClient ??= FluidClientVersion.v2_0;
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
 * @legacy @beta
 */
export const SharedTree = configuredSharedTree({});

/**
 * {@link SharedTree} but allowing a non-default configuration.
 * @remarks
 * This is useful for debugging and testing.
 * For example it can be used to opt into extra validation or see if opting out of some optimizations fixes an issue.
 *
 * With great care, and knowledge of the support and stability of the options exposed here,
 * this can also be used to opt into some features early or for performance tuning.
 *
 * @example
 * ```typescript
 * import {
 * 	configuredSharedTreeBeta,
 * 	ForestTypeReference,
 * } from "fluid-framework/beta";
 * const SharedTree = configuredSharedTree({
 * 	forest: ForestTypeReference,
 * });
 * ```
 * @privateRemarks
 * The Legacy `ISharedObjectKind<ITree>` type is omitted here for simplicity.
 * @beta
 */
export function configuredSharedTreeBeta(
	options: SharedTreeOptionsBeta,
): SharedObjectKind<ITree> {
	return configuredSharedTree(options);
}

/**
 * {@link configuredSharedTreeBeta} including the legacy `ISharedObjectKind` type.
 * @privateRemarks
 * This is given a different export name (with legacy appended) to avoid the need to do the special reexport with different types from the fluid-framework package.
 * @legacy @beta
 */
export function configuredSharedTreeBetaLegacy(
	options: SharedTreeOptionsBeta,
): ISharedObjectKind<ITree> & SharedObjectKind<ITree> {
	return configuredSharedTree(options);
}

/**
 * {@link configuredSharedTreeBetaLegacy} but including `@alpha` options.
 *
 * @example
 * ```typescript
 * import {
 * 	TreeCompressionStrategy,
 * 	configuredSharedTree,
 * 	FormatValidatorBasic,
 * 	ForestTypeReference,
 * } from "@fluidframework/tree/internal";
 * const SharedTree = configuredSharedTree({
 * 	forest: ForestTypeReference,
 * 	jsonValidator: FormatValidatorBasic,
 * 	treeEncodeType: TreeCompressionStrategy.Uncompressed,
 * });
 * ```
 * @privateRemarks
 * This should be legacy, but has to be internal due to no alpha+legacy being setup yet.
 *
 * This should be renamed to `configuredSharedTreeAlpha` to avoid colliding with the eventual public version which will have less options.
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
