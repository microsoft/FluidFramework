/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
    IValueChanged,
    SharedMap,
} from "@fluidframework/map";
import {
    IFluidDataProps,
    FluidToViewMap,
    ViewToFluidMap,
    IViewState,
    IFluidState,
    ISyncedState,
} from "../interface";
import {
    syncedStateCallbackListener,
    updateStateAndFluidObjectMap,
    getSchema,
    getFluidState,
} from ".";

/**
 * Fetch the synced state for this view from the SyncedDataObject sharedState and add
 * listeners for all state updates
 * @param syncedStateId - Unique ID for this synced data object's state
 * @param syncedState - The synced data object's shared state map
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 * @param dataProps - Contains the runtime and fluidObjectMap to create and store DDSes
 * @param state - Current view state
 * @param setState - Callback to update view state
 * @param viewToFluid - A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 */
export async function initializeState<
    SV extends IViewState,
    SF extends IFluidState
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
    const schemaHandles = getSchema(
        syncedStateId,
        syncedState,
    );
    if (schemaHandles?.storedHandleMapHandle.absolutePath === undefined) {
        throw Error(`Schema not initialized prior to render for ${syncedStateId}`);
    }
    const storedHandleMap = dataProps.fluidObjectMap.get(
        schemaHandles?.storedHandleMapHandle.absolutePath,
    )?.fluidObject as SharedMap;
    if (storedHandleMap === undefined) {
        throw Error(`Stored handle map not initialized prior to render for ${syncedStateId}`);
    }
    const unlistenedHandles: IFluidHandle[] = [];
    for (const handle of storedHandleMap.values()) {
        unlistenedHandles.push(handle);
    }

    const currentFluidState = getFluidState(
        syncedStateId,
        syncedState,
        dataProps.fluidObjectMap,
        fluidToView,
    );
    if (currentFluidState === undefined) {
        throw Error("Synced state update triggered before Fluid state was initialized");
    }

    for (const fluidStateKey of fluidToView.keys()) {
        const value = fluidToView.get(fluidStateKey);
        if (value === undefined) {
            throw Error("Cannot find fluidToView value");
        }
        if (value.sharedObjectCreate !== undefined) {
            const fluidObject = currentFluidState[fluidStateKey] as any;
            unlistenedHandles.push(fluidObject.handle);
        }
    }

    state.isInitialized = true;
    state.syncedStateId = syncedStateId;
    // Define the synced state callback listener that will be responsible for triggering state updates on synced state
    // value changes
    const syncedStateCallback = (
        change: IValueChanged,
        local: boolean,
    ) => {
        const callback = syncedStateCallbackListener(
            dataProps.fluidObjectMap,
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

    // Add the callback to the fluidObject's own synced state
    syncedState.addValueChangedListener(syncedStateCallback);
    storedHandleMap.on("valueChanged", (
        change: IValueChanged,
        local: boolean,
    ) => {
        const handle = storedHandleMap.get<IFluidHandle>(change.key);
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (handle !== undefined && !state.fluidObjectMap?.has(handle.absolutePath)) {
            state.fluidObjectMap?.set(handle.absolutePath, {
                isListened: false,
            });
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            updateStateAndFluidObjectMap<SV, SF>(
                [handle],
                dataProps.fluidObjectMap,
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

    return updateStateAndFluidObjectMap<SV, SF>(
        unlistenedHandles,
        dataProps.fluidObjectMap,
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
