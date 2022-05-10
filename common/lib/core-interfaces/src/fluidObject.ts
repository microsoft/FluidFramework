/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
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
    readonly IFluidLoadable?: IFluidLoadable;
    /**
     * @deprecated - use `FluidObject<IFluidRunnable>` instead
     */
    readonly IFluidRunnable?: IFluidRunnable;
    /**
     * @deprecated - use `FluidObject<IFluidRouter>` instead
     */
    readonly IFluidRouter?: IFluidRouter;
    /**
     * @deprecated - use `FluidObject<IFluidHandleContext>` instead
     */
    readonly IFluidHandleContext?: IFluidHandleContext;
    /**
     * @deprecated - use `FluidObject<IFluidHandle>` instead
     */
    readonly IFluidHandle?: IFluidHandle;
    /**
     * @deprecated - use `FluidObject<IFluidSerializer>` instead
     */
    readonly IFluidSerializer?: IFluidSerializer;
}
