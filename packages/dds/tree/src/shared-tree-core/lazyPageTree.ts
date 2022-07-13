/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObjectEvents, SharedObject } from "@fluidframework/shared-object-base";

// TODO: consider moving LazyPageTree out into its own directory since it needs a lot fewer
// dependencies than shared-tree-core.

/**
 * Abstract DDS providing incremental summarization and partial checkouts of pages of data.
 */
export abstract class LazyPageTree extends SharedObject<ILazyPageTreeEvents> {
 // TODO
}

export interface ILazyPageTreeEvents extends ISharedObjectEvents {
    (event: "updated", listener: () => void): unknown;
}
