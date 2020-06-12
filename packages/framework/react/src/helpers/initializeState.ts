/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ISharedMap,
    IDirectoryValueChanged,
    SharedMap,
} from "@fluidframework/map";
import { SharedObject } from "@fluidframework/shared-object-base";
import {
    IFluidDataProps,
    FluidToViewMap,
    ViewToFluidMap,
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
} from "../interface";
import {
    rootCallbackListener,
    syncStateAndRoot,
    updateStateAndComponentMap,
} from ".";

/**
 * Fetch the synced state for this view from the SyncedComponent sharedState and add
 * listeners for all state updates
 * @param syncedStateId - Unique ID for this synced component's state
 * @param root - The component's shared state map
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
    root: ISharedMap,
    dataProps: IFluidDataProps,
    state: SV,
    setState: (
        newState: SV,
        fromRootUpdate?: boolean,
        isLocal?: boolean
    ) => void,
    fluidToView: FluidToViewMap<SV, SF>,
    viewToFluid: ViewToFluidMap<SV, SF>,
): Promise<void> {
    state.isInitialized = true;
    state.syncedStateId = syncedStateId;
    // Define the root callback listener that will be responsible for triggering state updates on root value changes
    const rootCallback = (
        change: IDirectoryValueChanged,
        local: boolean,
    ) => {
        const callback = rootCallbackListener(
            dataProps.fluidComponentMap,
            syncedStateId,
            root,
            dataProps.runtime,
            state,
            setState,
            fluidToView,
            viewToFluid,
        );
        return callback(change, local);
    };
    const handlePaths = dataProps.fluidComponentMap.keys();
    for (const path of handlePaths) {
        const value = dataProps.fluidComponentMap.get(path);
        if (!value) {
            throw Error(`Cannot find handle with path ${path}`);
        }
        if (!value.isListened) {
            const component = value.component;
            if (!component) {
                throw Error("Cannot listen to component before it is initialized");
            }

            if (value.isRuntimeMap) {
                (component as SharedMap).on("valueChanged", rootCallback);
            } else if (value.listenedEvents) {
                for (const event of value.listenedEvents) {
                    (component as SharedObject).on(event, () =>
                        syncStateAndRoot(
                            true,
                            syncedStateId,
                            root,
                            dataProps.runtime,
                            state,
                            setState,
                            dataProps.fluidComponentMap,
                            fluidToView,
                            viewToFluid,
                        ));
                }
            }
            value.isListened = true;
            dataProps.fluidComponentMap.set(path, value);
        }
    }

    // Add the callback to the component's own root
    root.on("valueChanged", rootCallback);

    return updateStateAndComponentMap<SV, SF>(
        [],
        dataProps.fluidComponentMap,
        true,
        syncedStateId,
        root,
        dataProps.runtime,
        state,
        setState,
        rootCallback,
        fluidToView,
        viewToFluid,
    );
}
