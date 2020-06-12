/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap } from "@fluidframework/map";
import { IFluidSchemaHandles } from "./internalInterface";

/**
 * Returns the component schema stored on the synced state for this component
 * @param syncedStateId - Unique ID for this synced component's state
 * @param syncedState - The shared directory this component shared state is stored on
 */
export const getComponentSchema = (
    syncedStateId: string,
    syncedState: ISharedMap,
): IFluidSchemaHandles | undefined =>
    syncedState.get<IFluidSchemaHandles>(`componentSchema-${syncedStateId}`);
