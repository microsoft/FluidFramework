/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ISharedMap } from "@fluidframework/map";

/**
 * The respective handles for the Fluid schema params listed above
 */
export interface IFluidSchemaHandles {
    viewMatchingMapHandle: IFluidHandle<ISharedMap>;
    fluidMatchingMapHandle: IFluidHandle<ISharedMap>;
    storedHandleMapHandle: IFluidHandle<ISharedMap>;
}
