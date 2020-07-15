/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IFluidObject } from "@fluidframework/component-core-interfaces";

export interface IFluidModule {
    fluidExport: IComponent & IFluidObject;
}
