/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidObject } from "@fluidframework/component-core-interfaces";

export interface IFluidModule {
    fluidExport: IFluidObject & IFluidObject;
}
