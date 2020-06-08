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
 * @param runtime - The component runtime
 * @param componentMap - A map of component handle paths to their respective components
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 * @param newFluidState - The Fluid state to store on to the root, after converting components to their handles
 */
export function setFluidStateToRoot<SV,SF>(
    syncedStateId: string,
    root: ISharedDirectory,
    runtime: IComponentRuntime,
    componentMap: FluidComponentMap,
    fluidToView: Map<keyof SF, IViewConverter<SV,SF>>,
    newFluidState?: SF,
): IComponentHandle {
    const storedStateHandle = root.get<IComponentHandle>(`syncedState-${syncedStateId}`);
    let storedState = componentMap.get(storedStateHandle?.path)?.component as SharedMap;
    if (storedStateHandle === undefined || storedState === undefined) {
        const newState = SharedMap.create(runtime);
        componentMap.set(newState.handle.path, {
            component: newState,
            isRuntimeMap: true,
        });
        storedState = newState;
    }
    if (storedState === undefined) {
        throw Error("Failed to fetch synced state from root");
    }
    for (const key of fluidToView.keys()) {
        const fluidKey = key as string;
        const rootKey = fluidToView?.get(fluidKey as keyof SF)?.rootKey;
        const createCallback = fluidToView?.get(fluidKey as keyof SF)?.sharedObjectCreate;
        if (createCallback) {
            if (storedState.get(fluidKey) === undefined) {
                const sharedObject = createCallback(runtime);
                componentMap.set(sharedObject.handle.path, {
                    component: sharedObject,
                    listenedEvents: fluidToView?.get(fluidKey as keyof SF)?.listenedEvents || ["valueChanged"],
                });
                storedState.set(fluidKey, sharedObject.handle);
                if (rootKey) {
                    root.set(rootKey, sharedObject.handle);
                }
            } else {
                storedState.set(fluidKey, storedState.get(fluidKey));
                if (rootKey) {
                    root.set(rootKey, root.get(rootKey));
                }
            }
        } else if (rootKey) {
            const value = newFluidState ? newFluidState[fluidKey] : root.get(rootKey);
            root.set(rootKey, value);
            storedState.set(fluidKey, value);
        } else {
            const value = newFluidState ? newFluidState[fluidKey] : storedState.get(fluidKey);
            storedState.set(fluidKey, value);
        }
    }
    root.set(`syncedState-${syncedStateId}`, storedState.handle);
    return storedState.handle;
}
