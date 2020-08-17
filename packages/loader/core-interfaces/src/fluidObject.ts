/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IProvideFluidConfiguration,
    IProvideFluidLoadable,
    IProvideFluidRunnable,
} from "./fluidLoadable";
import { IProvideFluidRouter } from "./fluidRouter";
import { IProvideFluidHandle, IProvideFluidHandleContext } from "./handles";
import { IProvideFluidSerializer } from "./serializer";

/* eslint-disable @typescript-eslint/no-empty-interface */
// TODO: Remove once all usages are moved over to FluidDataInterfaceCatalog
export interface IFluidObject extends
    Readonly<Partial<
        IProvideFluidLoadable
        & IProvideFluidRunnable
        & IProvideFluidRouter
        & IProvideFluidHandleContext
        & IProvideFluidConfiguration
        & IProvideFluidHandle
        & IProvideFluidSerializer>> {
}

export interface FluidDataInterfaceCatalog extends
    Readonly<
        IProvideFluidLoadable
        & IProvideFluidRunnable
        & IProvideFluidRouter
        & IProvideFluidHandleContext
        & IProvideFluidConfiguration
        & IProvideFluidHandle
        & IProvideFluidSerializer> {
}
/* eslint-enable @typescript-eslint/no-empty-interface */

/** Prepare the given object to be queried for the interfaces in the Fluid Data Interface Catalog */
export const queryObject = (obj: unknown) => obj as Partial<FluidDataInterfaceCatalog>;
