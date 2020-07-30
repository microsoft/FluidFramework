/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap, IDirectoryValueChanged } from "@fluidframework/map";
import { IFluidDataStoreRuntime } from "@fluidframework/component-runtime-definitions";
import {
    FluidComponentMap,
    ViewToFluidMap,
    FluidToViewMap,
    IFluidFunctionalComponentViewState,
    IFluidFunctionalComponentFluidState,
} from "../interface";
import { syncState } from "./syncState";
import { getByFluidKey } from "./utils";
import { getViewFromFluid } from "./getViewFromFluid";
import { getFluidState } from ".";
import { ISyncedState } from "..";

/**
 * The callback that is added to the "valueChanged" event on the IComponentListened this
 * is passed in to. This will trigger state updates when the synced state value is updated
 * @param fluidComponentMap - A map of component handle paths to their respective components
 * @param syncedStateId - Unique ID for this synced component's state
 * @param syncedState - The shared map this component's synced state is stored on
 * @param runtime - The component runtime
 * @param state - The current view state
 * @param setState - Callback to update the react view state
 * @param fluidToView - A map of the Fluid state values that need conversion to their view state counterparts and the
 * respective converters
 * @param viewToFluid - A map of the view state values that need conversion to their Fluid state counterparts and the
 * respective converters
 */
export const syncedStateCallbackListener = <
    SV extends IFluidFunctionalComponentViewState,
    SF extends IFluidFunctionalComponentFluidState
>(
    fluidComponentMap: FluidComponentMap,
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
) => (change: IDirectoryValueChanged, local: boolean) => {
    const currentFluidState = getFluidState(
        syncedStateId,
        syncedState,
        fluidComponentMap,
        fluidToView,
    );
    if (currentFluidState === undefined) {
        throw Error("Synced state update triggered before fluid state was initialized");
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
            fluidComponentMap,
            fluidToView,
            viewToFluid,
        );
    } else if (
        viewToFluid !== undefined &&
        viewToFluidKeys.includes(change.key)
    ) {
        // If the update is to a child component, trigger only a view update as the child itself will
        // update its Fluid update
        const stateKey = getByFluidKey(change.key, viewToFluid);
        if (stateKey !== undefined) {
            const newPartialState = getViewFromFluid(
                syncedStateId,
                syncedState,
                change.key as keyof SF,
                fluidComponentMap,
                fluidToView,
                state,
                currentFluidState,
            );
            state[stateKey as string] = newPartialState[stateKey];
            state.fluidComponentMap = fluidComponentMap;
            setState(state, true, local);
        } else {
            throw Error(
                `Unable to extract view state from synced state change key: ${change.key}`,
            );
        }
    }
};
