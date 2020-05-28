/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedDirectory } from "@fluidframework/map";
import { IFluidSchemaHandles } from "../interface";

/**
 * Store the component schema on to the shared root
 * @param syncedStateId - Unique ID to use for storing the component's synced state in the root
 * @param root - The root shared directory that will be used to store the synced state
 * @param componentSchemaHandles - Handles for the schema SharedMaps
 */
export function setComponentSchemaToRoot(
    syncedStateId: string,
    root: ISharedDirectory,
    componentSchemaHandles: IFluidSchemaHandles,
): void {
    root.set(`componentSchema-${syncedStateId}`, componentSchemaHandles);
}
