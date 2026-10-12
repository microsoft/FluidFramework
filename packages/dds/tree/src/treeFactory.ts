/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SharedObjectKind } from "@fluidframework/shared-object-base";
import type {
	ISharedObject,
	ISharedObjectKind,
	SharedObjectKindAlpha,
} from "@fluidframework/shared-object-base/internal";

import {
	type ITreePrivate,
	type SharedTreeOptions,
	type SharedTreeOptionsBeta,
	RevertibleSupportEnabled,
} from "./shared-tree/index.js";
import type { ITree } from "./simple-tree/index.js";
import { configuredSharedTreeInternal, resolveOptions } from "./treeFactoryCore.js";

/**
 * {@link ITreePrivate} extended with ISharedObject.
 * @remarks
 * This is used when integration testing this package with the Fluid runtime as it exposes the APIs the runtime consumes to manipulate the tree.
 */
export interface ISharedTree extends ISharedObject, ITreePrivate {}

/**
 * SharedTree is a hierarchical data structure for collaboratively editing strongly typed JSON-like trees
 * of objects, arrays, and other data types.
 * @legacy @beta
 */
export const SharedTree: ISharedObjectKind<ITree> & SharedObjectKind<ITree> =
	configuredSharedTree({});

/**
 * {@link SharedTree} but without legacy types, and with alpha types.
 * @alpha
 */
export const SharedTreeAlpha: SharedObjectKindAlpha<ITree> = configuredSharedTree({});

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
 * {@link configuredSharedTreeBeta} but including the alpha {@link SharedTreeOptions}.
 * @alpha
 */
export function configuredSharedTreeAlpha(
	options: SharedTreeOptions,
): SharedObjectKind<ITree> {
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
): ISharedObjectKind<ITree> & SharedObjectKindAlpha<ITree> {
	const internalOptions = resolveOptions(
		options,
		options.revertibleSupport ?? RevertibleSupportEnabled,
	);
	return configuredSharedTreeInternal(internalOptions);
}

export { configuredSharedTreeInternal, resolveOptions } from "./treeFactoryCore.js";
