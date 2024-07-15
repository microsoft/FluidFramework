/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import { ISharedMap } from "@fluidframework/map/internal";
import {
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
} from "@fluidframework/runtime-definitions/internal";

/**
 * @legacy
 * @alpha
 */
export interface IProvideTestFluidObject {
	readonly ITestFluidObject: ITestFluidObject;
}

/**
 * @legacy
 * @alpha
 */
export interface ITestFluidObject extends IProvideTestFluidObject, IFluidLoadable {
	root: ISharedMap;
	readonly runtime: IFluidDataStoreRuntime;
	readonly channel: IFluidDataStoreChannel;
	readonly context: IFluidDataStoreContext;
	getSharedObject<T = any>(id: string): Promise<T>;
}
