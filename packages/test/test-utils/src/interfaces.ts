/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ISharedMap } from "@fluidframework/map";
import {
	IFluidDataStoreContext,
	IFluidDataStoreChannel,
} from "@fluidframework/runtime-definitions";
import { IFluidLoadable } from "@fluidframework/core-interfaces";

/**
 * @alpha
 */
export interface IProvideTestFluidObject {
	readonly ITestFluidObject: ITestFluidObject;
}

/**
 * @alpha
 */
export interface ITestFluidObject extends IProvideTestFluidObject, IFluidLoadable {
	root: ISharedMap;
	readonly runtime: IFluidDataStoreRuntime;
	readonly channel: IFluidDataStoreChannel;
	readonly context: IFluidDataStoreContext;
	getSharedObject<T = any>(id: string): Promise<T>;
}
