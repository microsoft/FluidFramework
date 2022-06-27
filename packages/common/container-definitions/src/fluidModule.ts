/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidObject } from "@fluidframework/core-interfaces";
import { IProvideFluidCodeDetailsComparer } from "./fluidPackage";
import { IRuntimeFactory } from "./runtime";

export interface IFluidModule {
    fluidExport: FluidObject<IRuntimeFactory & IProvideFluidCodeDetailsComparer>;
}
