/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import {
    IDirectoryValueChanged,
    SharedMap,
} from "@fluidframework/map";
import {
    IFluidDataProps,
    FluidToViewMap,
    ViewToFluidMap,
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
    ISyncedState,
} from "../interface";
import {
    syncedStateCallbackListener,
    updateStateAndComponentMap,
    getComponentSchema,
    getFluidState,
} from ".";

/**
 * Fetch the synced state for this view from the SyncedComponent sharedState and add
 * listeners for all state updates
 * @param syncedStateId - Unique ID for this synced component's state
 * @param syncedState - The component's shared state map
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 * @param dataProps - Contains the runtime and fluidComponentMap to create and store DDS'
 * @param state - Current view state
 * @param setState - Callback to update view state
 * @param viewToFluid - A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 */
export async function initializeState<
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    syncedStateId: string,
    syncedState: ISyncedState,
    dataProps: IFluidDataProps,
    state: SV,
    setState: (
        newState: SV,
        fromRootUpdate?: boolean,
        isLocal?: boolean
    ) => void,
    fluidToView: FluidToViewMap<SV, SF>,
    viewToFluid?: ViewToFluidMap<SV, SF>,
): Promise<void> {
    const componentSchemaHandles = getComponentSchema(
        syncedStateId,
        syncedState,
    );
<<<<<<< HEAD
    if (componentSchemaHandles?.storedHandleMapHandle.path === undefined) {
        throw Error(`Component schema not initialized prior to render for ${syncedStateId}`);
=======
    // TODO #2457 - Move synced state initializing into component lifecycle, expose API for update
    if (storedFluidStateHandle === undefined) {
        const storedFluidState = SharedMap.create(dataProps.runtime);
        dataProps.fluidComponentMap.set(storedFluidState.handle.absolutePath, {
            component: storedFluidState,
            isRuntimeMap: true,
        });
        root.set(`syncedState-${syncedStateId}`, storedFluidState.handle);
        storedFluidStateHandle = storedFluidState.handle;
    } else {
        dataProps.fluidComponentMap.set(storedFluidStateHandle.absolutePath, {
            component: await storedFluidStateHandle.get(),
            isRuntimeMap: true,
        });
>>>>>>> Replaced path with id in IComponentHandleContext and added absolutePath.
    }
    const storedHandleMap = dataProps.fluidComponentMap.get(
        componentSchemaHandles?.storedHandleMapHandle.path,
    )?.component as SharedMap;
    if (storedHandleMap === undefined) {
        throw Error(`Stored handle map not initialized prior to render for ${syncedStateId}`);
    }
<<<<<<< HEAD
    const unlistenedHandles: IComponentHandle[] = [];
    for (const handle of storedHandleMap.values()) {
        unlistenedHandles.push(handle);
=======

    for (const key of fluidToView.keys()) {
        const fluidKey = key as string;
        const rootKey = fluidToView?.get(fluidKey as keyof SF)?.rootKey;
        const createCallback = fluidToView?.get(fluidKey as keyof SF)
            ?.sharedObjectCreate;
        if (createCallback) {
            if (fluidStateMap.get(fluidKey) === undefined) {
                const sharedObject = createCallback(dataProps.runtime);
                dataProps.fluidComponentMap.set(sharedObject.handle.absolutePath, {
                    component: sharedObject,
                    listenedEvents: fluidToView?.get(fluidKey as keyof SF)
                        ?.listenedEvents || ["valueChanged"],
                });
                fluidStateMap.set(fluidKey, sharedObject.handle);
                if (rootKey) {
                    root.set(rootKey, sharedObject.handle);
                }
            } else {
                const handle = fluidStateMap.get(fluidKey);
                dataProps.fluidComponentMap.set(handle.path, {
                    component: await handle.get(),
                    listenedEvents: fluidToView?.get(fluidKey as keyof SF)
                        ?.listenedEvents,
                });
            }
        } else if (rootKey) {
            fluidStateMap.set(fluidKey, root.get(rootKey));
        }
>>>>>>> Replaced path with id in IComponentHandleContext and added absolutePath.
    }

    const currentFluidState = getFluidState(
        syncedStateId,
        syncedState,
        dataProps.fluidComponentMap,
        fluidToView,
    );
    if (!currentFluidState) {
        throw Error("Synced state update triggered before fluid state was initialized");
    }

    for (const fluidStateKey of fluidToView.keys()) {
        const value = fluidToView.get(fluidStateKey);
        if (!value) {
            throw Error("Cannot find fluidToView value");
        }
        if (value.sharedObjectCreate) {
            const component = currentFluidState[fluidStateKey] as any;
            unlistenedHandles.push(component.handle);
        }
    }

    state.isInitialized = true;
    state.syncedStateId = syncedStateId;
<<<<<<< HEAD
    // Define the synced state callback listener that will be responsible for triggering state updates on synced state
    // value changes
    const syncedStateCallback = (
=======

    // Add the list of SharedMap handles for the schema and any unlistened handles passed in through the component
    // map to the list of handles we will fetch and start listening to
    unlistenedComponentHandles = [
        ...unlistenedComponentHandles,
        ...[
            componentSchemaHandles.componentKeyMapHandle,
            componentSchemaHandles.fluidMatchingMapHandle,
            componentSchemaHandles.viewMatchingMapHandle,
        ],
    ];
    const unlistenedMapHandles = [...unlistenedComponentHandles];

    dataProps.fluidComponentMap.forEach((value: IFluidComponent, k) => {
        if (!value.isListened && value.component?.handle !== undefined) {
            unlistenedComponentHandles.push(value.component.handle);
        }
    });

    // Initialize the FluidComponentMap with our data handles
    for (const handle of unlistenedMapHandles) {
        dataProps.fluidComponentMap.set(handle.absolutePath, {
            isListened: false,
            isRuntimeMap: true,
            component: await handle.get(),
        });
    }

    // Define the root callback listener that will be responsible for triggering state updates on root value changes
    const initRootCallback = (
>>>>>>> Replaced path with id in IComponentHandleContext and added absolutePath.
        change: IDirectoryValueChanged,
        local: boolean,
    ) => {
        const callback = syncedStateCallbackListener(
            dataProps.fluidComponentMap,
            storedHandleMap,
            syncedStateId,
            syncedState,
            dataProps.runtime,
            state,
            setState,
            fluidToView,
            viewToFluid,
        );
        return callback(change, local);
    };

    // Add the callback to the component's own synced state
    syncedState.addValueChangedListener(syncedStateCallback);
    storedHandleMap.on("valueChanged", (
        change: IDirectoryValueChanged,
        local: boolean,
    ) => {
        const handle = storedHandleMap.get<IComponentHandle>(change.key);
        if (handle !== undefined && !state.fluidComponentMap?.has(handle.path)) {
            state.fluidComponentMap?.set(handle.path, {
                isListened: false,
            });
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            updateStateAndComponentMap<SV, SF>(
                [handle],
                dataProps.fluidComponentMap,
                storedHandleMap,
                true,
                syncedStateId,
                syncedState,
                dataProps.runtime,
                state,
                setState,
                syncedStateCallback,
                fluidToView,
                viewToFluid,
            );
        }
    });

    return updateStateAndComponentMap<SV, SF>(
        unlistenedHandles,
        dataProps.fluidComponentMap,
        storedHandleMap,
        true,
        syncedStateId,
        syncedState,
        dataProps.runtime,
        state,
        setState,
        syncedStateCallback,
        fluidToView,
        viewToFluid,
    );
}
