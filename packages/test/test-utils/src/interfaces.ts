/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import type { ISharedMap } from "@fluidframework/map/internal";
import type {
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
} from "@fluidframework/runtime-definitions/internal";

/**
 * @legacy @beta
 */
export interface IProvideTestFluidObject {
	readonly ITestFluidObject: ITestFluidObject;
}

/**
 * @legacy @beta
 */
export interface ITestFluidObject
	extends IProvideTestFluidObject,
		IFluidLoadable {
	root: ISharedMap;
	readonly runtime: IFluidDataStoreRuntime;
	readonly channel: IFluidDataStoreChannel;
	readonly context: IFluidDataStoreContext;
	getSharedObject<T = any>(id: string): Promise<T>;
}
