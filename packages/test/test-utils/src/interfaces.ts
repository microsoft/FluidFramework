/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ISharedMap } from "@fluidframework/map";
import { IFluidDataStoreContext, IFluidDataStoreChannel } from "@fluidframework/runtime-definitions";
import { IFluidLoadable } from "@fluidframework/core-interfaces";

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideTestFluidComponent>> { }
}

export interface IProvideTestFluidComponent {
    readonly ITestFluidComponent: ITestFluidComponent;
}

export interface ITestFluidComponent extends IProvideTestFluidComponent, IFluidLoadable {
    root: ISharedMap;
    readonly runtime: IFluidDataStoreRuntime;
    readonly channel: IFluidDataStoreChannel;
    readonly context: IFluidDataStoreContext;
    getSharedObject<T = any>(id: string): Promise<T>;
}
