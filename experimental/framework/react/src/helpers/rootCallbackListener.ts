/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap, IValueChanged } from "@fluidframework/map";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import {
    FluidObjectMap,
    ViewToFluidMap,
    FluidToViewMap,
    IViewState,
    IFluidState,
} from "../interface";
import { ISyncedState } from "..";
import { syncState } from "./syncState";
import { getByFluidKey } from "./utils";
import { getViewFromFluid } from "./getViewFromFluid";
import { getFluidState } from ".";

/**
 * The callback that is added to the "valueChanged" event on the Fluid object this
 * is passed in to. This will trigger state updates when the synced state value is updated
 * @param fluidObjectMap - A map of Fluid handle paths to their Fluid objects
 * @param syncedStateId - Unique ID for this synced Fluid object's state
 * @param syncedState - The shared map this Fluid object's synced state is stored on
 * @param runtime - The data store runtime
 * @param state - The current view state
 * @param setState - Callback to update the react view state
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 * @param viewToFluid - A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 */
export const syncedStateCallbackListener = <
    SV extends IViewState,
    SF extends IFluidState
>(
    fluidObjectMap: FluidObjectMap,
    storedHandleMap: ISharedMap,
    syncedStateId,
    syncedState: ISyncedState,
    runtime: IFluidDataStoreRuntime,
    state: SV,
    setState: (
        newState: SV,
        fromRootUpdate?: boolean,
        isLocal?: boolean
    ) => void,
    fluidToView: FluidToViewMap<SV, SF>,
    viewToFluid?: ViewToFluidMap<SV, SF>,
) => (change: IValueChanged, local: boolean) => {
    const currentFluidState = getFluidState(
        syncedStateId,
        syncedState,
        fluidObjectMap,
        fluidToView,
    );
    if (currentFluidState === undefined) {
        throw Error("Synced state update triggered before Fluid state was initialized");
    }
    const viewToFluidKeys: string[] = viewToFluid !== undefined
        ? Array.from(viewToFluid.values()).map((item) => item.fluidKey as string)
        : [];
    if (!local && change.key === `syncedState-${syncedStateId}`) {
        // If the update is to the synced Fluid state, update both the Fluid and view states
        syncState(
            true,
            syncedStateId,
            syncedState,
            runtime,
            state,
            setState,
            fluidObjectMap,
            fluidToView,
            viewToFluid,
        );
    } else if (
        viewToFluid !== undefined &&
        viewToFluidKeys.includes(change.key)
    ) {
        // If the update is to a child Fluid object, trigger only a view update as the child itself will
        // update its Fluid update
        const stateKey = getByFluidKey(change.key, viewToFluid);
        if (stateKey !== undefined) {
            const newPartialState = getViewFromFluid(
                syncedStateId,
                syncedState,
                change.key as keyof SF,
                fluidObjectMap,
                fluidToView,
                state,
                currentFluidState,
            );
            state[stateKey as string] = newPartialState[stateKey];
            state.fluidObjectMap = fluidObjectMap;
            setState(state, true, local);
        } else {
            throw Error(
                `Unable to extract view state from synced state change key: ${change.key}`,
            );
        }
    }
};
