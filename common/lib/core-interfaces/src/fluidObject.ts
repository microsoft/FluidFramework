/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidConfiguration,
    IFluidLoadable,
    IFluidRunnable,
} from "./fluidLoadable";
import { IFluidRouter } from "./fluidRouter";
import { IFluidHandle, IFluidHandleContext } from "./handles";
import { IFluidSerializer } from "./serializer";

/**
 * @deprecated Use `FluidObject` or the interface directly instead
 */
export interface IFluidObject {

    /**
     * @deprecated - use `FluidObject<IFluidLoadable>` instead
     */
    IFluidLoadable?: IFluidLoadable;
    /**
     * @deprecated - use `FluidObject<IFluidRunnable>` instead
     */
    IFluidRunnable?: IFluidRunnable
    /**
     * @deprecated - use `FluidObject<IFluidRouter>` instead
     */
    IFluidRouter?: IFluidRouter;
    /**
     * @deprecated - use `FluidObject<IFluidHandleContext>` instead
     */
    IFluidHandleContext?: IFluidHandleContext;
    /**
     * @deprecated - use `FluidObject<IFluidConfiguration>` instead
     */
    IFluidConfiguration?: IFluidConfiguration;
    /**
     * @deprecated - use `FluidObject<IFluidHandle>` instead
     */
    IFluidHandle?: IFluidHandle;
    /**
     * @deprecated - use `FluidObject<IFluidSerializer>` instead
     */
    IFluidSerializer?: IFluidSerializer;
}
