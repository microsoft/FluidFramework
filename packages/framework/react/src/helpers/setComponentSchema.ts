/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISyncedState } from "..";
import { IFluidSchemaHandles } from "./internalInterface";

/**
 * Store the schema on to the shared synced state
 * @param syncedStateId - Unique ID to use for storing the synced state in the shared map
 * @param syncedState - The shared map that will be used to store the synced state
 * @param schemaHandles - Handles for the schema SharedMaps
 */
export function setSchema(
    syncedStateId: string,
    syncedState: ISyncedState,
    schemaHandles: IFluidSchemaHandles,
): void {
    syncedState.set(`schema-${syncedStateId}`, schemaHandles);
}
