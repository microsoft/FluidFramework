/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";

/**
 * ! TODO
 * @legacy
 * @beta
 */
export interface IDelayLoadChannelFactory<T = unknown> extends IChannelFactory<T> {
	createAsync(runtime: IFluidDataStoreRuntime, id?: string): Promise<T>;
	loadObjectKindAsync(): Promise<void>;
}
