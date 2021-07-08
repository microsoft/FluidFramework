/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Returns the schema stored on the synced state for this Fluid object
 * @param syncedStateId - Unique ID for this synced data object's state
 * @param syncedState - The shared map this Fluid shared state is stored on
 */
export const getSchema = (syncedStateId, syncedState) => syncedState.get(`schema-${syncedStateId}`);
//# sourceMappingURL=getSchema.js.map