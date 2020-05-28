/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedDirectory } from "@fluidframework/map";

/**
 * Store the Fluid state onto the shared root
 * @param syncedStateId - Unique ID to use for storing the component's synced state in the root
 * @param root - The root shared directory that will be used to store the synced state
 * @param fluidState - The Fluid state to store on to the root, after converting components to their handles
 */
export function setFluidStateToRoot<SF>(
    syncedStateId: string,
    root: ISharedDirectory,
    fluidState: SF,
): void {
    const convertedState = {};
    Object.entries(fluidState).forEach(([fluidKey, fluidValue]) => {
        if (fluidValue.IComponentLoadable) {
            convertedState[fluidKey] = fluidValue.IComponentLoadable.handle;
        } else {
            convertedState[fluidKey] = fluidValue;
        }
    });
    root.set(`syncedState-${syncedStateId}`, convertedState);
}
