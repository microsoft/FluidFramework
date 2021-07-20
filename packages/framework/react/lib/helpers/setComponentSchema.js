/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Store the schema on to the shared synced state
 * @param syncedStateId - Unique ID to use for storing the synced state in the shared map
 * @param syncedState - The shared map that will be used to store the synced state
 * @param schemaHandles - Handles for the schema SharedMaps
 */
export function setSchema(syncedStateId, syncedState, schemaHandles) {
    syncedState.set(`schema-${syncedStateId}`, schemaHandles);
}
//# sourceMappingURL=setComponentSchema.js.map