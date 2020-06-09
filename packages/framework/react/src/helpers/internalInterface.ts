/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { ISharedMap } from "@fluidframework/map";

/**
 * The respective handles for the fluid schema params listed above
 */
export interface IFluidSchemaHandles {
    componentKeyMapHandle: IComponentHandle<ISharedMap>;
    viewMatchingMapHandle: IComponentHandle<ISharedMap>;
    fluidMatchingMapHandle: IComponentHandle<ISharedMap>;
}
