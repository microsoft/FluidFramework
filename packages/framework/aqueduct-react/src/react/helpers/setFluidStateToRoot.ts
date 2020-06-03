/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedDirectory, SharedMap } from "@fluidframework/map";
import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { FluidComponentMap } from "../interface";

/**
 * Store the Fluid state onto the shared root
 * @param syncedStateId - Unique ID to use for storing the component's synced state in the root
 * @param root - The root shared directory that will be used to store the synced state
 * @param fluidState - The Fluid state to store on to the root, after converting components to their handles
 */
export function setFluidStateToRoot<SF>(
    syncedStateId: string,
    root: ISharedDirectory,
    runtime: IComponentRuntime,
    componentMap: FluidComponentMap,
    fluidState: SF,
): IComponentHandle {
    const storedStateHandle = root.get<IComponentHandle>(`syncedState-${syncedStateId}`);
    const storedState = ((storedStateHandle !== undefined && componentMap.get(storedStateHandle.path)?.component)
        || SharedMap.create(runtime)) as SharedMap;
    Object.entries(fluidState).forEach(([fluidKey, fluidValue]) => {
        if (fluidValue.IComponentLoadable) {
            storedState.set(fluidKey, fluidValue.IComponentLoadable.handle);
        } else {
            storedState.set(fluidKey, fluidValue);
        }
    });
    root.set(`syncedState-${syncedStateId}`, storedState.handle);
    return storedState.handle;
}
