/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createSharedObjectKind } from '@fluidframework/shared-object-base/internal';

import type { ISharedTree } from './ISharedTree.js';
import { SharedTreeFactory } from './SharedTree.js';

/**
 * Creates and identifies experimental shared trees.
 *
 * @remarks
 * Before you call `SharedTree.create`, register a factory with the data store runtime.
 * The factory returned by `SharedTree.getFactory()` uses the default write format and options.
 * For different settings, register a {@link SharedTreeFactory} with the required write format and options instead.
 * `SharedTree.create` then uses that registered factory and returns an {@link ISharedTree} with those settings.
 *
 * @alpha
 */
export const SharedTree = createSharedObjectKind<ISharedTree>(SharedTreeFactory);

/**
 * The instance type for trees created with the {@link (SharedTree:variable)} factory object.
 * @alpha
 */
export type SharedTree = ISharedTree;
