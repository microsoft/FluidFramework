/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";

/**
 * A document is a collection of shared types.
 */
export class Document {
    /**
     * Constructs a new document from the provided details
     */
    constructor(
        public readonly runtime: IFluidDataStoreRuntime,
        public readonly context: IFluidDataStoreContext,
    ) { }
}
