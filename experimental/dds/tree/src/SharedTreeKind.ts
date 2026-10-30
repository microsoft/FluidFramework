/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidDataStoreRuntime } from '@fluidframework/datastore-definitions/internal';

import type { ISharedTree } from './ISharedTree.js';
import { SharedTree as SharedTreeImplementation, type SharedTreeArgs, type SharedTreeFactory } from './SharedTree.js';
import type { WriteFormat } from './persisted-types/index.js';

/**
 * Creates and loads experimental shared trees without access to the implementation class.
 *
 * @remarks
 * The default factory uses the latest write format.
 * Before a write-format upgrade, all collaborating clients must support the new format.
 * See the {@link https://github.com/microsoft/FluidFramework/blob/main/experimental/dds/tree/docs/Write-Format.md | write-format documentation}.
 *
 * @alpha
 */
export const SharedTree: {
	/**
	 * Creates a tree with the default initial node.
	 * @param runtime - The runtime that owns the tree.
	 * @param id - An optional channel ID.
	 * @returns The new tree.
	 */
	create(runtime: IFluidDataStoreRuntime, id?: string): ISharedTree;

	/**
	 * Gets a factory for write format 0.0.2.
	 * @param args - The write format and optional configuration.
	 * @returns The configured factory.
	 */
	getFactory(...args: SharedTreeArgs<WriteFormat.v0_0_2>): SharedTreeFactory;

	/**
	 * Gets a factory for write format 0.1.1.
	 * @param args - The write format and optional configuration.
	 * @returns The configured factory.
	 */
	getFactory(...args: SharedTreeArgs<WriteFormat.v0_1_1>): SharedTreeFactory;

	/**
	 * Gets a factory with the latest write format and default options.
	 * @returns The default factory.
	 */
	getFactory(): SharedTreeFactory;
} = {
	create: SharedTreeImplementation.create,
	getFactory: SharedTreeImplementation.getFactory,
};

/**
 * The interface for an experimental shared tree.
 * @alpha
 */
export type SharedTree = ISharedTree;
