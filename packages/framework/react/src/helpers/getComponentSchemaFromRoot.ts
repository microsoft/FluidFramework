/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap } from "@fluidframework/map";
import { IFluidSchemaHandles } from "./internalInterface";

/**
 * Returns the component schema stored on the root for this component
 * @param syncedStateId - Unique ID for this synced component's state
 * @param root - The shared directory this component shared state is stored on
 */
export const getComponentSchemaFromRoot = (
    syncedStateId: string,
    root: ISharedMap,
): IFluidSchemaHandles | undefined =>
    root.get<IFluidSchemaHandles>(`componentSchema-${syncedStateId}`);
