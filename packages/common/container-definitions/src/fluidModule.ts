/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidObject } from "@fluidframework/core-interfaces";
import type { IProvideFluidCodeDetailsComparer } from "./fluidPackage";
import type { IRuntimeFactory } from "./runtime";

/**
 * @alpha
 */
export interface IFluidModule {
	fluidExport: FluidObject<IRuntimeFactory & IProvideFluidCodeDetailsComparer>;
}
