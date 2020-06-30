/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap, SharedMap } from "@fluidframework/map";
import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import {
    FluidComponentMap,
    IViewConverter,
    IFluidConverter,
    ISyncedState,
} from "../interface";

/**
 * Store the Fluid state onto the shared synced state
 * @param syncedStateId - Unique ID to use for storing the component's synced state in the map
 * @param syncedState - The shared map that will be used to store the synced state
 * @param runtime - The component runtime
 * @param componentMap - A map of component handle paths to their respective components
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 * @param newFluidState - The Fluid state to store on to the syncedState, after converting components to their handles
 */
export function setFluidState<SV, SF>(
    syncedStateId: string,
    syncedState: ISyncedState,
    runtime: IComponentRuntime,
    componentMap: FluidComponentMap,
    fluidToView: Map<keyof SF, IViewConverter<SV, SF>>,
    newViewState: SV,
    newFluidState?: SF,
    viewToFluid?: Map<keyof SV, IFluidConverter<SV, SF>>,
): IComponentHandle {
    const storedStateHandle = syncedState.get<IComponentHandle>(
        `syncedState-${syncedStateId}`,
    );
    let storedState = componentMap.get(storedStateHandle?.absolutePath)
        ?.component as ISharedMap;
    if (storedStateHandle === undefined || storedState === undefined) {
        const newState = SharedMap.create(runtime);
        componentMap.set(newState.handle.absolutePath, {
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
        const syncedStateKey = fluidToView?.get(fluidKey as keyof SF)?.rootKey;
        const createCallback = fluidToView?.get(fluidKey as keyof SF)
            ?.sharedObjectCreate;
        if (createCallback) {
            if (storedState.get(fluidKey) === undefined) {
                const sharedObject = createCallback(runtime);
                componentMap.set(sharedObject.handle.absolutePath, {
                    component: sharedObject,
                    listenedEvents: fluidToView?.get(fluidKey as keyof SF)
                        ?.listenedEvents || ["valueChanged"],
                });
                storedState.set(fluidKey, sharedObject.handle);
                if (syncedStateKey) {
                    syncedState.set(syncedStateKey, sharedObject.handle);
                }
            } else {
                storedState.set(fluidKey, storedState.get(fluidKey));
                if (syncedStateKey) {
                    syncedState.set(
                        syncedStateKey,
                        syncedState.get(syncedStateKey),
                    );
                }
            }
        } else if (syncedStateKey) {
            const value = newFluidState
                ? newFluidState[fluidKey]
                : syncedState.get(syncedStateKey);
            syncedState.set(syncedStateKey, value);
            storedState.set(fluidKey, value);
        } else {
            const value = newFluidState
                ? newFluidState[fluidKey]
                : storedState.get(fluidKey);
            storedState.set(fluidKey, value);
        }
    }
    if (viewToFluid !== undefined && newFluidState !== undefined) {
        for (const key of viewToFluid.keys()) {
            const viewKey = key as string;
            const fluidConverter = viewToFluid?.get(viewKey as keyof SV)
                ?.fluidConverter;
            if (fluidConverter) {
                const value = fluidConverter(newViewState, newFluidState);
                // Write this value to the stored state if it doesn't match the name of a view value
                if (
                    fluidToView.get(viewKey as keyof SF)?.sharedObjectCreate ===
                    undefined
                ) {
                    storedState.set(viewKey, value);
                }
            }
        }
    }
    syncedState.set(`syncedState-${syncedStateId}`, storedState.handle);
    return storedState.handle;
}
