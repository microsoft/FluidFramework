/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidObject } from "@fluidframework/core-interfaces/internal";
import type { IProvideFluidCodeDetailsComparer } from "./fluidPackage.js";
import type { IRuntimeFactory } from "./runtime.js";

/**
 * @alpha
 */
export interface IFluidModule {
	fluidExport: FluidObject<IRuntimeFactory & IProvideFluidCodeDetailsComparer>;
}
