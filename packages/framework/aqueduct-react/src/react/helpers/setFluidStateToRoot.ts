/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedDirectory, SharedMap } from "@fluidframework/map";
import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { FluidComponentMap, IViewConverter } from "../interface";

/**
 * Store the Fluid state onto the shared root
 * @param syncedStateId - Unique ID to use for storing the component's synced state in the root
 * @param root - The root shared directory that will be used to store the synced state
 * @param fluidState - The Fluid state to store on to the root, after converting components to their handles
 */
export function setFluidStateToRoot<SV,SF>(
    syncedStateId: string,
    root: ISharedDirectory,
    runtime: IComponentRuntime,
    componentMap: FluidComponentMap,
    fluidState: SF,
    fluidToView?: Map<keyof SF, IViewConverter<SV,SF>>,
): IComponentHandle {
    const storedStateHandle = root.get<IComponentHandle>(`syncedState-${syncedStateId}`);
    const storedState = ((storedStateHandle !== undefined && componentMap.get(storedStateHandle.path)?.component)
        || SharedMap.create(runtime)) as SharedMap;
    Object.entries(fluidState).forEach(([fluidKey, fluidValue]) => {
        const rootKey = fluidToView?.get(fluidKey as keyof SF)?.rootKey;
        if (fluidValue.IComponentLoadable) {
            storedState.set(fluidKey, fluidValue.IComponentLoadable.handle);
        } else if ((rootKey && !fluidToView?.get(fluidKey as keyof SF)?.fluidObjectType)) {
            storedState.set(fluidKey, fluidValue);
            root.set(rootKey, fluidValue);
        } else if (!rootKey) {
            storedState.set(fluidKey, fluidValue);
        }
    });
    root.set(`syncedState-${syncedStateId}`, storedState.handle);
    return storedState.handle;
}
