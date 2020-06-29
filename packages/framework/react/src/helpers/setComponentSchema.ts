/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidSchemaHandles } from "./internalInterface";
import { ISyncedState } from "..";

/**
 * Store the component schema on to the shared synced state
 * @param syncedStateId - Unique ID to use for storing the component's synced state in the map
 * @param syncedState - The shared map that will be used to store the synced state
 * @param componentSchemaHandles - Handles for the schema SharedMaps
 */
export function setComponentSchema(
    syncedStateId: string,
    syncedState: ISyncedState,
    componentSchemaHandles: IFluidSchemaHandles,
): void {
    syncedState.set(`componentSchema-${syncedStateId}`, componentSchemaHandles);
}
