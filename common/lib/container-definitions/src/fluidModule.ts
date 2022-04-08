/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObject, IFluidObject, IProvideFluidCodeDetailsComparer } from "@fluidframework/core-interfaces";
import { IRuntimeFactory } from "./runtime";

export interface IFluidModule {
    fluidExport: IFluidObject & FluidObject<IRuntimeFactory & IProvideFluidCodeDetailsComparer>;
}
