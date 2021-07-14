/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
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
/* eslint-enable @typescript-eslint/no-empty-interface */
