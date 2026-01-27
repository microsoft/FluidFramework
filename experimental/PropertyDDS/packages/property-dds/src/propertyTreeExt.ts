/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";

import { SharedPropertyTree } from "./propertyTree.js";
import {
	DeflatedPropertyTreeFactory,
	LZ4PropertyTreeFactory,
} from "./propertyTreeExtFactories.js";

/**
 * This class is the extension of SharedPropertyTree which compresses
 * the deltas and summaries communicated to the server by Deflate.
 * @internal
 */
export class DeflatedPropertyTree extends SharedPropertyTree {
	public static create(runtime: IFluidDataStoreRuntime, id?: string, queryString?: string) {
		return runtime.createChannel(id, DeflatedPropertyTreeFactory.Type) as DeflatedPropertyTree;
	}

	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	public static getFactory(): IChannelFactory {
		return new DeflatedPropertyTreeFactory();
	}
}

/**
 * @internal
 */
export class LZ4PropertyTree extends SharedPropertyTree {
	public static create(runtime: IFluidDataStoreRuntime, id?: string, queryString?: string) {
		return runtime.createChannel(id, LZ4PropertyTreeFactory.Type) as LZ4PropertyTree;
	}

	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	public static getFactory(): IChannelFactory {
		return new LZ4PropertyTreeFactory();
	}
}
