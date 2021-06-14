/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISyncedState } from "../interface";
import { IFluidSchemaHandles } from "./internalInterface";

/**
 * Returns the schema stored on the synced state for this Fluid object
 * @param syncedStateId - Unique ID for this synced data object's state
 * @param syncedState - The shared map this Fluid shared state is stored on
 */
export const getSchema = (
    syncedStateId: string,
    syncedState: ISyncedState,
): IFluidSchemaHandles | undefined =>
    syncedState.get<IFluidSchemaHandles>(`schema-${syncedStateId}`);
