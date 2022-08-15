/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelFactory, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { SharedPropertyTree } from "./propertyTree";
import { DeflatedPropertyTreeFactory, LZ4PropertyTreeFactory } from "./propertyTreeExtFactories";

/**
 * This class is the extension of SharedPropertyTree which compresses
 * the deltas and summaries communicated to the server by Deflate.
 */
export class DeflatedPropertyTree extends SharedPropertyTree {
    public static create(runtime: IFluidDataStoreRuntime, id?: string, queryString?: string) {
        return runtime.createChannel(id, DeflatedPropertyTreeFactory.Type) as DeflatedPropertyTree;
    }

    public static getFactory(): IChannelFactory {
        return new DeflatedPropertyTreeFactory();
    }
}

export class LZ4PropertyTree extends SharedPropertyTree {
    public static create(runtime: IFluidDataStoreRuntime, id?: string, queryString?: string) {
        return runtime.createChannel(id, LZ4PropertyTreeFactory.Type) as LZ4PropertyTree;
    }

    public static getFactory(): IChannelFactory {
        return new LZ4PropertyTreeFactory();
    }
}
