/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap, SharedMap } from "@fluidframework/map";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
    FluidObjectMap,
    IViewConverter,
    IFluidConverter,
    ISyncedState,
} from "../interface";

/**
 * Store the Fluid state onto the shared synced state
 * @param syncedStateId - Unique ID to use for storing the Fluid object's synced state in the map
 * @param syncedState - The shared map that will be used to store the synced state
 * @param runtime - The data store runtime
 * @param fluidObjectMap - A map of Fluid handle paths to their Fluid objects
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 * @param newFluidState - The Fluid state to store on to the syncedState,
 * after converting Fluid objects to their handles
 */
export function setFluidState<SV, SF>(
    syncedStateId: string,
    syncedState: ISyncedState,
    runtime: IFluidDataStoreRuntime,
    fluidObjectMap: FluidObjectMap,
    fluidToView: Map<keyof SF, IViewConverter<SV, SF>>,
    newViewState: SV,
    newFluidState?: SF,
    viewToFluid?: Map<keyof SV, IFluidConverter<SV, SF>>,
): IFluidHandle {
    const storedStateHandle = syncedState.get<IFluidHandle>(
        `syncedState-${syncedStateId}`,
    );
    let storedState: ISharedMap | undefined;
    if (storedStateHandle) {
        storedState = fluidObjectMap.get(storedStateHandle.absolutePath)
            ?.fluidObject as ISharedMap;
    }
    if (storedStateHandle === undefined || storedState === undefined) {
        const newState = SharedMap.create(runtime);
        fluidObjectMap.set(newState.handle.absolutePath, {
            fluidObject: newState,
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
        if (createCallback !== undefined) {
            if (storedState.get(fluidKey) === undefined) {
                const sharedObject = createCallback(runtime);
                fluidObjectMap.set(sharedObject.handle.absolutePath, {
                    fluidObject: sharedObject,
                    listenedEvents: fluidToView?.get(fluidKey as keyof SF)
                        ?.listenedEvents ?? ["valueChanged"],
                });
                storedState.set(fluidKey, sharedObject.handle);
                if (syncedStateKey !== undefined) {
                    syncedState.set(syncedStateKey, sharedObject.handle);
                }
            } else {
                storedState.set(fluidKey, storedState.get(fluidKey));
                if (syncedStateKey !== undefined) {
                    syncedState.set(
                        syncedStateKey,
                        syncedState.get(syncedStateKey),
                    );
                }
            }
        } else if (syncedStateKey !== undefined) {
            const value = newFluidState !== undefined
                ? newFluidState[fluidKey]
                : syncedState.get(syncedStateKey);
            syncedState.set(syncedStateKey, value);
            storedState.set(fluidKey, value);
        } else {
            const value = newFluidState !== undefined
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
            const fluidKey = viewToFluid?.get(viewKey as keyof SV)
                ?.fluidKey;
            if (fluidConverter !== undefined && fluidKey !== undefined) {
                const value = fluidConverter(newViewState, newFluidState);
                // Write this value to the stored state if it doesn't match the name of a view value
                if (
                    fluidToView.get(fluidKey)?.sharedObjectCreate ===
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
